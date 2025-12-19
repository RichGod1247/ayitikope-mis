// src/app/api/curriculum/hierarchy/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getCurriculumHierarchyForSubject,
} from "@/lib/curriculumEngine";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const subjectSlug = searchParams.get("subjectSlug") ?? undefined;
  const phase = searchParams.get("phase") ?? undefined;
  const level = searchParams.get("level") ?? undefined;
  const subject = searchParams.get("subject") ?? undefined;

  if (!subject && !subjectSlug) {
    return NextResponse.json(
      { ok: false, error: "subject or subjectSlug is required" },
      { status: 400 }
    );
  }

  try {
    const hierarchy = await getCurriculumHierarchyForSubject({
      phase,
      level,
      subject,
      subjectSlug,
    });

    if (!hierarchy) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No curriculum found for this phase/level/subject/slug. Check that your NaCCA seed data is in the CurriculumSubject table.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        subject: hierarchy,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error in /api/curriculum/hierarchy:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load curriculum hierarchy. See server logs.",
      },
      { status: 500 }
    );
  }
}
