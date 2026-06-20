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
    select: {
      scopeKey: true,
      scope: true,
      releasedAt: true,
      classroomId: true,
      readinessStatus: true,
      readinessScore: true,
      releaseMode: true,
      releaseSnapshotHash: true,
    },
  });

  function isEvidenceBackedRelease(r: (typeof releases)[number]) {
    const status = String(r.readinessStatus ?? "").toUpperCase();
    return (
      (status === "READY" || status === "OVERRIDE") &&
      !!String(r.releaseSnapshotHash ?? "").trim()
    );
  }

  const schoolRaw = releases.find((r) => r.scopeKey === "SCHOOL") ?? null;
  const school = schoolRaw && isEvidenceBackedRelease(schoolRaw) ? schoolRaw : null;

  const byClass: Record<
    string,
    {
      releasedAt: string;
      readinessStatus: string;
      readinessScore: number;
      releaseMode: string | null;
      releaseSnapshotHash: string | null;
    }
  > = {};

  for (const r of releases) {
    if (r.scopeKey !== "SCHOOL" && isEvidenceBackedRelease(r)) {
      byClass[r.scopeKey] = {
        releasedAt: r.releasedAt.toISOString(),
        readinessStatus: String(r.readinessStatus),
        readinessScore: Number(r.readinessScore ?? 0),
        releaseMode: r.releaseMode ?? null,
        releaseSnapshotHash: r.releaseSnapshotHash ?? null,
      };
    }
  }

  const suppressedReleases = releases
    .filter((r) => !isEvidenceBackedRelease(r))
    .map((r) => ({
      scope: r.scope,
      scopeKey: r.scopeKey,
      classroomId: r.classroomId,
      releasedAt: r.releasedAt.toISOString(),
      readinessStatus: String(r.readinessStatus),
      readinessScore: Number(r.readinessScore ?? 0),
      releaseMode: r.releaseMode ?? null,
      releaseSnapshotHash: r.releaseSnapshotHash ?? null,
      reason: "Release row is not evidence-backed and is hidden from active release status.",
    }));

  return noStoreJson(200, {
    ok: true,
    term: t,
    academicYear: y,
    school: school
      ? {
          releasedAt: school.releasedAt.toISOString(),
          readinessStatus: String(school.readinessStatus),
          readinessScore: Number(school.readinessScore ?? 0),
          releaseMode: school.releaseMode ?? null,
          releaseSnapshotHash: school.releaseSnapshotHash ?? null,
        }
      : null,
    classroomReleaseMap: byClass,
    suppressedReleases,
  });
}