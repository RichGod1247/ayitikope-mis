// src/app/api/governance/notices/inbox/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  GovernanceNoticeError,
  listGovernanceNoticeInbox,
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

  const { searchParams } = new URL(req.url);

  try {
    const items = await listGovernanceNoticeInbox({
      actorUserId: auth.ctx.userId,
      input: {
        take: searchParams.get("take"),
        unreadOnly: searchParams.get("unreadOnly"),
        unacknowledgedOnly: searchParams.get("unacknowledgedOnly"),
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

    console.error("[GOVERNANCE_NOTICE_INBOX_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_LIST_GOVERNANCE_NOTICES",
    });
  }
}