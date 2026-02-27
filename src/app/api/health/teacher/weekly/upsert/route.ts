// src/app/api/health/teacher/weekly/upsert/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { normRole } from "@/lib/roleRouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function mondayUtcISO(d: Date): string {
  const day = d.getUTCDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1) - day; // to Monday
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  m.setUTCDate(m.getUTCDate() + diff);
  return m.toISOString().slice(0, 10); // YYYY-MM-DD
}

function parseWeekStartISO(raw: unknown): string {
  const s = cleanStr(raw);
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return mondayUtcISO(new Date());
}

function isTeacherLike(roleName: string | null) {
  const r = normRole(roleName ?? "");
  // allow teacher + school leadership to self-report too
  return r === "TEACHER" || r === "HEADTEACHER" || r === "ADMIN" || r === "SCHOOL_ADMIN" || r === "SUPERADMIN";
}

export async function POST(req: NextRequest) {
  // ✅ Auth: NEVER trust tenantId/userId from client
  const gate = await requireApiUserContext(req, { requireTenant: true });
  if (!gate.ok) return gate.res;

  const ctx = gate.ctx;

  if (!isTeacherLike(ctx.roleName)) {
    return jsonNoStore(
      { ok: false, error: "FORBIDDEN", role: ctx.roleName, path: "/api/health/teacher/weekly/upsert" },
      403
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Back-compat only: if client still sends tenantId/userId, it MUST match session
  const tenantIdFromClient = cleanStr((body as any)?.tenantId);
  if (tenantIdFromClient && tenantIdFromClient !== ctx.tenantId) {
    return jsonNoStore({ ok: false, error: "FORBIDDEN_TENANT_MISMATCH" }, 403);
  }

  const userIdFromClient = cleanStr((body as any)?.userId);
  if (userIdFromClient && userIdFromClient !== ctx.userId) {
    return jsonNoStore({ ok: false, error: "FORBIDDEN_USER_MISMATCH" }, 403);
  }

  const weekStartISO = parseWeekStartISO((body as any)?.weekStart);
  const stress = Number((body as any)?.stressLevel ?? 3);
  const workload = Number((body as any)?.workload ?? 3);

  const comments = typeof (body as any)?.comments === "string" ? String((body as any).comments).trim() : null;

  if (!(stress >= 1 && stress <= 5)) return jsonNoStore({ ok: false, error: "stressLevel must be 1..5" }, 400);
  if (!(workload >= 1 && workload <= 5)) return jsonNoStore({ ok: false, error: "workload must be 1..5" }, 400);

  const weekStartDate = new Date(`${weekStartISO}T00:00:00.000Z`);

  try {
    // ✅ Upsert by (tenantId, userId, weekStart)
    const saved = await prisma.teacherHealthWeekly.upsert({
      where: {
        TeacherHealthWeekly_unique_tenant_user_week: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          weekStart: weekStartDate,
        },
      },
      update: { stressLevel: stress, workload, comments },
      create: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        weekStart: weekStartDate,
        stressLevel: stress,
        workload,
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
  } catch (err) {
    console.error("health/teacher/weekly/upsert error:", err);
    return jsonNoStore({ ok: false, error: "Failed to upsert teacher weekly health" }, 500);
  }
}
