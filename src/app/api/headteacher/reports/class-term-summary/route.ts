// src/app/api/headteacher/reports/class-term-summary/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/headteacher/reports/class-term-summary
 *
 * Query params:
 *  - classroomId (required)
 *  - term (required) – e.g. "1st Term"
 *  - academicYear (required) – e.g. "2025/2026"
 *
 * Returns:
 *  - subjects[] – list of subjects with at least one assessment
 *  - students[] – each with scores by subject and totals
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const classroomId = url.searchParams.get("classroomId");
    const term = url.searchParams.get("term");
    const academicYear = url.searchParams.get("academicYear");

    if (!classroomId || !term || !academicYear) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "classroomId, term and academicYear are required query parameters.",
        },
        { status: 400 }
      );
    }

    // 1) Auth – ensure headteacher is signed in
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId: string | undefined = user?.id;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Not signed in" },
        { status: 401 }
      );
    }

    // 2) Tenant – check membership
    const membership = await prisma.membership.findFirst({
      where: { userId },
    });

    if (!membership?.tenantId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No tenant membership found for this user.",
        },
        { status: 401 }
      );
    }

    const tenantId = membership.tenantId;

    // 3) Load students for this class & tenant
    const students = await prisma.student.findMany({
      where: {
        tenantId,
        classroomId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
      orderBy: {
        firstName: "asc",
      },
    });

    if (students.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          tenantId,
          classroomId,
          term,
          academicYear,
          subjects: [],
          students: [],
          message:
            "No learners found for this class. Please assign learners to this classroom first.",
        },
        { status: 200 }
      );
    }

    // 4) Load assessment items for this class, term & year
    //
    // Expected shape:
    //   model AssessmentItem {
    //     id           String @id @default(cuid())
    //     tenantId     String
    //     classroomId  String
    //     term         String
    //     academicYear String
    //     subject      String
    //     title        String
    //     maxScore     Int
    //   }
    const items = await prisma.assessmentItem.findMany({
      where: {
        tenantId,
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
      orderBy: {
        subject: "asc",
      },
    });

    if (items.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          tenantId,
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
        },
        { status: 200 }
      );
    }

    const itemIds = items.map((i) => i.id);

    // Compute total possible marks per subject
    const maxBySubject = new Map<string, number>();
    for (const item of items) {
      const subject = item.subject ?? "Unknown";
      const max = item.maxScore ?? 0;
      const prev = maxBySubject.get(subject) ?? 0;
      maxBySubject.set(subject, prev + max);
    }

    const subjects = Array.from(maxBySubject.keys()).sort();

    // 5) Load scores for those items
    //
    // Your real shape (from the TS error) is:
    //   model AssessmentScore {
    //     id        String  @id @default(cuid())
    //     createdAt DateTime
    //     updatedAt DateTime
    //     studentId String
    //     itemId    String   // FK to AssessmentItem
    //     score     Int
    //     comment   String?
    //   }
    //
    // So we filter by itemId (not assessmentItemId) and don't use tenantId here.
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

    // Map itemId -> { subject, maxScore }
    const itemMeta = new Map<
      string,
      { subject: string; maxScore: number }
    >();
    for (const item of items) {
      itemMeta.set(item.id, {
        subject: item.subject ?? "Unknown",
        maxScore: item.maxScore ?? 0,
      });
    }

    // Build per-student aggregates
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

      const { subject, maxScore } = meta;
      const scoreValue = sc.score ?? 0;

      const agg = ensureAgg(sc.studentId);
      // Sum totals
      agg.totalScore += scoreValue;
      agg.maxTotalScore += maxScore;

      // Sum per subject
      const prevSubjectScore = agg.scoresBySubject[subject] ?? 0;
      agg.scoresBySubject[subject] =
        prevSubjectScore + scoreValue;
    }

    // 6) Build response for all students
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

    return NextResponse.json(
      {
        ok: true,
        tenantId,
        classroomId,
        term,
        academicYear,
        subjects,
        students: studentRows,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(
      "Error in /api/headteacher/reports/class-term-summary",
      err
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Unexpected error while building class term summary.",
      },
      { status: 500 }
    );
  }
}
