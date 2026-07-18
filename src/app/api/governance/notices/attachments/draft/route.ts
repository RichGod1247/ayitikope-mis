//src/app/api/governance/notices/attachments/draft/route.ts
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ALL_GOVERNANCE_ROLES,
  requireGovernanceApiContext,
} from "@/lib/governance/scope";
import {
  GovernanceNoticeAttachmentError,
  listGovernanceNoticeDraftAttachments,
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

export async function GET(req: NextRequest) {
  const reqId = randomUUID();

  const auth = await requireGovernanceApiContext(req, {
    allowedRoles: ALL_GOVERNANCE_ROLES,
  });

  if (!auth.ok) return auth.res;

  const draftKey = req.nextUrl.searchParams.get("draftKey");

  try {
    const result = await listGovernanceNoticeDraftAttachments({
      scope: auth.scope,
      actorUserId: auth.ctx.userId,
      draftKey,
    });

    return json(200, {
      ok: true,
      reqId,
      draftKey: result.draftKey,
      items: result.items.map((item) => ({
        id: item.id,
        displayFilename: item.displayFilename,
        extension: item.extension,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        sha256Hash: item.sha256Hash,
        confidential: item.confidential,
        recipientVisible: item.recipientVisible,
        status: item.status,
        scanStatus: item.scanStatus,
                malwareScanStatus: item.malwareScanStatus,
        malwareScanQueuedAt: item.malwareScanQueuedAt,
        malwareScanStartedAt: item.malwareScanStartedAt,
        malwareScannedAt: item.malwareScannedAt,
        uploadedAt: item.uploadedAt,
        verifiedAt: item.verifiedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      count: result.count,
      totalBytes: result.totalBytes,
      limits: result.limits,
    });
  } catch (error) {
    if (error instanceof GovernanceNoticeAttachmentError) {
      return json(error.status, {
        ok: false,
        reqId,
        error: error.code,
      });
    }

    console.error("[GOVERNANCE_NOTICE_ATTACHMENT_DRAFT_LIST_ERROR]", {
      reqId,
      error,
    });

    return json(500, {
      ok: false,
      reqId,
      error: "FAILED_TO_LIST_NOTICE_DRAFT_ATTACHMENTS",
    });
  }
}