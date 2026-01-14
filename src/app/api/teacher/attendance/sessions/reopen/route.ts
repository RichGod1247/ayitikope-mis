import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  sessionId: z.string().min(1, "sessionId is required."),
  // tenantId may be sent by legacy clients; never trust it.
  tenantId: z.string().optional(),
});

function jsonErr(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
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
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message || "Invalid request body.";
    return jsonErr(400, msg);
  }

  const { sessionId, tenantId: tenantIdParam } = parsed.data;

  if (tenantIdParam && tenantIdParam !== safe.tenantId) {
    return jsonErr(403, "Forbidden (tenant mismatch).");
  }

  const membership = await prisma.membership.findFirst({
    where: { tenantId: safe.tenantId, userId: safe.userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!membership) return jsonErr(403, "Forbidden.");

  // Read session (tenant-scoped)
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
  if (ses.certifiedAt) return jsonErr(409, "Certified sessions cannot be reopened.");
  if (!ses.isClosed) return jsonErr(409, "Session is already open.");

  // Prevent silent takeover (consistent with your open route)
  if (ses.takenByUserId && ses.takenByUserId !== safe.userId) {
    return jsonErr(403, "This session is owned by another user.");
  }

  // Update (and claim ownership if null)
  const updated = await prisma.attendanceSession.update({
    where: { id: sessionId },
    data: { isClosed: false, closedAt: null, takenByUserId: ses.takenByUserId ?? safe.userId },
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

  return NextResponse.json({
    ok: true,
    session: {
      id: updated.id,
      tenantId: updated.tenantId,
      classroomId: updated.classroomId,
      classroomName: updated.classroom?.name ?? "",
      dateISO: dateISO(updated.date),
      takenByUserId: updated.takenByUserId ?? null,
      isClosed: updated.isClosed,
      closedAt: updated.closedAt?.toISOString() ?? null,
      certifiedAt: updated.certifiedAt?.toISOString() ?? null,
    },
  });
}
