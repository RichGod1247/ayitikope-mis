// src/app/api/parent/overview/explain/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Parent Overview Explainer (rule-based, no external AI)
 *
 * POST /api/parent/overview/explain
 *
 * Body:
 * {
 *   tenantId: string;
 *   guardianPhone: string;
 *   term: string;
 *   academicYear: string;
 *   students: Array<{
 *     id: string;
 *     name: string;
 *     classroomName: string | null;
 *     fees: {
 *       term: string;
 *       academicYear: string;
 *       totalBilledPesewas: number;
 *       totalWaivedPesewas: number;
 *       totalPaidPesewas: number;
 *       balancePesewas: number;
 *       lastPaymentAmountPesewas: number | null;
 *       lastPaymentAt: string | null;
 *     };
 *     health: {
 *       lastDate: string;
 *       temperatureC: number | null;
 *       symptoms: string | null;
 *       notes: string | null;
 *     } | null;
 *   }>;
 * }
 *
 * Returns: { ok: true, summary: string } on success.
 */

type FeeSummary = {
  term: string;
  academicYear: string;
  totalBilledPesewas: number;
  totalWaivedPesewas: number;
  totalPaidPesewas: number;
  balancePesewas: number;
  lastPaymentAmountPesewas: number | null;
  lastPaymentAt: string | null;
};

type HealthSnapshot = {
  lastDate: string;
  temperatureC: number | null;
  symptoms: string | null;
  notes: string | null;
};

type StudentOverview = {
  id: string;
  name: string;
  classroomName: string | null;
  fees: FeeSummary;
  health: HealthSnapshot | null;
};

