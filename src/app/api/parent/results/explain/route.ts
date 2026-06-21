// src/app/api/parent/results/explain/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SessionUserLike = {
  id?: unknown;
  tenantId?: unknown;
};

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

const ADMINISH = new Set(["ADMIN", "SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"]);

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

async function getSafeTenantCtx() {
  const session = await getServerSession(authOptions);
  const u = session?.user as SessionUserLike | undefined;

  const userId = typeof u?.id === "string" ? u.id : "";
  const tenantId = typeof u?.tenantId === "string" ? u.tenantId : "";

  if (!session || !userId) {
    return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  }

  if (!tenantId) {
    return { ok: false as const, status: 403, error: "NO_ACTIVE_TENANT" };
  }

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
    roleName: clean(membership.role?.name).toUpperCase(),
  };
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

function readTrustedPercentage(subject: SubjectPayload): number | null {
  if (typeof subject.percentage === "number") {
    return clampPercent(subject.percentage);
  }

  if (typeof subject.totalPercent === "number") {
    return clampPercent(subject.totalPercent);
  }

  return null;
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
    const ctx = await getSafeTenantCtx();

    if (!ctx.ok) {
      return noStoreJson({ ok: false, error: ctx.error }, ctx.status);
    }

    const isParent = ctx.roleName === "PARENT";
    const isAdminish = ADMINISH.has(ctx.roleName);

    if (!isParent && !isAdminish) {
      return noStoreJson({ ok: false, error: "FORBIDDEN" }, 403);
    }

    const body = (await req.json().catch(() => null)) as BodyShape | null;

    if (!body || typeof body !== "object") {
      return noStoreJson({ ok: false, error: "Invalid JSON body." }, 400);
    }

    const studentName = clean(body.studentName) || "your child";
    const classLabel = clean(body.className) || "their class";
    const term = clean(body.term) || "1st Term";
    const academicYear = clean(body.academicYear) || "2025/2026";
    const periodLabel = `${term}, ${academicYear}`;

    const subjects = normalizeSubjects(body.subjects);

    if (subjects.length === 0) {
      return noStoreJson({
        ok: true,
        summary:
          `For **${periodLabel}**, there are no complete policy-aware subject percentages ready yet for ${studentName}.\n\n` +
          "This does not mean the learner is doing poorly. It means EduLife OS is waiting for trusted assessment evidence before giving a full explanation.",
        suggestions: [
          "**What to do now**",
          "- Encourage attendance, punctuality, homework, and revision.",
          "- Ask politely whether assessment records are still being entered.",
          "- Keep the home routine steady while the school completes the evidence.",
        ].join("\n"),
        meta: {
          tenantId: ctx.tenantId,
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
        `For **${periodLabel}**, there is not enough trusted data to compute a clear overall percentage for ${studentName}.`
      );
    } else {
      lines.push(
        `For **${periodLabel}**, ${studentName} is currently around **${overall.toFixed(
          1
        )}%** across the policy-aware subjects available in EduLife OS.`
      );
    }

    if (best) {
      lines.push(
        `- Strongest subject: **${best.subject}** (~${best.percentage.toFixed(1)}%${
          best.policyText ? `, ${best.policyText}` : ""
        }).`
      );
    }

    if (weakest && weakest.subject !== best?.subject) {
      lines.push(
        `- Needs most attention: **${weakest.subject}** (~${weakest.percentage.toFixed(1)}%${
          weakest.policyText ? `, ${weakest.policyText}` : ""
        }).`
      );
    }

    if (high.length) lines.push(`- Strong areas: **${listNames(high)}**.`);
    if (mid.length) lines.push(`- Steady areas: **${listNames(mid)}**.`);
    if (low.length) lines.push(`- Support areas: **${listNames(low)}**.`);

    lines.push(
      "",
      `This is a snapshot for **${classLabel}** in **${periodLabel}**. It is feedback for growth, not a permanent label.`
    );

    const suggestions = [
      "**Practical plan at home**",
      "- Protect sleep, punctuality, and attendance.",
      "- Do short, consistent revision rather than rare long study.",
      weakest
        ? `- Focus first on **${weakest.subject}** for two weeks.`
        : "- Focus on one steady subject and push it higher.",
      "- Ask the teacher: “Which two topics should we practise first?”",
    ].join("\n");

    return noStoreJson({
      ok: true,
      summary: lines.join("\n"),
      suggestions,
      meta: {
        tenantId: ctx.tenantId,
        overall,
        subjectCount: subjects.length,
        explanationSource: "policy-payload-only",
      },
    });
  } catch (err) {
    console.error("[PARENT_RESULTS_EXPLAIN_ERROR]", err);
    return noStoreJson(
      { ok: false, error: "Failed to generate results explanation." },
      500
    );
  }
}