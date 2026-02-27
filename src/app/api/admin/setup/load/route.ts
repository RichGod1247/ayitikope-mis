// src/app/api/admin/setup/load/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function toTimeHHMM(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN"],
  });
  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;

  const t = await prisma.tenant.findUnique({
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
  });

  if (!t) return json({ ok: false, error: "TENANT_NOT_FOUND" }, 404);
  if (t.status !== "ACTIVE") return json({ ok: false, error: "TENANT_NOT_ACTIVE" }, 409);

  // Ensure tenant_settings exists (safe, idempotent)
  await prisma.tenantSettings.upsert({
    where: { tenantId },
    create: { tenantId },
    update: {},
  });

  const s = await prisma.tenantSettings.findUnique({
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

      attendanceStartTime: true,
      attendanceEndTime: true,
      lateCutoffMinutes: true,

      feverThreshold: true,

      setupCompletedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const settings = {
    currentAcademicYear: s?.currentAcademicYear ?? "",
    currentTerm: s?.currentTerm ?? "",

    term1Start: toISODateOnly(s?.term1Start) ?? "",
    term1End: toISODateOnly(s?.term1End) ?? "",
    term2Start: toISODateOnly(s?.term2Start) ?? "",
    term2End: toISODateOnly(s?.term2End) ?? "",
    term3Start: toISODateOnly(s?.term3Start) ?? "",
    term3End: toISODateOnly(s?.term3End) ?? "",

    attendanceStartTime: toTimeHHMM(s?.attendanceStartTime) ?? "",
    attendanceEndTime: toTimeHHMM(s?.attendanceEndTime) ?? "",
    lateCutoffMinutes: typeof s?.lateCutoffMinutes === "number" ? s.lateCutoffMinutes : null,

    feverThreshold: s?.feverThreshold != null ? Number(s.feverThreshold) : null,

    setupCompletedAt: s?.setupCompletedAt?.toISOString?.() ?? null,
    setupComplete: !!s?.setupCompletedAt,

    createdAt: s?.createdAt?.toISOString?.() ?? null,
    updatedAt: s?.updatedAt?.toISOString?.() ?? null,
  };

  // Keep response shape your UI expects
  const tenant = { ...t };
  // remove status from UI tenant payload if you want, but safe to include
  return json({ ok: true, tenant, settings }, 200);
}