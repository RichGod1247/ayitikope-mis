// src/app/api/consent/campaign/preview/route.ts
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---- RBAC helper ----
async function hasPermission(tenantId: string, userId: string, permName: string): Promise<boolean> {
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: {
      role: {
        select: {
          rolePerms: {
            select: { permission: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!membership?.role) return false;
  return membership.role.rolePerms.some((rp) => rp.permission?.name === permName);
}

function baseUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  return String(raw).replace(/\/$/, "");
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(req.url);

  // Backward compat only: allow tenantId param ONLY if it matches session tenant
  const suppliedTenantId = searchParams.get("tenantId");
  if (suppliedTenantId) {
    const guard = assertNoTenantOverride(suppliedTenantId, auth.ctx.tenantId);
    if (!guard.ok) {
      return new Response(JSON.stringify({ error: guard.error }), {
        status: guard.status,
        headers: { "content-type": "application/json" },
      });
    }
  }

  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 500);

  // RBAC: Preview needs CONSENT_EXPORT
  const ok = await hasPermission(auth.ctx.tenantId, auth.ctx.userId, "CONSENT_EXPORT");
  if (!ok) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const students = await prisma.student.findMany({
    where: { tenantId: auth.ctx.tenantId, guardianPhone: { not: null }, guardianSmsOptIn: false },
    select: { id: true, firstName: true, lastName: true, guardianName: true, guardianPhone: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: limit,
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.ctx.tenantId },
    select: { name: true },
  });

  const origin = baseUrl();

  // NOTE: your repo doesn’t yet include the real opt-in link endpoint.
  // For now we keep the legacy shape but session-safe; we’ll replace with secure token links next.
  const items = students.map((s) => {
    const name = `${s.lastName ?? ""} ${s.firstName ?? ""}`.trim();
    const link = `${origin}/api/consent/optin/student/link?studentId=${encodeURIComponent(s.id)}`; // tenant from token/session later
    const sms = `${tenant?.name ?? "School"}: SMS updates for ${name}. Tap to confirm: ${link}`;
    return {
      studentId: s.id,
      studentName: name,
      guardianName: s.guardianName ?? "",
      phone: s.guardianPhone ?? "",
      optinUrl: link,
      smsBody: sms,
    };
  });

  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}