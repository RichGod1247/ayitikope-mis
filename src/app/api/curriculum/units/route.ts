// src/app/api/curriculum/units/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CurriculumUnitLike = {
  id: string;
  phase: string | null;
  level: string | null;
  subject: string;
  term: string | null;
  weekNumber: number | null;
  strand: string;
  substrand: string | null;
  contentStandard: string | null;
  indicator: string | null;
  indicatorCode: string | null;
};

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

function nonEmpty(v: string | null): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parsePositiveInt(v: string | null): number | null {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

/**
 * GET /api/curriculum/units?subjectSlug=...&level=...&phase=...&term=...&weekNumber=...&take=500&cursor=...
 *
 * Secure rules:
 * - Requires authenticated user in a tenant.
 * - subjectSlug must resolve to either:
 *    (A) global subject (isGlobal=true) OR
 *    (B) tenant subject (tenantId=ctx.tenantId)
 * - Never leaks other tenant's subject hierarchy.
 *
 * Behavior:
 * - Returns a flattened list of indicators (unit-like rows) for the selected subject.
 * - If weekNumber provided, every returned row uses that weekNumber (labeling only).
 * - Otherwise, weekNumber is a synthetic sequence (1..N) within the returned page.
 */
export async function GET(req: NextRequest) {
  let ctx: { userId: string; tenantId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { userId: c.userId, tenantId: c.tenantId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  const subjectSlug = nonEmpty(searchParams.get("subjectSlug"));
  const subjectName = nonEmpty(searchParams.get("subject"));
  const phase = nonEmpty(searchParams.get("phase"));
  const level = nonEmpty(searchParams.get("level"));
  const term = nonEmpty(searchParams.get("term"));
  const weekNumberParam = parsePositiveInt(nonEmpty(searchParams.get("weekNumber")));

  if (!subjectSlug && !subjectName) {
    return jsonNoStore(
      { ok: false, error: "subjectSlug or subject is required to load curriculum units." },
      { status: 400 }
    );
  }

  const take = clamp(Number(searchParams.get("take") ?? 500) || 500, 1, 1000);
  const cursor = nonEmpty(searchParams.get("cursor")) ?? undefined;

  // 1) Resolve subject (tenant-safe)
  const subject = await prisma.curriculumSubject.findFirst({
    where: {
      isActive: true,
      OR: [{ isGlobal: true }, { tenantId: ctx.tenantId }],
      ...(subjectSlug ? { slug: subjectSlug } : {}),
      ...(subjectName
        ? {
            name: {
              equals: subjectName,
              mode: "insensitive",
            },
          }
        : {}),
      ...(phase ? { phase } : {}),
      ...(level ? { level } : {}),
    },
    orderBy: [{ isGlobal: "asc" }, { orderIndex: "asc" }, { name: "asc" }],
    select: { id: true, name: true, phase: true, level: true, slug: true },
  });

  if (!subject) {
    return jsonNoStore(
      { ok: true, items: [], nextCursor: null }, // treat as empty instead of throwing
      { status: 200 }
    );
  }

  // 2) Load indicators under subject, page-able and deterministic
  try {
    const indicators = await prisma.curriculumIndicator.findMany({
      where: {
        contentStandard: {
          subStrand: {
            strand: {
              subjectId: subject.id,
            },
          },
        },
      },
      orderBy: [{ code: "asc" }, { id: "asc" }],
      take: take + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        code: true,
        description: true,
        contentStandard: {
          select: {
            code: true,
            description: true,
            subStrand: {
              select: {
                code: true,
                title: true,
                strand: {
                  select: { code: true, title: true },
                },
              },
            },
          },
        },
      },
    });

    const hasMore = indicators.length > take;
    const sliced = hasMore ? indicators.slice(0, take) : indicators;

    let seq = 0;
    const items: CurriculumUnitLike[] = sliced.map((i) => {
      seq++;
      const syntheticWeek = seq;
      const unitWeek = weekNumberParam ?? syntheticWeek;

      const strandTitle =
        i.contentStandard.subStrand.strand.title ??
        i.contentStandard.subStrand.strand.code ??
        "Strand";

      const subTitle =
        i.contentStandard.subStrand.title ??
        i.contentStandard.subStrand.code ??
        null;

      return {
        id: i.id,
        phase: subject.phase ?? phase ?? null,
        level: subject.level ?? level ?? null,
        subject: subject.name,
        term: term ?? null,
        weekNumber: unitWeek,

        strand: strandTitle,
        substrand: subTitle,
        contentStandard: i.contentStandard.description ?? null,
        indicator: i.description ?? null,
        indicatorCode: i.code ?? null,
      };
    });

    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    return jsonNoStore({ ok: true, items, nextCursor }, { status: 200 });
  } catch (err) {
    console.error("CURRICULUM_UNITS_ERROR", err);
    return jsonNoStore(
      { ok: false, error: "Failed to load curriculum units for this subject." },
      { status: 500 }
    );
  }
}
