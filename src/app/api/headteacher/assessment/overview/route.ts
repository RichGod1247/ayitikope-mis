// src/app/api/headteacher/assessment/overview/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

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
  draftItemsCount: number;
  publishedItemsCount: number;
  lockedItemsCount: number;
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
});

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function normalizeItemStatus(raw: unknown): "DRAFT" | "PUBLISHED" | "LOCKED" {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "LOCKED") return "LOCKED";
  if (s === "PUBLISHED") return "PUBLISHED";
  return "DRAFT";
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    term: searchParams.get("term") ?? undefined,
    academicYear: searchParams.get("academicYear") ?? undefined,
  });

  if (!parsed.success) {
    return jsonNoStore(
      { ok: false, error: "Invalid filters", details: parsed.error.flatten() },
      400
    );
  }

  const term = parsed.data.term ?? "1st Term";
  const academicYear = parsed.data.academicYear ?? "2025/2026";

  try {
    const classrooms = await prisma.classroom.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: [{ grade: "asc" }, { name: "asc" }, { arm: "asc" }],
      select: {
        id: true,
        name: true,
        grade: true,
        arm: true,
      },
    });

    if (classrooms.length === 0) {
      const empty: HeadteacherOverviewResponse = {
        ok: true,
        context: { tenantId: ctx.tenantId, term, academicYear },
        classes: [],
      };
      return jsonNoStore(empty);
    }

    const classroomIds = classrooms.map((c) => c.id);

    const studentGroups = await prisma.student.groupBy({
      by: ["classroomId"],
      where: {
        tenantId: ctx.tenantId,
        status: "ACTIVE",
        classroomId: { in: classroomIds },
      },
      _count: { _all: true },
    });

    const learnersCountByClass = new Map<string, number>();
    for (const g of studentGroups) {
      if (!g.classroomId) continue;
      learnersCountByClass.set(g.classroomId, g._count._all);
    }

    const items = await prisma.assessmentItem.findMany({
      where: { tenantId: ctx.tenantId, term, academicYear },
      select: {
        id: true,
        classroomId: true,
        maxScore: true,
        status: true,
        scores: { select: { score: true } },
      },
    });

    const itemsCountByClass = new Map<string, number>();
    const sumScoreByClass = new Map<string, number>();
    const sumMaxByClass = new Map<string, number>();
    const draftCountByClass = new Map<string, number>();
    const publishedCountByClass = new Map<string, number>();
    const lockedCountByClass = new Map<string, number>();

    for (const item of items) {
      const classId = item.classroomId;
      if (!classId) continue;

      itemsCountByClass.set(classId, (itemsCountByClass.get(classId) ?? 0) + 1);

      const status = normalizeItemStatus(item.status);
      if (status === "LOCKED") {
        lockedCountByClass.set(classId, (lockedCountByClass.get(classId) ?? 0) + 1);
      } else if (status === "PUBLISHED") {
        publishedCountByClass.set(classId, (publishedCountByClass.get(classId) ?? 0) + 1);
      } else {
        draftCountByClass.set(classId, (draftCountByClass.get(classId) ?? 0) + 1);
      }

      const maxForItem = Number(item.maxScore ?? 0);
      if (!Number.isFinite(maxForItem) || maxForItem <= 0) continue;

      for (const sc of item.scores) {
        const scoreVal = Number(sc.score ?? 0);
        sumScoreByClass.set(
          classId,
          (sumScoreByClass.get(classId) ?? 0) + (Number.isFinite(scoreVal) ? scoreVal : 0)
        );
        sumMaxByClass.set(classId, (sumMaxByClass.get(classId) ?? 0) + maxForItem);
      }
    }

    const classes: HeadteacherOverviewClass[] = classrooms.map((cls) => {
      const learnersCount = learnersCountByClass.get(cls.id) ?? 0;
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
        draftItemsCount: draftCountByClass.get(cls.id) ?? 0,
        publishedItemsCount: publishedCountByClass.get(cls.id) ?? 0,
        lockedItemsCount: lockedCountByClass.get(cls.id) ?? 0,
      };
    });

    const response: HeadteacherOverviewResponse = {
      ok: true,
      context: { tenantId: ctx.tenantId, term, academicYear },
      classes,
    };

    return jsonNoStore(response);
  } catch (err) {
    console.error("[HEADTEACHER_ASSESSMENT_OVERVIEW_GET]", err);
    return jsonNoStore({ ok: false, error: "Unexpected server error." }, 500);
  }
}