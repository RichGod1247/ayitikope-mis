// src/app/api/curriculum/indicator-slices/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

function jsonNoStore(payload: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
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

/**
 * GET /api/curriculum/indicator-slices?subjectSlug=...&level=...&take=200
 *
 * Secure rules:
 * - Requires authenticated user in a tenant.
 * - subjectSlug must resolve to either:
 *    (A) global subject (isGlobal=true) OR
 *    (B) tenant subject (tenantId=ctx.tenantId)
 * - Never leaks other tenant's subject hierarchy.
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
  const level = nonEmpty(searchParams.get("level"));

  if (!subjectSlug) {
    return jsonNoStore({ ok: false, error: "subjectSlug is required." }, { status: 400 });
  }

  const take = clamp(Number(searchParams.get("take") ?? 200) || 200, 1, 500);
  const cursor = nonEmpty(searchParams.get("cursor")) ?? undefined;

  const subject = await prisma.curriculumSubject.findFirst({
    where: {
      slug: subjectSlug,
      isActive: true,
      ...(level ? { level } : {}),
      OR: [{ isGlobal: true }, { tenantId: ctx.tenantId }],
    },
    select: { id: true },
  });

  if (!subject) {
    return jsonNoStore(
      { ok: false, error: "Curriculum subject not found or not accessible." },
      { status: 404 }
    );
  }

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
                  select: {
                    code: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const hasMore = indicators.length > take;
    const sliced = hasMore ? indicators.slice(0, take) : indicators;

    const items = sliced.map((i) => {
      const strandCode = i.contentStandard.subStrand.strand.code ?? null;
      const strandTitle = i.contentStandard.subStrand.strand.title ?? null;

      const subStrandCode = i.contentStandard.subStrand.code ?? null;
      const subStrandTitle = i.contentStandard.subStrand.title ?? null;

      const contentStandardCode = i.contentStandard.code ?? null;
      const contentStandardDescription = i.contentStandard.description ?? null;

      const indicatorCode = i.code;
      const indicatorDescription = i.description;

      const label = `${indicatorCode} — ${indicatorDescription}`.slice(0, 220);

      return {
        indicatorId: i.id,
        strandCode,
        strandTitle,
        subStrandCode,
        subStrandTitle,
        contentStandardCode,
        contentStandardDescription,
        indicatorCode,
        indicatorDescription,
        label,
      };
    });

    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    return jsonNoStore({ ok: true, items, nextCursor }, { status: 200 });
  } catch (err) {
    console.error("CURRICULUM_INDICATOR_SLICES_ERROR", err);
    return jsonNoStore(
      { ok: false, error: "Failed to load curriculum topics (indicators)." },
      { status: 500 }
    );
  }
}
