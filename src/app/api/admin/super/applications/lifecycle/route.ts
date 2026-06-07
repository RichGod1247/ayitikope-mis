// src/app/api/admin/super/applications/lifecycle/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { OnboardingApplicationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { getIpFromHeaders, getUserAgentFromHeaders } from "@/lib/rateLimit";

type Action = "MARK_UNDER_REVIEW" | "REJECT" | "ARCHIVE" | "REOPEN";

type Body = {
  applicationId?: string;
  action?: string;
  reason?: string;
};

class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeAction(value: unknown): Action | null {
  const action = clean(value).toUpperCase();

  if (action === "MARK_UNDER_REVIEW") return "MARK_UNDER_REVIEW";
  if (action === "REJECT") return "REJECT";
  if (action === "ARCHIVE") return "ARCHIVE";
  if (action === "REOPEN") return "REOPEN";

  return null;
}

function requireReason(value: unknown) {
  const reason = clean(value);

  if (reason.length < 10) {
    throw new ApiError(400, "REASON_TOO_SHORT");
  }

  if (reason.length > 1000) {
    throw new ApiError(400, "REASON_TOO_LONG");
  }

  return reason;
}

function nextStatusFor(action: Action): OnboardingApplicationStatus {
  if (action === "MARK_UNDER_REVIEW") return "UNDER_REVIEW";
  if (action === "REJECT") return "REJECTED";
  if (action === "ARCHIVE") return "ARCHIVED";
  return "PENDING";
}

function assertAllowedTransition(params: {
  action: Action;
  current: OnboardingApplicationStatus;
}) {
  const { action, current } = params;

  if (action === "MARK_UNDER_REVIEW" && current !== "PENDING") {
    throw new ApiError(409, "ONLY_PENDING_CAN_BE_MARKED_UNDER_REVIEW");
  }

  if (action === "REJECT" && current !== "PENDING" && current !== "UNDER_REVIEW") {
    throw new ApiError(409, "ONLY_PENDING_OR_REVIEW_APPLICATION_CAN_BE_REJECTED");
  }

  if (action === "ARCHIVE" && current === "CONVERTED") {
    throw new ApiError(409, "CONVERTED_APPLICATION_CANNOT_BE_ARCHIVED");
  }

  if (action === "REOPEN" && current !== "REJECTED" && current !== "ARCHIVED") {
    throw new ApiError(409, "ONLY_REJECTED_OR_ARCHIVED_APPLICATION_CAN_BE_REOPENED");
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const ip = getIpFromHeaders(req.headers);
  const userAgent = getUserAgentFromHeaders(req.headers);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const applicationId = clean(body.applicationId);
    const action = normalizeAction(body.action);
    const reason = requireReason(body.reason);

    if (!applicationId) {
      return json(400, { ok: false, error: "APPLICATION_ID_REQUIRED" });
    }

    if (!action) {
      return json(400, { ok: false, error: "INVALID_APPLICATION_LIFECYCLE_ACTION" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const app = await tx.onboardingApplication.findUnique({
        where: { id: applicationId },
        select: {
          id: true,
          type: true,
          status: true,
          emailNorm: true,
          schoolName: true,
          applicantName: true,
          governanceRole: true,
          zoneId: true,
        },
      });

      if (!app) {
        throw new ApiError(404, "APPLICATION_NOT_FOUND");
      }

      assertAllowedTransition({ action, current: app.status });

      const nextStatus = nextStatusFor(action);
      const now = new Date();

      const updated = await tx.onboardingApplication.update({
        where: { id: app.id },
        data: {
          status: nextStatus,
          reviewedByUserId: auth.ctx.userId,
          reviewedAt: now,
          reviewReason: reason,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: auth.ctx.userId,
          action: `ONBOARDING_APPLICATION_${action}`,
          resource: "OnboardingApplication",
          resourceId: app.id,
          ip,
          userAgent,
          metadata: {
            applicationId: app.id,
            type: app.type,
            previousStatus: app.status,
            nextStatus,
            emailNorm: app.emailNorm,
            schoolName: app.schoolName,
            applicantName: app.applicantName,
            governanceRole: app.governanceRole,
            zoneId: app.zoneId,
            reason,
          },
        },
      });

      return updated;
    });

    return json(200, {
      ok: true,
      item: {
        id: result.id,
        status: result.status,
        reviewedAt: result.reviewedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return json(err.status, { ok: false, error: err.code });
    }

    console.error("ONBOARDING_APPLICATION_LIFECYCLE_ERROR", err);
    return json(500, { ok: false, error: "APPLICATION_LIFECYCLE_FAILED" });
  }
}