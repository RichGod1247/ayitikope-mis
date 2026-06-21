// src/app/api/student/results/explain/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PolicyInfo = {
  grade?: string | number | null;
  label?: string | null;
  band?: string | null;
  remark?: string | null;
};

type SubjectPayload = {
  subject?: string;
  percentage?: number | null;
  totalPercent?: number | null;
  grade?: string | number | null;
  gradeLabel?: string | null;
  remark?: string | null;
  ges?: PolicyInfo | null;
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

type NormalizedSubject = {
  subject: string;
  percentage: number;
  policyText: string | null;
};

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function clampPercent(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, v));
}

function readTrustedPercentage(subject: SubjectPayload): number | null {
  if (typeof subject.percentage === "number") {
    return clampPercent(subject.percentage);
  }

  if (typeof subject.totalPercent === "number") {
    return clampPercent(subject.totalPercent);
  }

  return null;
}

function policyTextFromSubject(subject: SubjectPayload): string | null {
  const parts: string[] = [];

  if (subject.grade != null && clean(subject.grade)) {
    parts.push(`Grade ${clean(subject.grade)}`);
  }

  if (clean(subject.gradeLabel)) parts.push(clean(subject.gradeLabel));
  if (clean(subject.remark)) parts.push(clean(subject.remark));

  const ges = subject.ges ?? null;
  if (ges) {
    if (ges.grade != null && clean(ges.grade)) parts.push(`Grade ${clean(ges.grade)}`);
    if (clean(ges.band)) parts.push(clean(ges.band));
    if (clean(ges.label)) parts.push(clean(ges.label));
    if (clean(ges.remark)) parts.push(clean(ges.remark));
  }

  const unique = Array.from(new Set(parts.filter(Boolean)));
  return unique.length ? unique.join(" – ") : null;
}

function normalizeSubjects(rawSubjects: unknown): NormalizedSubject[] {
  if (!Array.isArray(rawSubjects)) return [];

  return rawSubjects
    .map((subject) => {
      const s = subject as SubjectPayload;
      const name = clean(s.subject);
      const percentage = readTrustedPercentage(s);

      if (!name || percentage === null) return null;

      return {
        subject: name,
        percentage,
        policyText: policyTextFromSubject(s),
      };
    })
    .filter((s): s is NormalizedSubject => s !== null);
}

function listNames(arr: NormalizedSubject[], limit = 3): string {
  const names = arr.map((s) => s.subject);
  if (names.length === 0) return "";
  if (names.length <= limit) return names.join(", ");
  return `${names.slice(0, limit).join(", ")} and ${names.length - limit} more`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as BodyShape | null;

    if (!body || typeof body !== "object") {
      return noStoreJson({ ok: false, error: "Invalid JSON body." }, 400);
    }

    const youName = clean(body.studentName) || "you";
    const classLabel = clean(body.className) || "your class";
    const term = clean(body.term) || "1st Term";
    const academicYear = clean(body.academicYear) || "2025/2026";
    const periodLabel = `${term}, ${academicYear}`;

    const subjects = normalizeSubjects(body.subjects);

    if (subjects.length === 0) {
      return noStoreJson({
        ok: true,
        summary:
          `For **${periodLabel}**, there are no complete policy-aware subject percentages ready for you yet.\n\n` +
          "That does not mean you are doing badly. It simply means EduLife OS is waiting for trusted assessment evidence before explaining your results.",
        suggestions: [
          "**What you can do while marks are still being completed**",
          "- Keep paying attention in class and doing classwork/homework.",
          "- Ask your teacher which topic you can revise ahead of time.",
          "- Build small daily habits: study time, enough sleep, and fewer distractions.",
        ].join("\n"),
        meta: {
          tenantId: body.tenantId ?? null,
          overall: null,
          subjectCount: 0,
          explanationSource: "policy-payload-only",
        },
      });
    }

    const derivedOverall =
      subjects.reduce((sum, subject) => sum + subject.percentage, 0) /
      subjects.length;

    const overall = clampPercent(
      typeof body.overallPercentage === "number"
        ? body.overallPercentage
        : derivedOverall
    );

    const high = subjects.filter((s) => s.percentage >= 75);
    const mid = subjects.filter((s) => s.percentage >= 50 && s.percentage < 75);
    const low = subjects.filter((s) => s.percentage < 50);

    const sorted = [...subjects].sort((a, b) => b.percentage - a.percentage);
    const best = sorted[0] ?? null;
    const weakest = sorted[sorted.length - 1] ?? null;

    const lines: string[] = [];

    if (overall === null) {
      lines.push(
        `For **${periodLabel}**, there are some scores for ${youName}, but not enough trusted data to calculate a clear overall percentage yet.`
      );
    } else {
      const subjectVerb = youName.toLowerCase() === "you" ? "are" : "is";

      lines.push(
        `For **${periodLabel}**, ${youName} ${subjectVerb} currently around **${overall.toFixed(
          1
        )}%** across the policy-aware subjects available in EduLife OS.`
      );
    }

    if (best) {
      lines.push(
        `- Strongest subject right now: **${best.subject}** (~${best.percentage.toFixed(1)}%${
          best.policyText ? `, ${best.policyText}` : ""
        }).`
      );
    }

    if (weakest && weakest.subject !== best?.subject) {
      lines.push(
        `- Subject needing most attention: **${weakest.subject}** (~${weakest.percentage.toFixed(1)}%${
          weakest.policyText ? `, ${weakest.policyText}` : ""
        }).`
      );
    }

    if (high.length) {
      lines.push(`- Confidence subjects: **${listNames(high)}**.`);
    }

    if (mid.length) {
      lines.push(`- Steady subjects: **${listNames(mid)}**.`);
    }

    if (low.length) {
      lines.push(`- Growth subjects: **${listNames(low)}**.`);
    }

    lines.push(
      "",
      `Overall, this pattern gives you a clear map for **${classLabel}** in **${periodLabel}**. These results describe current performance, not permanent ability.`
    );

    const suggestionLines: string[] = [];

    suggestionLines.push("**Practical steps you can take from here**");

    if (best) {
      suggestionLines.push(
        `1. **Protect your strength**`,
        `   - Keep revising **${best.subject}** so it stays strong.`,
        "   - Try explaining a topic from this subject to a friend; teaching helps you remember better."
      );
    }

    if (weakest) {
      suggestionLines.push(
        "",
        `2. **Focus on your biggest growth area**`,
        `   - Start with **${weakest.subject}** for two weeks.`,
        "   - Practise one topic, one exercise, and one correction at a time.",
        "   - Ask your teacher what to practise first."
      );
    }

    suggestionLines.push(
      "",
      "3. **Build simple daily habits**",
      "   - Do homework first, then short revision.",
      "   - Sleep well and reduce distractions during study.",
      "   - Ask for help early instead of hiding confusion.",
      "",
      "Remember: your current result is feedback. With better habits and support, the pattern can change."
    );

    return noStoreJson({
      ok: true,
      summary: lines.join("\n"),
      suggestions: suggestionLines.join("\n"),
      meta: {
        tenantId: body.tenantId ?? null,
        overall,
        subjectCount: subjects.length,
        explanationSource: "policy-payload-only",
      },
    });
  } catch (err) {
    console.error("[STUDENT_RESULTS_EXPLAIN_ERROR]", err);
    return noStoreJson(
      {
        ok: false,
        error:
          "Failed to generate an explanation for your results. Please try again or talk to your teacher.",
      },
      500
    );
  }
}