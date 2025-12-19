// src/app/api/student/results/explain/route.ts
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

  if (ges.grade != null || ges.label || ges.band) {
    const parts: string[] = [];
    if (ges.grade != null) parts.push(`Grade ${ges.grade}`);
    if (ges.band) parts.push(ges.band);
    if (ges.label) parts.push(ges.label);
    return parts.join(" – ");
  }

  if (p >= 80) return "Excellent";
  if (p >= 70) return "Very good";
  if (p >= 60) return "Good";
  if (p >= 50) return "Pass";
  if (p >= 40) return "Below average";
  return "Weak – needs support";
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
    const youName = (studentName || "you").trim();
    const classLabel = (className || "your class").trim();

    if (!Array.isArray(rawSubjects)) {
      return NextResponse.json(
        { ok: false, error: "subjects must be an array." },
        { status: 400 }
      );
    }

    const subjects = rawSubjects
      .map((s) => ({
        subject: (s.subject ?? "").trim(),
        percentage: clampPercent(s.percentage ?? null),
        ges: s.ges ?? null,
      }))
      .filter((s) => s.subject && s.percentage != null);

    if (subjects.length === 0) {
      const summary =
        `For **${periodLabel}**, there are not enough continuous assessment scores recorded for you yet.\n\n` +
        `That does **not** mean you are doing badly. It simply means teachers are still entering marks into EduLife OS. ` +
        `Once more scores are inside the system, this page will show your subjects one by one.`;

      const suggestions =
        `**What you can do while marks are still being entered**\n` +
        `- Keep paying attention in class and doing your classwork and homework.\n` +
        `- Ask your teacher if there is any assignment or topic you can revise ahead of time.\n` +
        `- Use this waiting time to build good habits: a small daily study time, enough sleep, and less distraction during study.`;

      return NextResponse.json(
        { ok: true, summary, suggestions, meta: { tenantId: tenantId ?? null } },
        { status: 200 }
      );
    }

    // Overall percentage
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

    const sorted = [...subjects].sort(
      (a, b) => (b.percentage ?? 0) - (a.percentage ?? 0)
    );
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    const listNames = (arr: typeof subjects, limit = 3): string => {
      const names = arr.map((s) => s.subject);
      if (names.length === 0) return "";
      if (names.length <= limit) return names.join(", ");
      const head = names.slice(0, limit).join(", ");
      const remaining = names.length - limit;
      return `${head} and ${remaining} more`;
    };

    let overallLine: string;
    if (overall == null) {
      overallLine =
        `For **${periodLabel}**, there are some scores for you, but not enough to calculate a clear overall percentage yet.`;
    } else if (overall >= 80) {
      overallLine =
        `For **${periodLabel}**, your overall continuous assessment is about **${overall.toFixed(
          1
        )}%** — this is a **very strong performance**.`;
    } else if (overall >= 70) {
      overallLine =
        `For **${periodLabel}**, your overall score is around **${overall.toFixed(
          1
        )}%**, which means you are doing **well** but can still push certain areas higher.`;
    } else if (overall >= 55) {
      overallLine =
        `For **${periodLabel}**, your overall score is about **${overall.toFixed(
          1
        )}%**. This shows that you are **in the middle** — not failing, but with clear room to grow.`;
    } else if (overall >= 45) {
      overallLine =
        `For **${periodLabel}**, your overall continuous assessment is around **${overall.toFixed(
          1
        )}%**, which tells us that you are **struggling in some places**, but you can definitely improve with a clear plan.`;
    } else {
      overallLine =
        `For **${periodLabel}**, your overall continuous assessment is about **${overall?.toFixed(
          1
        )}%**. This does **not** mean you are not intelligent; it simply means your current habits, understanding, or support are not yet strong enough — and those can change.`;
    }

    const lines: string[] = [];
    lines.push(overallLine);

    if (best) {
      const bestGes = gesTextFromSubject(best);
      lines.push(
        `- Your strongest subject right now is **${best.subject}**, with about **${best.percentage!.toFixed(
          1
        )}%**${bestGes ? ` (${bestGes})` : ""}.`
      );
    }

    if (worst && worst !== best) {
      const worstGes = gesTextFromSubject(worst);
      lines.push(
        `- The subject that needs the **most attention** is **${worst.subject}**, with about **${worst.percentage!.toFixed(
          1
        )}%**${worstGes ? ` (${worstGes})` : ""}.`
      );
    }

    if (high.length > 0) {
      lines.push(
        `- You are doing especially well in **${listNames(
          high
        )}**. These are your current “confidence subjects”.`
      );
    }

    if (mid.length > 0) {
      lines.push(
        `- You are fairly steady in **${listNames(
          mid
        )}**. With a bit more focus, these can move into your strongest group.`
      );
    }

    if (low.length > 0) {
      lines.push(
        `- Subjects like **${listNames(
          low
        )}** are where you need to grow the most right now. This is normal; every serious student has some tough areas.`
      );
    }

    lines.push(
      ``,
      `Overall, this pattern gives you a clear map of where you are strong, where you are okay, and where you need to focus more in **${classLabel}** for **${periodLabel}**.`
    );

    const summary = lines.join("\n");

    // ------------ Suggestions (coach-style) ------------
    const suggestionLines: string[] = [];
    suggestionLines.push(`**Practical steps you can take from here**`);

    if (high.length > 0) {
      suggestionLines.push(
        `1. **Protect your strong subjects**`,
        `   - Keep revising **${listNames(
          high
        )}** regularly so they stay strong.`,
        `   - Let these subjects remind you that **you can understand things deeply** when you put in effort.`,
        `   - If a friend struggles in one of your strong subjects, try explaining a topic to them — teaching makes you even better.`
      );
    } else {
      suggestionLines.push(
        `1. **Notice any small strengths**`,
        `   - Even if you feel you do not have “very strong” subjects yet, look for the ones where you are **slightly better** than others.`,
        `   - Use them to remind yourself that growth is possible.`
      );
    }

    if (mid.length > 0) {
      suggestionLines.push(
        ``,
        `2. **Turn okay subjects into strong subjects**`,
        `   - Choose one or two subjects from **${listNames(
          mid
        )}** to focus on this month.`,
        `   - For each one, pick a fixed time (e.g., 20–30 minutes, 3 times per week) to revise notes and do extra questions.`,
        `   - Ask your teacher: “Which topics should I practice first if I want to improve in this subject?”`
      );
    }

    if (low.length > 0) {
      suggestionLines.push(
        ``,
        `3. **Handle your toughest subjects wisely**`,
        `   - For subjects like **${listNames(
          low
        )}**, do not say “I am just not good at this.” Instead, say: “I have not mastered this **yet**.”`,
        `   - Break the work into small pieces: one topic, one exercise, one past question at a time.`,
        `   - If you can, study with a friend who is strong in one of these areas, or ask the teacher for a few extra minutes after class.`,
        `   - Track any small improvement (for example, moving from 20% to 35%) as a **victory**, not a failure.`
      );
    }

    suggestionLines.push(
      ``,
      `4. **Fix your daily habits around school work**`,
      `   - Create a simple plan for school days: homework time, short revision, and then rest.`,
      `   - Reduce distractions when studying (especially phones and social media).`,
      `   - Sleep well. A tired brain cannot give its best, even if you “try hard”.`,
      ``,
      `5. **Stay in honest conversation with your adults**`,
      `   - Share this summary with your parents or guardians and talk about what you want to improve.`,
      `   - If you feel overwhelmed, tell a trusted adult or teacher early. Hiding struggles usually makes them grow.`,
      ``,
      `Remember: **these results describe your current performance, not your permanent ability**. If you keep showing up, asking questions, and improving your habits a little each week, your pattern can change in the next term and beyond.`
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
    console.error("[STUDENT_RESULTS_EXPLAIN_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to generate an explanation for your results. Please try again or talk to your teacher.",
      },
      { status: 500 }
    );
  }
}
