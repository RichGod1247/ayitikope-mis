import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
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

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
  });

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
      schoolSector: true,
      emisCode: true,
      contactEmail: true,
      contactPhoneNorm: true,
      settingsJson: true,
    },
    take: 200,
  });

  return json({
    ok: true,
    items: rows.map((r) => {
      const settings = asObj(r.settingsJson);

      const rejectedAt = parseDateMaybe(settings?.bootstrapRejectedAt);
      const rejectReason =
        typeof settings?.bootstrapRejectReason === "string"
          ? settings.bootstrapRejectReason
          : null;

      return {
        id: r.id,
        name: r.name,
        schoolCode: r.schoolCode,
        slug: r.slug,
        status: r.status,
        schoolSector: r.schoolSector,
        emisCode: r.emisCode ?? null,
        createdAt: r.createdAt.toISOString(),
        contactEmail: r.contactEmail ?? null,
        contactPhoneNorm: r.contactPhoneNorm ?? null,
        approvalRequired: true,
        rejectedAt: rejectedAt ? rejectedAt.toISOString() : null,
        rejectReason,
      };
    }),
  });
}