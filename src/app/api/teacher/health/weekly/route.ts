// src/app/api/teacher/health/weekly/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Always use Monday (UTC) as the start of the week
function startOfWeekUTC(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon, ...
  const diff = (day + 6) % 7; // 0 if Mon, 1 if Tue, ...
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ----------------------
// GET: load weekly entry
// ----------------------
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    const userId = searchParams.get("userId");
    const weekStartParam = searchParams.get("weekStart");

    if (!tenantId || !userId) {
      return NextResponse.json(
        { ok: false, error: "tenantId and userId are required." },
        { status: 400 }
      );
    }

    let weekStart: Date;
    if (weekStartParam) {
      const parsed = new Date(weekStartParam);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { ok: false, error: "Invalid weekStart date." },
          { status: 400 }
        );
      }
      weekStart = startOfWeekUTC(parsed);
    } else {
      weekStart = startOfWeekUTC(new Date());
    }

    // Use findFirst instead of compound unique helper
    const entry = await prisma.teacherHealthWeekly.findFirst({
      where: {
        tenantId,
        userId,
        weekStart,
      },
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      userId,
      weekStart: weekStart.toISOString(),
      entry,
    });
  } catch (err) {
    console.error("[TEACHER_HEALTH_WEEKLY_GET_ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load weekly health entry." },
      { status: 500 }
    );
  }
}

// ----------------------
// POST: save weekly entry
// ----------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const {
      tenantId,
      userId,
      weekStart: weekStartRaw,
      stressLevel,
      workload,
      comments,
    } = body as {
      tenantId?: string;
      userId?: string;
      weekStart?: string;
      stressLevel?: number;
      workload?: number;
      comments?: string | null;
    };

    if (!tenantId || !userId) {
      return NextResponse.json(
        { ok: false, error: "tenantId and userId are required." },
        { status: 400 }
      );
    }

    if (
      typeof stressLevel !== "number" ||
      stressLevel < 1 ||
      stressLevel > 10 ||
      typeof workload !== "number" ||
      workload < 1 ||
      workload > 10
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Invalid stressLevel or workload. They must be numbers between 1 and 10.",
        },
        { status: 400 }
      );
    }

    let weekStart: Date;
    if (weekStartRaw) {
      const parsed = new Date(weekStartRaw);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { ok: false, error: "Invalid weekStart date." },
          { status: 400 }
        );
      }
      weekStart = startOfWeekUTC(parsed);
    } else {
      weekStart = startOfWeekUTC(new Date());
    }

    // Manual "upsert": findFirst -> update or create
    const existing = await prisma.teacherHealthWeekly.findFirst({
      where: {
        tenantId,
        userId,
        weekStart,
      },
    });

    let entry;
    if (existing) {
      entry = await prisma.teacherHealthWeekly.update({
        where: { id: existing.id },
        data: {
          stressLevel,
          workload,
          comments: comments ?? null,
        },
      });
    } else {
      entry = await prisma.teacherHealthWeekly.create({
        data: {
          tenantId,
          userId,
          weekStart,
          stressLevel,
          workload,
          comments: comments ?? null,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      entry,
    });
  } catch (err) {
    console.error("[TEACHER_HEALTH_WEEKLY_POST_ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Failed to save weekly health entry." },
      { status: 500 }
    );
  }
}
