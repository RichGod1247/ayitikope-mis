// src/app/api/admin/fees/structures/archive/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  const isActive = Boolean(body.isActive);

  if (!id) return jsonNoStore({ ok: false, error: "FEE_STRUCTURE_ID_REQUIRED" }, 400);

  const existing = await prisma.feeStructure.findFirst({
    where: { id, tenantId: auth.ctx.tenantId },
    select: { id: true },
  });

  if (!existing) return jsonNoStore({ ok: false, error: "FEE_STRUCTURE_NOT_FOUND" }, 404);

  const item = await prisma.feeStructure.update({
    where: { id },
    data: { isActive },
  });

  return jsonNoStore({ ok: true, item });
}