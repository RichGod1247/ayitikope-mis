// src/app/api/curriculum/subjects/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const phase = searchParams.get("phase") || undefined;
  const level = searchParams.get("level") || undefined;

  try {
    const subjects = await prisma.curriculumSubject.findMany({
      where: {
        ...(phase ? { phase } : {}),
        ...(level ? { level } : {}),
      },
      orderBy: [
        { phase: "asc" },
        { level: "asc" },
        { orderIndex: "asc" },
        { name: "asc" },
      ],
      select: {
        id: true,
        phase: true,
        level: true,
        name: true,
        slug: true,
        orderIndex: true,
      },
    });

    return NextResponse.json({
      ok: true,
      items: subjects,
    });
  } catch (err) {
    console.error("CURRICULUM_SUBJECTS_API_ERROR", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load curriculum subjects.",
      },
      { status: 500 }
    );
  }
}
