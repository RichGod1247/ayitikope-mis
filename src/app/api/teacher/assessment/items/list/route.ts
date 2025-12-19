// src/app/api/teacher/assessment/items/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const tenantId = searchParams.get("tenantId");
    const classroomId = searchParams.get("classroomId");
    const term = searchParams.get("term");
    const academicYear = searchParams.get("academicYear");

    if (!tenantId || !classroomId || !term || !academicYear) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing required filters: tenantId, classroomId, term, academicYear",
        },
        { status: 400 }
      );
    }

    const items = await prisma.assessmentItem.findMany({
      where: {
        tenantId,
        classroomId,
        term,
        academicYear,
      },
      orderBy: {
        date: "asc",
      },
    });

    return NextResponse.json({
      ok: true,
      filters: { tenantId, classroomId, term, academicYear },
      count: items.length,
      items,
    });
  } catch (error) {
    console.error("[TEACHER_ASSESSMENT_ITEM_LIST_ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load assessment items.",
      },
      { status: 500 }
    );
  }
}
