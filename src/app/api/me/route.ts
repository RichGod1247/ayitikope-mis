// src/app/api/me/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { effectiveRole } from "@/lib/roleRouting";
import { normalizeTeacherScopeForRead } from "@/lib/teacherScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  tenantId?: string | null;
  roleName?: string | null;
  staffId?: string | null;
};

type TenantLite = {
  id: string;
  name: string;
  slug: string | null;
  schoolCode: string | null;
  status: string | null;
};

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isLikelyNextAuthDecryptError(err: unknown) {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return (
    msg.includes("jwe") ||
    msg.includes("jwt") ||
    msg.includes("decryption") ||
    msg.includes("invalid compact") ||
    msg.includes("session") ||
    msg.includes("argument name is invalid")
  );
}

export async function GET() {
  let session: any = null;
  try {
    session = (await getServerSession(authOptions)) ?? null;
  } catch (err) {
    return jsonNoStore(
      {
        ok: false,
        error: "UNAUTHENTICATED",
        detail: isLikelyNextAuthDecryptError(err) ? "SESSION_DECRYPT_FAILED" : "SESSION_READ_FAILED",
      },
      401
    );
  }

  const user = (session?.user ?? null) as SessionUser | null;
  if (!user?.id) return jsonNoStore({ ok: false, error: "UNAUTHENTICATED" }, 401);

  const userId = cleanStr(user.id);
  const email = user.email ?? null;
  const name = user.name ?? null;

  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: {
      tenantId: true,
      status: true,
      staffId: true,
      role: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const tenantIds = Array.from(
    new Set(memberships.map((m) => cleanStr(m.tenantId)).filter((x) => x.length > 0))
  );

  const tenants = tenantIds.length
    ? await prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true, slug: true, schoolCode: true, status: true },
      })
    : [];

  const tenantById = new Map<string, TenantLite>();
  for (const t of tenants) {
    tenantById.set(t.id, {
      id: t.id,
      name: t.name,
      slug: t.slug ?? null,
      schoolCode: t.schoolCode ?? null,
      status: (t.status ?? null) as any,
    });
  }

  const membershipsView = memberships.map((m) => {
    const tid = cleanStr(m.tenantId);
    const t = tenantById.get(tid) ?? null;
    const roleNameDb = m.role?.name ?? null;

    return {
      tenantId: tid || null,
      tenantName: t?.name ?? null,
      tenantSlug: t?.slug ?? null,
      schoolCode: t?.schoolCode ?? null,

      status: String(m.status ?? ""),
      staffId: m.staffId ?? null,

      roleName: roleNameDb,
      effectiveRole: roleNameDb ? effectiveRole(roleNameDb) : null,

      tenant: t,
      role: roleNameDb ? { name: roleNameDb } : null,
    };
  });

  const tenantId = cleanStr(user.tenantId) || null;

  if (!tenantId) {
    const activeMemberships = membershipsView.filter((m) => String(m.status) === "ACTIVE" && m.tenantId);
    const suggestedTenantId = activeMemberships.length === 1 ? activeMemberships[0].tenantId : null;

    return jsonNoStore(
      {
        ok: false,
        error: "TENANT_REQUIRED",
        userId,
        email,
        name,
        suggestedTenantId,
        memberships: membershipsView,
        user: {
          id: userId,
          email,
          name,
          tenantId: null,
          activeTenantId: null,
          roleName: null,
          effectiveRole: null,
          staffId: null,
          memberships: membershipsView,
        },
      },
      409
    );
  }

  const membership = memberships.find((m) => cleanStr(m.tenantId) === tenantId) ?? null;

  if (!membership) {
    return jsonNoStore(
      { ok: false, error: "TENANT_MEMBERSHIP_NOT_FOUND", tenantId, userId, memberships: membershipsView },
      403
    );
  }

  if (String(membership.status) !== "ACTIVE") {
    return jsonNoStore({ ok: false, error: "MEMBERSHIP_INACTIVE", tenantId, userId }, 403);
  }

  const tenant =
    tenantById.get(tenantId) ??
    (await prisma.tenant
      .findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, slug: true, schoolCode: true, status: true },
      })
      .then((t) =>
        t
          ? ({
              id: t.id,
              name: t.name,
              slug: t.slug ?? null,
              schoolCode: t.schoolCode ?? null,
              status: (t.status ?? null) as any,
            } as TenantLite)
          : null
      ));

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true, phoneNorm: true },
  });

  const roleNameDb = membership.role?.name ?? null;
  const eff = roleNameDb ? effectiveRole(roleNameDb) : null;
  const staffId = membership.staffId ?? null;

  const teacherProfile = await prisma.teacherProfile
    .findUnique({
      where: {
        teacherProfile_tenant_user_unique: { tenantId, userId },
      },
      select: {
        phase: true,
        classLevel: true,
        jhsAssignments: true,
        additionalDuties: true,
        phone: true,
      },
    })
    .catch(() => null);

  const teacherScopeRaw =
    teacherProfile
      ? {
          phase: teacherProfile.phase,
          classLevel: teacherProfile.classLevel,
          jhsAssignments: teacherProfile.jhsAssignments,
          additionalDuties: teacherProfile.additionalDuties,
          phone: teacherProfile.phone,
        }
      : null;

  const teacherScope = normalizeTeacherScopeForRead(teacherScopeRaw);

  return jsonNoStore(
    {
      ok: true as const,
      userId,
      email,
      name,

      tenantId,
      activeTenantId: tenantId,

      tenant: tenant ?? null,
      activeTenant: tenant ?? null,

      roleName: roleNameDb,
      effectiveRole: eff,

      staffId,
      teacherScope,

      phone: dbUser?.phone ?? null,
      phoneNorm: dbUser?.phoneNorm ?? null,

      memberships: membershipsView,

      user: {
        id: userId,
        email,
        name,
        tenantId,
        activeTenantId: tenantId,
        roleName: roleNameDb,
        effectiveRole: eff,
        staffId,
        memberships: membershipsView,
        tenant: tenant ?? null,
        activeTenant: tenant ?? null,
      },
    },
    200
  );
}