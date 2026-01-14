// src/app/api/teachers/curriculum/units/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function parsePositiveInt(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function POST() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use GET." }, { status: 405, headers: { Allow: "GET" } });
}

export async function GET(req: NextRequest) {
  let ctx: { userId: string; tenantId: string };
  try {
    const c = await requireServerUserContext({
      redirectTo: "/teacher/lesson-notes",
      requireTenant: true,
    });
    ctx = { userId: c.userId, tenantId: c.tenantId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  const phase = (searchParams.get("phase") ?? "").trim();
  const level = (searchParams.get("level") ?? "").trim();
  const subject = (searchParams.get("subject") ?? "").trim();
  const term = (searchParams.get("term") ?? "").trim();
  const weekNumber = parsePositiveInt(searchParams.get("weekNumber"));

  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  const take = clamp(Number(searchParams.get("take") ?? 50) || 50, 1, 200);

  if (!phase || !level || !subject || !term || !weekNumber) {
    return jsonNoStore(
      { ok: false, error: "phase, level, subject, term, and weekNumber are required." },
      { status: 400 }
    );
  }

  try {
    const where: any = {
      phase,
      level,
      subject,
      term,
      weekNumber,
      OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
    };

    if (q) {
      where.OR = [
        ...(where.OR ?? []),
      ];
      // Keep it simple: Prisma can't OR across strings without explicit fields:
      where.AND = [
        { OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
        {
          OR: [
            { indicatorCode: { contains: q, mode: "insensitive" } },
            { indicator: { contains: q, mode: "insensitive" } },
            { contentStandardCode: { contains: q, mode: "insensitive" } },
            { contentStandard: { contains: q, mode: "insensitive" } },
            { substrandCode: { contains: q, mode: "insensitive" } },
            { substrand: { contains: q, mode: "insensitive" } },
            { strandCode: { contains: q, mode: "insensitive" } },
            { strand: { contains: q, mode: "insensitive" } },
          ],
        },
      ];
      delete where.OR;
    }

    const items = await (prisma as any).curriculumUnit.findMany({
      where,
      take,
      orderBy: [{ indicatorCode: "asc" }, { id: "asc" }],
      select: {
        id: true,
        phase: true,
        level: true,
        subject: true,
        term: true,
        weekNumber: true,

        strandCode: true,
        strand: true,
        substrandCode: true,
        substrand: true,
        contentStandardCode: true,
        contentStandard: true,
        indicatorCode: true,
        indicator: true,
      },
    });

    return jsonNoStore({ ok: true, items }, { status: 200 });
  } catch (err) {
    console.error("[TEACHER_CURRICULUM_UNITS_LIST_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load curriculum units." }, { status: 500 });
  }
}
