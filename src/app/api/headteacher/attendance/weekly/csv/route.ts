// src/app/api/headteacher/attendance/weekly/csv/route.ts
import { NextRequest } from "next/server";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import {
  defaultLast7DaysRange,
  getWeeklyAttendanceStats,
  toISODateOnly,
} from "@/lib/headteacherAttendanceWeekly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(v: string) {
  // Wrap if contains comma/quote/newline
  if (/[,"\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET(req: NextRequest) {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

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

    const header = [
      "Class",
      "Total Enrolled",
      "Marks Taken",
      "Present",
      "Absent",
      "Late",
      "Excused",
      "Present %",
    ].join(",");

    const lines = stats.rows.map((r) => {
      return [
        csvEscape(r.classLabel),
        String(r.enrolled),
        String(r.marks),
        String(r.present),
        String(r.absent),
        String(r.late),
        String(r.excused),
        r.pct.toFixed(1),
      ].join(",");
    });

    const csv = [header, ...lines].join("\n");

    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="attendance_week_${range.start}_to_${range.end}.csv"`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[HEADTEACHER_WEEKLY_CSV_ERROR]", err);
    return new Response("Failed to generate CSV", { status: 500 });
  }
}
