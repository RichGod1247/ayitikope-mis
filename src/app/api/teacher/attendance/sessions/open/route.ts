// src/app/api/teacher/attendance/sessions/open/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";
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

type Body = {
  tenantId?: string; // legacy/back-compat only
  classroomId?: string;
  date?: string; // YYYY-MM-DD
  dateISO?: string; // legacy YYYY-MM-DD
};

export async function POST(req: Request) {
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
    } catch (e: any) {
      return jsonErr(400, String(e?.message || "Invalid date."));
    }

    await assertCanAccessClassroom({ ...safe, classroomId });

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
  } catch (e: any) {
    // unique race fallback (P2002)
    if (String(e?.code || "") === "P2002") {
      try {
        const ctx = await requireTenantContext();
        const safe = { userId: ctx.userId, tenantId: ctx.tenantId };

        const body = (await req.json().catch(() => null)) as Body | null;
        const classroomId = String(body?.classroomId || "").trim();
        const dateISO = String(body?.dateISO || body?.date || "").trim();
        if (!classroomId || !dateISO) return jsonErr(400, "classroomId and dateISO/date are required.");
        const date = parseDateISO(dateISO);

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

        await prisma.attendanceSession.updateMany({
          where: {
            id: existing.id,
            certifiedAt: null,
            isClosed: false,
            OR: [{ takenByUserId: null }, { takenByUserId: safe.userId }],
          },
          data: { takenByUserId: safe.userId },
        });

        return NextResponse.json(
          { ok: true, sessionId: existing.id },
          { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
        );
      } catch {
        return jsonErr(500, "Failed to open session.");
      }
    }

    const { status, msg } = toHttpError(e);
    return jsonErr(status, msg);
  }
}
