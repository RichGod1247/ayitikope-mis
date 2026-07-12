//src/app/api/governance/notices/recipients/search/route.ts
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ALL_GOVERNANCE_ROLES,
  requireGovernanceApiContext,
} from "@/lib/governance/scope";
import {
  GovernanceNoticeRecipientSelectionError,
  searchGovernanceNoticeRecipients,
} from "@/lib/governance/noticeRecipientSelection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(req: NextRequest) {
  const reqId = randomUUID();

  const auth = await requireGovernanceApiContext(req, {
    allowedRoles: ALL_GOVERNANCE_ROLES,
  });

  if (!auth.ok) return auth.res;

  const searchParams = req.nextUrl.searchParams;

  try {
    const result = await searchGovernanceNoticeRecipients({
      scope: auth.scope,
      input: {
        q: searchParams.get("q"),
        role: searchParams.get("role"),
        tenantId: searchParams.get("tenantId"),
        sectorTarget: searchParams.get("sectorTarget"),
        take: searchParams.get("take"),
      },
    });

    return json(200, {
      ok: true,
      reqId,
      ...result,
    });
  } catch (error) {
    if (error instanceof GovernanceNoticeRecipientSelectionError) {
      return json(error.status, {
        ok: false,
        reqId,
        error: error.code,
      });
    }

    console.error("[GOVERNANCE_NOTICE_RECIPIENT_SEARCH_ERROR]", {
      reqId,
      error,
    });

    return json(500, {
      ok: false,
      reqId,
      error: "FAILED_TO_SEARCH_NOTICE_RECIPIENTS",
    });
  }
}
