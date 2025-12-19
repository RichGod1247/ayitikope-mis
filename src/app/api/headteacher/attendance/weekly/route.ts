// src/app/api/headteacher/attendance/explain/route.ts

import { NextRequest, NextResponse } from "next/server";

/**
 * AI-like explainer for weekly attendance.
 *
 * POST /api/headteacher/attendance/explain
 *
 * Expected body (what the weekly UI sends):
 * {
 *   tenantId: string;
 *   start: string; // "YYYY-MM-DD"
 *   end: string;   // "YYYY-MM-DD"
 *   totalClasses: number;
 *   totalMarks: number;
 *   totalPresent: number;
 *   totalAbsent: number;
 *   totalLate: number;
 *   totalExcused: number;
 *   overallPresentPercent: number;
 *   classes: {
 *     classLabel: string;
 *     enrolled: number;
 *     marks: number;
 *     present: number;
 *     absent: number;
 *     late: number;
 *     excused: number;
 *     pct: number;
 *   }[];
 * }
 *
 * Returns JSON:
 * {
 *   ok: boolean;
 *   summary?: string;
 *   suggestions?: string;
 *   error?: string;
 * }
 *
 * NOTE:
 * - Purely rule-based. No external AI services.
 * - Safe for low-bandwidth / offline-ish environments.
 */

type WeeklyClassRow = {
  classLabel: string;
  enrolled: number;
  marks: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  pct: number;
};

type WeeklyExplainPayload = {
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
  classes?: WeeklyClassRow[];
};

type AiExplainResponse = {
  ok: boolean;
  summary?: string;
  suggestions?: string;
  error?: string;
};

function safeNumber(n: any, fallback = 0): number {
  const num = Number(n);
  return Number.isFinite(num) ? num : fallback;
}

function buildSummary(payload: WeeklyExplainPayload): string {
  const start = payload.start || "this week";
  const end = payload.end || "";
  const totalClasses = safeNumber(payload.totalClasses, 0);
  const totalMarks = safeNumber(payload.totalMarks, 0);
  const totalPresent = safeNumber(payload.totalPresent, 0);
  const totalAbsent = safeNumber(payload.totalAbsent, 0);

  const classes = Array.isArray(payload.classes)
    ? (payload.classes as WeeklyClassRow[])
    : [];

  const overall =
    typeof payload.overallPresentPercent === "number"
      ? payload.overallPresentPercent
      : totalMarks > 0
      ? (totalPresent / totalMarks) * 100
      : 0;

  // No marks at all → calm explanation
  if (totalMarks === 0 || classes.length === 0) {
    return `For the selected week (${
      end ? `${start} to ${end}` : start
    }), there are no attendance marks recorded in EduLife OS yet. Once teachers begin taking the register through the system, this space will summarise how faithfully classes met and help you spot gaps early.`;
  }

  const parts: string[] = [];

  // 1) Whole-school picture
  let levelSentence = "";
  if (overall >= 95) {
    levelSentence = `Attendance across the school is very strong, with about ${overall.toFixed(
      1
    )}% of all register marks recorded as present.`;
  } else if (overall >= 90) {
    levelSentence = `Attendance across the school is good, with roughly ${overall.toFixed(
      1
    )}% of all marks recorded as present.`;
  } else if (overall >= 80) {
    levelSentence = `Attendance across the school is fair, with around ${overall.toFixed(
      1
    )}% of all marks recorded as present.`;
  } else {
    levelSentence = `Attendance across the school is low this week, with only about ${overall.toFixed(
      1
    )}% of all marks recorded as present.`;
  }

  parts.push(
    `Between ${start}${end ? ` and ${end}` : ""}, teachers took about ${totalMarks.toLocaleString()} register mark(s) across ${totalClasses.toLocaleString()} class(es). ${levelSentence}`
  );

  // 2) Present vs absent in plain language
  parts.push(
    `In simple terms, there were about ${totalPresent.toLocaleString()} present mark(s) and ${totalAbsent.toLocaleString()} absent mark(s) recorded.`
  );

  // 3) Best and weakest classes
  const sorted = [...classes].sort((a, b) => b.pct - a.pct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  if (best) {
    parts.push(
      `The strongest attendance this week came from ${best.classLabel}, with about ${best.pct.toFixed(
        1
      )}% of their marks showing learners present.`
    );
  }

  if (worst && worst !== best) {
    parts.push(
      `The class that needs the most attention is ${worst.classLabel}, at around ${worst.pct.toFixed(
        1
      )}% present.`
    );
  }

  // 4) Overall tone / call to action
  if (overall >= 90) {
    parts.push(
      `Overall, this is a healthy attendance picture. The key is to keep praising classes that are consistent and quietly supporting any learners who are beginning to miss days.`
    );
  } else if (overall >= 80) {
    parts.push(
      `Overall, attendance is workable but can be stronger. A short conversation at staff meeting and reminders to parents can help close the gap before it becomes serious.`
    );
  } else {
    parts.push(
      `Overall, attendance this week needs urgent attention. It may be helpful to sit with class teachers, identify the main learners who are often absent, and plan gentle follow-up with their families.`
    );
  }

  return parts.join(" ");
}

function buildSuggestions(payload: WeeklyExplainPayload): string {
  const classes = Array.isArray(payload.classes)
    ? (payload.classes as WeeklyClassRow[])
    : [];

  const totalMarks = safeNumber(payload.totalMarks, 0);

  if (!classes.length || totalMarks === 0) {
    return [
      "• Encourage teachers to take attendance through EduLife OS every day, so that the dashboard reflects the true picture.",
      "• Once there is at least one full week of marks, revisit this summary and decide which classes need praise and which ones need support.",
    ].join("\n");
  }

  const sorted = [...classes].sort((a, b) => b.pct - a.pct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  const lines: string[] = [];

  if (best) {
    lines.push(
      `• Publicly appreciate ${best.classLabel} for their strong attendance. A simple “well done” at parade can motivate both learners and the class teacher.`
    );
  }

  if (worst) {
    lines.push(
      `• Sit briefly with the teacher of ${worst.classLabel}. Ask if there are specific learners or family situations behind the lower attendance and agree on 1–2 gentle follow-up actions.`
    );
  }

  lines.push(
    "• Share this weekly picture with your circuit supervisor or PTA once in a while to show that the school is watching attendance closely and acting early."
  );

  lines.push(
    "• Over time, you can pair this data with performance and health to see whether absenteeism is affecting learning or signalling deeper wellbeing issues."
  );

  return lines.join("\n");
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<AiExplainResponse>> {
  try {
    let body: WeeklyExplainPayload = {};
    try {
      body = (await req.json()) as WeeklyExplainPayload;
    } catch {
      body = {};
    }

    const summary = buildSummary(body);
    const suggestions = buildSuggestions(body);

    return NextResponse.json(
      {
        ok: true,
        summary,
        suggestions,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[HEAD_ATTENDANCE_EXPLAIN_ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          "The explainer could not process this week’s data. Please try again later or contact the system admin.",
      },
      { status: 500 }
    );
  }
}
