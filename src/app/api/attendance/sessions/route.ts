// src/app/api/attendance/sessions/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow, requireMembershipOrThrow } from "@/lib/authz";

const jsonErr = (status: number, error: string) =>
  NextResponse.json({ ok: false, error }, { status });

function parseISODateOnly(input: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const d = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toStartOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export async function GET(req: Request) {
  try {
    const user = await getCurrentUserOrThrow();
    if (!user.tenantId) return jsonErr(403, "NO_ACTIVE_TENANT");
    await requireMembershipOrThrow(user.id, user.tenantId);

    const url = new URL(req.url);
    const fromStr = url.searchParams.get("from")?.trim() || null;
    const toStr = url.searchParams.get("to")?.trim() || null;
    const classroomId = url.searchParams.get("classroomId")?.trim() || null;

    const where: any = { tenantId: user.tenantId };

    if (classroomId) {
      const room = await prisma.classroom.findFirst({
        where: { id: classroomId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!room) return jsonErr(404, "Classroom not found.");
      where.classroomId = room.id;
    }

    if (fromStr || toStr) {
      const dateFilter: any = {};
      if (fromStr) {
        const d = parseISODateOnly(fromStr);
        if (!d) return jsonErr(400, "Invalid 'from' date. Use YYYY-MM-DD.");
        dateFilter.gte = d;
      }
      if (toStr) {
        const d = parseISODateOnly(toStr);
        if (!d) return jsonErr(400, "Invalid 'to' date. Use YYYY-MM-DD.");
        dateFilter.lte = d;
      }
      where.date = dateFilter;
    }

    const items = await prisma.attendanceSession.findMany({
      where,
      orderBy: [{ date: "desc" }],
      select: {
        id: true,
        tenantId: true,
        classroomId: true,
        date: true,
        isClosed: true,
        closedAt: true,
        certifiedAt: true,
        takenByUserId: true,
        createdAt: true,
        updatedAt: true,
        classroom: { select: { id: true, name: true } },
        _count: { select: { marks: true } },
      },
    });

    return NextResponse.json({ ok: true, count: items.length, items }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return jsonErr(status, String(e?.message || e));
  }
}

const PostSchema = z.object({
  classroomId: z.string().min(1, "classroomId required"),
  date: z.string().min(1, "date required"),
  upsert: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  try {
    const user = await getCurrentUserOrThrow();
    if (!user.tenantId) return jsonErr(403, "NO_ACTIVE_TENANT");
    await requireMembershipOrThrow(user.id, user.tenantId);

    const raw = await req.json().catch(() => null);
    const parsed = PostSchema.safeParse(raw);
    if (!parsed.success) return jsonErr(400, parsed.error.issues[0]?.message || "Invalid body.");

    const dOnly = parseISODateOnly(parsed.data.date);
    const at = dOnly ? dOnly : toStartOfDayUTC(new Date(parsed.data.date));
    if (Number.isNaN(at.getTime())) return jsonErr(400, "Invalid date.");

    const classroom = await prisma.classroom.findFirst({
      where: { id: parsed.data.classroomId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!classroom) return jsonErr(404, "Classroom not found.");

    const run = async () =>
      prisma.$transaction(async (tx) => {
        const existing = await tx.attendanceSession.findFirst({
          where: { tenantId: user.tenantId!, classroomId: classroom.id, date: at },
          select: { id: true, takenByUserId: true, certifiedAt: true },
        });

        if (!existing) {
          return tx.attendanceSession.create({
            data: {
              tenantId: user.tenantId!,
              classroomId: classroom.id,
              date: at,
              takenByUserId: user.id,
            },
            select: {
              id: true,
              tenantId: true,
              classroomId: true,
              date: true,
              isClosed: true,
              closedAt: true,
              certifiedAt: true,
              takenByUserId: true,
              createdAt: true,
              updatedAt: true,
            },
          });
        }

        if (!parsed.data.upsert) {
          const e = new Error("Session already exists.");
          (e as any).status = 409;
          throw e;
        }

        if (existing.certifiedAt) {
          const e = new Error("Session is certified (immutable).");
          (e as any).status = 409;
          throw e;
        }

        if (existing.takenByUserId && existing.takenByUserId !== user.id) {
          const e = new Error("This session is owned by another user.");
          (e as any).status = 403;
          throw e;
        }

        return tx.attendanceSession.update({
          where: { id: existing.id },
          data: { takenByUserId: existing.takenByUserId ?? user.id },
          select: {
            id: true,
            tenantId: true,
            classroomId: true,
            date: true,
            isClosed: true,
            closedAt: true,
            certifiedAt: true,
            takenByUserId: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      });

    try {
      const result = await run();
      return NextResponse.json({ ok: true, session: result }, { status: 200 });
    } catch (e: any) {
      if (String(e?.code || "") === "P2002") {
        // Unique race: retry once using the same rules
        const result = await run();
        return NextResponse.json({ ok: true, session: result }, { status: 200 });
      }
      throw e;
    }
  } catch (e: any) {
    const status = e?.status ?? 500;
    return jsonErr(status, String(e?.message || e));
  }
}