function formatCedis(pesewas: number): string {
  return `GH₵${(pesewas / 100).toFixed(2)}`;
}

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
      guardianPhone,
      term,
      academicYear,
      students,
    } = body as {
      tenantId?: string;
      guardianPhone?: string;
      term?: string;
      academicYear?: string;
      students?: StudentOverview[];
    };

    if (!tenantId || !guardianPhone || !term || !academicYear) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "tenantId, guardianPhone, term and academicYear are required.",
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(students)) {
      return NextResponse.json(
        { ok: false, error: "students must be an array." },
        { status: 400 }
      );
    }

    const count = students.length;

    if (count === 0) {
      return NextResponse.json(
        {
          ok: true,
          summary:
            `For **${term}**, **${academicYear}**, I could not find any learners under this phone number in the system.\n\n` +
            `If you are sure your child is enrolled, kindly:\n` +
            `- Check that the school entered your phone number correctly, and\n` +
            `- Visit or call the school office so they can confirm your records.\n\n` +
            `Once your details are updated, this page will show fees and health summaries for your children in a calm way.`,
        },
        { status: 200 }
      );
    }

    // Aggregate fees across all children
    let totalBilled = 0;
    let totalWaived = 0;
    let totalPaid = 0;
    let totalBalance = 0;

    let childrenWithHealthAlerts = 0;

    for (const s of students) {
      const f = s.fees;
      totalBilled += f.totalBilledPesewas ?? 0;
      totalWaived += f.totalWaivedPesewas ?? 0;
      totalPaid += f.totalPaidPesewas ?? 0;
      totalBalance += f.balancePesewas ?? 0;

      if (s.health) {
        const temp = s.health.temperatureC ?? 0;
        const hasSymptoms =
          !!s.health.symptoms && s.health.symptoms.trim().length > 0;
        if (temp >= 37.8 || hasSymptoms) {
          childrenWithHealthAlerts += 1;
        }
      }
    }

    const netBilled = totalBilled - totalWaived;
    const overallBalance = netBilled - totalPaid;

    const headlineLines: string[] = [];
    const feesLines: string[] = [];
    const healthLines: string[] = [];
    const actionLines: string[] = [];

    // Headline: how many children + general tone
    headlineLines.push(
      `For **${term}**, **${academicYear}**, this phone number is linked to **${count}** child(ren) in the school.`
    );

    if (overallBalance <= 0 && netBilled > 0) {
      headlineLines.push(
        `Good news: based on the records here, your term fees look **fully paid** or slightly ahead.`
      );
    } else if (netBilled === 0) {
      headlineLines.push(
        `At the moment, I do not see any fee invoices for this term in the system. The school may still be setting them up.`
      );
    } else {
      headlineLines.push(
        `From all the children together, the system shows about **${formatCedis(
          netBilled
        )}** billed after waivers, with about **${formatCedis(
          totalPaid
        )}** paid so far.`
      );
      if (overallBalance > 0) {
        headlineLines.push(
          `That leaves an estimated balance of about **${formatCedis(
            overallBalance
          )}** to be cleared.`
        );
      }
    }

    // Per-child short lines
    feesLines.push(
      `Here is a **simple view per child**. These are not punishments, just a clear picture so you can plan calmly:`
    );

    for (const s of students) {
      const f = s.fees;
      const childNet = (f.totalBilledPesewas ?? 0) - (f.totalWaivedPesewas ?? 0);
      const childBalance = f.balancePesewas ?? 0;

      const classLabel = s.classroomName
        ? ` (${s.classroomName})`
        : "";

      let feeSentence = "";
      if (childNet === 0) {
        feeSentence = "no fees recorded yet for this term.";
      } else if (childBalance <= 0) {
        feeSentence = `fees for this term look settled.`;
      } else {
        feeSentence = `about ${formatCedis(
          childNet
        )} billed after waivers, with a remaining balance of about ${formatCedis(
          childBalance
        )}.`;
      }

      let healthSentence = "";
      if (!s.health) {
        healthSentence =
          "No recent health screening has been recorded yet.";
      } else {
        const temp = s.health.temperatureC;
        const hasSymptoms =
          !!s.health.symptoms && s.health.symptoms.trim().length > 0;

        if (temp == null && !hasSymptoms) {
          healthSentence =
            "The last health record has no temperature or symptoms written down.";
        } else if ((temp ?? 0) < 37.8 && !hasSymptoms) {
          healthSentence =
            "The last screening did not show fever or concerning symptoms.";
        } else {
          healthSentence =
            "The last screening showed either a higher temperature or some symptoms — it is wise to pay attention and, if needed, talk to a health worker.";
        }
      }

      feesLines.push(
        `- **${s.name}${classLabel}**: ${feeSentence} ${healthSentence}`
      );
    }

    // Health block
    if (childrenWithHealthAlerts === 0) {
      healthLines.push(
        `From the latest records, I do not see strong health alerts. Still, keep watching your children and encourage them to report when they feel unwell.`
      );
    } else {
      healthLines.push(
        `For health, about **${childrenWithHealthAlerts}** of your child(ren) had recent readings or symptoms that may need attention. This does not mean panic, only that it is good to observe them closely and seek medical advice if you are worried.`
      );
    }

    // Practical action lines (gentle, not fear-based)
    actionLines.push(
      `Here are **3 calm next steps** you can take as a parent:`
    );
    actionLines.push(
      `- If there is a fee balance, plan small, realistic payments and communicate with the school so they know you are working on it.`
    );
    actionLines.push(
      `- For any child with health notes or higher temperature, gently ask how they are feeling and, if needed, seek advice from a health professional.`
    );
    actionLines.push(
      `- At home, praise your children for their effort, not only their scores. Let them know school and home are on the same team.`
    );

    const summary =
      headlineLines.join("\n") +
      "\n\n" +
      feesLines.join("\n") +
      "\n\n" +
      healthLines.join("\n") +
      "\n\n" +
      actionLines.join("\n");

    return NextResponse.json(
      {
        ok: true,
        summary,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[PARENT_OVERVIEW_EXPLAIN_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to generate a parent overview explanation. Please try again.",
      },
      { status: 500 }
    );
  }
}
