// src/app/api/headteacher/attendance/certify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";

export const dynamic = "force-dynamic";

type Body = {
  sessionId?: string;
  note?: string | null;
};

type Resp =
  | { ok: true; item: { id: string; certifiedAt: string; certifiedByUserId: string } }
  | { ok: false; error: string };

function jsonNoStore(payload: any, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json(payload, {
    status: init?.status ?? 200,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function isLikelyId(id: string) {
  return /^[a-zA-Z0-9_-]{5,80}$/.test(id);
}

function cleanNote(v: unknown, max = 500) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function getRequestIp(req: NextRequest): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() ?? null;

  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();

  return null;
}

async function writeAudit(params: {
  tenantId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  metadata?: Record<string, any>;
  ip?: string | null;
  userAgent?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
        metadata: params.metadata ?? {},
      },
    });
  } catch {
    // Audit must never break the primary action.
  }
}

export async function GET() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use POST." } satisfies Resp, { status: 405 });
}

export async function POST(req: NextRequest): Promise<NextResponse<Resp>> {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized." } satisfies Resp, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonNoStore({ ok: false, error: "Invalid JSON body." } satisfies Resp, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const note = cleanNote(body.note);

  if (!sessionId || !isLikelyId(sessionId)) {
    return jsonNoStore({ ok: false, error: "Missing or invalid sessionId." } satisfies Resp, { status: 400 });
  }

  try {
    const current = await prisma.attendanceSession.findFirst({
      where: { id: sessionId, tenantId: ctx.tenantId },
      select: { id: true, isClosed: true, certifiedAt: true, classroomId: true, date: true },
    });

    if (!current) {
      return jsonNoStore({ ok: false, error: "Attendance session not found." } satisfies Resp, { status: 404 });
    }

    if (!current.isClosed) {
      return jsonNoStore({ ok: false, error: "Only CLOSED sessions can be certified." } satisfies Resp, { status: 400 });
    }

    if (current.certifiedAt) {
      return jsonNoStore({ ok: false, error: "This session is already certified." } satisfies Resp, { status: 409 });
    }

    const now = new Date();

    const write = await prisma.attendanceSession.updateMany({
      where: { id: sessionId, tenantId: ctx.tenantId, isClosed: true, certifiedAt: null },
      data: {
        certifiedAt: now,
        certifiedByUserId: ctx.userId,
        certifiedNote: note ?? null,
      },
    });

    if (write.count !== 1) {
      return jsonNoStore({ ok: false, error: "Could not certify. Refresh and try again." } satisfies Resp, { status: 409 });
    }

    await writeAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "ATTENDANCE_CERTIFIED",
      resource: "AttendanceSession",
      resourceId: sessionId,
      ip: getRequestIp(req),
      userAgent: req.headers.get("user-agent"),
      metadata: { note: note ?? null },
    });

    return jsonNoStore({
      ok: true,
      item: {
        id: sessionId,
        certifiedAt: now.toISOString(),
        certifiedByUserId: ctx.userId,
      },
    } satisfies Resp);
  } catch (err) {
    console.error("HEADTEACHER_ATTENDANCE_CERTIFY_ERROR", err);
    return jsonNoStore({ ok: false, error: "Server error certifying attendance." } satisfies Resp, { status: 500 });
  }
}
