// src/app/api/headteacher/assessment/overview/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HeadteacherOverviewClass = {
  classroomId: string;
  classroomName: string;
  grade: string | null;
  arm: string | null;
  learnersCount: number;
  itemsCount: number;
  averagePercent: number | null;
};

type HeadteacherOverviewResponse = {
  ok: boolean;
  context: {
    tenantId: string;
    term: string;
    academicYear: string;
  };
  classes: HeadteacherOverviewClass[];
};

const querySchema = z.object({
  term: z.string().optional(),
  academicYear: z.string().optional(),
  // tenantId intentionally NOT accepted.
});

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function requireHeadOrAdmin(tenantId: string, userId: string) {
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    include: { role: true },
  });
  if (!m) return false;
  const roleName = String(m.role?.name ?? "").toUpperCase();
  return roleName.includes("HEAD") || roleName.includes("ADMIN");
}

/**
 * Headteacher/Admin – Whole-school CA overview
 *
 * GET /api/headteacher/assessment/overview?term=...&academicYear=...
 *
 * classAverage% = (sum of all scores) / (sum of all max scores) × 100
 * We only include recorded score rows in both numerator and denominator.
 */
export async function GET(req: Request) {
  let safe: any;
  try {
    safe = await requireServerUserContext({ requireTenant: true });
  } catch {
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    term: searchParams.get("term") ?? undefined,
    academicYear: searchParams.get("academicYear") ?? undefined,
  });

  if (!parsed.success) {
    return jsonNoStore({ ok: false, error: "Invalid filters", details: parsed.error.flatten() }, 400);
  }

  const term = parsed.data.term ?? "1st Term";
  const academicYear = parsed.data.academicYear ?? "2025/2026";

  const can = await requireHeadOrAdmin(String(safe.tenantId), String(safe.userId));
  if (!can) return jsonNoStore({ ok: false, error: "FORBIDDEN" }, 403);

  try {
    // 1) Classrooms + learner counts (no student IDs)
    const classrooms = await prisma.classroom.findMany({
      where: { tenantId: safe.tenantId },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        grade: true,
        arm: true,
        _count: { select: { students: true } },
      },
    });

    if (classrooms.length === 0) {
      const empty: HeadteacherOverviewResponse = {
        ok: true,
        context: { tenantId: safe.tenantId, term, academicYear },
        classes: [],
      };
      return jsonNoStore(empty);
    }

    // 2) Assessment items + score rows (term/year)
    const items = await prisma.assessmentItem.findMany({
      where: { tenantId: safe.tenantId, term, academicYear },
      select: {
        id: true,
        classroomId: true,
        maxScore: true,
        scores: { select: { score: true } },
      },
    });

    const itemsCountByClass = new Map<string, number>();
    const sumScoreByClass = new Map<string, number>();
    const sumMaxByClass = new Map<string, number>();

    for (const item of items) {
      const classId = item.classroomId;
      if (!classId) continue;

      const maxForItem = Number(item.maxScore ?? 0);
      if (!Number.isFinite(maxForItem) || maxForItem <= 0) continue;

      itemsCountByClass.set(classId, (itemsCountByClass.get(classId) ?? 0) + 1);

      // Each recorded score row contributes: +score, +maxScore
      for (const sc of item.scores) {
        const scoreVal = Number(sc.score ?? 0);
        sumScoreByClass.set(classId, (sumScoreByClass.get(classId) ?? 0) + (Number.isFinite(scoreVal) ? scoreVal : 0));
        sumMaxByClass.set(classId, (sumMaxByClass.get(classId) ?? 0) + maxForItem);
      }
    }

    const classes: HeadteacherOverviewClass[] = classrooms.map((cls) => {
      const learnersCount = cls._count.students;
      const itemsCount = itemsCountByClass.get(cls.id) ?? 0;

      const sumScore = sumScoreByClass.get(cls.id) ?? 0;
      const sumMax = sumMaxByClass.get(cls.id) ?? 0;

      const averagePercent = sumMax > 0 ? (sumScore / sumMax) * 100 : null;

      return {
        classroomId: cls.id,
        classroomName: cls.name,
        grade: cls.grade ?? null,
        arm: cls.arm ?? null,
        learnersCount,
        itemsCount,
        averagePercent,
      };
    });

    const response: HeadteacherOverviewResponse = {
      ok: true,
      context: { tenantId: safe.tenantId, term, academicYear },
      classes,
    };

    return jsonNoStore(response);
  } catch (err) {
    console.error("[HeadteacherAssessmentOverview][GET] error", err);
    return jsonNoStore({ ok: false, error: "Unexpected server error." }, 500);
  }
}
