// src/app/api/parent/report/term/explain/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubjectPayload = {
  subject?: string;
  percentage?: number | null;
  totalPercent?: number | null;
  grade?: string | number | null;
  gradeLabel?: string | null;
  remark?: string | null;
  ges?: {
    grade?: string | number | null;
    label?: string | null;
    band?: string | null;
    remark?: string | null;
  } | null;

  // Kept for backward payload compatibility only.
  // Do not derive explanation percentages from these raw totals.
  totalScore?: number | null;
  maxScore?: number | null;
  totalObtained?: number | null;
  totalMax?: number | null;
};

type ExplainBody = {
  studentName?: string;
  classLabel?: string | null;
  term?: string;
  academicYear?: string;
  subjects?: SubjectPayload[];
  feesSummary?: {
    totalBilledPesewas?: number | null;
    totalWaivedPesewas?: number | null;
    totalPaidPesewas?: number | null;
    outstandingPesewas?: number | null;
  } | null;
  healthSummary?: {
    totalScreenings?: number | null;
    feverCount?: number | null;
    symptomsCount?: number | null;
    lastScreenedAt?: string | null;
  } | null;
};

type NormalizedSubject = {
  subject: string;
  percentage: number;
  gradeText: string | null;
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

function clampPercent(p: number | null | undefined): number | null {
  if (p == null || !Number.isFinite(p)) return null;
  return Math.max(0, Math.min(100, p));
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
      const name = clean(s.subject) || "Subject";
      const percentage = readTrustedPercentage(s);

      if (percentage === null) return null;

      return {
        subject: name,
        percentage,
        gradeText: policyTextFromSubject(s),
      };
    })
    .filter((s): s is NormalizedSubject => s !== null);
}

function listNames(subjects: NormalizedSubject[], limit = 3) {
  const names = subjects.map((s) => s.subject);
  if (names.length === 0) return "";
  if (names.length <= limit) return names.join(", ");
  return `${names.slice(0, limit).join(", ")} and ${names.length - limit} more`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as ExplainBody | null;

    if (!body || typeof body !== "object") {
      return noStoreJson({ ok: false, error: "Invalid JSON body." }, 400);
    }

    const studentName = clean(body.studentName) || "your child";
    const classText = body.classLabel ? ` in ${clean(body.classLabel)}` : "";

    const termText = clean(body.term) || "this term";
    const yearText = clean(body.academicYear);
    const periodLabel = yearText ? `${termText}, ${yearText}` : termText;

    const subjects = normalizeSubjects(body.subjects);

    if (subjects.length === 0) {
      return noStoreJson({
        ok: true,
        summary:
          `For **${periodLabel}**, there are no complete policy-aware subject percentages ready yet for ${studentName}${classText}. ` +
          `This does not mean the learner is doing badly. It means EduLife OS is waiting for trusted assessment evidence before giving an explanation.`,
        suggestions: [
          "You can gently ask the class teacher or headteacher when the assessment records will be completed.",
          "Meanwhile, keep encouraging regular study habits at home: reading, revision, attendance, and asking questions.",
        ].join("\n"),
        meta: {
          subjectCount: 0,
          explanationSource: "policy-payload-only",
        },
      });
    }

    const avgPercent =
      subjects.reduce((sum, s) => sum + s.percentage, 0) / subjects.length;

    const strong = subjects.filter((s) => s.percentage >= 75);
    const steady = subjects.filter((s) => s.percentage >= 50 && s.percentage < 75);
    const needsSupport = subjects.filter((s) => s.percentage < 50);

    const sorted = [...subjects].sort((a, b) => b.percentage - a.percentage);
    const best = sorted[0] ?? null;
    const weakest = sorted[sorted.length - 1] ?? null;

    const lines: string[] = [];

    lines.push(
      `For **${periodLabel}**, ${studentName}${classText} is currently around **${avgPercent.toFixed(
        1
      )}%** on average across the policy-aware subjects available in EduLife OS.`
    );

    if (best) {
      lines.push(
        `• Strongest area: **${best.subject}** (~${best.percentage.toFixed(1)}%${
          best.gradeText ? `, ${best.gradeText}` : ""
        }).`
      );
    }

    if (weakest && weakest.subject !== best?.subject) {
      lines.push(
        `• Needs most support: **${weakest.subject}** (~${weakest.percentage.toFixed(1)}%${
          weakest.gradeText ? `, ${weakest.gradeText}` : ""
        }).`
      );
    }

    if (strong.length) {
      lines.push(`• Strong areas: **${listNames(strong)}**.`);
    }

    if (steady.length) {
      lines.push(`• Steady areas: **${listNames(steady)}**.`);
    }

    if (needsSupport.length) {
      lines.push(`• Areas needing extra support: **${listNames(needsSupport)}**.`);
    }

    const feesSummary = body.feesSummary ?? null;
    if (feesSummary) {
      const billed = feesSummary.totalBilledPesewas ?? 0;
      const waived = feesSummary.totalWaivedPesewas ?? 0;
      const paid = feesSummary.totalPaidPesewas ?? 0;
      const outstanding =
        feesSummary.outstandingPesewas ?? billed - waived - paid;

      if (billed > 0 || paid > 0 || outstanding > 0) {
        if (outstanding > 0.5) {
          lines.push(
            "",
            `On the **fees** side, the estimated outstanding balance is **GH₵${(
              outstanding / 100
            ).toFixed(2)}**.`
          );
        } else {
          lines.push(
            "",
            "On the **fees** side, everything recorded for this learner appears to be settled for the term."
          );
        }
      }
    }

    const healthSummary = body.healthSummary ?? null;
    if (healthSummary) {
      const totalScreenings = healthSummary.totalScreenings ?? 0;
      const feverCount = healthSummary.feverCount ?? 0;
      const symptomsCount = healthSummary.symptomsCount ?? 0;

      if (totalScreenings > 0) {
        lines.push(
          "",
          `${studentName} has ${totalScreenings} recorded health screening${
            totalScreenings === 1 ? "" : "s"
          } in EduLife OS. ${
            feverCount || symptomsCount
              ? "Some screenings need parent-school attention, not fear."
              : "No major screening concern is highlighted by this summary."
          }`
        );
      }
    }

    lines.push(
      "",
      "This report is a conversation starter, not a final judgment. The goal is for home and school to work together with truth, calmness, and encouragement."
    );

    const suggestions = [
      "Practical next steps:",
      best ? `- Celebrate progress in ${best.subject}.` : "- Celebrate effort and consistency.",
      weakest
        ? `- Give focused support in ${weakest.subject}: short daily revision, practice questions, and teacher feedback.`
        : "- Keep a steady home-study rhythm.",
      "- Ask the learner how they feel about each subject before giving advice.",
      "- Focus on one improvement target at a time.",
    ].join("\n");

    return noStoreJson({
      ok: true,
      summary: lines.join("\n"),
      suggestions,
      meta: {
        overall: Number(avgPercent.toFixed(1)),
        subjectCount: subjects.length,
        explanationSource: "policy-payload-only",
      },
    });
  } catch (err) {
    console.error("[PARENT_TERM_REPORT_EXPLAIN_ERROR]", err);
    return noStoreJson(
      {
        ok: false,
        error:
          "Failed to generate a term summary explanation. Please try again or contact the school office.",
      },
      500
    );
  }
}