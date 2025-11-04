// src/app/api/dev/create-announcement/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET(req: Request) {
  // Safety: only allow in dev to avoid accidents in production
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { ok: false, error: "Disabled outside development." },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get("tenant")?.trim();
    const title = searchParams.get("title")?.trim();
    const body = searchParams.get("body")?.trim();

    if (!tenantSlug || !title || !body) {
      return NextResponse.json(
        { ok: false, error: "Required: tenant, title, body" },
        { status: 400 }
      );
    }

    // Find tenant id by slug
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, name: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { ok: false, error: `Tenant '${tenantSlug}' not found` },
        { status: 404 }
      );
    }

    // createdByUserId is optional in schema, so we can leave it null here.
    const ann = await prisma.announcement.create({
      data: {
        tenantId: tenant.id,
        title,
        body,
        createdByUserId: null,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Announcement created",
      tenant: tenant.name,
      item: {
        id: ann.id,
        title: ann.title,
        body: ann.body,
        createdAt: ann.createdAt,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
