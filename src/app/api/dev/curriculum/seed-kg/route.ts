// src/app/api/dev/curriculum/seed-kg/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/dev/curriculum/seed-kg
 *
 * Dev-only helper to quickly seed a few KG curriculum units into the
 * CurriculumUnit table so that the Lesson Design Studio has real data
 * to work with.
 *
 * This is just a starting point. Later we will:
 *  - expand it with more subjects / weeks
 *  - or replace it with a proper importer using your merged curriculum PDF.
 */

export async function POST(_req: NextRequest) {
  // 🔒 Safety: avoid accidentally seeding in production
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This endpoint is for development only and is disabled in production.",
      },
      { status: 403 }
    );
  }

  try {
    // Use `any` so we are flexible if the Prisma types evolve
    const client = prisma as any;

    // 1) For now, clear existing KG records to keep things clean & repeatable
    await client.curriculumUnit.deleteMany({
      where: {
        phase: "KG",
      },
    });

    // 2) Seed a small set of KG Mathematics units
    // NOTE: These examples are based on the style you've already used
    // (Number and Algebra / Counting and Numeration). We will later
    // refine them to match the exact wording from the merged curriculum.
    const units = [
      {
        phase: "KG",
        level: "KG1",
        subject: "Mathematics",
        term: "1st Term",
        weekNumber: 1,

        strandCode: "Strand 1",
        strand: "Number and Algebra",

        substrandCode: "Sub-strand 1",
        substrand: "Counting and Numeration",

        contentStandardCode: "KG1.M1.1",
        contentStandard:
          "Learners demonstrate understanding of counting, reading and writing numbers within a given range.",

        indicatorCode: "KG1.M1.1.1",
        indicator:
          "Learners count, read and write numbers from 1 to 20 using objects and number symbols.",

        notes:
          "Foundation counting work with songs, rhymes and concrete materials (bottle tops, sticks, stones, number cards).",
      },
      {
        phase: "KG",
        level: "KG1",
        subject: "Mathematics",
        term: "1st Term",
        weekNumber: 2,

        strandCode: "Strand 1",
        strand: "Number and Algebra",

        substrandCode: "Sub-strand 1",
        substrand: "Counting and Numeration",

        contentStandardCode: "KG1.M1.2",
        contentStandard:
          "Learners compare and order small collections of objects and numbers.",

        indicatorCode: "KG1.M1.2.1",
        indicator:
          "Learners compare two sets of objects and say which has more, less or the same.",

        notes:
          "Use real classroom objects; encourage learners to explain their thinking verbally.",
      },
      {
        phase: "KG",
        level: "KG2",
        subject: "Mathematics",
        term: "1st Term",
        weekNumber: 1,

        strandCode: "Strand 1",
        strand: "Number and Algebra",

        substrandCode: "Sub-strand 1",
        substrand: "Counting and Numeration",

        contentStandardCode: "KG2.M1.1",
        contentStandard:
          "Learners count, read and write numbers in a slightly higher range with understanding.",

        indicatorCode: "KG2.M1.1.1",
        indicator:
          "Learners count, read and write numbers from 1 to 50 using concrete and pictorial models.",

        notes:
          "Step up from KG1 by extending the range and linking to simple number lines.",
      },
      {
        phase: "KG",
        level: "KG2",
        subject: "Mathematics",
        term: "1st Term",
        weekNumber: 2,

        strandCode: "Strand 1",
        strand: "Number and Algebra",

        substrandCode: "Sub-strand 1",
        substrand: "Counting and Numeration",

        contentStandardCode: "KG2.M1.2",
        contentStandard:
          "Learners show understanding of number sequences and patterns.",

        indicatorCode: "KG2.M1.2.1",
        indicator:
          "Learners complete simple forward counting patterns within 1–50 (e.g. 1, 2, 3, __, __).",

        notes:
          "Link to clapping/stepping games; good moment for movement and songs.",
      },
    ];

    // 3) Insert sample units
    const result = await client.curriculumUnit.createMany({
      data: units,
    });

    return NextResponse.json(
      {
        ok: true,
        message: "KG curriculum units seeded successfully.",
        insertedCount: result.count ?? units.length,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[CURRICULUM_SEED_KG_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to seed KG curriculum units. Check server logs or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
