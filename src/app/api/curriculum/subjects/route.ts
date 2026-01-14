// src/app/api/curriculum/subjects/route.ts
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

/**
 * GET /api/curriculum/subjects
 * Secure rules:
 * - Requires an authenticated user in a tenant.
 * - Returns:
 *    (A) global subjects (isGlobal = true)
 *    (B) tenant subjects (tenantId = ctx.tenantId)
 * - Never leaks other tenant curricula.
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
  const phase = (searchParams.get("phase") ?? "").trim() || undefined;
  const level = (searchParams.get("level") ?? "").trim() || undefined;

  try {
    const rows = await prisma.curriculumSubject.findMany({
      where: {
        isActive: true,
        ...(phase ? { phase } : {}),
        ...(level ? { level } : {}),
        OR: [{ isGlobal: true }, { tenantId: ctx.tenantId }],
      },
      orderBy: [
        { phase: "asc" },
        { level: "asc" },
        { orderIndex: "asc" },
        { name: "asc" },
      ],
      select: {
        id: true,
        phase: true,
        level: true,
        name: true,
        slug: true,
        orderIndex: true,
        isGlobal: true,
        tenantId: true,
      },
    });

    return jsonNoStore(
      {
        ok: true,
        items: rows.map((r) => ({
          id: r.id,
          phase: r.phase ?? null,
          level: r.level ?? null,
          name: r.name,
          slug: r.slug,
          orderIndex: r.orderIndex ?? 0,
          isGlobal: r.isGlobal,
          tenantId: r.tenantId ?? null,
        })),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("CURRICULUM_SUBJECTS_LIST_ERROR", err);
    return jsonNoStore(
      { ok: false, error: "Failed to load curriculum subjects." },
      { status: 500 }
    );
  }
}
