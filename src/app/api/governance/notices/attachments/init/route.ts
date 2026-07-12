//src/app/api/governance/notices/attachments/init/route.ts
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ALL_GOVERNANCE_ROLES,
  requireGovernanceApiContext,
} from "@/lib/governance/scope";
import {
  GOVERNANCE_NOTICE_ATTACHMENT_POLICY,
  GovernanceNoticeAttachmentError,
  governanceNoticeAttachmentAllowedTypes,
  initializeGovernanceNoticeAttachment,
} from "@/lib/governance/noticeAttachments";

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

function objectBody(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const reqId = randomUUID();

  const auth = await requireGovernanceApiContext(req, {
    allowedRoles: ALL_GOVERNANCE_ROLES,
  });

  if (!auth.ok) return auth.res;

  const rawBody = await req.json().catch(() => null);
  const body = objectBody(rawBody);

  if (!body) {
    return json(400, {
      ok: false,
      reqId,
      error: "INVALID_JSON_BODY",
    });
  }

  try {
    const result = await initializeGovernanceNoticeAttachment({
      scope: auth.scope,
      actorUserId: auth.ctx.userId,
      input: body,
    });

    return json(result.reused ? 200 : 201, {
      ok: true,
      reqId,
      ...result,
      allowedTypes: governanceNoticeAttachmentAllowedTypes(),
      limits: GOVERNANCE_NOTICE_ATTACHMENT_POLICY,
    });
  } catch (error) {
    if (error instanceof GovernanceNoticeAttachmentError) {
      return json(error.status, {
        ok: false,
        reqId,
        error: error.code,
      });
    }

    console.error("[GOVERNANCE_NOTICE_ATTACHMENT_INIT_ERROR]", {
      reqId,
      error,
    });

    return json(500, {
      ok: false,
      reqId,
      error: "FAILED_TO_INITIALIZE_NOTICE_ATTACHMENT",
    });
  }
}
