// src/app/api/student/attendance/summary/route.ts
import { NextResponse } from "next/server";
import { AttendanceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireTenantContext,
  assertTenantParamMatches,
  toHttpError,
} from "@/lib/server/tenantScope";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function jsonErr(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE_HEADERS });
}

function parseISO(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Invalid date. Use YYYY-MM-DD.");
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");
  return d;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const url = new URL(req.url);

    // Backward compat tenantId (optional)
    const suppliedTenantId = (url.searchParams.get("tenantId") || "").trim() || null;
    assertTenantParamMatches(ctx.tenantId, suppliedTenantId);

    // Required (to avoid guessing your auth/student linkage)
    const studentId = (url.searchParams.get("studentId") || "").trim();
    if (!studentId) return jsonErr(400, "studentId is required.");

    // Optional scoping: if you pass classroomId we enforce teacher access
    const classroomId = (url.searchParams.get("classroomId") || "").trim() || null;

    // Optional date range (defaults to last 30 days)
    const toISOParam = (url.searchParams.get("to") || "").trim();
    const fromISOParam = (url.searchParams.get("from") || "").trim();

    const today = new Date();
    const toDate = toISOParam ? parseISO(toISOParam) : parseISO(toISO(today));
    const fromDate = fromISOParam
      ? parseISO(fromISOParam)
      : new Date(toDate.getTime() - 29 * 24 * 60 * 60 * 1000);

    if (fromDate.getTime() > toDate.getTime()) return jsonErr(400, "`from` must be <= `to`.");

    // If classroomId provided, require access (keeps this safe for teacher/HT dashboards)
    if (classroomId) {
      await assertCanAccessClassroom({
        tenantId: ctx.tenantId,
        userId: (ctx as any).userId,
        classroomId,
      });
    }

    // Pull marks with session relation included (fixes "mark.session does not exist")
    const marks = await prisma.attendanceMark.findMany({
      where: {
        studentId,
        session: {
          tenantId: ctx.tenantId,
          ...(classroomId ? { classroomId } : {}),
          date: { gte: fromDate, lte: toDate },
          certifiedAt: { not: null },
          isHoliday: false,
        },
      },
      select: {
        id: true,
        status: true,
        note: true,
        sessionId: true,
        createdAt: true,
        updatedAt: true,
        session: {
          // ✅ No "type" here (fixes your select error)
          select: {
            id: true,
            date: true,
            classroomId: true,
            isClosed: true,
            certifiedAt: true,
          },
        },
      },
      orderBy: { session: { date: "asc" } },
      take: 2000,
    });

    // Aggregate counts
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;

    const items = marks.map((m) => {
      if (m.status === AttendanceStatus.PRESENT) present += 1;
      else if (m.status === AttendanceStatus.ABSENT) absent += 1;
      else if (m.status === AttendanceStatus.LATE) late += 1;
      else if (m.status === AttendanceStatus.EXCUSED) excused += 1;

      return {
        markId: m.id,
        status: m.status,
        note: m.note,
        sessionId: m.sessionId,
        dateISO: toISO(m.session.date),
        classroomId: m.session.classroomId,
        session: {
          isClosed: m.session.isClosed,
          certifiedAt: m.session.certifiedAt,
        },
      };
    });

    return NextResponse.json(
      {
        ok: true,
        range: { from: toISO(fromDate), to: toISO(toDate) },
        studentId,
        classroomId,
        totals: { present, absent, late, excused, marks: marks.length },
        items,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (e) {
    const { status, msg } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status, headers: NO_STORE_HEADERS });
  }
}
