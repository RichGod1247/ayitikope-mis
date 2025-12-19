// src/app/api/parent/children/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/parent/children?guardianPhone=...
 *
 * Jason rules:
 *  - Always JSON with { ok:boolean, ... }
 *  - 400 if guardianPhone missing
 *  - 200 and ok:true for success (even if 0 children)
 *
 * For now we:
 *  - Find all students whose guardianPhone matches exactly.
 *  - Include their classroom info (if any).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const guardianPhone =
      searchParams.get("guardianPhone")?.trim() || "";

    if (!guardianPhone) {
      return NextResponse.json(
        {
          ok: false,
          error: "guardianPhone is required.",
        },
        { status: 400 }
      );
    }

    const client = prisma as any;

    const students = await client.student.findMany({
      where: {
        guardianPhone,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            arm: true,
          },
        },
      },
      orderBy: {
        firstName: "asc",
      },
    });

    const result = students.map((s: any) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`.trim(),
      guardianName: s.guardianName,
      guardianPhone: s.guardianPhone,
      classroom: s.classroom
        ? {
            id: s.classroom.id,
            name: s.classroom.name,
            grade: s.classroom.grade,
            arm: s.classroom.arm,
          }
        : null,
    }));

    return NextResponse.json(
      {
        ok: true,
        guardianPhone,
        students: result,
        count: result.length,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[PARENT_CHILDREN_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load learners for this phone number. Please try again.",
      },
      { status: 500 }
    );
  }
}
