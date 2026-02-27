// src/app/api/parent/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PARENT_COOKIE_NAME } from "@/lib/parentSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  url.pathname = "/parent/login";
  url.search = "";

  const res = NextResponse.redirect(url, { status: 303 });

  res.cookies.set(PARENT_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return res;
}