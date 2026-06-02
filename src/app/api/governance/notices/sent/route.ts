// src/app/api/governance/notices/sent/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  ALL_GOVERNANCE_ROLES,
  requireGovernanceApiContext,
} from "@/lib/governance/scope";
import {
  GovernanceNoticeError,
  listGovernanceSentNoticeAccountability,
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
  const auth = await requireGovernanceApiContext(req, {
    allowedRoles: ALL_GOVERNANCE_ROLES,
  });

  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(req.url);

  try {
    const items = await listGovernanceSentNoticeAccountability({
      scope: auth.scope,
      actorUserId: auth.ctx.userId,
      input: {
        caseId: searchParams.get("caseId"),
        take: searchParams.get("take"),
      },
    });

    return json(200, {
      ok: true,
      items,
      count: items.length,
    });
  } catch (err) {
    if (err instanceof GovernanceNoticeError) {
      return json(err.status, { ok: false, error: err.code });
    }

    console.error("[GOVERNANCE_SENT_NOTICE_ACCOUNTABILITY_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_LOAD_SENT_NOTICE_ACCOUNTABILITY",
    });
  }
}