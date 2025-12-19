// src/app/api/headteacher/attendance/explain/route.ts
import { NextRequest, NextResponse } from "next/server";

type ClassRow = {
  classLabel?: string;
  enrolled?: number;
  marks?: number;
  present?: number;
  absent?: number;
  late?: number;
  excused?: number;
  pct?: number;
};

type BodyShape = {
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
  classes?: ClassRow[];
};

function clampPercent(v: number | null | undefined): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
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
      start,
      end,
      totalClasses,
      totalMarks,
      totalPresent,
      totalAbsent,
      totalLate,
      totalExcused,
      overallPresentPercent,
      classes: rawClasses,
    } = body;

    const periodLabel =
      start && end ? `${start} to ${end}` : "the selected week";

    if (!Array.isArray(rawClasses)) {
      return NextResponse.json(
        { ok: false, error: "classes must be an array." },
        { status: 400 }
      );
    }

    const classes = rawClasses
      .map((c) => ({
        classLabel: (c.classLabel ?? "").trim(),
        enrolled: c.enrolled ?? 0,
        marks: c.marks ?? 0,
        present: c.present ?? 0,
        absent: c.absent ?? 0,
        late: c.late ?? 0,
        excused: c.excused ?? 0,
        pct: clampPercent(c.pct),
      }))
      .filter((c) => c.classLabel);

    const numClasses =
      typeof totalClasses === "number" && totalClasses > 0
        ? totalClasses
        : classes.length;

    const marksTaken = totalMarks ?? classes.reduce((sum, c) => sum + c.marks, 0);
    const presentMarks =
      totalPresent ?? classes.reduce((sum, c) => sum + c.present, 0);
    const absentMarks =
      totalAbsent ?? classes.reduce((sum, c) => sum + c.absent, 0);
    const lateMarks =
      totalLate ?? classes.reduce((sum, c) => sum + c.late, 0);
    const excusedMarks =
      totalExcused ?? classes.reduce((sum, c) => sum + c.excused, 0);

    const overallPct =
      typeof overallPresentPercent === "number" &&
      Number.isFinite(overallPresentPercent)
        ? clampPercent(overallPresentPercent)
        : marksTaken > 0
        ? clampPercent((presentMarks / Math.max(marksTaken, 1)) * 100)
        : 0;

    if (marksTaken === 0 || numClasses === 0 || classes.length === 0) {
      const summary =
        `For **${periodLabel}**, there are no recorded attendance marks yet for this school in EduLife OS.\n\n` +
        `That usually means either the week has just started, or teachers are still getting used to taking attendance inside the system. ` +
        `Once a few days of marks are captured, this AI explainer will give you a clear weekly story.`;

      const suggestions =
        `**How you can build a strong attendance culture from the start**\n` +
        `- Gently remind teachers to take attendance **every day** inside EduLife OS, not only on paper.\n` +
        `- In the next staff meeting, explain that this data helps you support them, not punish them.\n` +
        `- Aim first for consistency (taking the register) before pushing for very high percentages.\n` +
        `- Consider appointing one “attendance champion” teacher to help colleagues if they struggle with the new system.`;

      return NextResponse.json(
        {
          ok: true,
          summary,
          suggestions,
          meta: {
            tenantId: tenantId ?? null,
            periodLabel,
            overallPresentPct: 0,
            numClasses: 0,
          },
        },
        { status: 200 }
      );
    }

    // Sort by pct
    const sorted = [...classes].sort((a, b) => b.pct - a.pct);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    const high = classes.filter((c) => c.pct >= 90);
    const mid = classes.filter((c) => c.pct >= 80 && c.pct < 90);
    const low = classes.filter((c) => c.pct < 80);

    const listNames = (arr: typeof classes, limit = 3): string => {
      const names = arr.map((c) => c.classLabel);
      if (names.length === 0) return "";
      if (names.length <= limit) return names.join(", ");
      const head = names.slice(0, limit).join(", ");
      const remaining = names.length - limit;
      return `${head} and ${remaining} more`;
    };

    // Overall tone
    let overallLine: string;
    if (overallPct >= 95) {
      overallLine =
        `For **${periodLabel}**, whole-school attendance is exceptionally strong, at about **${overallPct.toFixed(
          1
        )}%** (based on **${marksTaken.toLocaleString()}** marks across **${numClasses}** classes).`;
    } else if (overallPct >= 90) {
      overallLine =
        `For **${periodLabel}**, whole-school attendance is **very healthy**, at about **${overallPct.toFixed(
          1
        )}%** (from **${marksTaken.toLocaleString()}** marks in **${numClasses}** classes).`;
    } else if (overallPct >= 80) {
      overallLine =
        `For **${periodLabel}**, school-wide attendance is **moderately good**, at around **${overallPct.toFixed(
          1
        )}%**. There is a solid base to build on, but also clear room for improvement.`;
    } else if (overallPct >= 70) {
      overallLine =
        `For **${periodLabel}**, whole-school attendance sits at about **${overallPct.toFixed(
          1
        )}%**. This suggests a **mixed picture**, with some classes doing well and others needing closer follow-up.`;
    } else {
      overallLine =
        `For **${periodLabel}**, whole-school attendance is around **${overallPct.toFixed(
          1
        )}%**, which is **lower than ideal**. This does not mean your work is failing, but it is an early warning that consistent strategies and conversations are needed.`;
    }

    const lines: string[] = [];
    lines.push(overallLine);

    if (best) {
      lines.push(
        `- The strongest class this week is **${best.classLabel}**, with attendance around **${best.pct.toFixed(
          1
        )}%**.`
      );
    }

    if (worst && worst !== best) {
      lines.push(
        `- The class that needs the closest follow-up is **${worst.classLabel}**, at about **${worst.pct.toFixed(
          1
        )}%**.`
      );
    }

    if (high.length > 0) {
      lines.push(
        `- Several classes are consistently strong (≥ 90% attendance), including **${listNames(
          high
        )}**. These are good examples for the rest of the school.`
      );
    }

    if (mid.length > 0) {
      lines.push(
        `- A number of classes are in the “almost there” zone (80–89%), such as **${listNames(
          mid
        )}**. With small adjustments, they can move into the strongest band.`
      );
    }

    if (low.length > 0) {
      lines.push(
        `- Classes below 80% attendance this week include **${listNames(
          low
        )}**, which may require targeted conversation with teachers, pupils and parents.`
      );
    }

    // Late vs absent pattern
    if (lateMarks > 0 || absentMarks > 0) {
      const lateShare =
        lateMarks + absentMarks > 0
          ? (lateMarks / (lateMarks + absentMarks)) * 100
          : 0;
      if (lateShare >= 50 && lateMarks > 10) {
        lines.push(
          ``,
          `There were about **${lateMarks.toLocaleString()}** late marks recorded, which is a large share of all attendance issues. This suggests that punctuality, more than complete absence, is a major theme for this week.`
        );
      } else if (absentMarks > 0) {
        lines.push(
          ``,
          `In total, there were roughly **${absentMarks.toLocaleString()}** absence marks and **${lateMarks.toLocaleString()}** late marks. Absence is still the bigger concern this week.`
        );
      }
    }

    if (excusedMarks > 0) {
      lines.push(
        `There were also **${excusedMarks.toLocaleString()}** excused absences. Keeping short notes on the most common reasons (sickness, travel, family issues) will help you tell a clear story to your circuit supervisor or municipal office.`
      );
    }

    lines.push(
      ``,
      `Overall, this week’s pattern gives you a quick pulse of where attendance culture is strong and where you may need gentle but firm follow-up.`
    );

    const summary = lines.join("\n");

    // ------------- Suggestions (headteacher plan) -------------
    const suggestionLines: string[] = [];
    suggestionLines.push(
      `**Practical actions you can take as headteacher**`
    );

    // Celebrate
    suggestionLines.push(
      `1. **Celebrate strong classes and teachers**`,
      `   - Publicly acknowledge classes like **${listNames(
        high.length > 0 ? high : classes.slice(0, 1)
      )}** for their consistent presence.`,
      `   - A simple announcement, sticker chart, or note in the staff WhatsApp group can reinforce positive behaviour.`,
      `   - Use these classes to share practical tips with others (e.g., how they remind pupils about punctuality).`
    );

    // Lift the mid-zone
    if (mid.length > 0) {
      suggestionLines.push(
        ``,
        `2. **Lift the “almost there” classes**`,
        `   - Arrange short conversations with teachers of **${listNames(
          mid
        )}** and ask: “What one small change could move your class from 80–89% into the 90s?”`,
        `   - Encourage them to track a simple weekly target (for example, “at least 2 days this week above 95%”).`,
        `   - Consider pairing a mid-performing class with a strong class for ideas and friendly competition.`
      );
    }

    // Target low
    if (low.length > 0) {
      suggestionLines.push(
        ``,
        `3. **Support the lowest-attending classes**`,
        `   - For classes such as **${listNames(
          low
        )}**, schedule short, supportive check-ins with the teacher — not as punishment, but as joint problem-solving.`,
        `   - Look for patterns: specific days of the week, particular groups of pupils, or common reasons in the class register.`,
        `   - Where appropriate, involve parents or guardians early with calm, fact-based communication rather than last-minute panic before exams.`
      );
    }

    // Tackle lateness / absence depending on pattern
    if (lateMarks > 0 || absentMarks > 0) {
      suggestionLines.push(
        ``,
        `4. **Clarify expectations around punctuality and presence**`
      );
      if (lateMarks > absentMarks && lateMarks > 10) {
        suggestionLines.push(
          `   - Because lateness is a big part of the issue this week, run a short awareness session with pupils about **arriving before the first lesson**.`,
          `   - Agree with staff on a consistent, fair way of recording latecomers and following up (e.g., conversation plus note home, rather than harsh punishment).`
        );
      } else {
        suggestionLines.push(
          `   - Since absence is the bigger challenge this week, identify pupils with repeated absences and work with teachers to understand the underlying reasons (health, distance, family issues).`,
          `   - Consider simple interventions: walk-to-school groups, parent meetings, or linking families to support services if available.`
        );
      }
    }

    // Data practice
    suggestionLines.push(
      ``,
      `5. **Strengthen data habits in EduLife OS**`,
      `   - Encourage teachers to take attendance in EduLife OS every morning, so that weekly and termly patterns are reliable.`,
      `   - Once a month, use this weekly view to brief the SMC or your circuit supervisor, showing both strengths and honest challenges.`,
      `   - Over time, you can compare weeks and terms to see whether your strategies are working, instead of relying only on memory.`
    );

    const suggestions = suggestionLines.join("\n");

    return NextResponse.json(
      {
        ok: true,
        summary,
        suggestions,
        meta: {
          tenantId: tenantId ?? null,
          periodLabel,
          overallPresentPct: overallPct,
          numClasses,
          marksTaken,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[HEADTEACHER_ATTENDANCE_EXPLAIN_ERROR]", err);
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
