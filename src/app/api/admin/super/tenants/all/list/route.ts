// src/app/api/admin/super/tenants/all/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma, SchoolSector, TenantStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function statusFrom(v: unknown): TenantStatus | "ALL" {
  const s = clean(v).toUpperCase();
  if (s === "PENDING") return TenantStatus.PENDING;
  if (s === "ACTIVE") return TenantStatus.ACTIVE;
  if (s === "SUSPENDED") return TenantStatus.SUSPENDED;
  if (s === "ARCHIVED") return TenantStatus.ARCHIVED;
  return "ALL";
}

function sectorFrom(v: unknown): SchoolSector | "ALL" {
  const s = clean(v).toUpperCase();
  if (s === "PUBLIC") return SchoolSector.PUBLIC;
  if (s === "PRIVATE") return SchoolSector.PRIVATE;
  return "ALL";
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const status = statusFrom(req.nextUrl.searchParams.get("status") || "ALL");
  const sector = sectorFrom(req.nextUrl.searchParams.get("sector") || "ALL");
  const q = clean(req.nextUrl.searchParams.get("q"));

  const where: Prisma.TenantWhereInput = {};

  if (status !== "ALL") where.status = status;
  if (sector !== "ALL") where.schoolSector = sector;

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { schoolCode: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { emisCode: { contains: q, mode: "insensitive" } },
      { contactEmail: { contains: q, mode: "insensitive" } },
      { contactPhoneNorm: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.tenant.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      schoolCode: true,
      slug: true,
      status: true,
      schoolSector: true,
      emisCode: true,
      district: true,
      circuit: true,
      region: true,
      createdAt: true,
      updatedAt: true,
      contactEmail: true,
      contactPhoneNorm: true,
      zone: {
        select: {
          id: true,
          name: true,
          zoneType: { select: { name: true, level: true } },
          parentZone: { select: { id: true, name: true } },
        },
      },
      _count: {
        select: {
          memberships: true,
          students: true,
          teacherProfiles: true,
          lessonNotes: true,
          feeInvoices: true,
          governanceInterventions: true,
        },
      },
    },
    take: 500,
  });

  return json({
    ok: true,
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      schoolCode: r.schoolCode,
      slug: r.slug,
      status: r.status,
      schoolSector: r.schoolSector,
      emisCode: r.emisCode ?? null,
      district: r.district ?? null,
      circuit: r.circuit ?? null,
      region: r.region ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      contactEmail: r.contactEmail ?? null,
      contactPhoneNorm: r.contactPhoneNorm ?? null,
      zone: r.zone ?? null,
      usage: {
        memberships: r._count.memberships,
        students: r._count.students,
        teachers: r._count.teacherProfiles,
        lessonNotes: r._count.lessonNotes,
        feeInvoices: r._count.feeInvoices,
        governanceCases: r._count.governanceInterventions,
      },
    })),
  });
}