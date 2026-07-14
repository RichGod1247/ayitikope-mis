//src/app/api/governance/notices/attachments/[attachmentId]/download/route.ts
import { randomUUID } from "crypto";
import {
  GovernanceOfficialNoticeAttachmentAccessAction,
  GovernanceOfficialNoticeAttachmentScanStatus,
  GovernanceOfficialNoticeAttachmentStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { resolveGovernanceScopeForContext } from "@/lib/governance/scope";
import { createPrivateR2DownloadUrl } from "@/lib/storage/privateR2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOWNLOAD_EXPIRY_SECONDS = 5 * 60;

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
      "Content-Security-Policy":
        "default-src 'none'; frame-ancestors 'none'",
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function requestIp(req: NextRequest) {
  const direct =
    clean(req.headers.get("cf-connecting-ip")) ||
    clean(req.headers.get("x-real-ip"));

  if (direct) return direct.slice(0, 160);

  const forwarded = clean(
    req.headers.get("x-forwarded-for"),
  );

  return (
    forwarded
      .split(",")
      .map((value) => value.trim())
      .find(Boolean)
      ?.slice(0, 160) ?? null
  );
}

function requestUserAgent(req: NextRequest) {
  return (
    clean(req.headers.get("user-agent")).slice(
      0,
      1000,
    ) || null
  );
}

async function writeDeniedAudit(args: {
  attachmentId: string;
  actorUserId: string;
  tenantId?: string | null;
  noticeId?: string | null;
  reason: string;
  reqId: string;
  ip: string | null;
  userAgent: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: args.tenantId ?? null,
        userId: args.actorUserId,
        action:
          "GOVERNANCE_NOTICE_ATTACHMENT_DOWNLOAD_DENIED",
        resource:
          "GovernanceOfficialNoticeAttachment",
        resourceId: args.attachmentId,
        ip: args.ip,
        userAgent: args.userAgent,
        metadata: {
          reqId: args.reqId,
          reason: args.reason,
          noticeId: args.noticeId ?? null,
        },
      },
    });
  } catch (error) {
    console.error(
      "[GOVERNANCE_NOTICE_ATTACHMENT_DENIED_AUDIT_ERROR]",
      {
        reqId: args.reqId,
        error,
      },
    );
  }
}

