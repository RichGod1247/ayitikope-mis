// src/app/api/headteacher/reports/student-term-report/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/headteacher/reports/student-term-report
 *
 * Query params:
 *  - studentId (required)
 *  - term (required) – e.g. "1st Term"
 *  - academicYear (required) – e.g. "2025/2026"
 *
 * Returns a per-learner term report:
 *  - student info
 *  - per-subject totals and items
 *  - overall totals and percentages
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const studentId = url.searchParams.get("studentId");
    const term = url.searchParams.get("term");
    const academicYear = url.searchParams.get("academicYear");

    if (!studentId || !term || !academicYear) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "studentId, term and academicYear are required query parameters.",
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

    // 3) Load student (must belong to this tenant)
    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        tenantId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        sex: true,
        classroomId: true,
      },
    });

    if (!student) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Learner not found for this school. Please check the link or contact the office.",
        },
        { status: 404 }
      );
    }

    if (!student.classroomId) {
      return NextResponse.json(
        {
          ok: true,
          tenantId,
          student: {
            id: student.id,
            firstName: student.firstName ?? "",
            lastName: student.lastName ?? "",
            sex: student.sex ?? "",
          },
          term,
          academicYear,
          subjects: [],
          overall: {
            totalScore: 0,
            maxTotalScore: 0,
            percentage: null as number | null,
          },
          message:
            "This learner is not assigned to a classroom yet. Please assign a class before generating term reports.",
        },
        { status: 200 }
      );
    }

    const classroomId = student.classroomId;

    // 4) Load assessment items for this learner's class, term & year
    //
    // Expected shape (already used in class-term-summary):
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
          student: {
            id: student.id,
            firstName: student.firstName ?? "",
            lastName: student.lastName ?? "",
            sex: student.sex ?? "",
          },
          term,
          academicYear,
          subjects: [],
          overall: {
            totalScore: 0,
            maxTotalScore: 0,
            percentage: null as number | null,
          },
          message:
            "No assessment items found yet for this learner's class and term. Once assessments are recorded, this report will populate.",
        },
        { status: 200 }
      );
    }

    const itemIds = items.map((i) => i.id);

    // 5) Load this learner's scores for those items
    //
    // Your real AssessmentScore shape (from previous errors):
    //   model AssessmentScore {
    //     id        String  @id @default(cuid())
    //     createdAt DateTime
    //     updatedAt DateTime
    //     studentId String
    //     itemId    String   // FK to AssessmentItem
    //     score     Int
    //     comment   String?
    //   }
    const scores = await prisma.assessmentScore.findMany({
      where: {
        studentId,
        itemId: {
          in: itemIds,
        },
      },
      select: {
        itemId: true,
        score: true,
        comment: true,
      },
    });

    // Build map: itemId -> score + comment (for this learner)
    const scoreByItem = new Map<
      string,
      { score: number; comment: string | null }
    >();
    for (const sc of scores) {
      if (!sc.itemId) continue;
      scoreByItem.set(sc.itemId, {
        score: sc.score ?? 0,
        comment: sc.comment ?? null,
      });
    }

    // 6) Build per-subject structure
    type SubjectRow = {
      subject: string;
      totalScore: number;
      maxTotalScore: number;
      percentage: number | null;
      items: {
        id: string;
        title: string;
        maxScore: number;
        score: number;
        comment: string | null;
      }[];
    };

    const subjectsMap = new Map<string, SubjectRow>();

    function ensureSubjectRow(subject: string): SubjectRow {
      let row = subjectsMap.get(subject);
      if (!row) {
        row = {
          subject,
          totalScore: 0,
          maxTotalScore: 0,
          percentage: null,
          items: [],
        };
        subjectsMap.set(subject, row);
      }
      return row;
    }

    for (const item of items) {
      const subject = item.subject ?? "Unknown";
      const maxScore = item.maxScore ?? 0;

      const sr = ensureSubjectRow(subject);

      const scoreInfo = scoreByItem.get(item.id);
      const scoreValue = scoreInfo?.score ?? 0;

      sr.totalScore += scoreValue;
      sr.maxTotalScore += maxScore;
      sr.items.push({
        id: item.id,
        title: item.title ?? "",
        maxScore,
        score: scoreValue,
        comment: scoreInfo?.comment ?? null,
      });
    }

    // Compute percentages per subject
    let overallTotal = 0;
    let overallMax = 0;

    for (const row of subjectsMap.values()) {
      overallTotal += row.totalScore;
      overallMax += row.maxTotalScore;

      if (row.maxTotalScore > 0) {
        row.percentage = row.totalScore / row.maxTotalScore;
      } else {
        row.percentage = null;
      }
    }

    const overallPercentage =
      overallMax > 0 ? overallTotal / overallMax : null;

    const subjects = Array.from(subjectsMap.values()).sort((a, b) =>
      a.subject.localeCompare(b.subject)
    );

    return NextResponse.json(
      {
        ok: true,
        tenantId,
        student: {
          id: student.id,
          firstName: student.firstName ?? "",
          lastName: student.lastName ?? "",
          sex: student.sex ?? "",
          classroomId,
        },
        term,
        academicYear,
        subjects,
        overall: {
          totalScore: overallTotal,
          maxTotalScore: overallMax,
          percentage: overallPercentage,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(
      "Error in /api/headteacher/reports/student-term-report",
      err
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Unexpected error while building learner term report.",
      },
      { status: 500 }
    );
  }
}
