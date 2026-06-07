// src/app/api/public/governance/zones/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET() {
  const zones = await prisma.adminZone.findMany({
    where: { isActive: true },
    orderBy: [{ zoneType: { level: "desc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      zoneType: { select: { name: true, level: true } },
      parentZone: { select: { id: true, name: true } },
    },
  });

  return json(200, {
    ok: true,
    zones,
  });
}