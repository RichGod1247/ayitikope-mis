// src/app/api/admin/sms/broadcast/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendViaHubtel, BrandName } from "@/lib/sms/hubtel";
import {
  requireTenantContext,
  assertTenantParamMatches,
  toHttpError,
} from "@/lib/server/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mode = "initial" | "full";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function resolveMode(input?: string): Mode {
  return input === "full" ? "full" : "initial";
}

function resolveBrand(input?: string): (typeof BrandName)[number] {
  const raw = String(input ?? process.env.HUBTEL_DEFAULT_BRAND ?? "EDULIFEOS")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (raw === "EDULIFE") return "EDULIFEOS";
  if (BrandName.includes(raw as (typeof BrandName)[number])) {
    return raw as (typeof BrandName)[number];
  }

  return "EDULIFEOS";
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

    // Membership/role gate (explicit)
    const m = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
      select: { status: true, role: { select: { name: true } } },
    });

    if (!m || m.status !== "ACTIVE" || !isAdminLike(m.role?.name ?? "")) {
      return { ok: false as const, res: json(403, { ok: false, error: "FORBIDDEN" }) };
    }

    // Production hard-lock
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

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.res;

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      message?: string;
      brand?: string;
      mode?: Mode;
      tenantId?: string; // legacy/back-compat only
    };

    // Back-compat only: if tenantId is supplied, it MUST match session tenant.
    const suppliedTenantId = body?.tenantId ? String(body.tenantId).trim() || null : null;
    assertTenantParamMatches(gate.ctx.tenantId, suppliedTenantId);

    const message = String(body.message ?? "").trim();
    if (!message) return json(400, { ok: false, error: "MESSAGE_REQUIRED" });

    const mode = resolveMode(body.mode);
    const brand = resolveBrand(body.brand);

    const recipients = await prisma.notificationContact.findMany({
      where: { tenantId: gate.ctx.tenantId, isActive: true },
      orderBy: { id: "asc" },
      take: mode === "initial" ? 3 : 2000, // hard cap
    });

    if (!recipients.length) {
      return json(400, { ok: false, error: "NO_RECIPIENTS" });
    }

    const results: { recipient: string; to: string; ok: boolean; error?: string }[] = [];
    let successCount = 0;

    for (const r of recipients as any[]) {
      const to = String(r.phone ?? "").trim();
      const recipientName = String(r.name ?? "Unknown");

      if (!to) {
        results.push({ recipient: recipientName, to: "", ok: false, error: "MISSING_PHONE" });
        continue;
      }

      try {
        const res = await sendViaHubtel({
          to,
          body: message,
          brand,
          meta: {
            purpose: "admin-broadcast",
            tenantId: gate.ctx.tenantId,
            mode,
            recipientId: r.id ?? null,
          },
        });

        results.push({ recipient: recipientName, to: res.to, ok: true });
        successCount += 1;
      } catch (err: any) {
        console.error("[SMS_BROADCAST_ERROR]", recipientName, err);
        results.push({
          recipient: recipientName,
          to,
          ok: false,
          error: err?.message ?? "SMS_SEND_FAILED",
        });
      }
    }

    return json(200, { ok: true, mode, brand, count: recipients.length, successCount, results });
  } catch (e) {
    const { status, msg } = toHttpError(e);
    return json(status, { ok: false, error: msg });
  }
}