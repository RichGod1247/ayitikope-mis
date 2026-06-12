//src/app/api/admin/attendance/scan-audit/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { AttendanceScanStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTenantContext, toHttpError } from "@/lib/server/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  date: z.string().optional(),
  classroomId: z.string().optional(),
  studentId: z.string().optional(),
  status: z.enum(["ALL", "ACCEPTED", "DUPLICATE", "REJECTED"]).optional(),
  take: z.string().optional(),
});

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function isScanAuditAdminRole(roleName: string | null | undefined) {
  const r = String(roleName ?? "").toUpperCase();

  return (
    r.includes("ADMIN") ||
    r.includes("HEAD") ||
    r.includes("OWNER") ||
    r === "SUPERADMIN"
  );
}

async function requireScanAuditAdmin(userId: string, tenantId: string) {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      tenantId,
      status: "ACTIVE",
    },
    select: {
      role: {
        select: {
          name: true,
        },
      },
    },
  });

  const roleName = membership?.role?.name ?? null;

  if (!membership || !isScanAuditAdminRole(roleName)) {
    const err = new Error("FORBIDDEN");
    (err as { status?: number }).status = 403;
    throw err;
  }

  return roleName;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value: unknown) {
  const raw = clean(value);
  if (!raw) return todayISO();

  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayISO();
}

function parseDateOnly(dateISO: string) {
  return new Date(`${dateISO}T00:00:00.000Z`);
}

function clampTake(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 80;

  return Math.min(Math.max(Math.trunc(n), 10), 200);
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return (
    [firstName, lastName].filter(Boolean).join(" ").trim() || "Unnamed learner"
  );
}

function classLabel(
  c?: {
    name?: string | null;
    grade?: string | null;
    arm?: string | null;
  } | null,
) {
  return [c?.name, c?.grade, c?.arm].filter(Boolean).join(" • ") || "Class";
}

function actorLabel(
  user?: { name?: string | null; email?: string | null } | null,
) {
  return clean(user?.name) || clean(user?.email) || "School staff";
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireTenantContext();

    const safe = {
      userId: ctx.userId,
      tenantId: ctx.tenantId,
    };

    await requireScanAuditAdmin(safe.userId, safe.tenantId);

    const { searchParams } = new URL(req.url);

    const parsed = QuerySchema.safeParse({
      date: searchParams.get("date") ?? undefined,
      classroomId: searchParams.get("classroomId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      take: searchParams.get("take") ?? undefined,
    });

    if (!parsed.success) {
      return json(400, {
        ok: false,
        error: "Invalid scan audit query.",
        details: parsed.error.flatten(),
      });
    }

    const dateISO = normalizeDate(parsed.data.date);
    const dateObj = parseDateOnly(dateISO);
    const take = clampTake(parsed.data.take);

    const classroomId = clean(parsed.data.classroomId);
    const studentId = clean(parsed.data.studentId);
    const statusFilter = parsed.data.status ?? "ALL";

    const where: Prisma.AttendanceScanEventWhereInput = {
      tenantId: safe.tenantId,
      ...(classroomId ? { classroomId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(statusFilter === "ALL"
        ? {}
        : { status: statusFilter as AttendanceScanStatus }),
      session: {
        date: dateObj,
      },
    };

    const events = await prisma.attendanceScanEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        createdAt: true,
        source: true,
        status: true,
        attendanceStatus: true,
        reason: true,
        session: {
          select: {
            id: true,
            date: true,
            isClosed: true,
            certifiedAt: true,
          },
        },
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            arm: true,
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        badge: {
          select: {
            id: true,
            tokenHint: true,
            issuedAt: true,
            revokedAt: true,
          },
        },
        scannedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const summary = {
      total: events.length,
      accepted: events.filter((event) => event.status === "ACCEPTED").length,
      duplicate: events.filter((event) => event.status === "DUPLICATE").length,
      rejected: events.filter((event) => event.status === "REJECTED").length,
      returned: events.length,
      take,
    };

    return json(200, {
      ok: true,
      date: dateISO,
      privacy: {
        rawQrPayloadExposed: false,
        rawTokenHashExposed: false,
        parentDataExposed: false,
        healthDataExposed: false,
        note: "Scan audit exposes operational attendance evidence only. Raw QR secrets, token hashes, parent data, health data, and location data are not returned.",
      },
      summary,
      items: events.map((event) => ({
        id: event.id,
        createdAt: iso(event.createdAt),
        source: event.source,
        status: event.status,
        attendanceStatus: event.attendanceStatus,
        reason: event.reason,
        credential: {
          kind: event.badge ? "ATTENDANCE_BADGE_V1" : "UNKNOWN",
          badgeId: event.badge?.id ?? null,
          tokenHint: event.badge?.tokenHint ?? null,
          issuedAt: iso(event.badge?.issuedAt),
          revokedAt: iso(event.badge?.revokedAt),
        },
        session: {
          id: event.session.id,
          date: iso(event.session.date)?.slice(0, 10) ?? dateISO,
          isClosed: event.session.isClosed,
          certifiedAt: iso(event.session.certifiedAt),
        },
        classroom: {
          id: event.classroom.id,
          label: classLabel(event.classroom),
        },
        student: event.student
          ? {
              id: event.student.id,
              name: fullName(event.student.firstName, event.student.lastName),
            }
          : null,
        scannedBy: {
          id: event.scannedBy.id,
          label: actorLabel(event.scannedBy),
        },
      })),
    });
  } catch (e) {
    const { status, msg } = toHttpError(e);

    return json(status, {
      ok: false,
      error: msg,
    });
  }
}
