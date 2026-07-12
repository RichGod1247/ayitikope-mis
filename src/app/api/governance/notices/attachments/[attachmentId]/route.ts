//src/app/api/governance/notices/attachments/[attachmentId]/route.ts
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ALL_GOVERNANCE_ROLES,
  requireGovernanceApiContext,
} from "@/lib/governance/scope";
import {
  deleteGovernanceNoticeAttachmentDraft,
  GovernanceNoticeAttachmentError,
} from "@/lib/governance/noticeAttachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params:
    | Promise<{ attachmentId: string }>
    | { attachmentId: string };
};

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

export async function DELETE(
  req: NextRequest,
  context: RouteContext,
) {
  const reqId = randomUUID();

  const auth = await requireGovernanceApiContext(req, {
    allowedRoles: ALL_GOVERNANCE_ROLES,
  });

  if (!auth.ok) return auth.res;

  const params = await Promise.resolve(context.params);
  const attachmentId = String(params?.attachmentId ?? "").trim();

  try {
    const result = await deleteGovernanceNoticeAttachmentDraft({
      scope: auth.scope,
      actorUserId: auth.ctx.userId,
      input: { attachmentId },
    });

    return json(200, {
      ok: true,
      reqId,
      ...result,
    });
  } catch (error) {
    if (error instanceof GovernanceNoticeAttachmentError) {
      return json(error.status, {
        ok: false,
        reqId,
        error: error.code,
      });
    }

    console.error("[GOVERNANCE_NOTICE_ATTACHMENT_DELETE_ERROR]", {
      reqId,
      error,
    });

    return json(500, {
      ok: false,
      reqId,
      error: "FAILED_TO_DELETE_NOTICE_ATTACHMENT",
    });
  }
}
