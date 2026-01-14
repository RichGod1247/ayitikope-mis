// src/app/api/teacher/attendance/sessions/open/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { Prisma } from "@prisma/client";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonErr(status: number, error: string) {
  return NextResponse.json(
    { ok: false, error },
    {
      status,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    }
  );
}

function parseDateISO(dateISO: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
    throw new Error("Invalid dateISO. Use YYYY-MM-DD.");
  }
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid dateISO.");
  return d;
}

type Body = {
  tenantId?: string; // legacy/back-compat only
  classroomId?: string;
  date?: string; // YYYY-MM-DD (client)
  dateISO?: string; // YYYY-MM-DD (legacy)
};

export async function POST(req: Request) {
  // ✅ Auth + tenant source of truth
  let safe: { userId: string; tenantId: string };
  try {
    safe = await requireServerUserContext({ requireTenant: true });
  } catch {
    return jsonErr(401, "Unauthorized.");
  }

  const body = (await req.json().catch(() => null)) as Body | null;

  const classroomId = String(body?.classroomId || "").trim();
  const dateISO = String(body?.dateISO || body?.date || "").trim();
  const tenantIdFromClient = body?.tenantId ? String(body.tenantId).trim() : null;

  if (!classroomId || !dateISO) {
    return jsonErr(400, "classroomId and dateISO/date are required.");
  }

  // If client sends tenantId, it MUST match authenticated tenant (prevents cross-tenant abuse)
  if (tenantIdFromClient && tenantIdFromClient !== safe.tenantId) {
    return jsonErr(403, "Forbidden (tenant mismatch).");
  }

  let date: Date;
  try {
    date = parseDateISO(dateISO);
  } catch (e: any) {
    return jsonErr(400, String(e?.message || "Invalid date."));
  }

  // ✅ Assignment + tenant + existence check
  try {
    await assertCanAccessClassroom({ ...safe, classroomId });
  } catch (e: any) {
    return jsonErr(Number(e?.status) || 403, String(e?.message || "Forbidden."));
  }

  // ✅ Race-safe create/claim logic
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.attendanceSession.findUnique({
        // ✅ FIX: correct composite unique input name
        where: { tenantId_classroomId_date: { tenantId: safe.tenantId, classroomId, date } },
        select: { id: true, certifiedAt: true, takenByUserId: true },
      });

      if (existing?.certifiedAt) {
        return {
          ok: false as const,
          status: 409,
          error: "Session already certified for this class/date.",
        };
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

      // Prevent takeover
      if (existing.takenByUserId && existing.takenByUserId !== safe.userId) {
        return { ok: false as const, status: 403, error: "This session is owned by another user." };
      }

      // Claim ONLY if unowned or already owned by same user (race-safe)
      const updated = await tx.attendanceSession.updateMany({
        where: {
          id: existing.id,
          certifiedAt: null,
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
    // If unique constraint race occurred, re-check and apply the same ownership rules
    const code = String(e?.code || "");
    if (code === "P2002") {
      const existing = await prisma.attendanceSession.findUnique({
        // ✅ FIX: correct composite unique input name
        where: { tenantId_classroomId_date: { tenantId: safe.tenantId, classroomId, date } },
        select: { id: true, certifiedAt: true, takenByUserId: true },
      });

      if (!existing) return jsonErr(500, "Failed to open session.");
      if (existing.certifiedAt) return jsonErr(409, "Session already certified for this class/date.");
      if (existing.takenByUserId && existing.takenByUserId !== safe.userId) {
        return jsonErr(403, "This session is owned by another user.");
      }

      await prisma.attendanceSession.updateMany({
        where: {
          id: existing.id,
          certifiedAt: null,
          OR: [{ takenByUserId: null }, { takenByUserId: safe.userId }],
        },
        data: { takenByUserId: safe.userId },
      });

      return NextResponse.json(
        { ok: true, sessionId: existing.id },
        { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
      );
    }

    return jsonErr(500, "Failed to open session.");
  }
}
