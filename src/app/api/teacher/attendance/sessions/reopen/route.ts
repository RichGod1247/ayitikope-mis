// src/app/api/teacher/attendance/sessions/reopen/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { z } from "zod";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    sessionId: z.string().min(1, "sessionId is required."),
    tenantId: z.string().optional(), // legacy
  })
  .strict();

function jsonErr(status: number, error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

function dateISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  let safe: { userId: string; tenantId: string };
  try {
    safe = await requireServerUserContext({ requireTenant: true });
  } catch {
    return jsonErr(401, "Unauthorized.");
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonErr(400, parsed.error.issues[0]?.message || "Invalid request body.");

  const { sessionId, tenantId: tenantIdParam } = parsed.data;

  if (tenantIdParam && tenantIdParam !== safe.tenantId) return jsonErr(403, "Forbidden (tenant mismatch).");

  const membership = await prisma.membership.findFirst({
    where: { tenantId: safe.tenantId, userId: safe.userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!membership) return jsonErr(403, "Forbidden.");

  const ses = await prisma.attendanceSession.findFirst({
    where: { id: sessionId, tenantId: safe.tenantId },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      date: true,
      isClosed: true,
      closedAt: true,
      certifiedAt: true,
      takenByUserId: true,
      classroom: { select: { name: true } },
    },
  });

  if (!ses) return jsonErr(404, "Session not found.");

  try {
    await assertCanAccessClassroom({ ...safe, classroomId: ses.classroomId });
  } catch (e: any) {
    return jsonErr(Number(e?.status) || 403, String(e?.message || "Forbidden."));
  }

  if (ses.certifiedAt) return jsonErr(409, "Certified sessions cannot be reopened.");
  if (!ses.isClosed) return jsonErr(409, "Session is already open.");

  if (ses.takenByUserId && ses.takenByUserId !== safe.userId) {
    return jsonErr(403, "This session is owned by another user.");
  }

  const upd = await prisma.attendanceSession.updateMany({
    where: {
      id: ses.id,
      tenantId: safe.tenantId,
      certifiedAt: null,
      isClosed: true,
      OR: [{ takenByUserId: null }, { takenByUserId: safe.userId }],
    },
    data: { isClosed: false, closedAt: null, takenByUserId: ses.takenByUserId ?? safe.userId },
  });

  if (upd.count !== 1) return jsonErr(409, "Unable to reopen due to a concurrent update. Retry.");

  const updated = await prisma.attendanceSession.findFirst({
    where: { id: ses.id, tenantId: safe.tenantId },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      date: true,
      isClosed: true,
      closedAt: true,
      certifiedAt: true,
      takenByUserId: true,
      classroom: { select: { name: true } },
    },
  });

  if (!updated) return jsonErr(404, "Session not found.");

  const d = dateISO(updated.date);

  return NextResponse.json(
    {
      ok: true,
      session: {
        id: updated.id,
        tenantId: updated.tenantId,
        classroomId: updated.classroomId,
        classroomName: updated.classroom?.name ?? "",
        date: d,
        dateISO: d,
        takenByUserId: updated.takenByUserId ?? null,
        isClosed: updated.isClosed,
        closedAt: updated.closedAt?.toISOString() ?? null,
        certifiedAt: updated.certifiedAt?.toISOString() ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}
