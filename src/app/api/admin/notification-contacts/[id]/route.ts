// src/app/api/admin/notification-contacts/[id]/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type PatchBody = {
  name?: string;
  phone?: string;
  isActive?: boolean;
};

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing contact ID in URL." },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as PatchBody;
    const data: PatchBody = {};

    if (typeof body.name === "string") {
      data.name = body.name.trim();
    }

    if (typeof body.phone === "string") {
      data.phone = body.phone.trim();
    }

    if (typeof body.isActive === "boolean") {
      data.isActive = body.isActive;
    }

    if (
      typeof data.name === "undefined" &&
      typeof data.phone === "undefined" &&
      typeof data.isActive === "undefined"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "No updatable fields provided (name, phone, or isActive).",
        },
        { status: 400 }
      );
    }

    const updated = await prisma.notificationContact.update({
      where: { id }, // id is a string, which matches your Prisma model
      data,
    });

    return NextResponse.json(
      {
        ok: true,
        contact: {
          id: String(updated.id),
          name: updated.name,
          phone: updated.phone,
          isActive: updated.isActive,
          createdAt: updated.createdAt?.toISOString() ?? null,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[NOTIF_CONTACT_UPDATE_ERROR]", err);

    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ??
          "Failed to update notification contact. Check server logs.",
      },
      { status: 500 }
    );
  }
}
