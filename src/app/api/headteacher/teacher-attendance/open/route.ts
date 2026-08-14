import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import { writeAuditLog } from "@/lib/audit";
import {
  readTeacherAttendanceFeatureState,
  teacherAttendanceDisabledPayload,
} from "@/lib/platformFeatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { date?: string };

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function toISODateOnly(input: unknown): string | null {
  const raw = clean(input);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toDbDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
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

  const feature = await readTeacherAttendanceFeatureState();
  if (!feature.enabled) {
    return jsonNoStore(teacherAttendanceDisabledPayload(), 423);
  }

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" }, 415);
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const isoDate = toISODateOnly(body?.date);
  if (!isoDate) return jsonNoStore({ ok: false, error: "VALID_DATE_REQUIRED" }, 400);

  const dbDate = toDbDate(isoDate);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.teacherAttendanceSession.findUnique({
        where: { tenantId_date: { tenantId: ctx.tenantId, date: dbDate } },
        select: {
          id: true,
          isClosed: true,
          certifiedAt: true,
          openedAt: true,
        },
      });

      if (existing?.certifiedAt) {
        return { ok: false as const, status: 409, error: "Teacher attendance for this date is already certified." };
      }

      if (existing?.isClosed) {
        return { ok: false as const, status: 409, error: "Teacher attendance is closed. Reopen it before editing." };
      }

      if (existing) {
        return { ok: true as const, created: false, sessionId: existing.id };
      }

      const created = await tx.teacherAttendanceSession.create({
        data: {
          tenantId: ctx.tenantId,
          date: dbDate,
          openedByUserId: ctx.userId,
        },
        select: { id: true },
      });

      return { ok: true as const, created: true, sessionId: created.id };
    });

    if (!result.ok) return jsonNoStore({ ok: false, error: result.error }, result.status);

    await audit(req, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: result.created ? "TEACHER_ATTENDANCE_SESSION_OPENED" : "TEACHER_ATTENDANCE_SESSION_OPEN_REUSED",
      resourceId: result.sessionId,
      metadata: { date: isoDate },
    });

    return jsonNoStore({ ok: true, sessionId: result.sessionId, date: isoDate });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.teacherAttendanceSession.findUnique({
        where: { tenantId_date: { tenantId: ctx.tenantId, date: dbDate } },
        select: { id: true, isClosed: true, certifiedAt: true },
      });

      if (existing?.certifiedAt) return jsonNoStore({ ok: false, error: "Teacher attendance for this date is already certified." }, 409);
      if (existing?.isClosed) return jsonNoStore({ ok: false, error: "Teacher attendance is closed. Reopen it before editing." }, 409);
      if (existing) return jsonNoStore({ ok: true, sessionId: existing.id, date: isoDate });
    }

    console.error("[HEADTEACHER_TEACHER_ATTENDANCE_OPEN_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to open teacher attendance." }, 500);
  }
}
