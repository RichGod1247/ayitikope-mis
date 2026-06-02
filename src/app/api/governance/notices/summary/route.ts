// src/app/api/governance/notices/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  getGovernanceNoticeInboxSummary,
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

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: false,
  });

  if (!auth.ok) return auth.res;

  try {
    const summary = await getGovernanceNoticeInboxSummary({
      actorUserId: auth.ctx.userId,
    });

    return json(200, {
      ok: true,
      summary,
    });
  } catch (err) {
    if (err instanceof GovernanceNoticeError) {
      return json(err.status, { ok: false, error: err.code });
    }

    console.error("[GOVERNANCE_NOTICE_SUMMARY_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_LOAD_NOTICE_SUMMARY",
    });
  }
}