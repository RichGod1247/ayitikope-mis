// src/app/api/parent/results/explain/route.ts
import { NextRequest, NextResponse } from "next/server";

type GesInfo = {
  grade?: number;
  label?: string;
  band?: string;
};

type SubjectPayload = {
  subject?: string;
  percentage?: number | null;
  ges?: GesInfo | null;
};

type BodyShape = {
  tenantId?: string;
  studentName?: string;
  className?: string;
  term?: string;
  academicYear?: string;
  overallPercentage?: number | null;
  subjects?: SubjectPayload[];
};

function clampPercent(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, v));
}

function gesTextFromSubject(s: SubjectPayload): string | null {
  const p = clampPercent(s.percentage);
  const ges = s.ges || {};
  if (p == null) return null;

  // Prefer provided GES info if any
  if (ges.grade != null || ges.label || ges.band) {
    const parts: string[] = [];
    if (ges.grade != null) parts.push(`Grade ${ges.grade}`);
    if (ges.band) parts.push(ges.band);
    if (ges.label) parts.push(ges.label);
    return parts.join(" – ");
  }

  // Fallback: basic interpretation from percentage
  if (p >= 80) return "Excellent (GES-style high performance)";
  if (p >= 70) return "Very good";
  if (p >= 60) return "Good";
  if (p >= 50) return "Satisfactory / Pass";
  if (p >= 40) return "Below average – needs support";
  return "Weak – needs close support";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as BodyShape | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const {
      tenantId,
      studentName,
      className,
      term = "1st Term",
      academicYear = "2025/2026",
      overallPercentage,
      subjects: rawSubjects,
    } = body;

    const periodLabel = `${term}, ${academicYear}`;

    if (!Array.isArray(rawSubjects)) {
      return NextResponse.json(
        { ok: false, error: "subjects must be an array." },
        { status: 400 }
      );
    }

    // Filter to subjects that actually have a percentage
    const subjects = rawSubjects
      .map((s) => ({
        subject: (s.subject ?? "").trim(),
        percentage: clampPercent(s.percentage ?? null),
        ges: s.ges ?? null,
      }))
      .filter((s) => s.subject && s.percentage != null);

    const childName = (studentName || "your child").trim();
    const classLabel = (className || "their class").trim();

    if (subjects.length === 0) {
      const summary =
        `For **${periodLabel}**, there are not enough continuous assessment scores recorded yet for ${childName}.\n\n` +
        `This simply means teachers have not finished entering marks into EduLife OS, not that your child is doing poorly. ` +
        `Once more scores are captured, you will see a full subject-by-subject picture here.`;

      const suggestions =
        `**How you can support while marks are still being entered**\n` +
        `- Keep encouraging ${childName} to attend school regularly and on time.\n` +
        `- Ask politely if teachers are still entering marks into the new system — this keeps everyone aligned without blame.\n` +
        `- Use this waiting period to build good routines at home (homework time, reading time, and adequate sleep).`;

      return NextResponse.json(
        { ok: true, summary, suggestions, meta: { tenantId: tenantId ?? null } },
        { status: 200 }
      );
    }

    // Overall percentage: use provided or derive simple average
    const subjectPercents = subjects
      .map((s) => s.percentage!)
      .filter((p) => p != null);
    const derivedOverall =
      subjectPercents.length > 0
        ? subjectPercents.reduce((a, b) => a + b, 0) / subjectPercents.length
        : null;

    const overall = clampPercent(
      overallPercentage != null ? overallPercentage : derivedOverall
    );

    // Buckets
    const high = subjects.filter((s) => (s.percentage ?? 0) >= 75);
    const mid = subjects.filter(
      (s) => (s.percentage ?? 0) >= 50 && (s.percentage ?? 0) < 75
    );
    const low = subjects.filter((s) => (s.percentage ?? 0) < 50);

    // Best and weakest
    const sorted = [...subjects].sort(
      (a, b) => (b.percentage ?? 0) - (a.percentage ?? 0)
    );
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    // Short helper for listing subject names
    const listNames = (arr: typeof subjects, limit = 3): string => {
      const names = arr.map((s) => s.subject);
      if (names.length === 0) return "";
      if (names.length <= limit) return names.join(", ");
      const head = names.slice(0, limit).join(", ");
      const remaining = names.length - limit;
      return `${head} and ${remaining} more`;
    };

    // Overall tone line
    let overallLine: string;
    if (overall == null) {
      overallLine =
        `For **${periodLabel}**, ${childName} has a number of recorded scores, ` +
        `but there is not yet enough information to compute a clear overall percentage.`;
    } else if (overall >= 80) {
      overallLine =
        `For **${periodLabel}**, ${childName} is performing at a **very strong level**, ` +
        `with an overall continuous assessment score of about **${overall.toFixed(
          1
        )}%**.`;
    } else if (overall >= 70) {
      overallLine =
        `For **${periodLabel}**, ${childName} is doing **well overall**, ` +
        `with an estimated continuous assessment score of around **${overall.toFixed(
          1
        )}%**.`;
    } else if (overall >= 55) {
      overallLine =
        `For **${periodLabel}**, ${childName} is **holding steady**, ` +
        `with an overall continuous assessment score of about **${overall.toFixed(
          1
        )}%**. There is room to strengthen a few areas.`;
    } else if (overall >= 45) {
      overallLine =
        `For **${periodLabel}**, ${childName}'s overall continuous assessment is around **${overall.toFixed(
          1
        )}%**, ` +
        `which signals that they are **struggling in some subjects** but can improve with focused support.`;
    } else {
      overallLine =
        `For **${periodLabel}**, ${childName}'s overall continuous assessment is about **${overall?.toFixed(
          1
        )}%**, ` +
        `indicating that they are facing **significant difficulty** in several subjects. This is not a verdict on their future, but a call for calm, organised support.`;
    }

    const lines: string[] = [];
    lines.push(overallLine);

    if (best) {
      const bestGes = gesTextFromSubject(best);
      lines.push(
        `- The strongest subject at the moment is **${best.subject}**, with about **${best.percentage!.toFixed(
          1
        )}%**${bestGes ? ` (${bestGes})` : ""}.`
      );
    }

    if (worst && worst !== best) {
      const worstGes = gesTextFromSubject(worst);
      lines.push(
        `- The subject needing the most attention is **${worst.subject}**, with about **${worst.percentage!.toFixed(
          1
        )}%**${worstGes ? ` (${worstGes})` : ""}.`
      );
    }

    if (high.length > 0) {
      lines.push(
        `- ${childName} is especially strong in **${listNames(
          high
        )}**. These are subjects you can praise and use as confidence-builders.`
      );
    }

    if (mid.length > 0) {
      lines.push(
        `- There are also some **steady subjects** (neither very high nor very low) such as **${listNames(
          mid
        )}**. With a bit more practice, these can easily move into the stronger range.`
      );
    }

    if (low.length > 0) {
      lines.push(
        `- A few subjects are clearly **struggling areas** right now, including **${listNames(
          low
        )}**. These are not reasons to panic, but they do need focused support from both home and school.`
      );
    }

    lines.push(
      ``,
      `Taken together, this pattern gives you a calm picture of where ${childName} is shining, where they are stable, and where they need extra help in **${classLabel}** for **${periodLabel}**.`
    );

    const summary = lines.join("\n");

    // ------------- Suggestions (practical plan) -------------
    const suggestionLines: string[] = [];
    suggestionLines.push(
      `**How you can support ${childName} at home, based on this pattern**`
    );

    // Strengths
    if (high.length > 0) {
      suggestionLines.push(
        `1. **Celebrate and protect strengths**`,
        `   - Praise ${childName} specifically for strong performance in **${listNames(
          high
        )}**.`,
        `   - Ask them to explain one topic from a strong subject to you; teaching builds confidence and deepens understanding.`,
        `   - Avoid comparing them to other children. Compare their progress with **their own past performance**.`
      );
    } else {
      suggestionLines.push(
        `1. **Notice any small wins**`,
        `   - Even if there are no very high scores yet, celebrate small improvements (for example, moving from 40% to 50%).`,
        `   - Let ${childName} know you see their efforts, not just their marks.`
      );
    }

    // Mid bucket
    if (mid.length > 0) {
      suggestionLines.push(
        ``,
        `2. **Turn “okay” subjects into strengths**`,
        `   - Focus on subjects like **${listNames(
          mid
        )}**, where ${childName} is already doing fairly well.`,
        `   - Help them build a simple weekly routine: for example, 2–3 short revision sessions of 20–30 minutes focusing on these subjects.`,
        `   - Encourage them to ask questions in class and to use class exercises as practice, not punishment.`
      );
    }

    // Low bucket
    if (low.length > 0) {
      suggestionLines.push(
        ``,
        `3. **Support the struggling areas calmly**`,
        `   - For subjects such as **${listNames(
          low
        )}**, avoid harsh words. Instead, ask: “Which parts feel confusing to you?”`,
        `   - If possible, agree with the class teacher on 1–2 key topics to focus on first, instead of trying to fix everything at once.`,
        `   - Consider pairing ${childName} with a friend who is strong in one of these subjects for short study times.`,
        `   - Watch for signs of stress or fear around these subjects and reassure ${childName} that improvement is a process, not a one-day event.`
      );
    }

    // General habits
    suggestionLines.push(
      ``,
      `4. **Build healthy routines around school work**`,
      `   - Set a regular time and quiet place for homework and revision, even if it is just **30 minutes per day**.`,
      `   - Protect sleep time; tired children struggle to focus, no matter how much they “try”.`,
      `   - Limit distracting screen time on school days, especially close to bedtime.`,
      ``,
      `5. **Stay in gentle partnership with the school**`,
      `   - Share any concerns with teachers early, using this summary as a starting point instead of an argument.`,
      `   - Ask the teacher: “What is one small thing we can do at home to support ${childName} in this subject?”`,
      `   - Remember: these results are **a snapshot**, not a final judgment. With steady support from home and school, the picture can improve term by term.`
    );

    const suggestions = suggestionLines.join("\n");

    return NextResponse.json(
      {
        ok: true,
        summary,
        suggestions,
        meta: {
          tenantId: tenantId ?? null,
          overall,
          subjectCount: subjects.length,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[PARENT_RESULTS_EXPLAIN_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to generate a calm explanation for these results. Please try again or contact the school.",
      },
      { status: 500 }
    );
  }
}
