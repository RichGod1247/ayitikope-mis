// src/app/api/headteacher/attendance/explain/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import {
  defaultLast7DaysRange,
  getWeeklyAttendanceStats,
  toISODateOnly,
} from "@/lib/headteacherAttendanceWeekly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BodyLegacy = {
  // IMPORTANT: tenantId is intentionally ignored if sent by legacy UI
  tenantId?: string;

  start?: string;
  end?: string;

  totalClasses?: number;
  totalMarks?: number;
  totalPresent?: number;
  totalAbsent?: number;
  totalLate?: number;
  totalExcused?: number;
  overallPresentPercent?: number;

  classes?: Array<{
    classLabel?: string;
    enrolled?: number;
    marks?: number;
    present?: number;
    absent?: number;
    late?: number;
    excused?: number;
    pct?: number;
  }>;
};

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

function clampPercent(v: number | null | undefined): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function safeTrim(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function listNames(rows: { classLabel: string }[], limit = 3) {
  const names = rows.map((r) => r.classLabel).filter(Boolean);
  if (names.length <= limit) return names.join(", ");
  return `${names.slice(0, limit).join(", ")} and ${names.length - limit} more`;
}

function buildNarrative(params: {
  start: string;
  end: string;
  rows: Array<{ classLabel: string; pct: number; marks: number }>;
  totals: {
    classes: number;
    marks: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    pctOverall: number;
  };
}) {
  const { start, end, rows, totals } = params;
  const periodLabel = `${start} to ${end}`;

  if (!totals.marks || !rows.length) {
    return {
      summary:
        `For **${periodLabel}**, there are no recorded attendance marks yet in EduLife OS.\n\n` +
        `This usually means the week has just started or teachers are still adjusting to taking attendance inside the system.`,
      suggestions:
        `**How to build strong attendance data quickly**\n` +
        `- Remind teachers to take attendance **daily** inside EduLife OS.\n` +
        `- Emphasize that data is for **support**, not punishment.\n` +
        `- Start with consistency before pushing aggressive targets.`,
      meta: { periodLabel, overallPresentPct: 0, numClasses: 0, marksTaken: 0 },
    };
  }

  const sorted = [...rows].sort((a, b) => b.pct - a.pct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  const high = rows.filter((r) => r.pct >= 90);
  const mid = rows.filter((r) => r.pct >= 80 && r.pct < 90);
  const low = rows.filter((r) => r.pct < 80);

  const overallPct = clampPercent(totals.pctOverall);

  const lines: string[] = [];

  if (overallPct >= 95) {
    lines.push(
      `For **${periodLabel}**, whole-school attendance is exceptionally strong at about **${overallPct.toFixed(
        1
      )}%** (from **${totals.marks.toLocaleString()}** marks across **${totals.classes}** classes).`
    );
  } else if (overallPct >= 90) {
    lines.push(
      `For **${periodLabel}**, whole-school attendance is **very healthy** at about **${overallPct.toFixed(
        1
      )}%** (from **${totals.marks.toLocaleString()}** marks across **${totals.classes}** classes).`
    );
  } else if (overallPct >= 80) {
    lines.push(
      `For **${periodLabel}**, school-wide attendance is **moderately good** at around **${overallPct.toFixed(
        1
      )}%** — solid base, but clear room to improve.`
    );
  } else if (overallPct >= 70) {
    lines.push(
      `For **${periodLabel}**, whole-school attendance is about **${overallPct.toFixed(
        1
      )}%** — mixed picture with some classes doing well and others needing follow-up.`
    );
  } else {
    lines.push(
      `For **${periodLabel}**, whole-school attendance is about **${overallPct.toFixed(
        1
      )}%**, which is **lower than ideal** and needs structured follow-up.`
    );
  }

  if (best) lines.push(`- Strongest class: **${best.classLabel}** at about **${best.pct.toFixed(1)}%**.`);
  if (worst && worst !== best) lines.push(`- Needs closest follow-up: **${worst.classLabel}** at about **${worst.pct.toFixed(1)}%**.`);

  if (high.length) lines.push(`- ≥90% classes include **${listNames(high)}**.`);
  if (mid.length) lines.push(`- 80–89% classes include **${listNames(mid)}**.`);
  if (low.length) lines.push(`- <80% classes include **${listNames(low)}**.`);

  if (totals.late > 0 || totals.absent > 0) {
    if (totals.late > totals.absent && totals.late > 10) {
      lines.push("", `There were **${totals.late.toLocaleString()}** late marks — punctuality looks like the main theme this week.`);
    } else if (totals.absent > 0) {
      lines.push("", `There were **${totals.absent.toLocaleString()}** absences and **${totals.late.toLocaleString()}** late marks — absence is the bigger concern this week.`);
    }
  }

  if (totals.excused > 0) {
    lines.push(
      `There were also **${totals.excused.toLocaleString()}** excused absences. Tracking common reasons helps reporting and intervention.`
    );
  }

  const suggestions: string[] = [];
  suggestions.push(`**Practical actions you can take as headteacher**`);
  suggestions.push(
    `1. **Celebrate strong classes** (e.g., **${listNames((high.length ? high : [best]).filter(Boolean) as any)}**).`,
    `2. **Lift the mid-zone** (80–89%) with small weekly targets and peer sharing.`,
    `3. **Support the lowest classes** with short, supportive teacher check-ins and early parent engagement.`,
    `4. **Standardize punctuality/absence follow-up** so teachers apply one consistent approach.`,
    `5. **Protect data quality**: insist attendance is taken in EduLife OS daily.`
  );

  return {
    summary: lines.join("\n"),
    suggestions: suggestions.join("\n"),
    meta: { periodLabel, overallPresentPct: overallPct, numClasses: totals.classes, marksTaken: totals.marks },
  };
}

export async function POST(req: NextRequest) {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });

  let body: BodyLegacy | null = null;
  try {
    body = (await req.json()) as BodyLegacy;
  } catch {
    body = null;
  }

  // Preferred: compute server-trusted stats from start/end
  const startQ = toISODateOnly(body?.start ?? null);
  const endQ = toISODateOnly(body?.end ?? null);
  const range = startQ && endQ ? { start: startQ, end: endQ } : defaultLast7DaysRange();

  try {
    // Backward-compatible: if legacy payload includes classes/pct, we can use it,
    // but we still DO NOT trust tenantId, and we prefer server-computed when absent.
    const legacyClasses = Array.isArray(body?.classes) ? body!.classes! : null;

    if (legacyClasses && legacyClasses.length) {
      const rows = legacyClasses
        .map((c) => ({
          classLabel: safeTrim(c.classLabel),
          pct: clampPercent(typeof c.pct === "number" ? c.pct : 0),
          marks: typeof c.marks === "number" ? c.marks : 0,
        }))
        .filter((r) => r.classLabel);

      const totals = {
        classes: typeof body?.totalClasses === "number" ? body!.totalClasses! : rows.length,
        marks:
          typeof body?.totalMarks === "number"
            ? body!.totalMarks!
            : rows.reduce((s, r) => s + (r.marks ?? 0), 0),
        present: typeof body?.totalPresent === "number" ? body!.totalPresent! : 0,
        absent: typeof body?.totalAbsent === "number" ? body!.totalAbsent! : 0,
        late: typeof body?.totalLate === "number" ? body!.totalLate! : 0,
        excused: typeof body?.totalExcused === "number" ? body!.totalExcused! : 0,
        pctOverall: clampPercent(body?.overallPresentPercent),
      };

      const out = buildNarrative({ start: range.start, end: range.end, rows, totals });
      return jsonNoStore({ ok: true, ...out }, { status: 200 });
    }

    const stats = await getWeeklyAttendanceStats({
      tenantId: ctx.tenantId,
      start: range.start,
      end: range.end,
    });

    const rows = stats.rows.map((r) => ({ classLabel: r.classLabel, pct: r.pct, marks: r.marks }));
    const out = buildNarrative({
      start: stats.start,
      end: stats.end,
      rows,
      totals: {
        classes: stats.totals.classes,
        marks: stats.totals.marks,
        present: stats.totals.present,
        absent: stats.totals.absent,
        late: stats.totals.late,
        excused: stats.totals.excused,
        pctOverall: stats.totals.pctOverall,
      },
    });

    return jsonNoStore({ ok: true, ...out }, { status: 200 });
  } catch (err) {
    console.error("[HEADTEACHER_ATTENDANCE_EXPLAIN_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to generate attendance explanation." }, { status: 500 });
  }
}

export async function GET() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use POST." }, { status: 405 });
}
