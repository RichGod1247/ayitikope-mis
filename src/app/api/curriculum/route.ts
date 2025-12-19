// src/app/api/curriculum/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getCurriculumHierarchyForSubject } from "@/lib/curriculumEngine";

/**
 * Curriculum Engine API
 *
 * GET /api/curriculum?phase=KG&level=KG1&subjectSlug=kg1-our-world-and-our-people
 * or
 * GET /api/curriculum?phase=KG&level=KG1&subject=Our%20World%20and%20Our%20People
 *
 * Returns a single curriculum subject hierarchy:
 *  - Subject
 *    - Strands
 *      - Sub-strands
 *        - Content standards
 *          - Indicators
 *            - Exemplars
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const phase = url.searchParams.get("phase") || undefined;
  const level = url.searchParams.get("level") || undefined;
  const subject = url.searchParams.get("subject") || undefined;
  const subjectSlug = url.searchParams.get("subjectSlug") || undefined;

  if (!subject && !subjectSlug) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing subject or subjectSlug. Provide at least one of: ?subject=... or ?subjectSlug=....",
      },
      { status: 400 }
    );
  }

  try {
    const tree = await getCurriculumHierarchyForSubject({
      phase,
      level,
      subject,
      subjectSlug,
    });

    if (!tree) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Curriculum subject not found for the given phase/level/subject. Please confirm that the seed data covers this combination.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        item: tree,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("CURRICULUM_ENGINE_API_ERROR", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Unexpected error while loading curriculum hierarchy. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
