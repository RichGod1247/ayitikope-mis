// src/app/api/health/student/daily/upsert/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type UpsertItem = {
  studentId: string;
  temperatureC?: number | null;
  symptoms?: string | null;
  notes?: string | null;
  sendSms?: boolean; // comes from client, but not stored here
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const tenantId: string | undefined = body.tenantId;
    const classroomId: string | undefined = body.classroomId;
    const dateStr: string | undefined = body.date;
    const items: UpsertItem[] = Array.isArray(body.items) ? body.items : [];

    if (!tenantId || !classroomId || !dateStr) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "tenantId, classroomId, and date are required to save daily health.",
        },
        { status: 400 }
      );
    }

    if (!items.length) {
      return NextResponse.json(
        { ok: true, itemsSaved: 0, message: "No health items to save." },
        { status: 200 }
      );
    }

    const baseDate = new Date(dateStr);
    if (Number.isNaN(baseDate.getTime())) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid date format for health entries.",
        },
        { status: 400 }
      );
    }

    const client: any = prisma as any;
    const filtered = items.filter((x) => !!x.studentId);

    let savedCount = 0;

    // IMPORTANT: do this SEQUENTIALLY to be friendly to connection_limit=1
    for (const item of filtered) {
      const { studentId } = item;

      const existing = await client.studentHealthDaily.findFirst({
        where: {
          tenantId,
          classroomId,
          studentId,
          date: baseDate,
        },
        select: { id: true },
      });

      const data = {
        tenantId,
        classroomId,
        studentId,
        date: baseDate,
        temperatureC:
          typeof item.temperatureC === "number" ? item.temperatureC : null,
        symptoms:
          typeof item.symptoms === "string" && item.symptoms.trim().length
            ? item.symptoms.trim()
            : null,
        notes:
          typeof item.notes === "string" && item.notes.trim().length
            ? item.notes.trim()
            : null,
      };

      if (existing) {
        await client.studentHealthDaily.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await client.studentHealthDaily.create({ data });
      }

      savedCount += 1;
    }

    return NextResponse.json(
      {
        ok: true,
        itemsSaved: savedCount,
        message: `Saved ${savedCount} daily health entr${
          savedCount === 1 ? "y" : "ies"
        }.`,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[HEALTH_DAILY_UPSERT_ERROR]", err);

    // If it's a Prisma connection timeout, give a clearer hint
    const code = err?.code as string | undefined;
    const isPoolTimeout = code === "P2024" || code === "P1001";

    return NextResponse.json(
      {
        ok: false,
        error: isPoolTimeout
          ? "Health save timed out while talking to the database. Please try again in a moment. (If this repeats, ask admin to increase DB connection limit.)"
          : "Failed to save daily health records. Please try again or contact the administrator.",
      },
      { status: isPoolTimeout ? 503 : 500 }
    );
  }
}
