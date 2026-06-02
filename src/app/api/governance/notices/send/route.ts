// src/app/api/governance/notices/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  ALL_GOVERNANCE_ROLES,
  requireGovernanceApiContext,
} from "@/lib/governance/scope";
import {
  GovernanceNoticeError,
  sendGovernanceOfficialNotice,
} from "@/lib/governance/notices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function ipFrom(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireGovernanceApiContext(req, {
    allowedRoles: ALL_GOVERNANCE_ROLES,
  });

  if (!auth.ok) return auth.res;

  const body = (await req.json().catch(() => null)) ?? {};

  try {
    const item = await sendGovernanceOfficialNotice({
      scope: auth.scope,
      actorUserId: auth.ctx.userId,
      input: body,
      ip: ipFrom(req),
      userAgent: req.headers.get("user-agent"),
    });

    return json(201, { ok: true, item });
  } catch (err) {
    if (err instanceof GovernanceNoticeError) {
      return json(err.status, { ok: false, error: err.code });
    }

    console.error("[GOVERNANCE_NOTICE_SEND_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_SEND_GOVERNANCE_NOTICE",
    });
  }
}