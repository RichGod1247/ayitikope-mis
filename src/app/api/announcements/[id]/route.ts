// src/app/api/announcements/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

type RouteContext = { params: { id: string } };

// PATCH /api/announcements/:id
export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const id = params.id;
    const body = await req.json();
    const { title, body: content } = body || {};

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing announcement id" },
        { status: 400 }
      );
    }
    if (!title && !content) {
      return NextResponse.json(
        { ok: false, error: "Nothing to update. Provide title or body." },
        { status: 400 }
      );
    }

    const updated = await prisma.announcement.update({
      where: { id },
      data: {
        ...(title ? { title: String(title) } : {}),
        ...(content ? { body: String(content) } : {}),
      },
      select: { id: true, title: true, body: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

// DELETE /api/announcements/:id
export async function DELETE(_req: Request, { params }: RouteContext) {
  try {
    const id = params.id;
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing announcement id" },
        { status: 400 }
      );
    }
    await prisma.announcement.delete({ where: { id } });
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
