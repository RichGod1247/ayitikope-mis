// src/app/api/students/contacts/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import { StudentStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function isAdminLike(roleName: unknown) {
  const r = effectiveRole(roleName);
  return r === "SUPERADMIN" || r === "SCHOOL_ADMIN" || r === "HEADTEACHER";
}

function enforceTenantMismatch(suppliedTenantId: string | null, sessionTenantId: string) {
  const v = String(suppliedTenantId ?? "").trim();
  if (v && v !== sessionTenantId) return false;
  return true;
}

function classLabel(name: string, arm: string | null) {
  return arm ? `${name} ${arm}` : name;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;

  if (!isAdminLike(auth.ctx.roleName)) {
    return noStoreJson(403, { ok: false, error: "FORBIDDEN" });
  }

  const url = new URL(req.url);
  const classroomId = String(url.searchParams.get("classroomId") ?? "").trim();

  // legacy param accepted ONLY for mismatch checks
  const suppliedTenantId = url.searchParams.get("tenantId");
  if (!enforceTenantMismatch(suppliedTenantId, auth.ctx.tenantId)) {
    return noStoreJson(403, { ok: false, error: "FORBIDDEN_TENANT_MISMATCH" });
  }

  if (!classroomId) {
    return noStoreJson(400, { ok: false, error: "MISSING_CLASSROOM_ID" });
  }

  const room = await prisma.classroom.findFirst({
    where: { id: classroomId, tenantId: auth.ctx.tenantId, status: "ACTIVE" },
    select: { id: true, name: true, arm: true },
  });

  if (!room) {
    return noStoreJson(404, { ok: false, error: "CLASSROOM_NOT_FOUND" });
  }

  // ✅ ACTIVE only (archived learners excluded from contact workflows)
  const students = await prisma.student.findMany({
    where: { tenantId: auth.ctx.tenantId, classroomId: room.id, status: StudentStatus.ACTIVE },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      note: true,
    },
    take: 2000,
  });

  return noStoreJson(200, {
    ok: true,
    items: students.map((s) => ({
      id: s.id,
      firstName: s.firstName ?? "",
      lastName: s.lastName ?? "",
      classLabel: classLabel(room.name, room.arm),
      guardianName: s.guardianName ?? null,
      guardianPhone: s.guardianPhone ?? null,
      guardianAltPhone: null, // keep UI contract stable
      relationship: null,
      notes: s.note ?? null,
    })),
  });
}