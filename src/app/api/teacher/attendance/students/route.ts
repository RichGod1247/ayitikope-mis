// src/app/api/teacher/attendance/students/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: NO_STORE_HEADERS });
}

async function getSafeTenantCtx() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: unknown; tenantId?: unknown } | undefined;
  const userId = typeof user?.id === "string" ? user.id : "";
  const tenantId = typeof user?.tenantId === "string" ? user.tenantId : "";

  if (!session || !userId) return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  if (!tenantId) return { ok: false as const, status: 403, error: "NO_ACTIVE_TENANT" };

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false as const, status: 403, error: "FORBIDDEN" };
  }

  return { ok: true as const, userId, tenantId };
}

export async function GET(req: Request) {
  const safe = await getSafeTenantCtx();
  if (!safe.ok) return json({ ok: false, error: safe.error }, safe.status);

  const { searchParams } = new URL(req.url);
  const tenantIdParam = (searchParams.get("tenantId") || "").trim(); // back-compat only
  const classroomId = (searchParams.get("classroomId") || "").trim();

  if (tenantIdParam && tenantIdParam !== safe.tenantId) {
    return json({ ok: false, error: "Forbidden (tenant mismatch)." }, 403);
  }

  if (!classroomId) {
    return json({ ok: false, error: "Missing classroomId." }, 400);
  }

  try {
    await assertCanAccessClassroom({
      tenantId: safe.tenantId,
      userId: safe.userId,
      classroomId,
    });

    const students = await prisma.student.findMany({
      where: { tenantId: safe.tenantId, classroomId, status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return json({ ok: true, count: students.length, students });
  } catch (error: unknown) {
    const status = Number((error as { status?: unknown })?.status) || 500;
    const message = error instanceof Error && error.message ? error.message : "Failed to load students from database.";

    if (status === 403 || status === 404) {
      return json({ ok: false, error: message }, status);
    }

    console.error("[ATTENDANCE_STUDENTS_ERROR]", error);
    return json({ ok: false, error: "Failed to load students from database." }, 500);
  }
}
