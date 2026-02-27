import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const key = req.headers.get("x-activate-key");
  if (!process.env.SUPER_ADMIN_ACTIVATE_KEY || key !== process.env.SUPER_ADMIN_ACTIVATE_KEY) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const schoolCode = String(body?.schoolCode ?? "").trim();
  if (!schoolCode) {
    return NextResponse.json({ ok: false, error: "schoolCode required" }, { status: 400 });
  }

  const tenant = await prisma.tenant.update({
    where: { schoolCode },
    data: { status: "ACTIVE" },
    select: { id: true, name: true, schoolCode: true, status: true },
  });

  return NextResponse.json({ ok: true, tenant });
}
