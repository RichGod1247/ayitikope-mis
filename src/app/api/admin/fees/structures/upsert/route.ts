// src/app/api/admin/fees/structures/upsert/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireTenantContext,
  assertTenantParamMatches,
  toHttpError,
} from "@/lib/server/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpsertBody = {
  tenantId?: string; // back-compat only
  id?: string; // optional: update by id
  name?: string;
  description?: string | null;
  term?: string;
  academicYear?: string;
  amountCedis?: string; // UI input: convert to pesewas
  isActive?: boolean;
};

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
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

function parseAmountToPesewas(amountStr: string): number | null {
  const trimmed = String(amountStr ?? "").trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/,/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  const pesewas = Math.round(parsed * 100);
  return pesewas >= 0 ? pesewas : null;
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireTenantContext();

    // role gate
    const m = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
      select: { status: true, role: { select: { name: true } } },
    });
    if (!m || m.status !== "ACTIVE" || !isAdminLike(m.role?.name ?? "")) {
      return jsonNoStore({ ok: false, error: "FORBIDDEN" }, 403);
    }

    const ct = req.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) {
      return jsonNoStore({ ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" }, 415);
    }

    const body = (await req.json().catch(() => ({}))) as UpsertBody;

    // Back-compat: tenantId may be sent, must match session
    const suppliedTenantId = body?.tenantId ? String(body.tenantId).trim() || null : null;
    assertTenantParamMatches(ctx.tenantId, suppliedTenantId);

    const tenantId = ctx.tenantId;

    const id = String(body.id ?? "").trim() || null;
    const name = String(body.name ?? "").trim();
    const term = String(body.term ?? "").trim();
    const academicYear = String(body.academicYear ?? "").trim();
    const description = String(body.description ?? "").trim() || null;
    const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

    if (!name) return jsonNoStore({ ok: false, error: "NAME_REQUIRED" }, 400);
    if (!term) return jsonNoStore({ ok: false, error: "TERM_REQUIRED" }, 400);
    if (!academicYear) return jsonNoStore({ ok: false, error: "ACADEMIC_YEAR_REQUIRED" }, 400);

    const amountPesewas = parseAmountToPesewas(String(body.amountCedis ?? ""));
    if (amountPesewas === null) {
      return jsonNoStore({ ok: false, error: "INVALID_AMOUNT" }, 400);
    }

    const db: any = prisma;

    // Update-by-id: verify tenant ownership first
    if (id) {
      const existing = await db.feeStructure.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!existing) return jsonNoStore({ ok: false, error: "NOT_FOUND" }, 404);

      const updated = await db.feeStructure.update({
        where: { id },
        data: { name, description, term, academicYear, amountPesewas, isActive },
      });

      return jsonNoStore({ ok: true, item: updated, created: false }, 200);
    }

    // Upsert-by-natural-key
    const found = await db.feeStructure.findFirst({
      where: { tenantId, name, term, academicYear },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (found?.id) {
      const updated = await db.feeStructure.update({
        where: { id: found.id },
        data: { description, amountPesewas, isActive },
      });

      return jsonNoStore({ ok: true, item: updated, created: false }, 200);
    }

    const created = await db.feeStructure.create({
      data: { tenantId, name, description, term, academicYear, amountPesewas, isActive },
    });

    return jsonNoStore({ ok: true, item: created, created: true }, 201);
  } catch (e) {
    console.error("[ADMIN_FEE_STRUCTURES_UPSERT_ERROR]", e);
    const { status, msg } = toHttpError(e);
    return jsonNoStore({ ok: false, error: msg }, status);
  }
}
