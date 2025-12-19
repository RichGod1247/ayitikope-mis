// src/app/api/student/assessment/explain/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Student Assessment AI-style Explainer
 *
 * GET /api/student/assessment/explain?studentId=...&term=...&academicYear=...
 *
 * Returns:
 *  - A simple "story" summary of the learner's performance.
 *  - A short, friendly set of suggestions.
 *
 * This is rule-based (no external AI call yet) but structured
 * so we can later swap the text generation with a real LLM.
 */

type SubjectAgg = {
  subject: string;
  totalScore: number;
  totalMax: number;
  percentage: number | null;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const studentId = (searchParams.get("studentId") || "").trim();
    const term = searchParams.get("term") || "1st Term";
    const academicYear =
      searchParams.get("academicYear") || "2025/2026";

    if (!studentId) {
      return NextResponse.json(
        { ok: false, error: "studentId is required." },
        { status: 400 }
      );
    }

    const client = prisma as any;

    // 1) Load all CA scores for this learner in the selected term/year
    const scores = await client.assessmentScore.findMany({
      where: {
        studentId,
        item: {
          term,
          academicYear,
        },
      },
      select: {
        score: true,
        item: {
          select: {
            subject: true,
            maxScore: true,
          },
        },
      },
    });

    if (!scores || scores.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          studentId,
          term,
          academicYear,
          summary:
            "For this term, there are no continuous assessment scores recorded for you yet in EduLife OS. Once your teachers start entering your test and quiz scores, I will be able to explain how you are doing in each subject.",
          suggestions:
            "For now, focus on:\n\n- Listening well in class and asking questions.\n- Doing all homework on time.\n- Revising your notes at least 10–15 minutes a day.\n\nWhen your scores are entered, we will turn your numbers into a story together.",
          meta: {
            overallPercentage: null,
            bestSubject: null,
            weakestSubject: null,
            subjectCount: 0,
          },
        },
        { status: 200 }
      );
    }

    // 2) Aggregate scores by subject
    const bySubject = new Map<string, SubjectAgg>();

    for (const row of scores) {
      const subjectName = row.item?.subject || "Subject";
      const score = typeof row.score === "number" ? row.score : 0;
      const max = typeof row.item?.maxScore === "number"
        ? row.item.maxScore
        : 0;

      if (!bySubject.has(subjectName)) {
        bySubject.set(subjectName, {
          subject: subjectName,
          totalScore: 0,
          totalMax: 0,
          percentage: null,
        });
      }

      const agg = bySubject.get(subjectName)!;
      agg.totalScore += score;
      agg.totalMax += max;
    }

    // 3) Compute per-subject percentages
    let grandTotalScore = 0;
    let grandTotalMax = 0;

    const subjects: SubjectAgg[] = [];

    for (const agg of bySubject.values()) {
      grandTotalScore += agg.totalScore;
      grandTotalMax += agg.totalMax;

      const pct =
        agg.totalMax > 0
          ? (agg.totalScore / agg.totalMax) * 100
          : null;

      subjects.push({
        ...agg,
        percentage:
          pct !== null ? Number(pct.toFixed(1)) : null,
      });
    }

    // 4) Overall percentage
    const overallPercentage =
      grandTotalMax > 0
        ? Number(((grandTotalScore / grandTotalMax) * 100).toFixed(1))
        : null;

    // 5) Best and weakest subjects (only where percentage != null)
    const subjectsWithPct = subjects.filter(
      (s) => s.percentage !== null
    );

    let bestSubject: SubjectAgg | null = null;
    let weakestSubject: SubjectAgg | null = null;

    if (subjectsWithPct.length > 0) {
      subjectsWithPct.sort(
        (a, b) => (b.percentage ?? 0) - (a.percentage ?? 0)
      );
      bestSubject = subjectsWithPct[0] || null;
      weakestSubject =
        subjectsWithPct[subjectsWithPct.length - 1] || null;
    }

    const subjectCount = subjects.length;

    // 6) Build a simple, friendly summary (talking to the learner)
    const periodLabel = `${term}, ${academicYear}`;

    const lines: string[] = [];

    if (overallPercentage !== null) {
      lines.push(
        `For **${periodLabel}**, your overall continuous assessment average is about **${overallPercentage.toFixed(
          1
        )}%** across **${subjectCount}** subject(s).`
      );
    } else {
      lines.push(
        `For **${periodLabel}**, some scores are missing max marks, so it's hard to calculate a full average.`
      );
    }

    if (bestSubject && bestSubject.percentage !== null) {
      lines.push(
        `• Your strongest subject so far is **${bestSubject.subject}**, at about **${bestSubject.percentage.toFixed(
          1
        )}%**. This is a subject you can build confidence around.`
      );
    }

    if (
      weakestSubject &&
      weakestSubject.percentage !== null &&
      weakestSubject.subject !== bestSubject?.subject
    ) {
      lines.push(
        `• The subject that needs the most support is **${weakestSubject.subject}**, at around **${weakestSubject.percentage.toFixed(
          1
        )}%**. This is not a failure — it's simply a signal of where to focus.`
      );
    }

    if (subjectsWithPct.length === 0) {
      lines.push(
        `Right now, I don't have enough complete data (score + max score) to clearly rank your subjects, but we can still use the scores to see where you are trying your best.`
      );
    }

    lines.push("");
    lines.push(
      `Remember: these numbers are **not your identity**. They are just a mirror to help you see where you're strong and where you can grow.`
    );

    const summary = lines.join("\n");

    // 7) Suggestions – simple, action-focused
    const suggestionLines: string[] = [];

    suggestionLines.push(
      `Here are a few simple steps you can take:`
    );
    suggestionLines.push(
      `- Pick one strong subject (like **${
        bestSubject?.subject ?? "your best subject"
      }**) and keep reading a little extra to stay ahead.`
    );
    suggestionLines.push(
      `- Pick one weaker subject (like **${
        weakestSubject?.subject ?? "your weakest subject"
      }**) and:\n  • Ask your teacher for help at least once a week.\n  • Practise 2–3 questions every evening.\n  • Study that subject with a friend who understands it well.`
    );
    suggestionLines.push(
      `- Set a small target: for example, “I want to improve my overall average by **5–10%** next term.”`
    );
    suggestionLines.push(
      `- Use your phone or a small notebook to track what you studied each day. Small, consistent effort beats last-minute panic.`
    );

    const suggestions = suggestionLines.join("\n");

    return NextResponse.json(
      {
        ok: true,
        studentId,
        term,
        academicYear,
        summary,
        suggestions,
        meta: {
          overallPercentage,
          bestSubject: bestSubject
            ? {
                subject: bestSubject.subject,
                percentage: bestSubject.percentage,
              }
            : null,
          weakestSubject: weakestSubject
            ? {
                subject: weakestSubject.subject,
                percentage: weakestSubject.percentage,
              }
            : null,
          subjectCount,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[STUDENT_ASSESSMENT_EXPLAIN_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to generate assessment explanation for this learner. Please try again.",
      },
      { status: 500 }
    );
  }
}
