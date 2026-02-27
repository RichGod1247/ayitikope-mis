// src/app/api/teacher/attendance/sessions/open/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { Prisma } from "@prisma/client";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonErr(status: number, error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

function parseDateISO(dateISO: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error("Invalid date. Use YYYY-MM-DD.");
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");
  return d;
}

type Body = {
  tenantId?: string; // legacy/back-compat only
  classroomId?: string;
  date?: string; // YYYY-MM-DD
  dateISO?: string; // legacy
};

export async function POST(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonErr(415, "Content-Type must be application/json.");
  }

  const body = (await req.json().catch(() => null)) as Body | null;

  const classroomId = String(body?.classroomId || "").trim();
  const dateISO = String(body?.dateISO || body?.date || "").trim();
  const tenantIdFromClient = body?.tenantId ? String(body.tenantId).trim() : "";

  if (!classroomId || !dateISO) return jsonErr(400, "classroomId and date are required.");

  if (tenantIdFromClient && tenantIdFromClient !== auth.ctx.tenantId) {
    return jsonErr(403, "Forbidden (tenant mismatch).");
  }

  let date: Date;
  try {
    date = parseDateISO(dateISO);
  } catch (e: any) {
    return jsonErr(400, String(e?.message || "Invalid date."));
  }

  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, tenantId: auth.ctx.tenantId },
    select: { id: true },
  });
  if (!classroom) return jsonErr(404, "Classroom not found.");

  // Teachers must be assigned; admin/headteacher can oversee
  // (assertCanAccessClassroom handles your JHS logic if implemented there)
  await assertCanAccessClassroom({ userId: auth.ctx.userId, tenantId: auth.ctx.tenantId, classroomId });

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.attendanceSession.findFirst({
        where: { tenantId: auth.ctx.tenantId, classroomId, date },
        select: { id: true, certifiedAt: true, takenByUserId: true },
      });

      if (existing?.certifiedAt) {
        return { ok: false as const, status: 409, error: "Session already certified for this class/date." };
      }

      if (!existing) {
        const created = await tx.attendanceSession.create({
          data: { tenantId: auth.ctx.tenantId, classroomId, date, takenByUserId: auth.ctx.userId, isClosed: false },
          select: { id: true },
        });
        return { ok: true as const, sessionId: created.id };
      }

      if (existing.takenByUserId && existing.takenByUserId !== auth.ctx.userId) {
        return { ok: false as const, status: 403, error: "This session is owned by another user." };
      }

      const updated = await tx.attendanceSession.updateMany({
        where: {
          id: existing.id,
          certifiedAt: null,
          OR: [{ takenByUserId: null }, { takenByUserId: auth.ctx.userId }],
        },
        data: { takenByUserId: auth.ctx.userId },
      });

      if (updated.count !== 1) {
        return { ok: false as const, status: 403, error: "This session was claimed by another user." };
      }

      return { ok: true as const, sessionId: existing.id };
    });

    if (!result.ok) return jsonErr(result.status, result.error);

    return NextResponse.json(
      { ok: true, sessionId: result.sessionId },
      { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
    );
  } catch (e: any) {
    if (String(e?.code || "") === "P2002") {
      // Unique conflict: fetch existing
      const existing = await prisma.attendanceSession.findFirst({
        where: { tenantId: auth.ctx.tenantId, classroomId, date },
        select: { id: true, certifiedAt: true, takenByUserId: true },
      });

      if (!existing) return jsonErr(500, "Failed to open session.");
      if (existing.certifiedAt) return jsonErr(409, "Session already certified for this class/date.");
      if (existing.takenByUserId && existing.takenByUserId !== auth.ctx.userId) {
        return jsonErr(403, "This session is owned by another user.");
      }

      await prisma.attendanceSession.updateMany({
        where: {
          id: existing.id,
          certifiedAt: null,
          OR: [{ takenByUserId: null }, { takenByUserId: auth.ctx.userId }],
        },
        data: { takenByUserId: auth.ctx.userId },
      });

      return NextResponse.json(
        { ok: true, sessionId: existing.id },
        { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
      );
    }

    console.error("teacher/attendance/sessions/open error:", e);
    return jsonErr(500, "Failed to open session.");
  }
}
