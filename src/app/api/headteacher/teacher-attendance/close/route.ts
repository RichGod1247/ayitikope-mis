//src/app/api/headteacher/teacher-attendance/close/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { sessionId?: string };

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeRole(v: unknown) {
  return clean(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
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

async function loadCompleteness(tenantId: string, sessionId: string) {
  const [memberships, records] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { userId: true, role: { select: { name: true } } },
    }),
    prisma.teacherAttendanceRecord.findMany({
      where: { tenantId, sessionId },
      select: { teacherUserId: true },
    }),
  ]);

  const teacherIds = memberships
    .filter((m) => normalizeRole(m.role?.name) === "TEACHER")
    .map((m) => m.userId);

  const marked = new Set(records.map((r) => r.teacherUserId));
  const missingTeacherUserIds = teacherIds.filter((id) => !marked.has(id));

  return {
    totalTeachers: teacherIds.length,
    marked: teacherIds.length - missingTeacherUserIds.length,
    unmarked: missingTeacherUserIds.length,
    missingTeacherUserIds,
  };
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
  if (!sessionId) return jsonNoStore({ ok: false, error: "SESSION_ID_REQUIRED" }, 400);

  try {
    const session = await prisma.teacherAttendanceSession.findFirst({
      where: { id: sessionId, tenantId: ctx.tenantId },
      select: {
        id: true,
        date: true,
        isClosed: true,
        closedAt: true,
        certifiedAt: true,
      },
    });

    if (!session) return jsonNoStore({ ok: false, error: "Teacher attendance session not found." }, 404);
    if (session.certifiedAt) return jsonNoStore({ ok: false, error: "Certified teacher attendance is immutable." }, 409);

    const completeness = await loadCompleteness(ctx.tenantId, session.id);

    if (completeness.totalTeachers < 1) {
      return jsonNoStore(
        { ok: false, error: "Cannot close this register because there are no active teacher accounts.", code: "NO_ACTIVE_TEACHERS" },
        409
      );
    }

    if (completeness.unmarked > 0) {
      return jsonNoStore(
        {
          ok: false,
          error: `Cannot close teacher attendance. ${completeness.unmarked} teacher${completeness.unmarked === 1 ? " is" : "s are"} still unmarked.`,
          code: "TEACHER_ATTENDANCE_INCOMPLETE",
          ...completeness,
        },
        409
      );
    }

    if (session.isClosed) {
      return jsonNoStore({ ok: true, sessionId: session.id, alreadyClosed: true, closedAt: session.closedAt?.toISOString() ?? null });
    }

    const now = new Date();
    const updated = await prisma.teacherAttendanceSession.updateMany({
      where: { id: session.id, tenantId: ctx.tenantId, certifiedAt: null, isClosed: false },
      data: { isClosed: true, closedAt: now, closedByUserId: ctx.userId },
    });

    if (updated.count !== 1) return jsonNoStore({ ok: false, error: "Could not close. Refresh and try again." }, 409);

    await audit(req, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "TEACHER_ATTENDANCE_SESSION_CLOSED",
      resourceId: session.id,
      metadata: {
        date: session.date.toISOString().slice(0, 10),
        markedRecords: completeness.marked,
        totalTeachers: completeness.totalTeachers,
        unmarked: completeness.unmarked,
      },
    });

    return jsonNoStore({ ok: true, sessionId: session.id, closedAt: now.toISOString() });
  } catch (err) {
    console.error("[HEADTEACHER_TEACHER_ATTENDANCE_CLOSE_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to close teacher attendance." }, 500);
  }
}
