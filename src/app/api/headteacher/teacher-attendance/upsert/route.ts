import { NextRequest, NextResponse } from "next/server";
import { AttendanceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import { writeAuditLog } from "@/lib/audit";
import {
  readTeacherAttendanceFeatureState,
  teacherAttendanceDisabledPayload,
} from "@/lib/platformFeatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;
type Status = (typeof STATUS)[number];

type Body = {
  sessionId?: string;
  teacherUserId?: string;
  status?: string;
  note?: string | null;
};

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

function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUS as readonly string[]).includes(v);
}

function requestIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

function displayName(user: { name?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined) {
  const full = clean(user?.name);
  if (full) return full;
  const parts = [clean(user?.firstName), clean(user?.lastName)].filter(Boolean).join(" ");
  return parts || clean(user?.email) || "User";
}

export async function POST(req: NextRequest) {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);

  const feature = await readTeacherAttendanceFeatureState();
  if (!feature.enabled) {
    return jsonNoStore(teacherAttendanceDisabledPayload(), 423);
  }

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" }, 415);
  }

  const body = (await req.json().catch(() => null)) as Body | null;

  const sessionId = clean(body?.sessionId);
  const teacherUserId = clean(body?.teacherUserId);
  const statusRaw = clean(body?.status).toUpperCase();
  const note = clean(body?.note).slice(0, 500) || null;

  if (!sessionId) return jsonNoStore({ ok: false, error: "SESSION_ID_REQUIRED" }, 400);
  if (!teacherUserId) return jsonNoStore({ ok: false, error: "TEACHER_USER_ID_REQUIRED" }, 400);
  if (!isStatus(statusRaw)) return jsonNoStore({ ok: false, error: "VALID_STATUS_REQUIRED" }, 400);

  if (teacherUserId === ctx.userId) {
    return jsonNoStore({ ok: false, error: "SELF_MARKING_FORBIDDEN" }, 403);
  }

  try {
    const [session, teacherMembership] = await Promise.all([
      prisma.teacherAttendanceSession.findFirst({
        where: { id: sessionId, tenantId: ctx.tenantId },
        select: { id: true, tenantId: true, date: true, isClosed: true, certifiedAt: true },
      }),
      prisma.membership.findFirst({
        where: { tenantId: ctx.tenantId, userId: teacherUserId, status: "ACTIVE" },
        select: {
          id: true,
          role: { select: { name: true } },
          user: { select: { id: true, name: true, firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    if (!session) return jsonNoStore({ ok: false, error: "TEACHER_ATTENDANCE_SESSION_NOT_FOUND" }, 404);
    if (session.certifiedAt) return jsonNoStore({ ok: false, error: "Teacher attendance is certified and cannot be edited." }, 409);
    if (session.isClosed) return jsonNoStore({ ok: false, error: "Teacher attendance is closed. Reopen it before editing." }, 409);

    if (!teacherMembership || normalizeRole(teacherMembership.role?.name) !== "TEACHER") {
      return jsonNoStore({ ok: false, error: "TARGET_TEACHER_NOT_FOUND" }, 404);
    }

    const existing = await prisma.teacherAttendanceRecord.findUnique({
      where: {
        sessionId_teacherUserId: {
          sessionId: session.id,
          teacherUserId,
        },
      },
      select: { id: true, status: true, note: true, markedByUserId: true, markedAt: true },
    });

    const saved = await prisma.teacherAttendanceRecord.upsert({
      where: {
        sessionId_teacherUserId: {
          sessionId: session.id,
          teacherUserId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        sessionId: session.id,
        teacherUserId,
        date: session.date,
        status: statusRaw as AttendanceStatus,
        note,
        markedByUserId: ctx.userId,
      },
      update: {
        status: statusRaw as AttendanceStatus,
        note,
        markedByUserId: ctx.userId,
        markedAt: new Date(),
      },
      select: {
        id: true,
        teacherUserId: true,
        date: true,
        status: true,
        note: true,
        markedAt: true,
        markedByUserId: true,
        updatedAt: true,
      },
    });

    await writeAuditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: existing ? "TEACHER_ATTENDANCE_UPDATED" : "TEACHER_ATTENDANCE_MARKED",
      resource: "TeacherAttendanceRecord",
      resourceId: saved.id,
      ip: requestIp(req),
      userAgent: req.headers.get("user-agent"),
      metadata: {
        sessionId: session.id,
        date: session.date.toISOString().slice(0, 10),
        teacherUserId,
        teacherName: displayName(teacherMembership.user),
        teacherMembershipId: teacherMembership.id,
        previousStatus: existing?.status ?? null,
        newStatus: saved.status,
        previousNote: existing?.note ?? null,
        newNote: saved.note ?? null,
        selfMarkingBlockedByPolicy: true,
      },
    });

    return jsonNoStore({
      ok: true,
      record: {
        ...saved,
        date: saved.date.toISOString().slice(0, 10),
        note: saved.note ?? "",
        markedAt: saved.markedAt.toISOString(),
        updatedAt: saved.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("[HEADTEACHER_TEACHER_ATTENDANCE_UPSERT_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to save teacher attendance." }, 500);
  }
}
