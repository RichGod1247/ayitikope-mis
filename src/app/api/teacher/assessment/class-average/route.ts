// src/app/api/teacher/assessment/class-average/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getToken } from "next-auth/jwt";
import { effectiveRole } from "@/lib/roleRouting";

type Ctx = { userId: string; tenantId: string; role: string };

function isAdminLike(role: string) {
  const r = String(role || "").toUpperCase();
  return r === "ADMIN" || r === "SCHOOL_ADMIN" || r === "HEADTEACHER" || r === "SUPERADMIN";
}

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Content-Type-Options", "nosniff");
  return res;
}

async function requireCtx(req: NextRequest): Promise<{ ok: true; ctx: Ctx } | { ok: false; res: NextResponse }> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const userId = token?.sub ? String(token.sub) : "";
  if (!userId) {
    return { ok: false, res: noStore(NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })) };
  }

  let tenantId = token?.tenantId ? String((token as any).tenantId) : "";
  if (!tenantId) {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastActiveTenantId: true },
    });
    tenantId = u?.lastActiveTenantId ?? "";
  }

  if (!tenantId) {
    return { ok: false, res: noStore(NextResponse.json({ ok: false, error: "NO_ACTIVE_TENANT" }, { status: 400 })) };
  }

  const membership = await prisma.membership.findFirst({
    where: { userId, tenantId, status: "ACTIVE" },
    select: { role: { select: { name: true } } },
  });

  const roleName = membership?.role?.name ? String(membership.role.name) : "";
  if (!roleName) {
    return { ok: false, res: noStore(NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 })) };
  }

  const role = effectiveRole(roleName);
  return { ok: true, ctx: { userId, tenantId, role } };
}

export async function GET(req: NextRequest) {
  const auth = await requireCtx(req);
  if (!auth.ok) return auth.res;

  const { ctx } = auth;

  const roleUpper = String(ctx.role || "").toUpperCase();
  const allowed = roleUpper === "TEACHER" || isAdminLike(roleUpper);
  if (!allowed) {
    return noStore(
      NextResponse.json({ ok: false, error: "FORBIDDEN", role: ctx.role, path: "/api/teacher/assessment/class-average" }, { status: 403 })
    );
  }

  const { searchParams } = new URL(req.url);

  // Legacy compat: accept tenantId param but never trust it.
  const tenantIdParam = searchParams.get("tenantId");
  if (tenantIdParam && tenantIdParam !== ctx.tenantId) {
    return noStore(NextResponse.json({ ok: false, error: "TENANT_MISMATCH" }, { status: 403 }));
  }

  const classroomId = searchParams.get("classroomId");
  const term = searchParams.get("term") ?? "1st Term";
  const academicYear = searchParams.get("academicYear") ?? "2025/2026";

  if (!classroomId) {
    return noStore(
      NextResponse.json(
        { ok: false, error: "Missing required query param: classroomId." },
        { status: 400 }
      )
    );
  }

  // Confirm classroom belongs to tenant
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, tenantId: ctx.tenantId },
    select: { id: true },
  });

  if (!classroom) {
    return noStore(NextResponse.json({ ok: false, error: "Classroom not found for this tenant." }, { status: 404 }));
  }

  // Items for class/term/year (tenant scoped by session)
  const items = await prisma.assessmentItem.findMany({
    where: {
      tenantId: ctx.tenantId,
      classroomId,
      term,
      academicYear,
    },
    select: { id: true, maxScore: true },
  });

  if (items.length === 0) {
    return noStore(
      NextResponse.json({
        ok: true,
        context: { tenantId: ctx.tenantId, classroomId, term, academicYear },
        averagePercent: null,
        learnersCount: 0,
        itemsCount: 0,
      })
    );
  }

  const itemMaxMap = new Map<string, number>();
  const itemIds: string[] = [];

  for (const it of items) {
    itemIds.push(it.id);
    itemMaxMap.set(it.id, Number(it.maxScore ?? 0));
  }

  const scores = await prisma.assessmentScore.findMany({
    where: { itemId: { in: itemIds } },
    select: { itemId: true, studentId: true, score: true },
  });

  if (scores.length === 0) {
    return noStore(
      NextResponse.json({
        ok: true,
        context: { tenantId: ctx.tenantId, classroomId, term, academicYear },
        averagePercent: null,
        learnersCount: 0,
        itemsCount: items.length,
      })
    );
  }

  let totalScore = 0;
  let totalMax = 0;
  const learnerIds = new Set<string>();

  for (const s of scores) {
    learnerIds.add(s.studentId);

    const max = itemMaxMap.get(s.itemId) ?? 0;
    if (max <= 0) continue;

    totalMax += max;
    totalScore += Number(s.score ?? 0);
  }

  const averagePercent = totalMax > 0 ? (totalScore / totalMax) * 100 : null;

  return noStore(
    NextResponse.json({
      ok: true,
      context: { tenantId: ctx.tenantId, classroomId, term, academicYear },
      averagePercent,
      learnersCount: learnerIds.size,
      itemsCount: items.length,
    })
  );
}
