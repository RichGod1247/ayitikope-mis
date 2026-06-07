// src/app/api/admin/governance/officers/list/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const [invites, assignments, zones] = await Promise.all([
    prisma.governanceOfficerInvite.findMany({
      orderBy: { createdAt: "desc" },
      take: 150,
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true,
        metadata: true,
        zone: {
          select: {
            id: true,
            name: true,
            zoneType: { select: { name: true, level: true } },
            parentZone: { select: { id: true, name: true } },
          },
        },
        createdBy: { select: { id: true, email: true, name: true } },
        acceptedBy: { select: { id: true, email: true, name: true } },
        revokedBy: { select: { id: true, email: true, name: true } },
      },
    }),

    prisma.governanceOfficerAssignment.findMany({
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 150,
      select: {
        id: true,
        role: true,
        title: true,
        phone: true,
        status: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        updatedAt: true,
        revokedAt: true,
        revokeReason: true,
        metadata: true,
        user: { select: { id: true, email: true, name: true } },
        zone: {
          select: {
            id: true,
            name: true,
            zoneType: { select: { name: true, level: true } },
            parentZone: { select: { id: true, name: true } },
          },
        },
        createdBy: { select: { id: true, email: true, name: true } },
        revokedBy: { select: { id: true, email: true, name: true } },
      },
    }),

    prisma.adminZone.findMany({
      where: { isActive: true },
      orderBy: [{ zoneType: { level: "desc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        zoneType: { select: { name: true, level: true } },
        parentZone: { select: { id: true, name: true } },
      },
    }),
  ]);

  return json(200, {
    ok: true,
    zones,
    invites: invites.map((i) => ({
      ...i,
      expiresAt: iso(i.expiresAt),
      acceptedAt: iso(i.acceptedAt),
      revokedAt: iso(i.revokedAt),
      createdAt: iso(i.createdAt),
      updatedAt: iso(i.updatedAt),
    })),
    assignments: assignments.map((a) => ({
      ...a,
      startsAt: iso(a.startsAt),
      endsAt: iso(a.endsAt),
      createdAt: iso(a.createdAt),
      updatedAt: iso(a.updatedAt),
      revokedAt: iso(a.revokedAt),
    })),
  });
}