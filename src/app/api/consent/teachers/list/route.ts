// src/app/api/consent/teachers/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"]);

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function roleUpper(v: unknown): string {
  return effectiveRole(v).trim().toUpperCase();
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const ctx = auth.ctx;

  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
      },
    },
    select: {
      status: true,
      role: { select: { name: true } },
    },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const roleName = roleUpper(membership.role?.name ?? ctx.roleName);
  if (!ALLOWED_ROLES.has(roleName)) {
    return json(403, { ok: false, error: "FORBIDDEN_ROLE" });
  }

  try {
    const memberships = await prisma.membership.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "ACTIVE",
      },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            smsOptIn: true,
          },
        },
      },
      take: 2000,
    });

    const dedup = new Map<
      string,
      { id: string; name: string | null; email: string | null; smsOptIn: boolean }
    >();

    for (const m of memberships) {
      if (!m.user) continue;
      dedup.set(m.user.id, {
        id: m.user.id,
        name: m.user.name ?? null,
        email: m.user.email ?? null,
        smsOptIn: !!m.user.smsOptIn,
      });
    }

    const items = Array.from(dedup.values()).sort((a, b) => {
      const an = (a.name || "").toLowerCase();
      const bn = (b.name || "").toLowerCase();
      if (an !== bn) return an < bn ? -1 : 1;

      const ae = (a.email || "").toLowerCase();
      const be = (b.email || "").toLowerCase();
      if (ae !== be) return ae < be ? -1 : 1;

      return 0;
    });

    return json(200, { ok: true, items });
  } catch (err) {
    console.error("[CONSENT_TEACHERS_LIST_ERROR]", err);
    return json(500, { ok: false, error: "Failed to list teachers." });
  }
}