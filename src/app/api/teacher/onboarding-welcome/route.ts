import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { markStaffOnboardingWelcome } from "@/lib/onboarding/staffWelcome";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  welcomeId?: string;
  action?: "SEEN" | "DISMISS";
};

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER"],
  });
  if (!auth.ok) return auth.res;

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const welcomeId = String(body.welcomeId ?? "").trim();
  const action = body.action === "DISMISS" ? "DISMISS" : body.action === "SEEN" ? "SEEN" : null;

  if (!welcomeId || !action) {
    return json(400, { ok: false, error: "INVALID_ONBOARDING_WELCOME_ACTION" });
  }

  const result = await markStaffOnboardingWelcome({
    welcomeId,
    userId: auth.ctx.userId,
    tenantId: auth.ctx.tenantId,
    action,
  });

  if (!result.found) {
    return json(404, { ok: false, error: "ONBOARDING_WELCOME_NOT_FOUND" });
  }

  return json(200, { ok: true, action });
}
