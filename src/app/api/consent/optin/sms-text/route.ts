// src/app/api/consent/optin/sms-text/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import { signStudentConsentToken } from "@/lib/consentTokens";
import { assertNoTenantOverride } from "@/lib/tenantGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function originFromEnv() {
  const o = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return o || `http://localhost:${process.env.PORT || 3000}`;
}

function isAdminLike(roleName: unknown) {
  const r = effectiveRole(roleName);
  return r === "SUPERADMIN" || r === "SCHOOL_ADMIN" || r === "HEADTEACHER";
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;
  if (!isAdminLike(auth.ctx.roleName)) {
    return new Response(JSON.stringify({ ok: false, error: "FORBIDDEN" }), {
      status: 403,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const { searchParams } = new URL(req.url);

  // Back-compat tenantId param (allowed only if matches session tenant)
  const suppliedTenantId = (searchParams.get("tenantId") ?? "").trim();
  if (suppliedTenantId) {
    const guard = assertNoTenantOverride(suppliedTenantId, auth.ctx.tenantId);
    if (!guard.ok) {
      return new Response(JSON.stringify({ ok: false, error: guard.error }), {
        status: guard.status,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }
  }

  const studentId = (searchParams.get("studentId") ?? "").trim();
  if (!studentId) {
    return new Response(JSON.stringify({ ok: false, error: "studentId is required" }), {
      status: 400,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: auth.ctx.tenantId },
    select: { id: true, tenantId: true, firstName: true, lastName: true, guardianName: true },
  });

  if (!student) {
    return new Response(JSON.stringify({ ok: false, error: "Student not found" }), {
      status: 404,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: student.tenantId },
    select: { name: true },
  });

  const schoolName = (tenant?.name || "Your School").trim();
  const origin = originFromEnv();

  const ttlDays = Math.min(Math.max(parseInt(process.env.CONSENT_TOKEN_TTL_DAYS || "14", 10) || 14, 1), 90);
  const token = signStudentConsentToken(student.id, ttlDays);

  // Use the existing confirm endpoint (guaranteed to exist in your repo)
  const link = `${origin}/api/consent/optin/student/link?token=${encodeURIComponent(token)}`;

  const child = [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || "your child";
  const guardian = (student.guardianName || "Dear Parent/Guardian").trim();

  const text = `${guardian}, ${schoolName}:
Please confirm health & SMS consent for ${child}.
Open: ${link}`;

  return new Response(JSON.stringify({ ok: true, text, link }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}