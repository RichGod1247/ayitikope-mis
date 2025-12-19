// src/app/api/headteacher/overview/route.ts

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  tenantId: z.string().min(1, "Tenant is required"),
  date: z.string().optional(), // YYYY-MM-DD or ISO
  term: z.string().optional(),
  academicYear: z.string().optional(),
});

// Small helper to normalise a date string to UTC day start/end
function getDayRange(dateStr?: string) {
  const base = dateStr ? new Date(dateStr) : new Date();

  const start = new Date(base);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return { start, end };
}

// Week start (Monday) in UTC, based on the given day
function getWeekStart(date: Date) {
  const weekStart = new Date(date);
  const day = weekStart.getUTCDay(); // 0..6, Sunday=0
  const diff = (day + 6) % 7; // Monday -> 0
  weekStart.setUTCDate(weekStart.getUTCDate() - diff);
  weekStart.setUTCHours(0, 0, 0, 0);
  return weekStart;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const parsed = querySchema.safeParse({
      tenantId: searchParams.get("tenantId"),
      date: searchParams.get("date") ?? undefined,
      term: searchParams.get("term") ?? undefined,
      academicYear: searchParams.get("academicYear") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid filters",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const {
      tenantId,
      date: dateStr,
      term = "1st Term",
      academicYear = "2025/2026",
    } = parsed.data;

    const { start: dayStart, end: dayEnd } = getDayRange(dateStr);
    const weekStart = getWeekStart(dayStart);

    //
    // 1) Get classrooms for this tenant
    //
    const classrooms = await prisma.classroom.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        grade: true,
        arm: true,
      },
      orderBy: { name: "asc" },
    });

    //
    // 2) All student daily health entries for that date
    //
    const healthRows = await prisma.studentHealthDaily.findMany({
      where: {
        tenantId,
        date: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
      select: {
        classroomId: true,
        studentId: true,
        temperatureC: true,
        symptoms: true,
      },
    });

    type HealthAgg = {
      total: number;
      highTemp: number;
      symptomatic: number;
    };

    const healthByClass = new Map<string, HealthAgg>();

    for (const row of healthRows) {
      const classroomId = row.classroomId;
      const existing = healthByClass.get(classroomId) ?? {
        total: 0,
        highTemp: 0,
        symptomatic: 0,
      };

      existing.total += 1;

      if (row.temperatureC != null && row.temperatureC >= 37.5) {
        existing.highTemp += 1;
      }

      if (row.symptoms && row.symptoms.trim() !== "") {
        existing.symptomatic += 1;
      }

      healthByClass.set(classroomId, existing);
    }

    //
    // 3) Assessment items for this term & academic year (all classes)
    //
    const assessmentItems = await prisma.assessmentItem.findMany({
      where: {
        tenantId,
        term,
        academicYear,
      },
      select: {
        id: true,
        classroomId: true,
        date: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    type AssessAgg = {
      totalItems: number;
      lastDate: Date | null;
    };

    const assessByClass = new Map<string, AssessAgg>();

    for (const item of assessmentItems) {
      const classroomId = item.classroomId;
      const existing = assessByClass.get(classroomId) ?? {
        totalItems: 0,
        lastDate: null as Date | null,
      };

      existing.totalItems += 1;

      const effectiveDate = item.date ?? item.createdAt;
      if (!existing.lastDate || effectiveDate > existing.lastDate) {
        existing.lastDate = effectiveDate;
      }

      assessByClass.set(classroomId, existing);
    }

    //
    // 4) Teacher weekly wellbeing for this week
    //
    const wellbeingRows = await prisma.teacherHealthWeekly.findMany({
      where: {
        tenantId,
        weekStart,
      },
      select: {
        id: true,
        userId: true,
        weekStart: true,
        stressLevel: true,
        workload: true,
        comments: true,
        user: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        stressLevel: "desc",
      },
    });

    //
    // 5) Build response payload
    //
    const classSummaries = classrooms.map((c) => {
      const health = healthByClass.get(c.id) ?? {
        total: 0,
        highTemp: 0,
        symptomatic: 0,
      };
      const assess = assessByClass.get(c.id) ?? {
        totalItems: 0,
        lastDate: null as Date | null,
      };

      return {
        classroomId: c.id,
        name: c.name,
        grade: c.grade,
        arm: c.arm,
        studentHealth: {
          totalRecords: health.total,
          highTempCount: health.highTemp,
          symptomaticCount: health.symptomatic,
        },
        assessments: {
          totalItems: assess.totalItems,
          lastAssessmentDate: assess.lastDate
            ? assess.lastDate.toISOString()
            : null,
        },
      };
    });

    const teacherWellbeing = wellbeingRows.map((r) => ({
      id: r.id,
      userId: r.userId,
      teacherName: r.user?.name ?? null,
      weekStart: r.weekStart.toISOString(),
      stressLevel: r.stressLevel,
      workload: r.workload,
      comments: r.comments,
    }));

    return NextResponse.json({
      ok: true,
      filters: {
        tenantId,
        date: dayStart.toISOString(),
        term,
        academicYear,
      },
      classes: classSummaries,
      teacherWellbeing,
    });
  } catch (err) {
    console.error("[HEADTEACHER_OVERVIEW_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load headteacher overview. Please try again or contact the office.",
      },
      { status: 500 }
    );
  }
}
