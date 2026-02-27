import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function parseBool(value: string | null): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function normalizeRoleName(role: unknown) {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z_]/g, "");
}

function roleEffective(role: unknown) {
  const r = normalizeRoleName(role);
  return r === "ADMIN" ? "SCHOOL_ADMIN" : r;
}

function isAdminLike(role: unknown) {
  const r = roleEffective(role);
  return r === "SCHOOL_ADMIN" || r.includes("HEAD") || r.includes("OWNER") || r.includes("SUPER");
}

async function requireAdminLike(tenantId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!m || m.status !== "ACTIVE") return { ok: false as const, status: 403, error: "Forbidden." };
  if (!isAdminLike(m.role?.name ?? "")) return { ok: false as const, status: 403, error: "Forbidden." };
  return { ok: true as const };
}

export async function GET(req: NextRequest) {
  // Auth + session tenant
  let ctx: { tenantId: string; userId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { tenantId: c.tenantId, userId: c.userId };
  } catch {
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const roleOk = await requireAdminLike(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  const url = new URL(req.url);

  // Back-compat: if tenantId is sent, it must match session tenant
  const guard = assertNoTenantOverride(url.searchParams.get("tenantId"), ctx.tenantId);
  if (!guard.ok) return jsonNoStore({ ok: false, error: guard.error }, guard.status);

  const term = (url.searchParams.get("term") ?? "").trim() || null;
  const academicYear = (url.searchParams.get("academicYear") ?? "").trim() || null;
  const onlyActive = parseBool(url.searchParams.get("onlyActive"));

  try {
    const where: any = { tenantId: ctx.tenantId };
    if (term) where.term = term;
    if (academicYear) where.academicYear = academicYear;
    if (typeof onlyActive === "boolean") where.isActive = onlyActive;

    const items = await prisma.feeStructure.findMany({
      where,
      orderBy: [{ academicYear: "desc" }, { term: "asc" }, { createdAt: "desc" }],
      take: 2000,
    });

    return jsonNoStore({ ok: true, items }, 200);
  } catch (err) {
    console.error("[ADMIN_FEE_STRUCTURES_LIST_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load fee structures. Please try again." }, 500);
  }
}
