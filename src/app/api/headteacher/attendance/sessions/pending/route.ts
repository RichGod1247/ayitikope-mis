// src/app/api/headteacher/attendance/sessions/pending/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import { defaultLast7DaysRange, toISODateOnly } from "@/lib/headteacherAttendanceWeekly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(req: NextRequest) {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const startQ = toISODateOnly(searchParams.get("start"));
  const endQ = toISODateOnly(searchParams.get("end"));
  const range = startQ && endQ ? { start: startQ, end: endQ } : defaultLast7DaysRange();

  try {
    const sessions = await prisma.attendanceSession.findMany({
      where: {
        tenantId: ctx.tenantId,
        isClosed: true,
        certifiedAt: null,
        date: {
          gte: new Date(`${range.start}T00:00:00.000Z`),
          lte: new Date(`${range.end}T23:59:59.999Z`),
        },
      },
      orderBy: [{ date: "desc" }],
      select: {
        id: true,
        date: true,
        classroomId: true,
        isClosed: true,
        certifiedAt: true,
        certifiedNote: true,
        classroom: { select: { name: true, grade: true, arm: true } },
      } as any,
      take: 500,
    });

    const items = sessions.map((s) => {
      const c = (s as any).classroom ?? null;
      const label =
        c?.name?.trim() ||
        (c?.grade ? (c?.arm ? `${c.grade} · Arm ${c.arm}` : `${c.grade}`) : "Class");

      return {
        id: s.id,
        date: s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date ?? ""),
        classroomId: s.classroomId,
        classLabel: label,
      };
    });

    return jsonNoStore({ ok: true, start: range.start, end: range.end, count: items.length, items });
  } catch (err) {
    console.error("[HEADTEACHER_PENDING_SESSIONS_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load pending sessions." }, { status: 500 });
  }
}
