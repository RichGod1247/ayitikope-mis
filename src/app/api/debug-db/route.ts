// src/app/api/debug-db/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function GET() {
  try {
    const r = await prisma.$queryRawUnsafe("select 1");
    return NextResponse.json({ ok: true, result: r });
  } catch (e: any) {
    console.error("DEBUG DB FAIL:", e?.message || e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
