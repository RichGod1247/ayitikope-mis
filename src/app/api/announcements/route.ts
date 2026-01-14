// src/app/api/announcements/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow, requireMembershipOrThrow, requireRoleOrThrow } from "@/lib/authz";

const CreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(160, "Title too long."),
  body: z.string().trim().min(1, "Body is required.").max(8000, "Body too long."),
});

const jsonErr = (status: number, error: string) =>
  NextResponse.json({ ok: false, error }, { status });

export async function GET() {
  try {
    const user = await getCurrentUserOrThrow();
    if (!user.tenantId) return jsonErr(403, "NO_ACTIVE_TENANT");

    await requireMembershipOrThrow(user.id, user.tenantId);

    const items = await prisma.announcement.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, title: true, body: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return jsonErr(status, String(e?.message || e));
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUserOrThrow();
    if (!user.tenantId) return jsonErr(403, "NO_ACTIVE_TENANT");

    const membership = await requireMembershipOrThrow(user.id, user.tenantId);

    // ✅ Production-grade: only admin/headteacher should post announcements
    requireRoleOrThrow(membership.role?.name, ["ADMIN", "HEADTEACHER"]);

    const raw = await req.json().catch(() => null);
    const parsed = CreateSchema.safeParse(raw);
    if (!parsed.success) return jsonErr(400, parsed.error.issues[0]?.message || "Invalid body.");

    const { title, body } = parsed.data;

    const created = await prisma.announcement.create({
      data: {
        tenant: { connect: { id: user.tenantId } },
        title,
        body,
        createdBy: { connect: { id: user.id } },
      },
      select: { id: true, title: true, body: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, item: created });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return jsonErr(status, String(e?.message || e));
  }
}
