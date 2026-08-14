import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  getGovernanceNoticeInboxSummary,
  GovernanceNoticeError,
} from "@/lib/governance/notices";
import { getHeadteacherAppraisalMessageSummary } from "@/lib/appraisals/headteacherAppraisalNotifications";

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
  const auth = await requireApiUserContext(req, {
    requireTenant: false,
  });

  if (!auth.ok) return auth.res;

  try {
    const [summary, appraisal] = await Promise.all([
      getGovernanceNoticeInboxSummary({
        actorUserId: auth.ctx.userId,
      }),
      getHeadteacherAppraisalMessageSummary({
        actorUserId: auth.ctx.userId,
      }),
    ]);

    return json(200, {
      ok: true,
      summary: {
        ...summary,
        appraisal,
      },
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
