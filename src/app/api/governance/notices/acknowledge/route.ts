// src/app/api/governance/notices/acknowledge/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  acknowledgeGovernanceNotice,
  GovernanceNoticeError,
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
  const auth = await requireApiUserContext(req, {
    requireTenant: false,
  });

  if (!auth.ok) return auth.res;

  const body = (await req.json().catch(() => null)) ?? {};

  try {
    const item = await acknowledgeGovernanceNotice({
      actorUserId: auth.ctx.userId,
      input: body,
      ip: ipFrom(req),
      userAgent: req.headers.get("user-agent"),
    });

    return json(200, { ok: true, item });
  } catch (err) {
    if (err instanceof GovernanceNoticeError) {
      return json(err.status, { ok: false, error: err.code });
    }

    console.error("[GOVERNANCE_NOTICE_ACK_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_ACKNOWLEDGE_GOVERNANCE_NOTICE",
    });
  }
}