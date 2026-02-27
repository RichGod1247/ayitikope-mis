//src/app/api/admin/health/alerts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_FEVER_THRESHOLD = 38.0;

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function normalizeRoleName(role: unknown) {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z_]/g, "");
}

// Legacy compat: treat ADMIN as SCHOOL_ADMIN
function roleEffective(role: unknown) {
  const r = normalizeRoleName(role);
  return r === "ADMIN" ? "SCHOOL_ADMIN" : r;
}

function isAdminLike(role: unknown) {
  const r = roleEffective(role);
  return r === "SCHOOL_ADMIN" || r.includes("HEAD") || r.includes("OWNER") || r.includes("SUPER");
}

async function requireAdminLike(tenantId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!m || m.status !== "ACTIVE") return { ok: false as const, status: 403, error: "Forbidden." };
  if (!isAdminLike(m.role?.name ?? "")) return { ok: false as const, status: 403, error: "Forbidden." };
  return { ok: true as const };
}

function parseDateRange(fromStr: string | null, toStr: string | null) {
  const todayIso = new Date().toISOString().slice(0, 10);

  const rawFrom = (fromStr ?? "").trim() || todayIso;
  const rawTo = (toStr ?? "").trim() || rawFrom;

  const start = new Date(`${rawFrom}T00:00:00.000Z`);
  const endExclusive = new Date(`${rawTo}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime())) {
    const s = new Date(`${todayIso}T00:00:00.000Z`);
    const e = new Date(`${todayIso}T00:00:00.000Z`);
    e.setUTCDate(e.getUTCDate() + 1);
    return { start: s, endExclusive: e, fromIso: todayIso, toIso: todayIso };
  }

  return { start, endExclusive, fromIso: rawFrom, toIso: rawTo };
}

function parseFeverThreshold(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  if (n <= 30 || n >= 45) return null;
  return Math.round(n * 10) / 10;
}

function resolveFeverThreshold(settingsJson: any) {
  const v =
    settingsJson?.health?.feverThresholdC ??
    settingsJson?.health?.feverThreshold ??
    settingsJson?.feverThresholdC ??
    settingsJson?.feverThreshold ??
    null;

  return parseFeverThreshold(v) ?? DEFAULT_FEVER_THRESHOLD;
}

function buildClassLabel(cls: { name?: string | null; grade?: string | null; arm?: string | null } | null | undefined) {
  if (!cls) return null;
  if (cls.name?.trim()) return cls.name.trim();
  const parts = [cls.grade, cls.arm].filter(Boolean);
  return parts.length ? parts.join(" ").trim() : null;
}

export async function GET(req: NextRequest) {
  // Auth + tenant from session
  let ctx: { tenantId: string; userId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { tenantId: c.tenantId, userId: c.userId };
  } catch {
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  // Role gate
  const roleOk = await requireAdminLike(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  const { searchParams } = new URL(req.url);

  // Back-compat: tenantId may be passed, must match session tenant
  const guard = assertNoTenantOverride(searchParams.get("tenantId"), ctx.tenantId);
  if (!guard.ok) return jsonNoStore({ ok: false, error: guard.error }, guard.status);

  const classroomId = (searchParams.get("classroomId") ?? "").trim() || null;
  const { start, endExclusive, fromIso, toIso } = parseDateRange(searchParams.get("from"), searchParams.get("to"));

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, settingsJson: true },
    });

    if (!tenant) return jsonNoStore({ ok: false, error: "TENANT_NOT_FOUND" }, 404);

    const settingsJson = (tenant.settingsJson as any) || {};
    const threshold = resolveFeverThreshold(settingsJson);

    const records = await prisma.studentHealthDaily.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(classroomId ? { classroomId } : {}),
        date: { gte: start, lt: endExclusive },
        temperatureC: { gte: threshold },
      },
      orderBy: [{ date: "desc" }],
      select: {
        id: true,
        classroomId: true,
        studentId: true,
        date: true,
        temperatureC: true,
        symptoms: true,
        notes: true,
      },
      take: 3000,
    });

    if (!records.length) {
      return jsonNoStore({ ok: true, items: [], count: 0, from: fromIso, to: toIso, threshold }, 200);
    }

    const studentIds = Array.from(new Set(records.map((r) => r.studentId).filter(Boolean)));
    const classroomIds = Array.from(new Set(records.map((r) => r.classroomId).filter(Boolean)));

    const [students, classrooms] = await Promise.all([
      studentIds.length
        ? prisma.student.findMany({
            where: { tenantId: ctx.tenantId, id: { in: studentIds } },
            select: { id: true, firstName: true, lastName: true },
            take: 8000,
          })
        : Promise.resolve([]),
      classroomIds.length
        ? prisma.classroom.findMany({
            where: { tenantId: ctx.tenantId, id: { in: classroomIds } },
            select: { id: true, name: true, grade: true, arm: true },
            take: 4000,
          })
        : Promise.resolve([]),
    ]);

    const studentMap = new Map<string, { firstName: string | null; lastName: string | null }>();
    for (const s of students) studentMap.set(s.id, { firstName: s.firstName ?? null, lastName: s.lastName ?? null });

    const classroomMap = new Map<string, { name: string | null; grade: string | null; arm: string | null }>();
    for (const c of classrooms) classroomMap.set(c.id, { name: c.name ?? null, grade: c.grade ?? null, arm: c.arm ?? null });

    const items = records.map((r) => {
      const s = r.studentId ? studentMap.get(r.studentId) : null;
      const c = r.classroomId ? classroomMap.get(r.classroomId) : null;

      const studentName = s ? [s.firstName, s.lastName].filter(Boolean).join(" ").trim() : "";
      const classLabel = buildClassLabel(c);

      const temp = r.temperatureC == null ? null : Number(r.temperatureC);

      return {
        id: r.id,
        date: r.date instanceof Date ? r.date.toISOString() : String(r.date ?? ""),
        studentId: r.studentId ?? null,
        studentName: studentName || "Unknown learner",
        classLabel,
        temperatureC: Number.isFinite(temp as number) ? temp : null,
        symptoms: r.symptoms ?? null,
        notes: r.notes ?? null,
      };
    });

    return jsonNoStore({ ok: true, items, count: items.length, from: fromIso, to: toIso, threshold }, 200);
  } catch (err) {
    console.error("[ADMIN_HEALTH_ALERTS_ERROR]", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_LOAD_HEALTH_ALERTS" }, 500);
  }
}
