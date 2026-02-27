// src/app/api/admin/students/consent/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import { rateLimitCheck, rateLimitRecord, getIpFromHeaders, getUserAgentFromHeaders } from "@/lib/rateLimit";
import { signStudentConsentToken } from "@/lib/consentTokens";
import { sendViaHubtel } from "@/lib/sms/hubtel";
import { StudentStatus } from "@prisma/client";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function originFromEnv() {
  const o = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return o || `http://localhost:${process.env.PORT || 3000}`;
}

function isAdminLike(roleName: unknown) {
  const r = effectiveRole(roleName);
  return r === "SUPERADMIN" || r === "SCHOOL_ADMIN" || r === "HEADTEACHER";
}

type Body = { studentId?: string };

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "TEACHER", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const ctx = auth.ctx;

  // Ensure membership is ACTIVE
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });
  if (!membership || membership.status !== "ACTIVE") return json(403, { ok: false, error: "FORBIDDEN" });

  const roleName = effectiveRole(membership.role?.name ?? ctx.roleName);

  const body = (await req.json().catch(() => ({}))) as Body;
  const studentId = String(body.studentId ?? "").trim();
  if (!studentId) return json(400, { ok: false, error: "STUDENT_ID_REQUIRED" });

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: ctx.tenantId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      classroomId: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      guardianSmsOptIn: true,
      healthConsentAt: true,
    },
  });
  if (!student) return json(404, { ok: false, error: "NOT_FOUND" });
  if (student.status === StudentStatus.ARCHIVED) return json(409, { ok: false, error: "ARCHIVED_IMMUTABLE" });

  // Teachers may send only for their classroom
  if (roleName === "TEACHER") {
    const classroomId = String(student.classroomId ?? "").trim();
    if (!classroomId) return json(403, { ok: false, error: "FORBIDDEN_NO_CLASSROOM" });
    await assertCanAccessClassroom({ userId: ctx.userId, tenantId: ctx.tenantId, classroomId });
  }

  if (!student.guardianPhone) return json(409, { ok: false, error: "NO_GUARDIAN_PHONE" });

  // Rate limits (anti-spam)
  const ip = getIpFromHeaders(req.headers);
  const ua = getUserAgentFromHeaders(req.headers);

  const perStudent = await rateLimitCheck({
    action: "CONSENT_SMS_SEND",
    key: `student:${ctx.tenantId}:${studentId}`,
    limit: 2,
    windowSeconds: 24 * 60 * 60,
  });
  if (!perStudent.ok) {
    return json(429, {
      ok: false,
      error: "RATE_LIMITED_STUDENT",
      retryAfterSeconds: perStudent.retryAfterSeconds,
    });
  }

  const perActor = await rateLimitCheck({
    action: "CONSENT_SMS_SEND",
    key: `actor:${ctx.tenantId}:${ctx.userId}`,
    limit: 30,
    windowSeconds: 60 * 60,
  });
  if (!perActor.ok) {
    return json(429, {
      ok: false,
      error: "RATE_LIMITED_ACTOR",
      retryAfterSeconds: perActor.retryAfterSeconds,
    });
  }

  // Record rate-limit attempt (counts as an attempt whether provider succeeds or not)
  await rateLimitRecord({
    action: "CONSENT_SMS_SEND",
    key: `student:${ctx.tenantId}:${studentId}`,
    ip,
    userAgent: ua,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    metadata: { studentId },
  });
  await rateLimitRecord({
    action: "CONSENT_SMS_SEND",
    key: `actor:${ctx.tenantId}:${ctx.userId}`,
    ip,
    userAgent: ua,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    metadata: { studentId },
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { name: true },
  });

  const schoolName = (tenant?.name || "Your School").trim();
  const origin = originFromEnv();

  const ttlDays = Math.min(Math.max(parseInt(process.env.CONSENT_TOKEN_TTL_DAYS || "14", 10) || 14, 1), 90);
  const token = signStudentConsentToken(student.id, ttlDays);

  // Guardian lands on a page and explicitly confirms (POST)
  const link = `${origin}/api/consent/optin/student/link?token=${encodeURIComponent(token)}`;

  const child = [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || "your child";
  const guardian = (student.guardianName || "Dear Parent/Guardian").trim();

  const text = `${guardian}, ${schoolName}:
Please confirm health & SMS consent for ${child}.
Open: ${link}`;

  // Send SMS
  const sms = await sendViaHubtel({
    to: student.guardianPhone,
    body: text,
    brand: "AYITIADMIN",
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    meta: {
      purpose: "student_consent_optin",
      studentId,
      ttlDays,
      role: roleName,
    },
  });

  // High-level audit for quick reporting (separate from SmsLog)
  try {
    await prisma.sMSSendAudit.create({
      data: {
        tenantId: ctx.tenantId,
        toPhone: sms.to,
        template: "CONSENT_STUDENT_OPTIN",
        payload: {
          studentId,
          link,
          actorId: ctx.userId,
          role: roleName,
        } as any,
      },
    });
  } catch {}

  // AuditLog for staff action
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "CONSENT_STUDENT_OPTIN_SMS_SENT",
        resource: "STUDENT",
        resourceId: studentId,
        ip,
        userAgent: ua,
        metadata: {
          to: sms.to,
          guardianSmsOptIn: student.guardianSmsOptIn,
          healthConsentAt: student.healthConsentAt ? student.healthConsentAt.toISOString() : null,
        } as any,
      },
    });
  } catch {}

  return json(200, { ok: true, studentId, to: sms.to, link, text });
}