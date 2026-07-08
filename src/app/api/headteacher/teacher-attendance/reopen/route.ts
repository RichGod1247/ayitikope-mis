//src/app/api/headteacher/teacher-attendance/reopen/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { sessionId?: string; reason?: string };

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function requestIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

async function audit(req: NextRequest, args: { tenantId: string; userId: string; action: string; resourceId: string; metadata?: Record<string, any> }) {
  await writeAuditLog({
    tenantId: args.tenantId,
    userId: args.userId,
    action: args.action,
    resource: "TeacherAttendanceSession",
    resourceId: args.resourceId,
    ip: requestIp(req),
    userAgent: req.headers.get("user-agent"),
    metadata: args.metadata ?? {},
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" }, 415);
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const sessionId = clean(body?.sessionId);
  const reason = clean(body?.reason).slice(0, 500);

  if (!sessionId) return jsonNoStore({ ok: false, error: "SESSION_ID_REQUIRED" }, 400);
  if (reason.length < 8) return jsonNoStore({ ok: false, error: "A clear reopen reason is required." }, 400);

  try {
    const session = await prisma.teacherAttendanceSession.findFirst({
      where: { id: sessionId, tenantId: ctx.tenantId },
      select: {
        id: true,
        date: true,
        isClosed: true,
        closedAt: true,
        closedByUserId: true,
        certifiedAt: true,
      },
    });

    if (!session) return jsonNoStore({ ok: false, error: "Teacher attendance session not found." }, 404);
    if (session.certifiedAt) return jsonNoStore({ ok: false, error: "Certified teacher attendance cannot be reopened." }, 409);
    if (!session.isClosed) return jsonNoStore({ ok: false, error: "Teacher attendance is already open." }, 409);

    const updated = await prisma.teacherAttendanceSession.updateMany({
      where: { id: session.id, tenantId: ctx.tenantId, certifiedAt: null, isClosed: true },
      data: { isClosed: false, closedAt: null, closedByUserId: null },
    });

    if (updated.count !== 1) return jsonNoStore({ ok: false, error: "Could not reopen. Refresh and try again." }, 409);

    await audit(req, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "TEACHER_ATTENDANCE_SESSION_REOPENED",
      resourceId: session.id,
      metadata: {
        reason,
        date: session.date.toISOString().slice(0, 10),
        previous: {
          isClosed: session.isClosed,
          closedAt: session.closedAt?.toISOString() ?? null,
          closedByUserId: session.closedByUserId ?? null,
        },
      },
    });

    return jsonNoStore({ ok: true, sessionId: session.id, reopened: true });
  } catch (err) {
    console.error("[HEADTEACHER_TEACHER_ATTENDANCE_REOPEN_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to reopen teacher attendance." }, 500);
  }
}
