import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  isActiveSuperadminUser,
  PlatformFeatureControlError,
  readTeacherAttendanceFeatureState,
  setTeacherAttendanceFeatureState,
} from "@/lib/platformFeatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const ALLOWED_BODY_FIELDS = new Set(["enabled", "reason", "confirm"]);

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

function clean(value: unknown) {
  return String(value ?? "").trim();
}

async function requireSuperadmin(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: false });
  if (!auth.ok) return auth;

  const allowed = await isActiveSuperadminUser(auth.ctx.userId);
  if (!allowed) {
    return {
      ok: false as const,
      res: jsonNoStore(403, { ok: false, error: "FORBIDDEN" }),
    };
  }

  return auth;
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperadmin(req);
  if (!auth.ok) return auth.res;

  const state = await readTeacherAttendanceFeatureState();

  return jsonNoStore(200, {
    ok: true,
    state: {
      key: state.key,
      enabled: state.enabled,
      configured: state.configured,
      storageAvailable: state.storageAvailable,
      reason: state.reason,
      updatedAt: state.updatedAt,
    },
  });
}

export async function POST(req: NextRequest) {
  const reqId = randomUUID();
  const auth = await requireSuperadmin(req);
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

  if (typeof body.enabled !== "boolean") {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "BOOLEAN_ENABLED_REQUIRED",
    });
  }

  if (body.confirm !== true) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "EXPLICIT_CONFIRMATION_REQUIRED",
    });
  }

  const reason = clean(body.reason);
  if (reason.length < 12 || reason.length > 500) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "PLATFORM_FEATURE_REASON_INVALID",
    });
  }

  try {
    const result = await setTeacherAttendanceFeatureState({
      actorUserId: auth.ctx.userId,
      enabled: body.enabled,
      reason,
      ip: requestIp(req),
      userAgent: req.headers.get("user-agent"),
    });

    return jsonNoStore(200, {
      ok: true,
      reqId,
      outcome: result.outcome,
      state: result.state,
    });
  } catch (error) {
    if (error instanceof PlatformFeatureControlError) {
      return jsonNoStore(error.status, {
        ok: false,
        reqId,
        error: error.code,
      });
    }

    console.error("[SUPERADMIN_TEACHER_ATTENDANCE_FEATURE_ERROR]", {
      reqId,
      error,
    });

    return jsonNoStore(500, {
      ok: false,
      reqId,
      error: "PLATFORM_FEATURE_CHANGE_FAILED",
    });
  }
}
