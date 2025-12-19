// src/app/api/teacher/assessment/items/upsert/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Upsert (create or update) a single assessment item for a class.
 *
 * This is intentionally kept simple and tolerant:
 * - Parses JSON body directly
 * - Coerces numeric fields
 * - Uses `title` / `weighting` to match the current Prisma schema
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      id,
      tenantId,
      classroomId,
      subject,
      term,
      academicYear,
      title,
      description,
      type,
      maxScore,
      weighting,
      date,
      // teacherUserId is accepted but not persisted yet – we may use it later for auditing
      teacherUserId, // eslint-disable-line @typescript-eslint/no-unused-vars
    } = body ?? {};

    // Basic validation – just enough to avoid crashing Prisma
    if (!tenantId || !classroomId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Tenant and classroom are required.",
        },
        { status: 400 }
      );
    }

    if (!subject || !term || !academicYear) {
      return NextResponse.json(
        {
          ok: false,
          error: "Subject, term and academic year are required.",
        },
        { status: 400 }
      );
    }

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "Title is required.",
        },
        { status: 400 }
      );
    }

    if (!type || typeof type !== "string") {
      return NextResponse.json(
        {
          ok: false,
          error: "Assessment type is required.",
        },
        { status: 400 }
      );
    }

    const maxScoreNumber =
      typeof maxScore === "number"
        ? maxScore
        : maxScore != null
        ? Number(maxScore)
        : 0;

    const weightingNumber =
      typeof weighting === "number"
        ? weighting
        : weighting != null && weighting !== ""
        ? Number(weighting)
        : null;

    const dateValue =
      date && typeof date === "string" && date.trim().length > 0
        ? new Date(date)
        : null;

    const data: any = {
      tenantId,
      classroomId,
      subject: String(subject).trim(),
      term: String(term).trim(),
      academicYear: String(academicYear).trim(),
      title: String(title).trim(),
      type: String(type).trim(),
      maxScore: Number.isFinite(maxScoreNumber) ? maxScoreNumber : 0,
      description:
        typeof description === "string" && description.trim().length > 0
          ? description.trim()
          : null,
      weighting:
        weightingNumber != null && Number.isFinite(weightingNumber)
          ? weightingNumber
          : null,
      date: dateValue,
    };

    let item;

    if (id && typeof id === "string") {
      // UPDATE existing assessment item
      item = await prisma.assessmentItem.update({
        where: { id },
        data,
      });
    } else {
      // CREATE new assessment item
      item = await prisma.assessmentItem.create({
        data,
      });
    }

    return NextResponse.json({
      ok: true,
      item,
    });
  } catch (err) {
    console.error("[TEACHER_ASSESSMENT_ITEM_UPSERT_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to save assessment item. Please try again or contact the office.",
      },
      { status: 500 }
    );
  }
}
