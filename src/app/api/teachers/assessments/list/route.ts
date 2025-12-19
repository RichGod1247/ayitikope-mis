import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Teacher Assessment List API
 *
 * GET /api/teachers/assessments/list?tenantId=...&classroomId=...&term=...&academicYear=...&subject=...
 *
 * - tenantId (required)
 * - classroomId (required)
 * - term (optional, e.g. "1st Term")
 * - academicYear (optional, e.g. "2025/2026")
 * - subject (optional, e.g. "Mathematics")
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const tenantId = searchParams.get("tenantId");
    const classroomId = searchParams.get("classroomId");
    const term = searchParams.get("term");
    const academicYear = searchParams.get("academicYear");
    const subject = searchParams.get("subject");

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required." },
        { status: 400 }
      );
    }

    if (!classroomId) {
      return NextResponse.json(
        { ok: false, error: "classroomId is required." },
        { status: 400 }
      );
    }

    // Basic filter
    const where: any = {
      tenantId,
      classroomId,
    };

    if (term) {
      where.term = term;
    }

    if (academicYear) {
      where.academicYear = academicYear;
    }

    if (subject) {
      where.subject = subject;
    }

    const items = await prisma.assessmentItem.findMany({
      where,
      orderBy: [
        { date: "asc" },
        { createdAt: "asc" },
      ],
      include: {
        scores: {
          select: {
            id: true,
            studentId: true,
            score: true,
          },
        },
      },
    });

    // Add basic stats: count + average
    const mapped = items.map((item) => {
      const scores = item.scores || [];
      const total = scores.reduce((sum, s) => sum + s.score, 0);
      const averageScore =
        scores.length > 0 ? total / scores.length : null;

      return {
        id: item.id,
        tenantId: item.tenantId,
        classroomId: item.classroomId,
        subject: item.subject,
        term: item.term,
        academicYear: item.academicYear,
        title: item.title,
        description: item.description,
        type: item.type,
        maxScore: item.maxScore,
        weighting: item.weighting,
        date: item.date,
        scoresCount: scores.length,
        averageScore,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    return NextResponse.json({
      ok: true,
      filters: {
        tenantId,
        classroomId,
        term,
        academicYear,
        subject,
      },
      count: mapped.length,
      items: mapped,
    });
  } catch (err) {
    console.error("[TEACHER_ASSESSMENTS_LIST_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load assessments. Please try again later.",
      },
      { status: 500 }
    );
  }
}
