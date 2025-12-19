// src/app/api/headteacher/attendance/weekly/explain/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/headteacher/attendance/weekly/explain
 *
 * Body shape (sent from the weekly UI):
 * {
 *   tenantId: string;
 *   start: string;        // "YYYY-MM-DD"
 *   end: string;          // "YYYY-MM-DD"
 *   pctOverall: number;   // overall present %
 *   totals: {
 *     enrolled: number;
 *     marks: number;
 *     present: number;
 *     absent: number;
 *     late: number;
 *     excused: number;
 *   };
 *   rows: Array<{
 *     classLabel: string;
 *     enrolled: number;
 *     marks: number;
 *     present: number;
 *     absent: number;
 *     late: number;
 *     excused: number;
 *     pct: number;
 *   }>;
 * }
 *
 * For now this is a rule-based explainer (no external AI call),
 * but it’s structured so we can later swap the “summary” generation
 * with a real LLM prompt.
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const {
      tenantId,
      start,
      end,
      pctOverall,
      totals,
      rows,
    } = body as {
      tenantId?: string;
      start?: string;
      end?: string;
      pctOverall?: number;
      totals?: {
        enrolled?: number;
        marks?: number;
        present?: number;
        absent?: number;
        late?: number;
        excused?: number;
      };
      rows?: Array<{
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

    const periodLabel =
      start && end ? `${start} to ${end}` : "the selected week";

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required." },
        { status: 400 }
      );
    }

    if (!Array.isArray(rows)) {
      return NextResponse.json(
        { ok: false, error: "rows must be an array." },
        { status: 400 }
      );
    }

    const numClasses = rows.length;
    if (numClasses === 0 || !totals) {
      return NextResponse.json(
        {
          ok: true,
          summary:
            `For ${periodLabel}, no attendance marks were recorded yet. ` +
            `Encourage teachers to take daily attendance so EduLife OS can give you a clear picture of presence, absence and lateness across the school.`,
          meta: {
            numClasses: 0,
            overallPresentPct: 0,
            periodLabel,
          },
        },
        { status: 200 }
      );
    }

    const totalMarks = totals.marks ?? 0;
    const totalPresent = totals.present ?? 0;
    const totalAbsent = totals.absent ?? 0;
    const totalLate = totals.late ?? 0;
    const totalExcused = totals.excused ?? 0;

    const safeOverallPct =
      typeof pctOverall === "number" && Number.isFinite(pctOverall)
        ? Math.max(0, Math.min(100, pctOverall))
        : totalMarks > 0
        ? (totalPresent / totalMarks) * 100
        : 0;

    // Sort classes by present %
    const validRows = rows
      .filter((r) => typeof r.pct === "number" && r.classLabel)
      .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));

    const top = validRows[0];
    const bottom = validRows[validRows.length - 1];

    const topLine =
      top && typeof top.pct === "number"
        ? `• The strongest attendance was in **${top.classLabel}** at about **${top.pct.toFixed(
            1
          )}%**.`
        : "";

    const bottomLine =
      bottom &&
      typeof bottom.pct === "number" &&
      bottom !== top &&
      validRows.length > 1
        ? `• The weakest attendance was in **${bottom.classLabel}** at around **${bottom.pct.toFixed(
            1
          )}%**. This class may need closer follow-up.`
        : "";

    const lateHotspot =
      totalLate > 0
        ? `There were about **${totalLate.toLocaleString()}** late marks. This is a good opportunity to remind learners and parents about punctuality.`
        : `There were almost no late marks recorded, which is a positive sign for punctuality.`;

    const absenceNote =
      totalAbsent > 0
        ? `Roughly **${totalAbsent.toLocaleString()}** absence marks were recorded. Try to check whether absences are concentrated in certain classes or days.`
        : `There were very few absence marks recorded this week. Keep reinforcing whatever is working well.`;


    const excusedNote =
      totalExcused > 0
        ? `You also had **${totalExcused.toLocaleString()}** excused absences. It may help to keep short notes on common reasons (sickness, travel, etc.) to support both guidance and reporting.`
        : "";

    const summaryLines: string[] = [];

    summaryLines.push(
      `For **${periodLabel}**, overall attendance across the school was about **${safeOverallPct.toFixed(
        1
      )}%** (based on **${totalMarks.toLocaleString()}** marks taken in **${numClasses}** classes).`
    );

    if (topLine) summaryLines.push(topLine);
    if (bottomLine) summaryLines.push(bottomLine);

    summaryLines.push("");
    summaryLines.push(lateHotspot);
    summaryLines.push(absenceNote);
    if (excusedNote) summaryLines.push(excusedNote);

    summaryLines.push("");
    summaryLines.push(
      `As headteacher, you can use this weekly snapshot to:`
    );
    summaryLines.push(
      `- Celebrate classes with consistently high presence.`
    );
    summaryLines.push(
      `- Visit or call classes with lower attendance for gentle follow-up.`
    );
    summaryLines.push(
      `- Share a short summary with the SMC / municipal officers using the CSV export.`
    );

    const summary = summaryLines.join("\n");

    return NextResponse.json(
      {
        ok: true,
        summary,
        meta: {
          periodLabel,
          numClasses,
          overallPresentPct: safeOverallPct,
          totals: {
            enrolled: totals.enrolled ?? 0,
            marks: totalMarks,
            present: totalPresent,
            absent: totalAbsent,
            late: totalLate,
            excused: totalExcused,
          },
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[ATTENDANCE_WEEKLY_EXPLAIN_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to generate a weekly attendance explanation. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
