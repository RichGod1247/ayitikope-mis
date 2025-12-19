// src/app/api/parent/report/term/explain/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/parent/report/term/explain
 *
 * Body (sent from parent term report UI):
 * {
 *   studentName: string;
 *   classLabel?: string | null;
 *   term: string;
 *   academicYear: string;
 *   subjects: Array<{
 *     subject?: string;
 *     percentage?: number | null;
 *     totalScore?: number | null;
 *     maxScore?: number | null;
 *     totalObtained?: number | null;
 *     totalMax?: number | null;
 *   }>;
 *   feesSummary?: {
 *     totalBilledPesewas?: number | null;
 *     totalWaivedPesewas?: number | null;
 *     totalPaidPesewas?: number | null;
 *     outstandingPesewas?: number | null;
 *   } | null;
 *   healthSummary?: {
 *     totalScreenings?: number | null;
 *     feverCount?: number | null;
 *     symptomsCount?: number | null;
 *     lastScreenedAt?: string | null;
 *   } | null;
 * }
 *
 * Returns:
 * {
 *   ok: boolean;
 *   summary?: string;
 *   suggestions?: string;
 *   error?: string;
 * }
 *
 * NOTE: This is rule-based, no external LLM calls.
 */

type ExplainBody = {
  studentName?: string;
  classLabel?: string | null;
  term?: string;
  academicYear?: string;
  subjects?: Array<{
    subject?: string;
    percentage?: number | null;
    totalScore?: number | null;
    maxScore?: number | null;
    totalObtained?: number | null;
    totalMax?: number | null;
  }>;
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

function clampPercent(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(100, p));
}

