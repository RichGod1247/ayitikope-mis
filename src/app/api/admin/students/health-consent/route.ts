// src/app/api/admin/students/health-consent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import { z } from "zod";
import { StudentStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function isAdminLike(roleName: unknown) {
  const r = effectiveRole(roleName);
  return r === "SUPERADMIN" || r === "SCHOOL_ADMIN" || r === "HEADTEACHER";
}

const PatchSchema = z.object({ studentId: z.string().min(1) }).strict();

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;
  if (!isAdminLike(auth.ctx.roleName)) return json(403, { ok: false, error: "FORBIDDEN" });

  const { searchParams } = new URL(req.url);
  const studentId = String(searchParams.get("studentId") ?? "").trim();
  if (!studentId) return json(400, { ok: false, error: "STUDENT_ID_REQUIRED" });

  const s = await prisma.student.findFirst({
    where: { id: studentId, tenantId: auth.ctx.tenantId },
    select: { id: true, healthConsentAt: true, guardianSmsOptIn: true, guardianPhone: true, status: true },
  });
  if (!s) return json(404, { ok: false, error: "NOT_FOUND" });

  return json(200, {
    ok: true,
    studentId: s.id,
    healthConsentAt: s.healthConsentAt ? s.healthConsentAt.toISOString() : null,
    guardianSmsOptIn: !!s.guardianSmsOptIn,
    guardianPhone: s.guardianPhone ?? null,
    status: s.status,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;
  if (!isAdminLike(auth.ctx.roleName)) return json(403, { ok: false, error: "FORBIDDEN" });

  const raw = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { ok: false, error: parsed.error.issues[0]?.message || "Invalid body." });
  }

  const studentId = parsed.data.studentId.trim();

  const s = await prisma.student.findFirst({
    where: { id: studentId, tenantId: auth.ctx.tenantId },
    select: { id: true, healthConsentAt: true, status: true },
  });
  if (!s) return json(404, { ok: false, error: "NOT_FOUND" });

  // ✅ Bank-grade: archived students are immutable for consent toggles
  if (s.status === StudentStatus.ARCHIVED) {
    return json(409, { ok: false, error: "ARCHIVED_IMMUTABLE" });
  }

  const next = s.healthConsentAt ? null : new Date();

  const updated = await prisma.student.update({
    where: { id: s.id },
    data: { healthConsentAt: next },
    select: { id: true, healthConsentAt: true },
  });

  return json(200, {
    ok: true,
    studentId: updated.id,
    healthConsentAt: updated.healthConsentAt ? updated.healthConsentAt.toISOString() : null,
  });
}