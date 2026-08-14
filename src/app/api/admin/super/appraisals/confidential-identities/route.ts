import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ConfidentialIdentityAuditError,
  listConfidentialIdentityAuditCycles,
  listConfidentialIdentityAuditRespondents,
  revealConfidentialRespondentIdentity,
} from "@/lib/appraisals/confidentialIdentityAudit";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const ALLOWED_BODY_FIELDS = new Set([
  "cycleId",
  "respondentKey",
  "purpose",
  "reason",
  "confirm",
]);

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

function requestIp(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

function safeError(error: unknown, reqId: string) {
  if (error instanceof ConfidentialIdentityAuditError) {
    return jsonNoStore(error.status, {
      ok: false,
      reqId,
      error: error.code,
    });
  }

  console.error("[SUPERADMIN_CONFIDENTIAL_IDENTITY_AUDIT_ERROR]", {
    reqId,
    error,
  });

  return jsonNoStore(500, {
    ok: false,
    reqId,
    error: "CONFIDENTIAL_IDENTITY_AUDIT_FAILED",
  });
}

async function requireAuthenticatedUser(req: NextRequest) {
  return requireApiUserContext(req, {
    requireTenant: false,
  });
}

export async function GET(req: NextRequest) {
  const reqId = randomUUID();
  const auth = await requireAuthenticatedUser(req);

  if (!auth.ok) return auth.res;

  try {
    const cycleId = clean(req.nextUrl.searchParams.get("cycleId"));

    if (!cycleId) {
      const cycles = await listConfidentialIdentityAuditCycles({
        actorUserId: auth.ctx.userId,
      });

      return jsonNoStore(200, {
        ok: true,
        reqId,
        cycles,
      });
    }

    const result = await listConfidentialIdentityAuditRespondents({
      actorUserId: auth.ctx.userId,
      cycleId,
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

export async function POST(req: NextRequest) {
  const reqId = randomUUID();
  const auth = await requireAuthenticatedUser(req);

  if (!auth.ok) return auth.res;

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonNoStore(415, {
      ok: false,
      reqId,
      error: "CONTENT_TYPE_MUST_BE_JSON",
    });
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return jsonNoStore(413, {
      ok: false,
      reqId,
      error: "REQUEST_BODY_TOO_LARGE",
    });
  }

  let body: Record<string, unknown>;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("INVALID_JSON_OBJECT");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "INVALID_JSON",
    });
  }

  const unexpected = Object.keys(body).filter(
    (key) => !ALLOWED_BODY_FIELDS.has(key),
  );

  if (unexpected.length) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "UNEXPECTED_BODY_FIELD",
    });
  }

  try {
    const result = await revealConfidentialRespondentIdentity({
      actorUserId: auth.ctx.userId,
      cycleId: clean(body.cycleId),
      respondentKey: clean(body.respondentKey),
      purpose: body.purpose,
      reason: body.reason,
      confirm: body.confirm,
      reqId,
      ip: requestIp(req),
      userAgent: req.headers.get("user-agent"),
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
