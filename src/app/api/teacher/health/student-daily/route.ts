// src/app/api/teacher/health/student-daily/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// -------------------------
// Helpers
// -------------------------

// Normalize any incoming date (YYYY-MM-DD or ISO) to start-of-day UTC
function getDayRange(dateStr?: string) {
  const base = dateStr ? new Date(dateStr) : new Date();

  const start = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate())
  );
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 1);

  return { start, end };
}

// -------------------------
// Zod schemas
// -------------------------

const EntrySchema = z.object({
  studentId: z.string().min(1, "studentId is required"),
  temperatureC: z.number().nullable().optional(),
  symptoms: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const UpsertSchema = z.object({
  tenantId: z.string().min(1, "tenantId is required"),
  classroomId: z.string().min(1, "classroomId is required"),
  // Optional date; if omitted, we treat it as "today"
  date: z.string().optional(),
  entries: z
    .array(EntrySchema)
    .min(1, "At least one learner record is required"),
});

// -------------------------
// GET: list health records for a class on a given day
// -------------------------
// Example:
//   /api/teacher/health/student-daily?tenantId=...&classroomId=...&date=2025-03-10
//
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    const classroomId = searchParams.get("classroomId");
    const dateStr = searchParams.get("date") ?? undefined;

    if (!tenantId || !classroomId) {
      return NextResponse.json(
        {
          ok: false,
          error: "tenantId and classroomId are required.",
        },
        { status: 400 }
      );
    }

    const { start, end } = getDayRange(dateStr);

    const items = await prisma.studentHealthDaily.findMany({
      where: {
        tenantId,
        classroomId,
        date: {
          gte: start,
          lt: end,
        },
      },
      orderBy: { date: "asc" },
    });

    return NextResponse.json({
      ok: true,
      filters: { tenantId, classroomId, date: start.toISOString() },
      count: items.length,
      items,
    });
  } catch (err) {
    console.error("[TEACHER_STUDENT_HEALTH_DAILY_GET_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load student daily health records. Please try again or contact the office.",
      },
      { status: 500 }
    );
  }
}

// -------------------------
// POST: bulk upsert daily health records
// -------------------------
// Each (studentId + date) is unique. We upsert so teachers can correct entries.
// -------------------------
export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = UpsertSchema.safeParse(json);

    if (!parsed.success) {
      console.error(
        "[TEACHER_STUDENT_HEALTH_DAILY_POST_ZOD_ERROR]",
        parsed.error.flatten()
      );
      const { fieldErrors, formErrors } = parsed.error.flatten();
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid data. Please check the form and try again.",
          details: { fieldErrors, formErrors },
        },
        { status: 400 }
      );
    }

    const { tenantId, classroomId, date, entries } = parsed.data;
    const { start } = getDayRange(date);

    const results = [];
    for (const entry of entries) {
      const record = await prisma.studentHealthDaily.upsert({
        where: {
          // Uses the named unique constraint in schema:
          // @@unique([studentId, date], name: "StudentHealthDaily_unique_student_date")
          StudentHealthDaily_unique_student_date: {
            studentId: entry.studentId,
            date: start,
          },
        },
        create: {
          tenantId,
          classroomId,
          studentId: entry.studentId,
          date: start,
          temperatureC:
            typeof entry.temperatureC === "number"
              ? entry.temperatureC
              : null,
          symptoms: entry.symptoms ?? null,
          notes: entry.notes ?? null,
        },
        update: {
          temperatureC:
            typeof entry.temperatureC === "number"
              ? entry.temperatureC
              : null,
          symptoms: entry.symptoms ?? null,
          notes: entry.notes ?? null,
        },
      });

      results.push(record);
    }

    return NextResponse.json({
      ok: true,
      date: start.toISOString(),
      count: results.length,
      items: results,
    });
  } catch (err) {
    console.error("[TEACHER_STUDENT_HEALTH_DAILY_POST_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to save student daily health records. Please try again or contact the office.",
      },
      { status: 500 }
    );
  }
}
