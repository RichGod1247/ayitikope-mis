// src/app/api/me/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;

  if (!u?.id || !u?.email) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: String(u.id),
      email: String(u.email),
      name: (u.name ?? null) as string | null,
      staffId: (u.staffId ?? null) as string | null,
      tenantId: (u.tenantId ?? null) as string | null,
      roleName: (u.roleName ?? null) as string | null,
    },
  });
}
