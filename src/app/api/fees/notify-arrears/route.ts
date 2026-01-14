// src/app/api/admin/sms/templates/fees-arrears/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_FEES_ARREARS_TEMPLATE = [
  "Dear Parent/Guardian of {{studentName}},",
  "",
  "Our records show that fees of GHS {{amountDue}} for {{className}} ({{term}})",
  "are still outstanding as of {{dueDate}}.",
  "",
  "If you have already paid, kindly disregard this message.",
  "Otherwise, we encourage you to settle at your earliest convenience.",
  "",
  "Thank you,",
  "{{schoolName}}",
].join("\n");

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

async function requireAdminLike(tenantId: string, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    include: { role: true },
  });
  if (!membership) return { ok: false as const, status: 403, error: "Forbidden." };
  const roleName = String(membership.role?.name ?? "").toUpperCase();
  const isAdminLike = roleName.includes("ADMIN") || roleName.includes("HEAD");
  if (!isAdminLike) return { ok: false as const, status: 403, error: "Forbidden." };
  return { ok: true as const };
}

export async function GET(req: NextRequest) {
  // Auth + tenant
  let ctx: { tenantId: string; userId: string };
  try {
    const c = await requireServerUserContext({ redirectTo: "/auth/signin", requireTenant: true });
    ctx = { tenantId: c.tenantId, userId: c.userId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const roleOk = await requireAdminLike(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, { status: roleOk.status });

  // Optional tenantId param (must match)
  const url = new URL(req.url);
  const tenantIdParam = (url.searchParams.get("tenantId") ?? "").trim();
  if (tenantIdParam && tenantIdParam !== ctx.tenantId) {
    return jsonNoStore({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, name: true, settingsJson: true },
    });

    if (!tenant) {
      return jsonNoStore({ ok: false, error: "Tenant not found." }, { status: 404 });
    }

    const settings = (tenant.settingsJson as any) || {};
    const smsTemplates = (settings.smsTemplates as any) || {};
    const fromSettings = smsTemplates.feesArrears;

    const template =
      typeof fromSettings === "string" && fromSettings.trim().length > 0
        ? fromSettings
        : DEFAULT_FEES_ARREARS_TEMPLATE;

    return jsonNoStore({
      ok: true,
      tenantId: tenant.id,
      tenantName: tenant.name ?? "School",
      template,
      isDefault: template === DEFAULT_FEES_ARREARS_TEMPLATE,
    });
  } catch (err) {
    console.error("[FEES_TEMPLATE_GET_ERROR]", err);
    // still safe default for UI stability
    return jsonNoStore(
      {
        ok: true,
        tenantId: ctx.tenantId,
        tenantName: "School",
        template: DEFAULT_FEES_ARREARS_TEMPLATE,
        isDefault: true,
        note: "Internal error; using default template. Check server logs.",
      },
      { status: 200 }
    );
  }
}

export async function POST(req: NextRequest) {
  // Auth + tenant
  let ctx: { tenantId: string; userId: string };
  try {
    const c = await requireServerUserContext({ redirectTo: "/auth/signin", requireTenant: true });
    ctx = { tenantId: c.tenantId, userId: c.userId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const roleOk = await requireAdminLike(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, { status: roleOk.status });

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "Content-Type must be application/json." }, { status: 415 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonNoStore({ ok: false, error: "Invalid JSON body." }, { status: 400 });
    }

    const { tenantId: tenantIdRaw, template } = body as { tenantId?: string; template?: string };

    const tenantId = (tenantIdRaw ?? "").trim() || ctx.tenantId;
    if (tenantId !== ctx.tenantId) {
      return jsonNoStore({ ok: false, error: "Forbidden." }, { status: 403 });
    }

    if (typeof template !== "string" || !template.trim()) {
      return jsonNoStore({ ok: false, error: "Template text cannot be empty." }, { status: 400 });
    }

    if (template.length > 1200) {
      return jsonNoStore(
        {
          ok: false,
          error: "Template is too long. Keep it under 1200 characters for SMS compatibility.",
        },
        { status: 400 }
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, settingsJson: true },
    });

    if (!tenant) {
      return jsonNoStore({ ok: false, error: "Tenant not found." }, { status: 404 });
    }

    const existing = (tenant.settingsJson as any) || {};
    const existingSmsTemplates = (existing.smsTemplates as any) || {};

    const nextSettings = {
      ...existing,
      smsTemplates: {
        ...existingSmsTemplates,
        feesArrears: template.trim(),
      },
    };

    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { settingsJson: nextSettings as any },
      select: { id: true },
    });

    return jsonNoStore({
      ok: true,
      tenantId: ctx.tenantId,
      template: template.trim(),
    });
  } catch (err) {
    console.error("[FEES_TEMPLATE_SAVE_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to save fees arrears template." }, { status: 500 });
  }
}
