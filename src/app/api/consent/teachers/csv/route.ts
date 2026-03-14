// src/app/api/consent/teachers/csv/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"]);

function roleUpper(v: unknown): string {
  return effectiveRole(v).trim().toUpperCase();
}

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Record<string, unknown>[], headerOrder: string[]): string {
  const header = headerOrder.join(",");
  const lines = rows.map((r) => headerOrder.map((k) => csvEscape(r[k])).join(","));
  return [header, ...lines].join("\n");
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
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const roleName = roleUpper(membership.role?.name ?? ctx.roleName);
  if (!ALLOWED_ROLES.has(roleName)) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN_ROLE" }, { status: 403 });
  }

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
    orderBy: { userId: "asc" },
  });

  const userMap = new Map<
    string,
    { id: string; name: string | null; email: string | null; smsOptIn: boolean | null }
  >();

  for (const m of memberships) {
    if (m.user) userMap.set(m.user.id, m.user);
  }

  const users = Array.from(userMap.values());

  const rows = users.map((u) => ({
    userId: u.id,
    name: u.name ?? "",
    email: u.email ?? "",
    smsOptIn: u.smsOptIn ? "Yes" : "No",
  }));

  const headerOrder = ["userId", "name", "email", "smsOptIn"];
  const csv = toCsv(rows, headerOrder);
  const filename = `teachers-smsoptin-${ctx.tenantId}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}