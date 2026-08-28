import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"] as const;

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function toISODateOnly(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: [...ALLOWED_ROLES],
  });
  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;

  const [tenant, settingsRow] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        schoolCode: true,
        slug: true,
        district: true,
        circuit: true,
        region: true,
        emisCode: true,
        gpsAddress: true,
        timezone: true,
        locale: true,
        status: true,
      },
    }),
    prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        currentAcademicYear: true,
        currentTerm: true,
        term1Start: true,
        term1End: true,
        term2Start: true,
        term2End: true,
        term3Start: true,
        term3End: true,
        // Backward-compatible read shape for stale/cached setup clients.
        // UI-P3A no longer uses these values and the save route does not rewrite them.
        attendanceStartTime: true,
        attendanceEndTime: true,
        lateCutoffMinutes: true,
        feverThreshold: true,
        setupCompletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  if (!tenant) return json({ ok: false, error: "TENANT_NOT_FOUND" }, 404);
  if (tenant.status !== "ACTIVE") return json({ ok: false, error: "TENANT_NOT_ACTIVE" }, 409);

  const settings = {
    currentAcademicYear: settingsRow?.currentAcademicYear ?? "",
    currentTerm: settingsRow?.currentTerm ?? "",
    term1Start: toISODateOnly(settingsRow?.term1Start) ?? "",
    term1End: toISODateOnly(settingsRow?.term1End) ?? "",
    term2Start: toISODateOnly(settingsRow?.term2Start) ?? "",
    term2End: toISODateOnly(settingsRow?.term2End) ?? "",
    term3Start: toISODateOnly(settingsRow?.term3Start) ?? "",
    term3End: toISODateOnly(settingsRow?.term3End) ?? "",
    // Compatibility shell only; the Academic Settings UI no longer exposes these.
    attendanceStartTime: settingsRow?.attendanceStartTime ?? "",
    attendanceEndTime: settingsRow?.attendanceEndTime ?? "",
    lateCutoffMinutes:
      typeof settingsRow?.lateCutoffMinutes === "number" ? settingsRow.lateCutoffMinutes : null,
    feverThreshold:
      settingsRow?.feverThreshold != null ? Number(settingsRow.feverThreshold) : null,
    setupCompletedAt: settingsRow?.setupCompletedAt?.toISOString?.() ?? null,
    setupComplete: !!settingsRow?.setupCompletedAt,
    createdAt: settingsRow?.createdAt?.toISOString?.() ?? null,
    updatedAt: settingsRow?.updatedAt?.toISOString?.() ?? null,
  };

  return json({ ok: true, tenant, settings }, 200);
}
