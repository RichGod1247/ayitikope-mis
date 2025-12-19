// src/app/api/curriculum/units/route.ts

import { NextRequest, NextResponse } from "next/server";
import {
  getCurriculumHierarchyForSubject,
  type CurriculumHierarchyRequest,
} from "@/lib/curriculumEngine";

/**
 * This route exposes "CurriculumUnit"-like slices for the
 * Teacher Lesson Note Studio (Step 2 – NaCCA curriculum slice).
 *
 * It now uses the NEW curriculum engine instead of any old
 * CurriculumUnit table, so that:
 *   - The generator route and the "Load NaCCA units" button
 *     both see the SAME source of truth.
 *
 * Query params accepted:
 *   - subject      (required unless subjectSlug is provided)
 *   - subjectSlug  (optional, preferred when present)
 *   - phase        (optional – currently for debugging / future use)
 *   - level        (optional – currently for debugging / future use)
 *   - term         (optional – only used for labelling)
 *   - weekNumber   (optional – only used for labelling)
 */

type CurriculumUnitLike = {
  id: string;
  phase: string | null;
  level: string | null;
  subject: string;
  term: string | null;
  weekNumber: number | null;
  strand: string;
  substrand: string | null;
  contentStandard: string | null;
  indicator: string | null;
  indicatorCode: string | null;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const searchParams = url.searchParams;

  const subject = (searchParams.get("subject") ?? "").trim();
  const subjectSlug = (searchParams.get("subjectSlug") ?? "").trim();
  const phase = (searchParams.get("phase") ?? "").trim();
  const level = (searchParams.get("level") ?? "").trim();
  const term = (searchParams.get("term") ?? "").trim();
  const weekRaw = (searchParams.get("weekNumber") ?? "").trim();

  let weekNumber: number | null = null;
  if (weekRaw !== "") {
    const parsed = Number.parseInt(weekRaw, 10);
    weekNumber = Number.isNaN(parsed) ? null : parsed;
  }

  if (!subject && !subjectSlug) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "subject or subjectSlug is required to load NaCCA curriculum units.",
      },
      { status: 400 }
    );
  }

  // -------------------------------
  // Use curriculum engine (same as generator route)
  // -------------------------------
  const engineReq: CurriculumHierarchyRequest = {};

  if (subjectSlug) {
    // When we have a slug (e.g. "jhs-1-computing"),
    // we treat it as the single source of truth.
    engineReq.subjectSlug = subjectSlug;
    // NOTE: We intentionally do NOT force phase/level filters here,
    // to avoid rejecting valid curricula if labels differ slightly.
  } else {
    // Fallback: we try with subject + optional phase/level
    if (subject) engineReq.subject = subject;
    if (phase) engineReq.phase = phase;
    if (level) engineReq.level = level;
  }

  let curriculum;
  try {
    curriculum = await getCurriculumHierarchyForSubject(engineReq);
  } catch (err) {
    console.error("CURRICULUM_UNITS_ENGINE_ERROR (engine call)", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Could not load curriculum for this subject. Please check that the curriculum has been seeded correctly.",
      },
      { status: 500 }
    );
  }

  if (!curriculum) {
    return NextResponse.json(
      {
        ok: true,
        items: [],
      },
      { status: 200 }
    );
  }

  // -------------------------------
  // Flatten the tree into units
  // -------------------------------
  const items: CurriculumUnitLike[] = [];
  let seq = 0;

  for (const strand of curriculum.strands ?? []) {
    for (const sub of strand.subStrands ?? []) {
      for (const cs of sub.contentStandards ?? []) {
        for (const ind of cs.indicators ?? []) {
          // If weekNumber isn't specified, we give each indicator a
          // "synthetic" week number based on sequence (1-based).
          const syntheticWeek = seq + 1;
          const unitWeek =
            weekNumber && weekNumber > 0 ? weekNumber : syntheticWeek;

          items.push({
            id: ind.id, // Unique enough for the Studio use-case
            phase: curriculum.phase ?? (phase || null),
            level: curriculum.level ?? (level || null),
            subject: curriculum.name ?? subject,
            term: term || null,
            weekNumber: unitWeek,

            strand:
              strand.title ??
              strand.code ??
              "Strand title not set",
            substrand:
              sub.title ??
              sub.code ??
              null,
            contentStandard: cs.description ?? null,
            indicator: ind.description ?? null,
            indicatorCode: ind.code ?? null,
          });

          seq++;
        }
      }
    }
  }

  return NextResponse.json(
    {
      ok: true,
      items,
    },
    { status: 200 }
  );
}
