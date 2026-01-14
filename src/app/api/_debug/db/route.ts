import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // if this throws, you're not hitting the DB you think
  const row = await prisma.tenantOnboardingCode.findFirst({
    select: { id: true, expiresAt: true },
  });
  return NextResponse.json({ ok: true, row });
}
