// src/app/api/student/assessment/explain/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubjectAgg = {
  subject: string;
  totalScore: number;
  totalMax: number;
  percentage: number | null;
};

function noStoreJson(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function isAllowedRole(roleName: string | null) {
  const r = String(roleName ?? "").toUpperCase();
  return r === "PARENT" || r.includes("ADMIN") || r.includes("HEAD") || r.includes("SUPER") || r.includes("OWNER");
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiUserContext(req, { requireTenant: true });
    if (!auth.ok) return auth.res;

    const ctx = auth.ctx;
    if (!isAllowedRole(ctx.roleName)) return noStoreJson({ ok: false, error: "FORBIDDEN" }, 403);

    const { searchParams } = new URL(req.url);

    const studentId = (searchParams.get("studentId") || "").trim();
    const term = (searchParams.get("term") || "1st Term").trim();
    const academicYear = (searchParams.get("academicYear") || "2025/2026").trim();

    if (!studentId) return noStoreJson({ ok: false, error: "studentId is required." }, 400);

    // ✅ Hard tenant lock
    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId: ctx.tenantId },
      select: { id: true, tenantId: true },
    });
    if (!student) return noStoreJson({ ok: false, error: "Student not found." }, 404);

    const scores = await prisma.assessmentScore.findMany({
      where: {
        studentId: student.id,
        item: { tenantId: ctx.tenantId, term, academicYear },
      },
      select: {
        score: true,
        item: { select: { subject: true, maxScore: true } },
      },
    });

    if (!scores || scores.length === 0) {
      return noStoreJson(
        {
          ok: true,
          studentId,
          term,
          academicYear,
          summary:
            "For this term, there are no continuous assessment scores recorded yet. Once your teachers enter your marks, I will explain your performance by subject.",
          suggestions:
            "For now:\n- Revise daily (10–20 minutes).\n- Do homework early.\n- Ask questions in class.\n- Practise past questions weekly.",
          meta: { overallPercentage: null, bestSubject: null, weakestSubject: null, subjectCount: 0 },
        },
        200
      );
    }

    const bySubject = new Map<string, SubjectAgg>();

    for (const row of scores) {
      const subjectName = row.item?.subject || "Subject";
      const score = typeof row.score === "number" ? row.score : 0;
      const max = typeof row.item?.maxScore === "number" ? row.item.maxScore : 0;

      if (!bySubject.has(subjectName)) {
        bySubject.set(subjectName, { subject: subjectName, totalScore: 0, totalMax: 0, percentage: null });
      }

      const agg = bySubject.get(subjectName)!;
      agg.totalScore += score;
      agg.totalMax += max;
    }

    let grandTotalScore = 0;
    let grandTotalMax = 0;

    const subjects: SubjectAgg[] = [];
    for (const agg of bySubject.values()) {
      grandTotalScore += agg.totalScore;
      grandTotalMax += agg.totalMax;
      const pct = agg.totalMax > 0 ? (agg.totalScore / agg.totalMax) * 100 : null;
      subjects.push({ ...agg, percentage: pct !== null ? Number(pct.toFixed(1)) : null });
    }

    const overallPercentage =
      grandTotalMax > 0 ? Number(((grandTotalScore / grandTotalMax) * 100).toFixed(1)) : null;

    const subjectsWithPct = subjects.filter((s) => s.percentage !== null);
    subjectsWithPct.sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0));

    const bestSubject = subjectsWithPct[0] || null;
    const weakestSubject = subjectsWithPct[subjectsWithPct.length - 1] || null;

    const periodLabel = `${term}, ${academicYear}`;
    const subjectCount = subjects.length;

    const lines: string[] = [];
    if (overallPercentage !== null) {
      lines.push(`For **${periodLabel}**, your overall continuous assessment average is about **${overallPercentage}%**.`);
    } else {
      lines.push(`For **${periodLabel}**, some max marks are missing, so the overall average is not fully reliable yet.`);
    }

    if (bestSubject?.percentage != null) lines.push(`• Strongest subject: **${bestSubject.subject}** (~${bestSubject.percentage}%).`);
    if (weakestSubject?.percentage != null && weakestSubject.subject !== bestSubject?.subject) {
      lines.push(`• Needs most support: **${weakestSubject.subject}** (~${weakestSubject.percentage}%).`);
    }

    lines.push("", "These numbers are not your identity. They are feedback.");

    const suggestions = [
      "Simple plan:",
      `- Protect your best subject (**${bestSubject?.subject ?? "your strongest"}**) with weekly revision.`,
      `- For your weakest subject (**${weakestSubject?.subject ?? "the toughest"}**): practise 2–3 questions daily and ask for help weekly.`,
      "- Improve by 5–10% next term: small daily consistency beats random big effort.",
    ].join("\n");

    return noStoreJson(
      {
        ok: true,
        studentId,
        term,
        academicYear,
        summary: lines.join("\n"),
        suggestions,
        meta: {
          overallPercentage,
          bestSubject: bestSubject ? { subject: bestSubject.subject, percentage: bestSubject.percentage } : null,
          weakestSubject: weakestSubject ? { subject: weakestSubject.subject, percentage: weakestSubject.percentage } : null,
          subjectCount,
        },
      },
      200
    );
  } catch (err) {
    console.error("[STUDENT_ASSESSMENT_EXPLAIN_ERROR]", err);
    return noStoreJson({ ok: false, error: "Failed to generate assessment explanation. Please try again." }, 500);
  }
}
