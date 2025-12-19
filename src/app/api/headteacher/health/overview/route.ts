// src/app/api/headteacher/health/overview/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TENANT_ID = "cmhhnghn00008vcpgp3fl07fl";

function getTodayISODate(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date") || getTodayISODate();

    // Normalise to "YYYY-MM-DDT00:00:00.000Z"
    const dateIso = `${dateParam}T00:00:00.000Z`;
    const date = new Date(dateIso);
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json(
        { ok: false, error: "Invalid date parameter." },
        { status: 400 }
      );
    }

    // 1) Read fever threshold from tenant.settings.health
    const tenant = await prisma.tenant.findUnique({
      where: { id: TENANT_ID },
      select: { settings: true, name: true, id: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { ok: false, error: "Tenant not found." },
        { status: 404 }
      );
    }

    let feverThresholdC = 38.0;
    const settings = (tenant.settings as any) || {};
    if (
      settings.health &&
      typeof settings.health === "object" &&
      typeof settings.health.feverThresholdC === "number"
    ) {
      feverThresholdC = settings.health.feverThresholdC;
    }

    // 2) Load student health daily rows for that date
    const dailyItems = await prisma.studentHealthDaily.findMany({
      where: {
        tenantId: TENANT_ID,
        date,
      },
      select: {
        id: true,
        studentId: true,
        classroomId: true,
        temperatureC: true,
        symptoms: true,
        notes: true,
      },
      orderBy: { createdAt: "asc" },
    });

    if (dailyItems.length === 0) {
      return NextResponse.json({
        ok: true,
        tenantId: tenant.id,
        tenantName: tenant.name,
        date: date.toISOString(),
        feverThresholdC,
        totalRecords: 0,
        feverCount: 0,
        byClassroom: [],
        samples: [],
      });
    }

    const studentIds = Array.from(
      new Set(dailyItems.map((i) => i.studentId))
    );
    const classroomIds = Array.from(
      new Set(dailyItems.map((i) => i.classroomId))
    );

    const [students, classrooms] = await Promise.all([
      prisma.student.findMany({
        where: { id: { in: studentIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          classroomId: true,
        },
      }),
      prisma.classroom.findMany({
        where: { id: { in: classroomIds } },
        select: { id: true, name: true },
      }),
    ]);

    const studentMap = new Map<
      string,
      { id: string; firstName: string; lastName: string }
    >();
    for (const s of students) {
      studentMap.set(s.id, {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
      });
    }

    const classroomMap = new Map<string, { id: string; name: string }>();
    for (const c of classrooms) {
      classroomMap.set(c.id, { id: c.id, name: c.name });
    }

    // 3) Aggregate
    let feverCount = 0;
    const byClassroomMap = new Map<
      string,
      {
        classroomId: string | null;
        classroomName: string;
        totalRecords: number;
        feverCount: number;
        maxTemp: number | null;
      }
    >();

    const samples: {
      studentName: string;
      classroomName: string;
      temperatureC: number | null;
      symptoms: string | null;
      notes: string | null;
      isFever: boolean;
    }[] = [];

    for (const item of dailyItems) {
      const student = item.studentId
        ? studentMap.get(item.studentId)
        : undefined;
      const classroom = item.classroomId
        ? classroomMap.get(item.classroomId)
        : undefined;

      const classroomName =
        classroom?.name ?? (item.classroomId ? "Unknown class" : "No class");
      const classroomKey = classroom?.id ?? item.classroomId ?? "NO_CLASS";

      const temp = item.temperatureC ?? null;
      const isFever = temp != null && temp >= feverThresholdC;
      if (isFever) feverCount += 1;

      // Per-class aggregation
      let agg = byClassroomMap.get(classroomKey);
      if (!agg) {
        agg = {
          classroomId: classroom?.id ?? item.classroomId ?? null,
          classroomName,
          totalRecords: 0,
          feverCount: 0,
          maxTemp: null,
        };
        byClassroomMap.set(classroomKey, agg);
      }
      agg.totalRecords += 1;
      if (isFever) agg.feverCount += 1;
      if (temp != null) {
        if (agg.maxTemp == null || temp > agg.maxTemp) {
          agg.maxTemp = temp;
        }
      }

      const studentName = student
        ? `${student.firstName} ${student.lastName}`.trim()
        : "Unknown learner";

      samples.push({
        studentName,
        classroomName,
        temperatureC: temp,
        symptoms: item.symptoms,
        notes: item.notes,
        isFever,
      });
    }

    const byClassroom = Array.from(byClassroomMap.values()).sort((a, b) =>
      a.classroomName.localeCompare(b.classroomName)
    );

    return NextResponse.json({
      ok: true,
      tenantId: tenant.id,
      tenantName: tenant.name,
      date: date.toISOString(),
      feverThresholdC,
      totalRecords: dailyItems.length,
      feverCount,
      byClassroom,
      samples,
    });
  } catch (err) {
    console.error("[headteacher/health/overview] GET error", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load health overview." },
      { status: 500 }
    );
  }
}
