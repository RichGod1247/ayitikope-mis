// src/app/api/headteacher/attendance/weekly/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import {
  defaultLast7DaysRange,
  getWeeklyAttendanceStats,
  toISODateOnly,
} from "@/lib/headteacherAttendanceWeekly";

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
    const stats = await getWeeklyAttendanceStats({
      tenantId: ctx.tenantId,
      start: range.start,
      end: range.end,
    });

    return jsonNoStore({ ok: true, ...stats }, { status: 200 });
  } catch (err) {
    console.error("[HEADTEACHER_WEEKLY_SUMMARY_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load weekly attendance summary." }, { status: 500 });
  }
}
