// src/app/api/headteacher/results/release/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function roleUpper(role: string | null | undefined) {
  return String(role ?? "").trim().toUpperCase();
}

function isHeadOrAdmin(role: string) {
  return (
    role === "HEADTEACHER" ||
    role === "SCHOOL_ADMIN" ||
    role === "ADMIN" ||
    role === "SUPERADMIN"
  );
}

export async function GET(req: NextRequest) {
  const gate = await requireApiUserContext(req as any, { requireTenant: true });
  if (!gate.ok) return gate.res as any;

  const ctx = gate.ctx;
  const role = roleUpper(ctx.roleName);
  if (!isHeadOrAdmin(role)) {
    return noStoreJson(403, { ok: false, error: "FORBIDDEN", role });
  }

  const { searchParams } = new URL(req.url);
  const term = (searchParams.get("term") ?? "").trim() || null;
  const academicYear = (searchParams.get("academicYear") ?? "").trim() || null;

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { currentTerm: true, currentAcademicYear: true },
  });

  const t = term ?? settings?.currentTerm ?? "1st Term";
  const y = academicYear ?? settings?.currentAcademicYear ?? "2025/2026";

  const releases = await prisma.resultsRelease.findMany({
    where: { tenantId: ctx.tenantId, term: t, academicYear: y },
    select: { scopeKey: true, scope: true, releasedAt: true, classroomId: true },
  });

  const school = releases.find((r) => r.scopeKey === "SCHOOL") ?? null;

  const byClass: Record<string, { releasedAt: string }> = {};
  for (const r of releases) {
    if (r.scopeKey !== "SCHOOL") {
      byClass[r.scopeKey] = { releasedAt: r.releasedAt.toISOString() };
    }
  }

  return noStoreJson(200, {
    ok: true,
    term: t,
    academicYear: y,
    school: school ? { releasedAt: school.releasedAt.toISOString() } : null,
    classroomReleaseMap: byClass,
  });
}