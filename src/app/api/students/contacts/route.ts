// src/app/api/admin/students/contacts/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type GuardianContact = {
  studentId: string;
  guardianName: string;
  phone: string;
  relationship?: string | null;
};

type SettingsShape = {
  guardianContacts?: Record<string, GuardianContact>;
  // other settings keys may also exist here (sms, fees, etc.)
};

function normalizePhone(raw: string): string {
  const digits = (raw || "").trim();
  if (!digits) return "";
  // For now we just trim whitespace. The Hubtel normalizer in sms lib will do deeper cleaning.
  return digits;
}

async function loadTenantSettings(tenantId: string) {
  const client: any = prisma as any;

  const tenant = await client.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      settings: true,
    },
  });

  if (!tenant) return null;

  const settings: SettingsShape =
    tenant.settings && typeof tenant.settings === "object"
      ? (tenant.settings as SettingsShape)
      : {};

  return { id: tenant.id as string, name: (tenant.name as string) || "", settings };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId")?.trim() || "";

  if (!tenantId) {
    return NextResponse.json(
      {
        ok: false,
        error: "tenantId is required to load guardian contacts.",
      },
      { status: 400 }
    );
  }

  try {
    const tenant = await loadTenantSettings(tenantId);
    if (!tenant) {
      return NextResponse.json(
        {
          ok: false,
          error: "Tenant not found. Please verify tenantId.",
        },
        { status: 404 }
      );
    }

    const map = tenant.settings.guardianContacts || {};
    const items: GuardianContact[] = Object.values(map).filter(
      (c) => c && typeof c.studentId === "string"
    );

    return NextResponse.json({
      ok: true,
      tenantId: tenant.id,
      tenantName: tenant.name,
      items,
    });
  } catch (err: any) {
    console.error("[GUARDIAN_CONTACTS_GET_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Internal error loading guardian contacts. Please contact the system administrator.",
      },
      { status: 500 }
    );
  }
}

type SaveBody = {
  tenantId?: string;
  contacts?: GuardianContact[];
};

export async function POST(request: Request) {
  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid JSON payload.",
      },
      { status: 400 }
    );
  }

  const tenantId = body.tenantId?.trim() || "";
  const contacts = Array.isArray(body.contacts) ? body.contacts : [];

  if (!tenantId) {
    return NextResponse.json(
      {
        ok: false,
        error: "tenantId is required to save guardian contacts.",
      },
      { status: 400 }
    );
  }

  if (!contacts.length) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No contacts were provided. Add at least one guardian with a phone number before saving.",
      },
      { status: 400 }
    );
  }

  try {
    const client: any = prisma as any;
    const tenant = await client.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, settings: true },
    });

    if (!tenant) {
      return NextResponse.json(
        {
          ok: false,
          error: "Tenant not found. Please verify tenantId.",
        },
        { status: 404 }
      );
    }

    const currentSettings: SettingsShape =
      tenant.settings && typeof tenant.settings === "object"
        ? (tenant.settings as SettingsShape)
        : {};

    const nextMap: Record<string, GuardianContact> = {
      ...(currentSettings.guardianContacts || {}),
    };

    let upsertCount = 0;

    for (const raw of contacts) {
      const studentId = (raw.studentId || "").trim();
      const guardianName = (raw.guardianName || "").trim();
      const phone = normalizePhone(raw.phone || "");
      const relationship = (raw.relationship || "").trim() || null;

      if (!studentId) continue;

      // We require at least a phone number or a name to keep the entry.
      if (!phone && !guardianName) {
        // If previously existed, we remove it (treat empty as delete).
        if (nextMap[studentId]) {
          delete nextMap[studentId];
          upsertCount += 1;
        }
        continue;
      }

      nextMap[studentId] = {
        studentId,
        guardianName,
        phone,
        relationship,
      };
      upsertCount += 1;
    }

    const nextSettings: SettingsShape = {
      ...currentSettings,
      guardianContacts: nextMap,
    };

    await client.tenant.update({
      where: { id: tenantId },
      data: {
        settings: nextSettings,
      },
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      savedCount: upsertCount,
    });
  } catch (err: any) {
    console.error("[GUARDIAN_CONTACTS_SAVE_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Internal error saving guardian contacts. Please contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
