// src/app/api/admin/health/alerts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const FEVER_THRESHOLD = 37.8;

function parseDateRange(fromStr: string | null, toStr: string | null) {
  // Default to "today" if missing / invalid
  const todayIso = new Date().toISOString().slice(0, 10);
  const baseFrom = fromStr && fromStr.trim().length > 0 ? fromStr : todayIso;
  const baseTo = toStr && toStr.trim().length > 0 ? toStr : baseFrom;

  const start = new Date(baseFrom);
  const end = new Date(baseTo);
  // Make "to" inclusive by adding one day and using < endExclusive
  end.setDate(end.getDate() + 1);

  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const tenantId = searchParams.get("tenantId") || "";
    const classroomId = searchParams.get("classroomId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required." },
        { status: 400 }
      );
    }

    const { start, end } = parseDateRange(from, to);

    const client: any = prisma as any;

    // 1) Raw fever records from StudentHealthDaily (no relations)
    const records = await client.studentHealthDaily.findMany({
      where: {
        tenantId,
        ...(classroomId ? { classroomId } : {}),
        date: {
          gte: start,
          lt: end,
        },
        temperatureC: {
          gte: FEVER_THRESHOLD,
        },
      },
      orderBy: {
        date: "desc",
      },
      select: {
        id: true,
        tenantId: true,
        classroomId: true,
        studentId: true,
        date: true,
        temperatureC: true,
        symptoms: true,
        notes: true,
      },
    });

    if (!records.length) {
      // No fever alerts in that window – return ok empty
      return NextResponse.json({ ok: true, items: [] });
    }

    // 2) Gather unique student & classroom IDs
    const studentIds = Array.from(
      new Set(
        records
          .map((r: any) => r.studentId)
          .filter((id: string | null) => !!id)
      )
    );

    const classroomIds = Array.from(
      new Set(
        records
          .map((r: any) => r.classroomId)
          .filter((id: string | null) => !!id)
      )
    );

    // 3) Load students & classrooms separately
    const [students, classrooms] = await Promise.all([
      studentIds.length
        ? client.student.findMany({
            where: { id: { in: studentIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
      classroomIds.length
        ? client.classroom.findMany({
            where: { id: { in: classroomIds } },
            select: { id: true, name: true, grade: true, arm: true },
          })
        : Promise.resolve([]),
    ]);

    const studentMap = new Map<
      string,
      { firstName: string | null; lastName: string | null }
    >();
    for (const s of students as any[]) {
      studentMap.set(s.id, {
        firstName: s.firstName ?? null,
        lastName: s.lastName ?? null,
      });
    }

    const classroomMap = new Map<
      string,
      { name: string | null; grade: string | null; arm: string | null }
    >();
    for (const c of classrooms as any[]) {
      classroomMap.set(c.id, {
        name: c.name ?? null,
        grade: (c as any).grade ?? null,
        arm: (c as any).arm ?? null,
      });
    }

    // 4) Shape into what the page expects
    const items = records.map((r: any) => {
      const s = r.studentId ? studentMap.get(r.studentId) : undefined;
      const c = r.classroomId ? classroomMap.get(r.classroomId) : undefined;

      const studentName = s
        ? [s.firstName, s.lastName].filter(Boolean).join(" ")
        : "Unknown learner";

      const labelParts: string[] = [];
      if (c?.name) labelParts.push(c.name);
      if (c?.arm) labelParts.push(c.arm);
      const classLabel = labelParts.join(" ");

      return {
        id: r.id,
        date: r.date instanceof Date ? r.date.toISOString() : r.date,
        studentId: r.studentId ?? null,
        studentName,
        classLabel: classLabel || null,
        temperatureC:
          typeof r.temperatureC === "number" ? r.temperatureC : null,
        symptoms: r.symptoms ?? null,
        notes: r.notes ?? null,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (err: any) {
    console.error("[ADMIN_HEALTH_ALERTS_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load health alerts from the database. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
