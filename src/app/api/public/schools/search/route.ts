// src/app/api/public/schools/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = clean(searchParams.get("q"));

    // Avoid dumping your whole tenant table.
    if (q.length < 2) {
      return noStoreJson(200, { ok: true, items: [] });
    }

    const items = await prisma.tenant.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { district: { contains: q, mode: "insensitive" } },
          { circuit: { contains: q, mode: "insensitive" } },
          { region: { contains: q, mode: "insensitive" } },
          // If parent types school code/EMIS, still works, but UI won’t display it.
          { schoolCode: { contains: q, mode: "insensitive" } },
          { emisCode: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        district: true,
        circuit: true,
        region: true,
        gpsAddress: true,
        schoolCode: true,
        emisCode: true,
      },
      orderBy: [{ name: "asc" }],
      take: 20,
    });

    return noStoreJson(200, { ok: true, items });
  } catch (e) {
    console.error("[PUBLIC_SCHOOLS_SEARCH_ERROR]", e);
    return noStoreJson(500, { ok: false, error: "Failed to load schools." });
  }
}