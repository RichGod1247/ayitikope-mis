// src/app/api/admin/health/settings/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TENANT_ID = "cmhhnghn00008vcpgp3fl07fl";

type HealthSettings = {
  feverThresholdC: number;
  notifyParentsOnFever: boolean;
  notifyHealthCenterOnFever: boolean;
  healthCenterName: string;
  healthCenterPhone: string;
};

function getDefaultHealthSettings(): HealthSettings {
  return {
    feverThresholdC: 38.0,
    notifyParentsOnFever: true,
    notifyHealthCenterOnFever: false,
    healthCenterName: "",
    healthCenterPhone: "",
  };
}

export async function GET() {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: TENANT_ID },
      select: { id: true, name: true, settings: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { ok: false, error: "Tenant not found" },
        { status: 404 }
      );
    }

    let healthSettings: HealthSettings;
    const rawSettings = (tenant.settings as any) || {};

    if (rawSettings.health && typeof rawSettings.health === "object") {
      const hs = rawSettings.health;
      const defaults = getDefaultHealthSettings();

      healthSettings = {
        feverThresholdC:
          typeof hs.feverThresholdC === "number"
            ? hs.feverThresholdC
            : defaults.feverThresholdC,
        notifyParentsOnFever:
          typeof hs.notifyParentsOnFever === "boolean"
            ? hs.notifyParentsOnFever
            : defaults.notifyParentsOnFever,
        notifyHealthCenterOnFever:
          typeof hs.notifyHealthCenterOnFever === "boolean"
            ? hs.notifyHealthCenterOnFever
            : defaults.notifyHealthCenterOnFever,
        healthCenterName:
          typeof hs.healthCenterName === "string"
            ? hs.healthCenterName
            : defaults.healthCenterName,
        healthCenterPhone:
          typeof hs.healthCenterPhone === "string"
            ? hs.healthCenterPhone
            : defaults.healthCenterPhone,
      };
    } else {
      healthSettings = getDefaultHealthSettings();
    }

    return NextResponse.json({
      ok: true,
      tenantId: tenant.id,
      tenantName: tenant.name,
      healthSettings,
    });
  } catch (err) {
    console.error("[admin/health/settings] GET error", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load health settings.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid payload" },
        { status: 400 }
      );
    }

    const incoming = (body.healthSettings ?? body) as Partial<HealthSettings>;
    const defaults = getDefaultHealthSettings();

    const feverThresholdRaw = incoming.feverThresholdC;
    const feverThreshold =
      typeof feverThresholdRaw === "number"
        ? feverThresholdRaw
        : Number(feverThresholdRaw);

    if (
      !Number.isFinite(feverThreshold) ||
      feverThreshold <= 30 ||
      feverThreshold >= 45
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Invalid feverThresholdC; please choose between 30 and 45 °C.",
        },
        { status: 400 }
      );
    }

    const healthSettings: HealthSettings = {
      feverThresholdC: feverThreshold,
      notifyParentsOnFever:
        typeof incoming.notifyParentsOnFever === "boolean"
          ? incoming.notifyParentsOnFever
          : defaults.notifyParentsOnFever,
      notifyHealthCenterOnFever:
        typeof incoming.notifyHealthCenterOnFever === "boolean"
          ? incoming.notifyHealthCenterOnFever
          : defaults.notifyHealthCenterOnFever,
      healthCenterName:
        typeof incoming.healthCenterName === "string"
          ? incoming.healthCenterName.trim()
          : defaults.healthCenterName,
      healthCenterPhone:
        typeof incoming.healthCenterPhone === "string"
          ? incoming.healthCenterPhone.trim()
          : defaults.healthCenterPhone,
    };

    const tenant = await prisma.tenant.findUnique({
      where: { id: TENANT_ID },
      select: { id: true, settings: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { ok: false, error: "Tenant not found" },
        { status: 404 }
      );
    }

    const existingSettings = (tenant.settings as any) || {};
    const newSettings = {
      ...existingSettings,
      health: healthSettings,
    };

    const updated = await prisma.tenant.update({
      where: { id: TENANT_ID },
      data: { settings: newSettings as any },
      select: { id: true },
    });

    return NextResponse.json({
      ok: true,
      tenantId: updated.id,
      healthSettings,
    });
  } catch (err) {
    console.error("[admin/health/settings] POST error", err);
    return NextResponse.json(
      { ok: false, error: "Failed to save health settings." },
      { status: 500 }
    );
  }
}
