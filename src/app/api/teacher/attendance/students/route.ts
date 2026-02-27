// src/app/api/teacher/attendance/students/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getSafeTenantCtx() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  const userId = typeof u?.id === "string" ? u.id : "";
  const tenantId = typeof u?.tenantId === "string" ? u.tenantId : "";

  if (!session || !userId) return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  if (!tenantId) return { ok: false as const, status: 403, error: "NO_ACTIVE_TENANT" };

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false as const, status: 403, error: "FORBIDDEN" };
  }

  return { ok: true as const, userId, tenantId, roleName: (membership.role?.name ?? "").trim() };
}

export async function GET(req: Request) {
  const safe = await getSafeTenantCtx();
  if (!safe.ok) {
    return NextResponse.json(
      { ok: false, error: safe.error },
      { status: safe.status, headers: { "cache-control": "no-store" } }
    );
  }

  const { searchParams } = new URL(req.url);
  const tenantIdParam = (searchParams.get("tenantId") || "").trim(); // back-compat only
  const classroomId = (searchParams.get("classroomId") || "").trim();

  if (tenantIdParam && tenantIdParam !== safe.tenantId) {
    return NextResponse.json(
      { ok: false, error: "Forbidden (tenant mismatch)." },
      { status: 403, headers: { "cache-control": "no-store" } }
    );
  }

  if (!classroomId) {
    return NextResponse.json(
      { ok: false, error: "Missing classroomId." },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  try {
    const classroom = await prisma.classroom.findFirst({
      where: { id: classroomId, tenantId: safe.tenantId },
      select: { id: true },
    });

    if (!classroom) {
      return NextResponse.json(
        { ok: false, error: "Classroom not found for active tenant." },
        { status: 404, headers: { "cache-control": "no-store" } }
      );
    }

    const students = await prisma.student.findMany({
      where: { tenantId: safe.tenantId, classroomId },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return NextResponse.json(
      { ok: true, count: students.length, students },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    console.error("[ATTENDANCE_STUDENTS_ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load students from database." },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
