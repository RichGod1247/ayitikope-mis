// src/app/api/debug-tenant/set/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");

  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "Missing ?slug=" },
      { status: 400 }
    );
  }

  const res = NextResponse.json({ ok: true, slug });
  // Cookie lives for 30 days, adjust as you like
  res.cookies.set("x-tenant", slug, {
    path: "/",
    httpOnly: false, // dev/debug only
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
