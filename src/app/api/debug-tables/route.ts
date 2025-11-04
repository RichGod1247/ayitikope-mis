// src/app/api/debug-tables/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function GET() {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema = 'edulife_os'
      ORDER BY table_name;
    `);
    return NextResponse.json({ ok: true, tables: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
