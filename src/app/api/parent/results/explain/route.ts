// src/app/api/parent/results/explain/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GesInfo = { grade?: number; label?: string; band?: string };
type SubjectPayload = { subject?: string; percentage?: number | null; ges?: GesInfo | null };
type BodyShape = {
  tenantId?: string; // ignored (session scoped)
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

const ADMINISH = new Set(["ADMIN", "SCHOOL_ADMIN", "HEADTEACHER"]);

async function getSafeTenantCtx() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;

  const userId = typeof u?.id === "string" ? u.id : "";
  const tenantId = typeof u?.tenantId === "string" ? u.tenantId : "";

  if (!session || !userId) return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  if (!tenantId) return { ok: false as const, status: 403, error: "NO_ACTIVE_TENANT" };

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false as const, status: 403, error: "FORBIDDEN" };
  }

  return {
    ok: true as const,
    userId,
    tenantId,
    roleName: String(membership.role?.name ?? "").trim(),
  };
}

function gesTextFromSubject(s: SubjectPayload): string | null {
  const p = clampPercent(s.percentage ?? null);
  const ges = s.ges || {};
  if (p == null) return null;

  if (ges.grade != null || ges.label || ges.band) {
    const parts: string[] = [];
    if (ges.grade != null) parts.push(`Grade ${ges.grade}`);
    if (ges.band) parts.push(ges.band);
    if (ges.label) parts.push(ges.label);
    return parts.join(" – ");
  }

  if (p >= 80) return "Excellent (GES-style high performance)";
  if (p >= 70) return "Very good";
  if (p >= 60) return "Good";
  if (p >= 50) return "Satisfactory / Pass";
  if (p >= 40) return "Below average – needs support";
  return "Weak – needs close support";
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getSafeTenantCtx();
    if (!ctx.ok) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status, headers: { "cache-control": "no-store" } }
      );
    }

    const isParent = ctx.roleName === "PARENT";
    const isAdminish = ADMINISH.has(ctx.roleName);
    if (!isParent && !isAdminish) {
      return NextResponse.json(
        { ok: false, error: "FORBIDDEN" },
        { status: 403, headers: { "cache-control": "no-store" } }
      );
    }

    const body = (await req.json().catch(() => null)) as BodyShape | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
    }

    const {
      studentName,
      className,
      term = "1st Term",
      academicYear = "2025/2026",
      overallPercentage,
      subjects: rawSubjects,
    } = body;

    const periodLabel = `${term}, ${academicYear}`;

    if (!Array.isArray(rawSubjects)) {
      return NextResponse.json({ ok: false, error: "subjects must be an array." }, { status: 400 });
    }

    const subjects = rawSubjects
      .map((s) => ({
        subject: String(s.subject ?? "").trim(),
        percentage: clampPercent(s.percentage ?? null),
        ges: s.ges ?? null,
      }))
      .filter((s) => s.subject && s.percentage != null);

    const childName = String(studentName || "your child").trim();
    const classLabel = String(className || "their class").trim();

    if (subjects.length === 0) {
      const summary =
        `For **${periodLabel}**, there are not enough continuous assessment scores recorded yet for ${childName}.\n\n` +
        `This simply means teachers have not finished entering marks into EduLife OS, not that your child is doing poorly.`;

      const suggestions =
        `**What to do now**\n` +
        `- Encourage regular attendance and punctuality.\n` +
        `- Ask politely if marks are still being entered.\n` +
        `- Maintain home routines (homework time, reading time, adequate sleep).`;

      return NextResponse.json(
        { ok: true, summary, suggestions, meta: { tenantId: ctx.tenantId } },
        { status: 200, headers: { "cache-control": "no-store" } }
      );
    }

    const subjectPercents = subjects.map((s) => s.percentage!).filter((p) => p != null);
    const derivedOverall =
      subjectPercents.length > 0 ? subjectPercents.reduce((a, b) => a + b, 0) / subjectPercents.length : null;

    const overall = clampPercent(overallPercentage != null ? overallPercentage : derivedOverall);

    const high = subjects.filter((s) => (s.percentage ?? 0) >= 75);
    const mid = subjects.filter((s) => (s.percentage ?? 0) >= 50 && (s.percentage ?? 0) < 75);
    const low = subjects.filter((s) => (s.percentage ?? 0) < 50);

    const sorted = [...subjects].sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    const listNames = (arr: typeof subjects, limit = 3): string => {
      const names = arr.map((s) => s.subject);
      if (names.length === 0) return "";
      if (names.length <= limit) return names.join(", ");
      return `${names.slice(0, limit).join(", ")} and ${names.length - limit} more`;
    };

    let overallLine: string;
    if (overall == null) overallLine = `For **${periodLabel}**, there is not yet enough data to compute a clear overall percentage.`;
    else if (overall >= 80) overallLine = `For **${periodLabel}**, ${childName} is performing at a **very strong level** (~**${overall.toFixed(1)}%**).`;
    else if (overall >= 70) overallLine = `For **${periodLabel}**, ${childName} is doing **well overall** (~**${overall.toFixed(1)}%**).`;
    else if (overall >= 55) overallLine = `For **${periodLabel}**, ${childName} is **holding steady** (~**${overall.toFixed(1)}%**) with room to strengthen a few areas.`;
    else if (overall >= 45) overallLine = `For **${periodLabel}**, ${childName} is around **${overall.toFixed(1)}%**, showing struggle in some subjects but improvement is realistic with focused support.`;
    else overallLine = `For **${periodLabel}**, ${childName} is around **${overall.toFixed(1)}%**, meaning several subjects need calm, organised support — not panic.`;

    const lines: string[] = [overallLine];

    if (best) {
      const bestGes = gesTextFromSubject(best);
      lines.push(`- Strongest subject: **${best.subject}** (~**${best.percentage!.toFixed(1)}%**${bestGes ? `, ${bestGes}` : ""}).`);
    }
    if (worst && worst !== best) {
      const worstGes = gesTextFromSubject(worst);
      lines.push(`- Needs most attention: **${worst.subject}** (~**${worst.percentage!.toFixed(1)}%**${worstGes ? `, ${worstGes}` : ""}).`);
    }
    if (high.length) lines.push(`- Strong areas: **${listNames(high)}**.`);
    if (mid.length) lines.push(`- Steady areas: **${listNames(mid)}** (these can become strengths).`);
    if (low.length) lines.push(`- Struggling areas: **${listNames(low)}** (focus here calmly).`);
    lines.push("", `This is a snapshot for **${classLabel}** in **${periodLabel}** — patterns can improve term by term.`);

    const suggestions = [
      `**Practical plan at home (simple and effective)**`,
      `1) Protect sleep + punctuality (tired children underperform).`,
      `2) Do 20–30 minutes revision, 4 days/week (short + consistent beats long + rare).`,
      low.length
        ? `3) Start with ONE struggling subject (${low[0].subject}) for 2 weeks, then add the next.`
        : `3) Strengthen one “steady” subject into a “strong” one.`,
      `4) Talk to the teacher: “What 2 topics should we focus on first?”`,
    ].join("\n");

    return NextResponse.json(
      { ok: true, summary: lines.join("\n"), suggestions, meta: { tenantId: ctx.tenantId, overall, subjectCount: subjects.length } },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    console.error("[PARENT_RESULTS_EXPLAIN_ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Failed to generate results explanation." },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
