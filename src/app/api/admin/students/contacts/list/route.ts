// src/app/api/admin/students/contacts/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
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

function classLabel(c: { name: string; grade: string | null; arm: string | null }) {
  return [c.name, c.grade, c.arm].filter(Boolean).join(" • ");
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;
  if (!isAdminLike(auth.ctx.roleName)) return json(403, { ok: false, error: "FORBIDDEN" });

  const { searchParams } = new URL(req.url);
  const classroomId = String(searchParams.get("classroomId") ?? "").trim();
  if (!classroomId) return json(400, { ok: false, error: "CLASSROOM_ID_REQUIRED" });

  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, tenantId: auth.ctx.tenantId, status: "ACTIVE" },
    select: { id: true, name: true, grade: true, arm: true },
  });
  if (!classroom) return json(400, { ok: false, error: "INVALID_CLASSROOM" });

  const students = await prisma.student.findMany({
    where: {
      tenantId: auth.ctx.tenantId,
      classroomId,
      status: StudentStatus.ACTIVE,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      note: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 1200,
  });

  const label = classLabel({
    name: classroom.name,
    grade: classroom.grade ?? null,
    arm: classroom.arm ?? null,
  });

  return json(200, {
    ok: true,
    items: students.map((s) => ({
      id: s.id,
      firstName: s.firstName ?? "",
      lastName: s.lastName ?? "",
      classLabel: label,
      guardianName: s.guardianName ?? null,
      guardianPhone: s.guardianPhone ?? null,
      relationship: null,
      notes: s.note ?? null,
    })),
  });
}