// src/app/api/admin/students/attendance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";

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
  const studentId = String(searchParams.get("studentId") ?? "").trim();
  if (!studentId) return json(400, { ok: false, error: "STUDENT_ID_REQUIRED" });

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: auth.ctx.tenantId },
    select: { id: true },
  });
  if (!student) return json(404, { ok: false, error: "NOT_FOUND" });

  // UI says “last 20 records” → return 20
  const marks = await prisma.attendanceMark.findMany({
    where: {
      studentId,
      session: { tenantId: auth.ctx.tenantId },
    },
    select: {
      id: true,
      status: true,
      note: true,
      session: {
        select: {
          date: true,
          classroom: { select: { name: true, grade: true, arm: true } },
        },
      },
    },
    orderBy: { session: { date: "desc" } },
    take: 20,
  });

  return json(200, {
    ok: true,
    items: marks.map((m) => ({
      id: m.id,
      date: m.session.date.toISOString(),
      classLabel: m.session.classroom
        ? classLabel({
            name: m.session.classroom.name,
            grade: m.session.classroom.grade ?? null,
            arm: m.session.classroom.arm ?? null,
          })
        : null,
      status: m.status,
      note: m.note ?? null,
    })),
  });
}