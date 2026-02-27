// src/app/api/admin/sms/resend/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendViaHubtel, BrandName } from "@/lib/sms/hubtel";
import { requireTenantContext, toHttpError } from "@/lib/server/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
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

function effectiveRole(role: unknown) {
  const r = normalizeRoleName(role);
  if (r === "ADMIN") return "SCHOOL_ADMIN";
  if (r === "HEADMASTER") return "HEADTEACHER";
  return r;
}

function isAdminLike(role: unknown) {
  const r = effectiveRole(role);
  return r === "SCHOOL_ADMIN" || r === "HEADTEACHER" || r.includes("OWNER") || r.includes("SUPER");
}

async function requireAdmin(req: NextRequest) {
  try {
    const ctx = await requireTenantContext();

    const m = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
      select: { status: true, role: { select: { name: true } } },
    });

    if (!m || m.status !== "ACTIVE" || !isAdminLike(m.role?.name ?? "")) {
      return { ok: false as const, res: json(403, { ok: false, error: "FORBIDDEN" }) };
    }

    if (process.env.NODE_ENV === "production") {
      const key = req.headers.get("x-admin-key") || "";
      if (!process.env.ADMIN_DASHBOARD_KEY || key !== process.env.ADMIN_DASHBOARD_KEY) {
        return { ok: false as const, res: json(401, { ok: false, error: "UNAUTHORIZED" }) };
      }
    }

    return { ok: true as const, ctx };
  } catch {
    return { ok: false as const, res: json(401, { ok: false, error: "UNAUTHORIZED" }) };
  }
}

function resolveBrandFromLog(logBrand?: string | null): string {
  if (!logBrand) return "AYITIADMIN";
  const upper = logBrand.toUpperCase();
  if (BrandName.includes(upper as (typeof BrandName)[number])) return upper;
  return "AYITIADMIN";
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.res;

  try {
    const idNum = Number.parseInt(params.id, 10);
    if (Number.isNaN(idNum)) return json(400, { ok: false, error: "INVALID_SMS_LOG_ID" });

    const log = (await (prisma as any).smsLog.findFirst({
      where: { id: idNum, tenantId: gate.ctx.tenantId },
    })) as any | null;

    if (!log) return json(404, { ok: false, error: `SMS_LOG_NOT_FOUND` });

    if (!log.to || !log.body) {
      return json(400, { ok: false, error: "LOG_MISSING_TO_OR_BODY" });
    }

    const brand = resolveBrandFromLog(log.brand);

    const originalMeta = log.meta ?? log.providerMeta ?? (log.providerRaw && log.providerRaw.meta) ?? {};
    const mergedMeta = {
      ...(originalMeta || {}),
      purpose: (originalMeta && originalMeta.purpose) || "resend-from-log",
      resendOfId: idNum,
      tenantId: gate.ctx.tenantId,
    };

    const result = await sendViaHubtel({ to: log.to, body: log.body, brand, meta: mergedMeta });

    return json(200, {
      ok: true,
      resendOfId: idNum,
      brand,
      to: result.to,
      providerResponse: result.providerResponse,
    });
  } catch (e) {
    const { status, msg } = toHttpError(e);
    return json(status, { ok: false, error: msg });
  }
}