export async function POST(
  req: NextRequest,
  context: RouteContext,
) {
  const reqId = randomUUID();

  const auth = await requireApiUserContext(req, {
    requireTenant: false,
  });

  if (!auth.ok) return auth.res;

  const params = await Promise.resolve(
    context.params,
  );

  const attachmentId = clean(
    params?.attachmentId,
  );

  const ip = requestIp(req);
  const userAgent = requestUserAgent(req);

  if (!attachmentId) {
    return json(400, {
      ok: false,
      reqId,
      error: "ATTACHMENT_ID_REQUIRED",
    });
  }

  try {
    const attachment =
      await prisma.governanceOfficialNoticeAttachment.findUnique(
        {
          where: {
            id: attachmentId,
          },
          select: {
            id: true,
            noticeId: true,
            tenantId: true,
            zoneId: true,
            uploadedByUserId: true,
            displayFilename: true,
            mimeType: true,
            sizeBytes: true,
            objectKey: true,
            sha256Hash: true,
            status: true,
            scanStatus: true,
            sealedAt: true,
            deletedAt: true,
            notice: {
              select: {
                id: true,
                senderUserId: true,
                tenantId: true,
                zoneId: true,
                recipients: {
                  where: {
                    recipientUserId:
                      auth.ctx.userId,
                  },
                  take: 1,
                  select: {
                    id: true,
                    recipientUserId: true,
                  },
                },
              },
            },
          },
        },
      );

    if (
  !attachment ||
  !attachment.noticeId ||
  !attachment.notice ||
  attachment.status !==
    GovernanceOfficialNoticeAttachmentStatus.SEALED ||
  attachment.scanStatus !==
    GovernanceOfficialNoticeAttachmentScanStatus.CLEAN ||
  !attachment.sealedAt ||
  Boolean(attachment.deletedAt) ||
  !clean(attachment.objectKey)
) {
  await writeDeniedAudit({
    attachmentId,
    actorUserId: auth.ctx.userId,
    tenantId:
      attachment?.tenantId ?? null,
    noticeId:
      attachment?.noticeId ?? null,
    reason:
      "NOT_FOUND_OR_NOT_AVAILABLE",
    reqId,
    ip,
    userAgent,
  });

  return json(404, {
    ok: false,
    reqId,
    error:
      "NOTICE_ATTACHMENT_NOT_FOUND",
  });
}

const notice = attachment.notice;
    const recipient =
      notice.recipients[0] ?? null;

    const isSender =
      notice.senderUserId === auth.ctx.userId;

    const isExactRecipient =
      recipient?.recipientUserId ===
      auth.ctx.userId;

    let governanceScope:
      | Awaited<
          ReturnType<
            typeof resolveGovernanceScopeForContext
          >
        >
      | null = null;

    let isGovernanceScopeAuthorized = false;

    const targetTenantId =
      notice.tenantId ??
      attachment.tenantId ??
      null;

    const targetZoneId =
      notice.zoneId ??
      attachment.zoneId ??
      null;

    if (!isSender && !isExactRecipient) {
      governanceScope =
        await resolveGovernanceScopeForContext(
          auth.ctx,
        );

      isGovernanceScopeAuthorized = Boolean(
        governanceScope &&
          (governanceScope.isSuperAdmin ||
            Boolean(
              targetTenantId &&
                governanceScope.tenantIds.includes(
                  targetTenantId,
                ),
            ) ||
            Boolean(
              targetZoneId &&
                governanceScope.zoneIds.includes(
                  targetZoneId,
                ),
            )),
      );
    }

    if (
      !isSender &&
      !isExactRecipient &&
      !isGovernanceScopeAuthorized
    ) {
      await writeDeniedAudit({
        attachmentId,
        actorUserId: auth.ctx.userId,
        tenantId: targetTenantId,
        noticeId: notice.id,
        reason: "OUTSIDE_NOTICE_ACCESS_SCOPE",
        reqId,
        ip,
        userAgent,
      });

      return json(404, {
        ok: false,
        reqId,
        error:
          "NOTICE_ATTACHMENT_NOT_FOUND",
      });
    }

    const authorizationBasis = isSender
      ? "NOTICE_SENDER"
      : isExactRecipient
        ? "EXACT_NOTICE_RECIPIENT"
        : "CURRENT_GOVERNANCE_SCOPE";

    const signed =
      await createPrivateR2DownloadUrl({
        key: attachment.objectKey,
        downloadFilename:
          attachment.displayFilename,
        contentType: attachment.mimeType,
        expiresInSeconds:
          DOWNLOAD_EXPIRY_SECONDS,
      });

    /*
     * Successful access evidence is mandatory.
     *
     * Do not return the signed URL if the access
     * record cannot be persisted.
     */
    await prisma.governanceOfficialNoticeAttachmentAccess.create(
      {
        data: {
          attachmentId: attachment.id,
          noticeId: notice.id,
          recipientId: isExactRecipient
            ? recipient?.id ?? null
            : null,
          actorUserId: auth.ctx.userId,
          action:
            GovernanceOfficialNoticeAttachmentAccessAction.DOWNLOAD,
          ip,
          userAgent,
          metadata: {
            reqId,
            authorizationBasis,
            expiresInSeconds:
              signed.expiresInSeconds,
            targetTenantId,
            targetZoneId,
            sha256Hash:
              attachment.sha256Hash,
          },
        },
      },
    );

    const expiresAt = new Date(
      Date.now() +
        signed.expiresInSeconds * 1000,
    ).toISOString();

    return json(200, {
      ok: true,
      reqId,
      item: {
        attachmentId: attachment.id,
        noticeId: notice.id,
        displayFilename:
          attachment.displayFilename,
        mimeType: attachment.mimeType,
        sizeBytes: Number(
          attachment.sizeBytes,
        ),
        sha256Hash:
          attachment.sha256Hash,
        downloadUrl:
          signed.downloadUrl,
        expiresInSeconds:
          signed.expiresInSeconds,
        expiresAt,
        authorizationBasis,
      },
    });
  } catch (error) {
    console.error(
      "[GOVERNANCE_NOTICE_ATTACHMENT_DOWNLOAD_ERROR]",
      {
        reqId,
        attachmentId,
        actorUserId: auth.ctx.userId,
        error,
      },
    );

    return json(500, {
      ok: false,
      reqId,
      error:
        "FAILED_TO_CREATE_NOTICE_ATTACHMENT_DOWNLOAD",
    });
  }
}