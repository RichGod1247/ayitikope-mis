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

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const [invites, assignments, zones] = await Promise.all([
    prisma.governanceOfficerInvite.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
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
      },
    }),

    prisma.governanceOfficerAssignment.findMany({
      where: { status: "ACTIVE", revokedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        role: true,
        title: true,
        phone: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
        zone: {
          select: {
            id: true,
            name: true,
            zoneType: { select: { name: true, level: true } },
            parentZone: { select: { id: true, name: true } },
          },
        },
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
      expiresAt: i.expiresAt.toISOString(),
      acceptedAt: i.acceptedAt?.toISOString() ?? null,
      revokedAt: i.revokedAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
    })),
    assignments: assignments.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}