// src/app/api/headteacher/results/release/notify/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { sendViaHubtel } from "@/lib/sms/hubtel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function roleUpper(role: string | null | undefined) {
  return String(role ?? "").trim().toUpperCase();
}

function isHeadOrAdmin(role: string) {
  return role === "HEADTEACHER" || role === "SCHOOL_ADMIN" || role === "ADMIN" || role === "SUPERADMIN";
}

function safeStr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function getBaseUrl(req: NextRequest) {
  const env =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL;

  if (env) return env.replace(/\/+$/, "");

  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

type Body = {
  scope?: "SCHOOL" | "CLASSROOM";
  term?: string;
  academicYear?: string;
  classroomId?: string | null;
  batchSize?: number;
};

export async function POST(req: NextRequest) {
  const gate = await requireApiUserContext(req as any, { requireTenant: true });
  if (!gate.ok) return gate.res as any;

  const ctx = gate.ctx;
  const role = roleUpper(ctx.roleName);
  if (!isHeadOrAdmin(role)) return noStoreJson(403, { ok: false, error: "FORBIDDEN", role });

  const body = (await req.json().catch(() => null)) as Body | null;

  const scope = (body?.scope ?? "SCHOOL") as "SCHOOL" | "CLASSROOM";
  const term = safeStr(body?.term) || "1st Term";
  const academicYear = safeStr(body?.academicYear) || "2025/2026";
  const classroomId = safeStr(body?.classroomId) || null;

  const batchSizeRaw = Number(body?.batchSize ?? 25);
  const batchSize = Number.isFinite(batchSizeRaw) ? Math.max(5, Math.min(60, Math.trunc(batchSizeRaw))) : 25;

  if (scope !== "SCHOOL" && scope !== "CLASSROOM") return noStoreJson(400, { ok: false, error: "INVALID_SCOPE" });
  if (!term || !academicYear) return noStoreJson(400, { ok: false, error: "MISSING_TERM_OR_YEAR" });

  let scopeKey = "SCHOOL";
  let classroomIdToStore: string | null = null;

  if (scope === "CLASSROOM") {
    if (!classroomId) return noStoreJson(400, { ok: false, error: "MISSING_CLASSROOM_ID" });

    const classroom = await prisma.classroom.findFirst({
      where: { id: classroomId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!classroom) return noStoreJson(404, { ok: false, error: "CLASSROOM_NOT_FOUND" });

    scopeKey = classroomId;
    classroomIdToStore = classroomId;
  }

  // Must be released first
  const release = await prisma.resultsRelease.findFirst({
    where: { tenantId: ctx.tenantId, term, academicYear, scopeKey },
    select: { id: true },
  });
  if (!release) {
    return noStoreJson(400, { ok: false, error: "RESULTS_NOT_RELEASED_YET", term, academicYear, scope, scopeKey });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { name: true },
  });

  // Upsert job by unique key
  const jobId = crypto.randomBytes(16).toString("hex");

  const existing = await prisma.resultsReleaseNotifyJob.findFirst({
    where: { tenantId: ctx.tenantId, term, academicYear, scopeKey },
    select: { id: true, status: true },
  });

  const job = existing
    ? await prisma.resultsReleaseNotifyJob.update({
        where: { id: existing.id },
        data: {
          scope,
          classroomId: classroomIdToStore,
          status: existing.status === "DONE" ? "PENDING" : existing.status,
          lastError: null,
          updatedAt: new Date(),
        },
      })
    : await prisma.resultsReleaseNotifyJob.create({
        data: {
          id: jobId,
          tenantId: ctx.tenantId,
          term,
          academicYear,
          scope,
          scopeKey,
          classroomId: classroomIdToStore,
          status: "PENDING",
          createdByUserId: ctx.userId,
        },
      });

  // Seed recipients once (only if none exist for this job)
  const existingRecipientsCount = await prisma.resultsReleaseNotifyRecipient.count({
    where: { jobId: job.id },
  });

  if (existingRecipientsCount === 0) {
    const students = await prisma.student.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "ACTIVE",
        guardianSmsOptIn: true,
        guardianPhoneNorm: { not: null },
        ...(scope === "CLASSROOM" ? { classroomId: classroomIdToStore } : {}),
      },
      distinct: ["guardianPhoneNorm"],
      orderBy: { guardianPhoneNorm: "asc" },
      select: { guardianPhoneNorm: true },
      take: 5000,
    });

    const phones = students.map((s) => String(s.guardianPhoneNorm)).filter(Boolean);

    if (phones.length) {
      await prisma.resultsReleaseNotifyRecipient.createMany({
        data: phones.map((p) => ({
          jobId: job.id,
          tenantId: ctx.tenantId,
          guardianPhoneNorm: p,
          status: "PENDING",
        })),
        skipDuplicates: true,
      });
    }

    await prisma.resultsReleaseNotifyJob.update({
      where: { id: job.id },
      data: { totalTargets: phones.length, updatedAt: new Date() },
    });
  }

  // Mark running
  await prisma.resultsReleaseNotifyJob.update({
    where: { id: job.id },
    data: {
      status: "RUNNING",
      startedAt: job.startedAt ?? new Date(),
      updatedAt: new Date(),
    },
  });

  const pending = await prisma.resultsReleaseNotifyRecipient.findMany({
    where: { jobId: job.id, status: "PENDING" },
    orderBy: { guardianPhoneNorm: "asc" },
    take: batchSize,
    select: { id: true, guardianPhoneNorm: true },
  });

  if (pending.length === 0) {
    const doneJob = await prisma.resultsReleaseNotifyJob.update({
      where: { id: job.id },
      data: { status: "DONE", completedAt: new Date(), updatedAt: new Date() },
    });

    return noStoreJson(200, {
      ok: true,
      job: doneJob,
      batch: { sent: 0, failed: 0 },
      done: true,
      message: "No pending recipients left.",
    });
  }

  const baseUrl = getBaseUrl(req);
  const schoolName = tenant?.name ?? "Your school";

  // Keep it short to reduce spam flags
  const text =
    `${schoolName}: Results for ${term} ${academicYear} are now available on EduLife OS Parent Portal.` +
    ` Open: ${baseUrl}/parent-portal`;

  let sent = 0;
  let failed = 0;

  for (const r of pending) {
    try {
      const out = await sendViaHubtel({
        to: r.guardianPhoneNorm,
        body: text,
        brand: "AYITIADMIN",
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        meta: { category: "RESULTS_RELEASE_NOTIFY", term, academicYear, scope, scopeKey },
      });

      await prisma.resultsReleaseNotifyRecipient.update({
        where: { id: r.id },
        data: {
          status: out.ok ? "SENT" : "FAILED",
          providerMessageId: (out.providerResponse as any)?.messageId ?? null,
          providerStatus: null,
          providerStatusDescription: out.ok ? "SENT" : "FAILED",
        },
      });

      sent += 1;
    } catch (e: any) {
      failed += 1;
      await prisma.resultsReleaseNotifyRecipient.update({
        where: { id: r.id },
        data: {
          status: "FAILED",
          providerStatusDescription: String(e?.message ?? "FAILED"),
        },
      });
    }
  }

  // Update counts
  const remaining = await prisma.resultsReleaseNotifyRecipient.count({
    where: { jobId: job.id, status: "PENDING" },
  });

  const updatedJob = await prisma.resultsReleaseNotifyJob.update({
    where: { id: job.id },
    data: {
      sentCount: { increment: sent },
      failedCount: { increment: failed },
      updatedAt: new Date(),
      ...(remaining === 0 ? { status: "DONE", completedAt: new Date() } : {}),
    },
  });

  return noStoreJson(200, {
    ok: true,
    job: updatedJob,
    batch: { sent, failed },
    remaining,
    done: remaining === 0,
  });
}

export async function GET(req: NextRequest) {
  const gate = await requireApiUserContext(req as any, { requireTenant: true });
  if (!gate.ok) return gate.res as any;

  const ctx = gate.ctx;
  const role = roleUpper(ctx.roleName);
  if (!isHeadOrAdmin(role)) return noStoreJson(403, { ok: false, error: "FORBIDDEN", role });

  const { searchParams } = new URL(req.url);
  const term = String(searchParams.get("term") || "").trim();
  const academicYear = String(searchParams.get("academicYear") || "").trim();
  const scopeKey = String(searchParams.get("scopeKey") || "SCHOOL").trim();

  if (!term || !academicYear) return noStoreJson(400, { ok: false, error: "MISSING_TERM_OR_YEAR" });

  const job = await prisma.resultsReleaseNotifyJob.findFirst({
    where: { tenantId: ctx.tenantId, term, academicYear, scopeKey },
    orderBy: { createdAt: "desc" },
  });

  if (!job) return noStoreJson(200, { ok: true, job: null });

  const remaining = await prisma.resultsReleaseNotifyRecipient.count({
    where: { jobId: job.id, status: "PENDING" },
  });

  return noStoreJson(200, { ok: true, job, remaining });
}