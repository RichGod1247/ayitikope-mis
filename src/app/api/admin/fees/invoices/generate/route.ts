// src/app/api/admin/fees/invoices/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";
import {
  FinanceError,
  generateInvoicesForClassroomFeeStructure,
} from "@/lib/finance/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

type Body = {
  tenantId?: string;
  classroomId?: string;
  feeStructureId?: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" }, 415);
  }

  let body: Body;

  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonNoStore({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const guard = assertNoTenantOverride(body?.tenantId ?? null, tenantId);
  if (!guard.ok) {
    return jsonNoStore({ ok: false, error: guard.error }, guard.status);
  }

  const classroomId = String(body?.classroomId ?? "").trim();
  const feeStructureId = String(body?.feeStructureId ?? "").trim();

  if (!classroomId || !feeStructureId) {
    return jsonNoStore(
      { ok: false, error: "classroomId and feeStructureId are required." },
      400
    );
  }

  try {
    const result = await generateInvoicesForClassroomFeeStructure({
      tenantId,
      classroomId,
      feeStructureId,
      actorUserId: auth.ctx.userId,
    });

    return jsonNoStore(result, 200);
  } catch (err) {
    if (err instanceof FinanceError) {
      return jsonNoStore({ ok: false, error: err.code }, err.status);
    }

    console.error("[ADMIN_FEE_INVOICES_GENERATE_ERROR]", err);

    return jsonNoStore(
      { ok: false, error: "FAILED_TO_GENERATE_INVOICES" },
      500
    );
  }
}