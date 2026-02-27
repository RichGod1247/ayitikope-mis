// src/app/api/admin/students/health/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import { StudentStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_FEVER_THRESHOLD = 37.8;

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function isAdminLike(roleName: unknown) {
  const r = effectiveRole(roleName);
  return r === "SUPERADMIN" || r === "SCHOOL_ADMIN" || r === "HEADTEACHER";
}

function toNumber(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object" && typeof v.toNumber === "function") {
    const n = v.toNumber();
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;
  if (!isAdminLike(auth.ctx.roleName)) return json(403, { ok: false, error: "FORBIDDEN" });

  const { searchParams } = new URL(req.url);
  const studentId = String(searchParams.get("studentId") ?? "").trim();
  if (!studentId) return json(400, { ok: false, error: "STUDENT_ID_REQUIRED" });

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: auth.ctx.tenantId, status: StudentStatus.ACTIVE },
    select: { id: true },
  });
  if (!student) return json(404, { ok: false, error: "NOT_FOUND" });

  // ✅ Tenant-configured fever threshold (fallback to default)
  const ts = await prisma.tenantSettings.findUnique({
    where: { tenantId: auth.ctx.tenantId },
    select: { feverThreshold: true },
  });
  const threshold = toNumber(ts?.feverThreshold as any) ?? DEFAULT_FEVER_THRESHOLD;

  const rows = await prisma.studentHealthDaily.findMany({
    where: { tenantId: auth.ctx.tenantId, studentId },
    select: { id: true, date: true, temperatureC: true, symptoms: true, notes: true },
    orderBy: { date: "desc" },
    take: 40,
  });

  return json(200, {
    ok: true,
    items: rows.map((r) => {
      const t = toNumber(r.temperatureC as any);
      return {
        id: r.id,
        date: r.date.toISOString(),
        temperatureC: t,
        symptoms: r.symptoms ?? null,
        notes: r.notes ?? null,
        isFever: typeof t === "number" && t >= threshold,
      };
    }),
  });
}