function deriveSubjectPercentage(s: any): number | null {
  if (typeof s.percentage === "number" && Number.isFinite(s.percentage)) {
    return clampPercent(s.percentage);
  }

  const totalRaw =
    typeof s.totalScore === "number"
      ? s.totalScore
      : typeof s.totalObtained === "number"
      ? s.totalObtained
      : null;

  const maxRaw =
    typeof s.maxScore === "number"
      ? s.maxScore
      : typeof s.totalMax === "number"
      ? s.totalMax
      : null;

  if (totalRaw == null || maxRaw == null || maxRaw <= 0) return null;

  return clampPercent((totalRaw / maxRaw) * 100);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | ExplainBody
      | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const {
      studentName: rawStudentName,
      classLabel,
      term,
      academicYear,
      subjects: rawSubjects,
      feesSummary,
      healthSummary,
    } = body;

    const studentName = (rawStudentName || "your child").trim();
    const classText = classLabel
      ? ` in ${classLabel}`
      : "";

    const termText = term || "this term";
    const yearText = academicYear || "";

    const periodLabel =
      yearText && termText
        ? `${termText}, ${yearText}`
        : termText || "this term";

    const subjects = Array.isArray(rawSubjects)
      ? rawSubjects
      : [];

    // If no subjects at all, give a soft explanation
    if (subjects.length === 0) {
      const summary =
        `For **${periodLabel}**, there are no continuous assessment scores recorded in EduLife OS yet for ${studentName}${classText}. ` +
        `Once the teacher starts entering class tests and project scores, this page will show a clear picture of strengths and areas to support.`;

      const suggestions = [
        `You can gently ask the class teacher when CA scores will be ready in the system.`,
        `Use this waiting time to keep encouraging regular study habits at home: reading, revision, and asking questions.`,
      ].join("\n");

      return NextResponse.json(
        {
          ok: true,
          summary,
          suggestions,
        },
        { status: 200 }
      );
    }

    // Build per-subject percentages
    const withPercents = subjects
      .map((s) => {
        const p = deriveSubjectPercentage(s);
        return {
          subject: s.subject || "Subject",
          percentage: p,
        };
      })
      .filter((s) => s.percentage !== null) as {
      subject: string;
      percentage: number;
    }[];

    // If all percentages are null (should be rare)
    if (withPercents.length === 0) {
      const summary =
        `For **${periodLabel}**, EduLife OS found subject scores for ${studentName}${classText}, ` +
        `but could not compute percentages yet. This usually means the maximum scores have not been set properly.`;

      const suggestions =
        `Kindly let the class teacher or headteacher know so they can check the assessment setup. ` +
        `Once corrected, this page will automatically show clear percentage scores for each subject.`;

      return NextResponse.json(
        { ok: true, summary, suggestions },
        { status: 200 }
      );
    }

    // Overall average
    const totalPercent = withPercents.reduce(
      (sum, s) => sum + s.percentage,
      0
    );
    const avgPercent = clampPercent(
      totalPercent / withPercents.length
    );

    // Group subjects by strength
    const strong: string[] = [];
    const solid: string[] = [];
    const needsSupport: string[] = [];

    for (const s of withPercents) {
      if (s.percentage >= 75) {
        strong.push(s.subject);
      } else if (s.percentage >= 50) {
        solid.push(s.subject);
      } else {
        needsSupport.push(s.subject);
      }
    }

    const strongText =
      strong.length > 0
        ? strong.join(", ")
        : "";
    const solidText =
      solid.length > 0
        ? solid.join(", ")
        : "";
    const supportText =
      needsSupport.length > 0
        ? needsSupport.join(", ")
        : "";

    // Fees interpretation
    const billed =
      feesSummary?.totalBilledPesewas ?? 0;
    const waived =
      feesSummary?.totalWaivedPesewas ?? 0;
    const paid = feesSummary?.totalPaidPesewas ?? 0;

    const outstandingExplicit =
      feesSummary?.outstandingPesewas;
    const outstanding =
      outstandingExplicit != null
        ? outstandingExplicit
        : billed - waived - paid;

    // Health interpretation
    const totalScreenings =
      healthSummary?.totalScreenings ?? 0;
    const feverCount =
      healthSummary?.feverCount ?? 0;
    const symptomsCount =
      healthSummary?.symptomsCount ?? 0;

    // -----------------------------
    // Build parent-friendly summary
    // -----------------------------
    const lines: string[] = [];

    // Overall
    lines.push(
      `For **${periodLabel}**, ${studentName}${classText} is working at about **${avgPercent.toFixed(
        1
      )}%** on average across the subjects that have been recorded in EduLife OS.`
    );

    if (strong.length > 0) {
      lines.push(
        `• Strong areas: **${strongText}** – these subjects are going very well and deserve celebration.`
      );
    }

    if (solid.length > 0) {
      lines.push(
        `• Steady areas: **${solidText}** – these subjects are generally okay but can still grow with regular revision and feedback.`
      );
    }

    if (needsSupport.length > 0) {
      lines.push(
        `• Needs extra support: **${supportText}** – these are the subjects where a bit more guidance, practice and encouragement will really help.`
      );
    }

    // Fees note
    if (billed > 0 || paid > 0 || outstanding > 0) {
      const billedCedis = (billed - waived) / 100;
      const paidCedis = paid / 100;
      const outstandingCedis =
        outstanding / 100;

      if (outstanding > 0.5) {
        lines.push(
          "",
          `On the **fees** side, the system shows that about **GH₵${billedCedis.toFixed(
            2
          )}** was billed for this term after waivers, ` +
            `and around **GH₵${paidCedis.toFixed(
              2
            )}** has been paid so far. This leaves an estimated balance of **GH₵${outstandingCedis.toFixed(
              2
            )}** to clear.`
        );
      } else {
        lines.push(
          "",
          `On the **fees** side, everything recorded for this learner appears to be **fully settled** for the term in EduLife OS.`
        );
      }
    }

    // Health note
    if (totalScreenings > 0) {
      const parts: string[] = [];
      parts.push(
        `During this academic year, ${studentName} has been screened about **${totalScreenings}** time${
          totalScreenings === 1 ? "" : "s"
        } at school.`
      );

      if (feverCount > 0) {
        parts.push(
          `There were around **${feverCount}** screening${
            feverCount === 1 ? "" : "s"
          } with higher temperature readings.`
        );
      }

      if (symptomsCount > 0) {
        parts.push(
          `In addition, **${symptomsCount}** screening${
            symptomsCount === 1 ? "" : "s"
          } recorded some symptoms.`
        );
      }

      parts.push(
        `This information is not to create fear, but to help parents and school work together to protect health early.`
      );

      lines.push("", parts.join(" "));
    } else if (healthSummary) {
      lines.push(
        "",
        `For now, there are no recorded health screenings for ${studentName} in EduLife OS. As the school uses the daily-health tools more, you will see a simple history here.`
      );
    }

    lines.push(
      "",
      `Overall, this report is a **conversation starter**, not a final judgment. The goal is for home and school to walk together so that ${studentName} keeps growing in confidence, character and competence.`
    );

    const summary = lines.join("\n");

    // -----------------------------
    // Suggestions block
    // -----------------------------
    const suggestionLines: string[] = [];

    if (strong.length > 0) {
      suggestionLines.push(
        `• Take a moment to **celebrate** the strong subjects (${strongText}). Simple words like “Well done, keep it up” mean a lot.`
      );
    }

    if (needsSupport.length > 0) {
      suggestionLines.push(
        `• For the subjects needing support (${supportText}), agree on a calm plan: a short daily revision time, extra practice questions, or chatting with the teacher about how to help.`
      );
    }

    if (outstanding > 0.5) {
      suggestionLines.push(
        `• If fees are outstanding, consider **small, regular payments** instead of waiting for one big amount. This reduces stress on both the home and the school.`
      );
    }

    if (totalScreenings > 0 && (feverCount > 0 || symptomsCount > 0)) {
      suggestionLines.push(
        `• Keep an eye on ${studentName}'s health: plenty of sleep, good food, water, hygiene, and early visits to the clinic when something doesn’t look right.`
      );
    }

    suggestionLines.push(
      `• Use this report as an opportunity to **listen** to ${studentName}: ask how they feel about each subject, and what support they think would help them most.`
    );

    const suggestions = suggestionLines.join("\n");

    return NextResponse.json(
      {
        ok: true,
        summary,
        suggestions,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[PARENT_TERM_REPORT_EXPLAIN_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to generate a term summary explanation. Please try again or contact the school office.",
      },
      { status: 500 }
    );
  }
}
