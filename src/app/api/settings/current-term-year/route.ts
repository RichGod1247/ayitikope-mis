// src/app/api/settings/current-term-year/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

const VALID_TERMS = ["1st Term", "2nd Term", "3rd Term"] as const;
type Term = (typeof VALID_TERMS)[number];

function normalizeTerm(raw: unknown): Term | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;

  if (v === "1st term" || v === "term 1" || v === "term1" || v === "1" || v === "first term") return "1st Term";
  if (v === "2nd term" || v === "term 2" || v === "term2" || v === "2" || v === "second term") return "2nd Term";
  if (v === "3rd term" || v === "term 3" || v === "term3" || v === "3" || v === "third term") return "3rd Term";

  const exact = VALID_TERMS.find((t) => t.toLowerCase() === v);
  return exact ?? null;
}

function normalizeAcademicYear(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;

  // Accept 2025-2026 → normalize
  const dash = v.match(/^(\d{4})-(\d{4})$/);
  if (dash) return `${dash[1]}/${dash[2]}`;

  // Strict 2025/2026
  if (/^\d{4}\/\d{4}$/.test(v)) return v;

  return null;
}

async function requireTenantCtx() {
  const c = await requireServerUserContext({ requireTenant: true });
  return { userId: c.userId, tenantId: c.tenantId };
}

// Bank-grade rule: only privileged tenant members can set global tenant calendar.
// We intentionally implement this without trusting client claims.
async function assertCanManageTenantSettings(ctx: { userId: string; tenantId: string }) {
  const prismaAny = prisma as any;

  const membership = await prismaAny.membership?.findFirst?.({
    where: { userId: ctx.userId, tenantId: ctx.tenantId, status: "ACTIVE" },
    select: { role: true, roles: true }, // role/roles may differ in your schema
  });

  const roleLike: string[] = [];
  if (membership?.role && typeof membership.role === "string") roleLike.push(membership.role);
  if (Array.isArray(membership?.roles)) roleLike.push(...membership.roles.filter((x: any) => typeof x === "string"));

  const normalized = roleLike.map((r) => r.toUpperCase());

  const allowed = ["OWNER", "ADMIN", "HEADTEACHER", "SUPER_ADMIN"];
  const ok = normalized.some((r) => allowed.includes(r));

  if (!ok) {
    // If your schema doesn’t have role/roles yet, this will correctly deny writes until you wire RBAC.
    throw new Error("FORBIDDEN");
  }
}

/**
 * GET /api/settings/current-term-year
 * - Tenant-scoped (ctx.tenantId)
 * - No hardcoded term/year
 */
export async function GET(_req: NextRequest) {
  let ctx: { userId: string; tenantId: string };
  try {
    ctx = await requireTenantCtx();
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const row = await prisma.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
      select: { currentTerm: true, currentAcademicYear: true, updatedAt: true },
    });

    const term = normalizeTerm(row?.currentTerm);
    const academicYear = normalizeAcademicYear(row?.currentAcademicYear);

    const configured = Boolean(term && academicYear);

    return jsonNoStore(
      {
        ok: true,
        configured,
        term: term ?? null,
        academicYear: academicYear ?? null,
        updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[CURRENT_TERM_YEAR_GET_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load current term/year." }, { status: 500 });
  }
}

/**
 * POST /api/settings/current-term-year
 * - Tenant-scoped upsert
 * - Write requires privileged role (admin/headteacher/owner)
 * Body: { term: "2nd Term", academicYear: "2025/2026" }
 */
export async function POST(req: NextRequest) {
  let ctx: { userId: string; tenantId: string };
  try {
    ctx = await requireTenantCtx();
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    await assertCanManageTenantSettings(ctx);
  } catch (e: any) {
    if (String(e?.message) === "FORBIDDEN") {
      return jsonNoStore({ ok: false, error: "Forbidden." }, { status: 403 });
    }
    return jsonNoStore({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const term = normalizeTerm(body?.term);
  const academicYear = normalizeAcademicYear(body?.academicYear);

  if (!term) {
    return jsonNoStore({ ok: false, error: "Invalid term. Use 1st Term, 2nd Term, or 3rd Term." }, { status: 400 });
  }
  if (!academicYear) {
    return jsonNoStore({ ok: false, error: 'Invalid academicYear. Use format "YYYY/YYYY" (e.g., 2025/2026).' }, { status: 400 });
  }

  try {
    const saved = await prisma.tenantSettings.upsert({
      where: { tenantId: ctx.tenantId },
      update: { currentTerm: term, currentAcademicYear: academicYear },
      create: { tenantId: ctx.tenantId, currentTerm: term, currentAcademicYear: academicYear },
      select: { currentTerm: true, currentAcademicYear: true, updatedAt: true },
    });

    return jsonNoStore(
      {
        ok: true,
        term: normalizeTerm(saved.currentTerm),
        academicYear: normalizeAcademicYear(saved.currentAcademicYear),
        updatedAt: saved.updatedAt.toISOString(),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[CURRENT_TERM_YEAR_POST_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to save current term/year." }, { status: 500 });
  }
}
