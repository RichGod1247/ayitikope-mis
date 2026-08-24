import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"]);

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId: auth.ctx.userId,
        tenantId: auth.ctx.tenantId,
      },
    },
    select: { status: true, role: { select: { name: true } } },
  });
  const role = effectiveRole(membership?.role?.name ?? auth.ctx.roleName)
    .trim()
    .toUpperCase();
  if (!membership || membership.status !== "ACTIVE" || !ALLOWED_ROLES.has(role)) {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const studentId = String(new URL(req.url).searchParams.get("studentId") ?? "").trim();
  if (!studentId) return json(400, { ok: false, error: "studentId is required" });

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: auth.ctx.tenantId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
      status: true,
      classroom: { select: { name: true, grade: true, arm: true } },
    },
  });

  if (!student) return json(404, { ok: false, error: "Student not found" });

  return json(200, { ok: true, student });
}
