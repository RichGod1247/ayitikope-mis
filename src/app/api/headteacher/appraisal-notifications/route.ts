import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import {
  listHeadteacherAppraisalMessages,
  markHeadteacherAppraisalMessageRead,
} from "@/lib/appraisals/headteacherAppraisalNotifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  notificationId?: unknown;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function jsonNoStore(status: number, payload: unknown) {
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

function safeError(error: unknown, reqId: string) {
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };

  const statusValue = Number(candidate?.status);
  const status =
    Number.isInteger(statusValue) && statusValue >= 400 && statusValue <= 499
      ? statusValue
      : 500;

  const rawCode = clean(candidate?.code) || clean(candidate?.message);
  const code = /^[A-Z0-9_]{3,140}$/.test(rawCode)
    ? rawCode
    : "FAILED_TO_MANAGE_APPRAISAL_MESSAGES";

  if (status >= 500) {
    console.error("[HEADTEACHER_APPRAISAL_MESSAGES_ERROR]", {
      reqId,
      error,
    });
  }

  return jsonNoStore(status, {
    ok: false,
    reqId,
    error: code,
  });
}

export async function GET(req: NextRequest) {
  const reqId = randomUUID();
  const ctx = await getHeadteacherApiContext();

  if (!ctx) {
    return jsonNoStore(401, {
      ok: false,
      reqId,
      error: "UNAUTHORIZED",
    });
  }

  const { searchParams } = new URL(req.url);
  const takeRaw = Number.parseInt(clean(searchParams.get("take")), 10);
  const take = Number.isFinite(takeRaw) ? Math.max(1, Math.min(50, takeRaw)) : 20;

  try {
    const inbox = await listHeadteacherAppraisalMessages({
      actorUserId: ctx.userId,
      take,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId,
      ...inbox,
    });
  } catch (error) {
    return safeError(error, reqId);
  }
}

export async function POST(req: NextRequest) {
  const reqId = randomUUID();
  const ctx = await getHeadteacherApiContext();

  if (!ctx) {
    return jsonNoStore(401, {
      ok: false,
      reqId,
      error: "UNAUTHORIZED",
    });
  }

  const contentType = clean(req.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("application/json")) {
    return jsonNoStore(415, {
      ok: false,
      reqId,
      error: "CONTENT_TYPE_MUST_BE_JSON",
    });
  }

  const body = (await req.json().catch(() => null)) as RequestBody | null;
  const notificationId = clean(body?.notificationId);

  if (!/^[0-9a-f-]{20,60}$/i.test(notificationId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "INVALID_APPRAISAL_NOTIFICATION_ID",
    });
  }

  try {
    const result = await markHeadteacherAppraisalMessageRead({
      actorUserId: ctx.userId,
      notificationId,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId,
      result,
    });
  } catch (error) {
    return safeError(error, reqId);
  }
}
