// src/app/api/admin/super/applications/list/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  OnboardingApplicationStatus,
  OnboardingApplicationType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function typeFrom(value: unknown): OnboardingApplicationType | "ALL" {
  const t = clean(value).toUpperCase();

  if (t === "SCHOOL") return OnboardingApplicationType.SCHOOL;
  if (t === "GOVERNANCE_OFFICER") return OnboardingApplicationType.GOVERNANCE_OFFICER;

  return "ALL";
}

function statusFrom(value: unknown): OnboardingApplicationStatus | "ALL" {
  const s = clean(value).toUpperCase();

  if (s === "PENDING") return OnboardingApplicationStatus.PENDING;
  if (s === "UNDER_REVIEW") return OnboardingApplicationStatus.UNDER_REVIEW;
  if (s === "REJECTED") return OnboardingApplicationStatus.REJECTED;
  if (s === "CONVERTED") return OnboardingApplicationStatus.CONVERTED;
  if (s === "ARCHIVED") return OnboardingApplicationStatus.ARCHIVED;

  return "ALL";
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const type = typeFrom(req.nextUrl.searchParams.get("type") || "ALL");
  const status = statusFrom(req.nextUrl.searchParams.get("status") || "ALL");
  const q = clean(req.nextUrl.searchParams.get("q"));

  const where: Prisma.OnboardingApplicationWhereInput = {};

  if (type !== "ALL") where.type = type;
  if (status !== "ALL") where.status = status;

  if (q) {
    where.OR = [
      { applicantName: { contains: q, mode: "insensitive" } },
      { applicantTitle: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { schoolName: { contains: q, mode: "insensitive" } },
      { officialId: { contains: q, mode: "insensitive" } },
      { region: { contains: q, mode: "insensitive" } },
      { district: { contains: q, mode: "insensitive" } },
      { circuit: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.onboardingApplication.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 300,
  });

  const zoneIds = Array.from(
    new Set(rows.map((row) => row.zoneId).filter((id): id is string => Boolean(id)))
  );

  const zones = zoneIds.length
    ? await prisma.adminZone.findMany({
        where: { id: { in: zoneIds } },
        select: {
          id: true,
          name: true,
          zoneType: { select: { name: true, level: true } },
          parentZone: { select: { id: true, name: true } },
        },
      })
    : [];

  const zoneMap = new Map(zones.map((zone) => [zone.id, zone]));

  return json(200, {
    ok: true,
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,

      applicantName: row.applicantName,
      applicantTitle: row.applicantTitle,

      email: row.email,
      phone: row.phone,

      schoolName: row.schoolName,
      schoolSector: row.schoolSector,
      officialId: row.officialId,
      gpsAddress: row.gpsAddress,
      region: row.region,
      district: row.district,
      circuit: row.circuit,

      governanceRole: row.governanceRole,
      zoneId: row.zoneId,
      zone: row.zoneId ? zoneMap.get(row.zoneId) ?? null : null,
      title: row.title,

      notes: row.notes,
      source: row.source,

      reviewedByUserId: row.reviewedByUserId,
      reviewedAt: iso(row.reviewedAt),
      reviewReason: row.reviewReason,

      convertedByUserId: row.convertedByUserId,
      convertedAt: iso(row.convertedAt),
      convertedTenantBootstrapInviteId: row.convertedTenantBootstrapInviteId,
      convertedGovernanceOfficerInviteId: row.convertedGovernanceOfficerInviteId,

      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
}