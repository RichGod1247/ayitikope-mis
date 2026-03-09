// src/app/api/headteacher/reports/class-term-summary/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * GET /api/headteacher/reports/class-term-summary
 *
 * Query params:
 *  - classroomId (required)
 *  - term (required)
 *  - academicYear (required)
 */
export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;

  try {
    const url = new URL(req.url);
    const classroomId = (url.searchParams.get("classroomId") ?? "").trim();
    const term = (url.searchParams.get("term") ?? "").trim();
    const academicYear = (url.searchParams.get("academicYear") ?? "").trim();

    if (!classroomId || !term || !academicYear) {
      return noStoreJson(400, {
        ok: false,
        error: "classroomId, term and academicYear are required query parameters.",
      });
    }

    const classroom = await prisma.classroom.findFirst({
      where: {
        id: classroomId,
        tenantId: ctx.tenantId,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    if (!classroom) {
      return noStoreJson(404, {
        ok: false,
        error: "CLASSROOM_NOT_FOUND",
      });
    }

    const students = await prisma.student.findMany({
      where: {
        tenantId: ctx.tenantId,
        classroomId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });

    if (students.length === 0) {
      return noStoreJson(200, {
        ok: true,
        tenantId: ctx.tenantId,
        classroomId,
        term,
        academicYear,
        subjects: [],
        students: [],
        message:
          "No learners found for this class. Please assign learners to this classroom first.",
      });
    }

    const items = await prisma.assessmentItem.findMany({
      where: {
        tenantId: ctx.tenantId,
        classroomId,
        term,
        academicYear,
      },
      select: {
        id: true,
        subject: true,
        title: true,
        maxScore: true,
      },
      orderBy: [{ subject: "asc" }, { createdAt: "asc" }],
    });

    if (items.length === 0) {
      return noStoreJson(200, {
        ok: true,
        tenantId: ctx.tenantId,
        classroomId,
        term,
        academicYear,
        subjects: [],
        students: students.map((s) => ({
          id: s.id,
          firstName: s.firstName ?? "",
          lastName: s.lastName ?? "",
          totalScore: 0,
          maxTotalScore: 0,
          scoresBySubject: {},
        })),
        message:
          "No assessment items found for this class and term yet. Once assessments are recorded, this report will populate.",
      });
    }

    const itemIds = items.map((i) => i.id);

    const maxBySubject = new Map<string, number>();
    for (const item of items) {
      const subject = item.subject ?? "Unknown";
      const max = Number(item.maxScore ?? 0);
      maxBySubject.set(subject, (maxBySubject.get(subject) ?? 0) + max);
    }

    const subjects = Array.from(maxBySubject.keys()).sort();

    const scores = await prisma.assessmentScore.findMany({
      where: {
        itemId: {
          in: itemIds,
        },
      },
      select: {
        itemId: true,
        studentId: true,
        score: true,
      },
    });

    const itemMeta = new Map<string, { subject: string; maxScore: number }>();
    for (const item of items) {
      itemMeta.set(item.id, {
        subject: item.subject ?? "Unknown",
        maxScore: Number(item.maxScore ?? 0),
      });
    }

    type StudentAgg = {
      totalScore: number;
      maxTotalScore: number;
      scoresBySubject: Record<string, number>;
    };

    const aggByStudent = new Map<string, StudentAgg>();

    function ensureAgg(studentId: string): StudentAgg {
      let existing = aggByStudent.get(studentId);
      if (!existing) {
        existing = {
          totalScore: 0,
          maxTotalScore: 0,
          scoresBySubject: {},
        };
        aggByStudent.set(studentId, existing);
      }
      return existing;
    }

    for (const sc of scores) {
      if (!sc.studentId || !sc.itemId) continue;

      const meta = itemMeta.get(sc.itemId);
      if (!meta) continue;

      const agg = ensureAgg(sc.studentId);
      const scoreValue = Number(sc.score ?? 0);

      agg.totalScore += Number.isFinite(scoreValue) ? scoreValue : 0;
      agg.maxTotalScore += meta.maxScore;
      agg.scoresBySubject[meta.subject] =
        (agg.scoresBySubject[meta.subject] ?? 0) +
        (Number.isFinite(scoreValue) ? scoreValue : 0);
    }

    const studentRows = students.map((s) => {
      const agg = aggByStudent.get(s.id) ?? {
        totalScore: 0,
        maxTotalScore: 0,
        scoresBySubject: {},
      };

      return {
        id: s.id,
        firstName: s.firstName ?? "",
        lastName: s.lastName ?? "",
        totalScore: agg.totalScore,
        maxTotalScore: agg.maxTotalScore,
        scoresBySubject: agg.scoresBySubject,
      };
    });

    return noStoreJson(200, {
      ok: true,
      tenantId: ctx.tenantId,
      classroomId,
      term,
      academicYear,
      subjects,
      students: studentRows,
    });
  } catch (err: any) {
    console.error("[HEADTEACHER_CLASS_TERM_SUMMARY_GET]", err);
    return noStoreJson(500, {
      ok: false,
      error:
        err?.message || "Unexpected error while building class term summary.",
    });
  }
}