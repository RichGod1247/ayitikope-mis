// src/app/api/attendance/sessions/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUserOrThrow } from "../../../../lib/auth";
import { getCurrentTenantOrThrow } from "../../../../lib/tenant";

// Normalize any incoming date to 00:00:00 UTC
function toStartOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/**
 * GET /api/attendance/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD&classroomId=...
 */
export async function GET(req: Request) {
  try {
    const { tenant } = await getCurrentTenantOrThrow();
    const url = new URL(req.url);

    const fromStr = url.searchParams.get("from");
    const toStr = url.searchParams.get("to");
    const classroomId = url.searchParams.get("classroomId") || undefined;

    const where: any = { tenantId: tenant.id };
    if (classroomId) where.classroomId = classroomId;

    if (fromStr || toStr) {
      const dateFilter: any = {};
      if (fromStr) {
        const d = toStartOfDayUTC(new Date(fromStr));
        if (!Number.isNaN(d.getTime())) dateFilter.gte = d;
      }
      if (toStr) {
        const d = toStartOfDayUTC(new Date(toStr));
        if (!Number.isNaN(d.getTime())) dateFilter.lte = d;
      }
      if (Object.keys(dateFilter).length) where.date = dateFilter;
    }

    const items = await prisma.attendanceSession.findMany({
      where,
      orderBy: [{ date: "desc" }],
      select: {
        id: true,
        date: true,
        classroomId: true,
        createdAt: true,
        updatedAt: true,
        classroom: { select: { id: true, name: true } },
        _count: { select: { marks: true } },
      },
    });

    return NextResponse.json({ ok: true, tenant, count: items.length, items }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}

/**
 * POST /api/attendance/sessions
 * Body: { classroomId: string, date: string(YYYY-MM-DD or ISO), upsert?: boolean }
 */
const PostSchema = z.object({
  classroomId: z.string().min(1, "classroomId required"),
  date: z.string().min(1, "date required"),
  upsert: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  try {
    const { tenant } = await getCurrentTenantOrThrow();
    const user = await getCurrentUserOrThrow();

    const body = await req.json();
    const parsed = PostSchema.parse(body);

    const at = toStartOfDayUTC(new Date(parsed.date));
    if (Number.isNaN(at.getTime())) {
      return NextResponse.json({ ok: false, error: "Invalid date" }, { status: 400 });
    }

    // Ensure classroom belongs to tenant
    const classroom = await prisma.classroom.findFirst({
      where: { id: parsed.classroomId, tenantId: tenant.id },
      select: { id: true },
    });
    if (!classroom) {
      return NextResponse.json({ ok: false, error: "Classroom not found for this tenant" }, { status: 404 });
    }

    // Upsert by unique (tenantId, classroomId, date)
    const session = await prisma.attendanceSession.upsert({
      where: {
        tenant_classroom_date_unique: {
          tenantId: tenant.id,
          classroomId: classroom.id,
          date: at,
        },
      },
      create: {
        tenantId: tenant.id,
        classroomId: classroom.id,
        date: at,
        takenByUserId: user.id ?? null,
      },
      update: {
        takenByUserId: user.id ?? null,
      },
      select: {
        id: true,
        date: true,
        classroomId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, session }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
