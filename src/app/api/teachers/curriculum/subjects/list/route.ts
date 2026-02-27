// src/app/api/teachers/curriculum/subjects/list/route.ts
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

export async function POST() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use GET." }, { status: 405, headers: { Allow: "GET" } });
}

export async function GET(_req: NextRequest) {
  let ctx: { userId: string; tenantId: string };
  try {
    const c = await requireServerUserContext({
      requireTenant: true,
    });
    ctx = { userId: c.userId, tenantId: c.tenantId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  // ✅ Membership gate (ACTIVE only)
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return jsonNoStore({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  try {
    const items = await prisma.curriculumSubject.findMany({
      where: {
        isActive: true,
        OR: [{ tenantId: ctx.tenantId }, { isGlobal: true }],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        phase: true,
        level: true,
        isGlobal: true,
      },
      orderBy: [{ phase: "asc" }, { level: "asc" }, { name: "asc" }],
    });

    return jsonNoStore({ ok: true, items }, { status: 200 });
  } catch (err) {
    console.error("[TEACHER_CURRICULUM_SUBJECTS_LIST_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load curriculum subjects." }, { status: 500 });
  }
}
