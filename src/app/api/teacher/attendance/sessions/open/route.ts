// src/app/api/teacher/attendance/sessions/open/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";
import { assertAttendanceDateInCurrentTerm } from "@/lib/server/attendanceAcademicCalendar";
import {
  requireTenantContext,
  assertTenantParamMatches,
  toHttpError,
} from "@/lib/server/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonErr(status: number, error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

function parseDateISO(dateISO: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error("Invalid dateISO. Use YYYY-MM-DD.");
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid dateISO.");
  return d;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

type Body = {
  tenantId?: string; // legacy/back-compat only
  classroomId?: string;
  date?: string; // YYYY-MM-DD
  dateISO?: string; // legacy YYYY-MM-DD
};

type SafeCtx = { userId: string; tenantId: string };

type OpenInput = {
  safe: SafeCtx;
  classroomId: string;
  date: Date;
};

async function recoverUniqueRace({ safe, classroomId, date }: OpenInput) {
  // Revalidate classroom authority on the fallback path as well. A unique-race
  // recovery must never become an authorization bypass.
  await assertCanAccessClassroom({ ...safe, classroomId });
  await assertAttendanceDateInCurrentTerm({ tenantId: safe.tenantId, date });

  const existing = await prisma.attendanceSession.findFirst({
    where: { tenantId: safe.tenantId, classroomId, date },
    select: { id: true, certifiedAt: true, takenByUserId: true, isClosed: true },
  });

  if (!existing) return jsonErr(500, "Failed to open session.");
  if (existing.certifiedAt) return jsonErr(409, "Session already certified for this class/date.");
  if (existing.isClosed) return jsonErr(409, "Session is closed. Reopen it before editing.");
  if (existing.takenByUserId && existing.takenByUserId !== safe.userId) {
    return jsonErr(403, "This session is owned by another user.");
  }

  const claimed = await prisma.attendanceSession.updateMany({
    where: {
      id: existing.id,
      certifiedAt: null,
      isClosed: false,
      OR: [{ takenByUserId: null }, { takenByUserId: safe.userId }],
    },
    data: { takenByUserId: safe.userId },
  });

  if (claimed.count !== 1) {
    return jsonErr(403, "This session was claimed by another user.");
  }

  return NextResponse.json(
    { ok: true, sessionId: existing.id },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

export async function POST(req: Request) {
  let input: OpenInput | null = null;

  try {
    const ctx = await requireTenantContext();
    const safe = { userId: ctx.userId, tenantId: ctx.tenantId };

    const body = (await req.json().catch(() => null)) as Body | null;

    const classroomId = String(body?.classroomId || "").trim();
    const dateISO = String(body?.dateISO || body?.date || "").trim();
    const suppliedTenantId = body?.tenantId ? String(body.tenantId).trim() || null : null;

    if (!classroomId || !dateISO) return jsonErr(400, "classroomId and dateISO/date are required.");

    // compat-only tenant param
    assertTenantParamMatches(safe.tenantId, suppliedTenantId);

    let date: Date;
    try {
      date = parseDateISO(dateISO);
    } catch (error: unknown) {
      return jsonErr(400, errorMessage(error, "Invalid date."));
    }

    input = { safe, classroomId, date };

    await assertCanAccessClassroom({ ...safe, classroomId });
    await assertAttendanceDateInCurrentTerm({ tenantId: safe.tenantId, date });

    const findSession = (tx: Prisma.TransactionClient) =>
      tx.attendanceSession.findFirst({
        where: { tenantId: safe.tenantId, classroomId, date },
        select: { id: true, certifiedAt: true, takenByUserId: true, isClosed: true },
      });

    const result = await prisma.$transaction(async (tx) => {
      const existing = await findSession(tx);

      if (existing?.certifiedAt) {
        return { ok: false as const, status: 409, error: "Session already certified for this class/date." };
      }

      if (existing?.isClosed) {
        return { ok: false as const, status: 409, error: "Session is closed. Reopen it before editing." };
      }

      if (!existing) {
        const created = await tx.attendanceSession.create({
          data: {
            tenantId: safe.tenantId,
            classroomId,
            date,
            takenByUserId: safe.userId,
            isClosed: false,
          },
          select: { id: true },
        });
        return { ok: true as const, sessionId: created.id };
      }

      if (existing.takenByUserId && existing.takenByUserId !== safe.userId) {
        return { ok: false as const, status: 403, error: "This session is owned by another user." };
      }

      const updated = await tx.attendanceSession.updateMany({
        where: {
          id: existing.id,
          certifiedAt: null,
          isClosed: false,
          OR: [{ takenByUserId: null }, { takenByUserId: safe.userId }],
        },
        data: { takenByUserId: safe.userId },
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
  } catch (error: unknown) {
    if (String((error as { code?: unknown })?.code ?? "") === "P2002" && input) {
      try {
        return await recoverUniqueRace(input);
      } catch (raceError: unknown) {
        const { status, msg } = toHttpError(raceError);
        return jsonErr(status, msg);
      }
    }

    const { status, msg } = toHttpError(error);
    return jsonErr(status, msg);
  }
}
