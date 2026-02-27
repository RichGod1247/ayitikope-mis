// src/app/api/admin/super/tenants/pending/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTO_ACTIVATE_HOURS = Number(process.env.TENANT_AUTO_ACTIVATE_AFTER_HOURS || 12) || 12;

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function asObj(v: unknown): Record<string, any> {
  return v && typeof v === "object" ? (v as any) : {};
}

function parseDateMaybe(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function getBootstrapSubmittedAt(settings: any, fallback: Date) {
  const d = parseDateMaybe(settings?.bootstrapSubmittedAt);
  return d ?? fallback;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: false, requireRoleNames: ["SUPERADMIN"] });
  if (!auth.ok) return auth.res;

  const rows = await prisma.tenant.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      schoolCode: true,
      slug: true,
      createdAt: true,
      status: true,
      contactEmail: true,
      contactPhoneNorm: true,
      settingsJson: true,
    },
    take: 200,
  });

  const now = Date.now();

  return json({
    ok: true,
    items: rows.map((r) => {
      const settings = asObj(r.settingsJson);
      const submittedAt = getBootstrapSubmittedAt(settings, r.createdAt);
      const autoActivateAt = new Date(submittedAt.getTime() + AUTO_ACTIVATE_HOURS * 60 * 60 * 1000);

      const rejectedAt = parseDateMaybe(settings?.bootstrapRejectedAt);
      const rejectReason = typeof settings?.bootstrapRejectReason === "string" ? settings.bootstrapRejectReason : null;

      const remainingMs = autoActivateAt.getTime() - now;
      const autoActivateInMinutes = Math.max(0, Math.ceil(remainingMs / 60000));

      return {
        id: r.id,
        name: r.name,
        schoolCode: r.schoolCode,
        slug: r.slug,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        contactEmail: r.contactEmail ?? null,
        contactPhoneNorm: r.contactPhoneNorm ?? null,

        autoActivateAt: autoActivateAt.toISOString(),
        autoActivateInMinutes,

        rejectedAt: rejectedAt ? rejectedAt.toISOString() : null,
        rejectReason,
      };
    }),
  });
}