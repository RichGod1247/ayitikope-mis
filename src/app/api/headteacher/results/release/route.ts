// src/app/api/headteacher/results/release/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function roleUpper(role: string | null | undefined) {
  return String(role ?? "").trim().toUpperCase();
}

function isHeadOrAdmin(role: string) {
  return (
    role === "HEADTEACHER" ||
    role === "SCHOOL_ADMIN" ||
    role === "ADMIN" ||
    role === "SUPERADMIN"
  );
}

function safeStr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

type Body = {
  scope?: "SCHOOL" | "CLASSROOM";
  term?: string;
  academicYear?: string;
  classroomId?: string | null;
};

export async function POST(req: NextRequest) {
  const gate = await requireApiUserContext(req as any, { requireTenant: true });
  if (!gate.ok) return gate.res as any;

  const ctx = gate.ctx;
  const role = roleUpper(ctx.roleName);
  if (!isHeadOrAdmin(role)) {
    return noStoreJson(403, { ok: false, error: "FORBIDDEN", role });
  }

  const body = (await req.json().catch(() => null)) as Body | null;

  const scope = (body?.scope ?? "SCHOOL") as "SCHOOL" | "CLASSROOM";
  const term = safeStr(body?.term) || "1st Term";
  const academicYear = safeStr(body?.academicYear) || "2025/2026";
  const classroomId = safeStr(body?.classroomId) || null;

  if (scope !== "SCHOOL" && scope !== "CLASSROOM") {
    return noStoreJson(400, { ok: false, error: "INVALID_SCOPE" });
  }

  if (!term || !academicYear) {
    return noStoreJson(400, { ok: false, error: "MISSING_TERM_OR_YEAR" });
  }

  let scopeKey = "SCHOOL";
  let classroomIdToStore: string | null = null;

  if (scope === "CLASSROOM") {
    if (!classroomId) {
      return noStoreJson(400, { ok: false, error: "MISSING_CLASSROOM_ID" });
    }

    const classroom = await prisma.classroom.findFirst({
      where: { id: classroomId, tenantId: ctx.tenantId },
      select: { id: true },
    });

    if (!classroom) {
      return noStoreJson(404, { ok: false, error: "CLASSROOM_NOT_FOUND" });
    }

    scopeKey = classroomId;
    classroomIdToStore = classroomId;
  }

  const existing = await prisma.resultsRelease.findFirst({
    where: { tenantId: ctx.tenantId, term, academicYear, scopeKey },
    select: { id: true },
  });

  const now = new Date();

  const row = existing
    ? await prisma.resultsRelease.update({
        where: { id: existing.id },
        data: {
          scope,
          classroomId: classroomIdToStore,
          releasedAt: now,
          releasedByUserId: ctx.userId,
        },
      })
    : await prisma.resultsRelease.create({
        data: {
          tenantId: ctx.tenantId,
          term,
          academicYear,
          scope,
          scopeKey,
          classroomId: classroomIdToStore,
          releasedAt: now,
          releasedByUserId: ctx.userId,
        },
      });

  return noStoreJson(200, { ok: true, release: row });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireApiUserContext(req as any, { requireTenant: true });
  if (!gate.ok) return gate.res as any;

  const ctx = gate.ctx;
  const role = roleUpper(ctx.roleName);
  if (!isHeadOrAdmin(role)) {
    return noStoreJson(403, { ok: false, error: "FORBIDDEN", role });
  }

  const body = (await req.json().catch(() => null)) as Body | null;

  const scope = (body?.scope ?? "SCHOOL") as "SCHOOL" | "CLASSROOM";
  const term = safeStr(body?.term) || "1st Term";
  const academicYear = safeStr(body?.academicYear) || "2025/2026";
  const classroomId = safeStr(body?.classroomId) || null;

  if (scope !== "SCHOOL" && scope !== "CLASSROOM") {
    return noStoreJson(400, { ok: false, error: "INVALID_SCOPE" });
  }

  const scopeKey = scope === "SCHOOL" ? "SCHOOL" : classroomId || "";
  if (!scopeKey) {
    return noStoreJson(400, { ok: false, error: "MISSING_SCOPE_KEY" });
  }

  const existing = await prisma.resultsRelease.findFirst({
    where: { tenantId: ctx.tenantId, term, academicYear, scopeKey },
    select: { id: true },
  });

  if (!existing) {
    return noStoreJson(200, { ok: true, deleted: false });
  }

  await prisma.resultsRelease.delete({ where: { id: existing.id } });
  return noStoreJson(200, { ok: true, deleted: true });
}