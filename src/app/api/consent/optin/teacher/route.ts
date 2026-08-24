import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { setAuthenticatedStaffEssentialAlerts } from "@/lib/essentialAlerts/enrollment";
import { requestIp } from "@/lib/essentialAlerts/publicPage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    userId?: string;
    tenantId?: string;
    actorId?: string;
  };

  // Legacy client identity fields are rejected rather than trusted.
  if (body.userId && body.userId !== auth.ctx.userId) {
    return json(403, { ok: false, error: "STAFF_SELF_SERVICE_ONLY" });
  }
  if (body.tenantId && body.tenantId !== auth.ctx.tenantId) {
    return json(403, { ok: false, error: "FORBIDDEN_TENANT_MISMATCH" });
  }
  if (body.actorId && body.actorId !== auth.ctx.userId) {
    return json(403, { ok: false, error: "ACTOR_OVERRIDE_FORBIDDEN" });
  }
  if (typeof body.enabled !== "boolean") {
    return json(400, { ok: false, error: "enabled (boolean) is required" });
  }

  try {
    const row = await setAuthenticatedStaffEssentialAlerts({
      tenantId: auth.ctx.tenantId,
      userId: auth.ctx.userId,
      actorUserId: auth.ctx.userId,
      enabled: body.enabled,
      ip: requestIp(req),
      userAgent: req.headers.get("user-agent"),
    });

    return json(200, {
      ok: true,
      essentialAlerts: {
        status: row.status,
        policyVersion: row.policyVersion,
        consentedAt: row.consentedAt?.toISOString() ?? null,
        optedOutAt: row.optedOutAt?.toISOString() ?? null,
      },
      legacySmsOptInChanged: false,
    });
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: unknown }).status) || 500
        : 500;
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "ESSENTIAL_ALERT_UPDATE_FAILED")
        : "ESSENTIAL_ALERT_UPDATE_FAILED";
    return json(status, { ok: false, error: code });
  }
}
