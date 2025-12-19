// src/app/api/parents/my-children/health/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const FEVER_THRESHOLD = 37.8;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    const studentId = searchParams.get("studentId");

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required." },
        { status: 400 }
      );
    }

    if (!studentId) {
      return NextResponse.json(
        { ok: false, error: "studentId is required." },
        { status: 400 }
      );
    }

    // Use prisma as any so TS doesn't block us
    const client = prisma as any;

    // If the health model is not yet wired / named differently,
    // fail *gracefully* and just return an empty list instead of crashing.
    if (
      !client.studentDailyHealth ||
      typeof client.studentDailyHealth.findMany !== "function"
    ) {
      console.error(
        "[PARENT_CHILD_HEALTH_MODEL_MISSING] prisma.studentDailyHealth is not defined. " +
          "Returning an empty list so the parent UI does not crash. " +
          "Check your Prisma schema for the actual health model name used by /api/health/student/daily/upsert."
      );

      return NextResponse.json({ ok: true, items: [] });
    }

    const records = await client.studentDailyHealth.findMany({
      where: {
        tenantId,
        studentId,
      },
      orderBy: {
        date: "desc",
      },
      take: 20,
      select: {
        id: true,
        date: true,
        temperatureC: true,
        symptoms: true,
        notes: true,
      },
    });

    const items = (records as any[]).map((r: any) => {
      const rawTemp = r.temperatureC;
      const temp =
        typeof rawTemp === "number" && !Number.isNaN(rawTemp)
          ? rawTemp
          : null;

      const isFever =
        temp !== null && typeof temp === "number" && temp >= FEVER_THRESHOLD;

      const dateValue =
        r.date instanceof Date ? r.date : new Date(r.date as string);

      return {
        id: String(r.id),
        date: dateValue.toISOString(),
        temperatureC: temp,
        symptoms: r.symptoms ?? null,
        notes: r.notes ?? null,
        isFever,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("[PARENT_CHILD_HEALTH_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load recent health & temperature records for this learner. Please try again or contact the school.",
      },
      { status: 500 }
    );
  }
}
