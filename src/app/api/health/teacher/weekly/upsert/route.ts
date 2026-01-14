// src/app/api/health/teacher/weekly/upsert/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function mondayUtcISO(d: Date): string {
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day; // move to Monday
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  m.setUTCDate(m.getUTCDate() + diff);
  return m.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const tenantId = String(body?.tenantId ?? "").trim();
    const userId = String(body?.userId ?? "").trim(); // teacher's User.id
    const week = String(body?.weekStart ?? "").trim(); // optional; ISO YYYY-MM-DD

    const stress = Number((body as any)?.stressLevel ?? 3); // 1..5
    const work = Number((body as any)?.workload ?? 3); // 1..5

    const comments =
      typeof (body as any)?.comments === "string"
        ? ((body as any).comments as string).trim()
        : null;

    if (!tenantId) return jsonNoStore({ ok: false, error: "tenantId is required" }, 400);
    if (!userId) return jsonNoStore({ ok: false, error: "userId (teacher) is required" }, 400);

    if (!(stress >= 1 && stress <= 5))
      return jsonNoStore({ ok: false, error: "stressLevel must be 1..5" }, 400);

    if (!(work >= 1 && work <= 5))
      return jsonNoStore({ ok: false, error: "workload must be 1..5" }, 400);

    // resolve weekStart: default to current Monday UTC if not provided
    const weekStartISO =
      week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : mondayUtcISO(new Date());

    // sanity check: user belongs to tenant (via membership)
    const mem = await prisma.membership.findFirst({
      where: { userId, tenantId },
      select: { id: true },
    });

    if (!mem) {
      return jsonNoStore({ ok: false, error: "Teacher is not a member of the tenant" }, 400);
    }

    const weekStartDate = new Date(weekStartISO);

    // ✅ Upsert by (tenantId, userId, weekStart) — matches your schema unique constraint
    const saved = await prisma.teacherHealthWeekly.upsert({
      where: {
        TeacherHealthWeekly_unique_tenant_user_week: {
          tenantId,
          userId,
          weekStart: weekStartDate,
        },
      },
      update: {
        stressLevel: stress,
        workload: work,
        comments,
      },
      create: {
        tenantId,
        userId,
        weekStart: weekStartDate,
        stressLevel: stress,
        workload: work,
        comments,
      },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        weekStart: true,
        stressLevel: true,
        workload: true,
        comments: true,
      },
    });

    return jsonNoStore({ ok: true, saved }, 200);
  } catch (err: unknown) {
    console.error("teacher/weekly/upsert error:", err);
    return jsonNoStore({ ok: false, error: "Failed to upsert teacher weekly health" }, 500);
  }
}
