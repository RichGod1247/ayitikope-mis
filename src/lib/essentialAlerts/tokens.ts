import { createHmac, timingSafeEqual } from "crypto";
import {
  ESSENTIAL_ALERT_POLICY,
  type EssentialAlertRecipientKind,
  clean,
} from "@/lib/essentialAlerts/policy";

type EssentialAlertTokenPayload = {
  v: 1;
  scope: "ESSENTIAL_ALERTS";
  kind: EssentialAlertRecipientKind;
  tid: string;
  sid?: string;
  uid?: string;
  pf: string;
  pv: number;
  iat: number;
  exp: number;
};

export type EssentialAlertCompactInviteReference = {
  v: 1;
  kind: EssentialAlertRecipientKind;
  enrollmentId: string;
  invitationCount: number;
};

const COMPACT_SIGNATURE_BYTES = 16;

function secret() {
  const value = clean(
    process.env.CONSENT_TOKEN_SECRET || process.env.NEXTAUTH_SECRET,
  );
  if (!value) {
    throw new Error(
      "Missing CONSENT_TOKEN_SECRET (or NEXTAUTH_SECRET) env var.",
    );
  }
  return value;
}

function base64urlEncode(input: Buffer) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecode(value: string) {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function signPayload(payloadB64: string) {
  return base64urlEncode(
    createHmac("sha256", secret()).update(payloadB64, "utf8").digest(),
  );
}

function compactKindCode(kind: EssentialAlertRecipientKind) {
  return kind === "GUARDIAN" ? "g" : "s";
}

function compactKindFromCode(code: string): EssentialAlertRecipientKind | null {
  if (code === "g") return "GUARDIAN";
  if (code === "s") return "STAFF";
  return null;
}

function compactSignature(body: string) {
  return createHmac("sha256", secret())
    .update(`ESSENTIAL_ALERT_SHORT_V1|${body}`, "utf8")
    .digest()
    .subarray(0, COMPACT_SIGNATURE_BYTES);
}

export function essentialAlertPhoneFingerprint(input: {
  tenantId: string;
  kind: EssentialAlertRecipientKind;
  subjectId: string;
  phoneNorm: string;
}) {
  return createHmac("sha256", secret())
    .update(
      [
        "ESSENTIAL_ALERT_PHONE_V1",
        clean(input.tenantId),
        input.kind,
        clean(input.subjectId),
        clean(input.phoneNorm),
      ].join("|"),
      "utf8",
    )
    .digest("hex");
}

export function signEssentialAlertCompactInvite(input: {
  kind: EssentialAlertRecipientKind;
  enrollmentId: string;
  invitationCount: number;
}) {
  const enrollmentId = clean(input.enrollmentId);
  const invitationCount = Number(input.invitationCount);

  if (
    !/^[A-Za-z0-9_-]{8,120}$/.test(enrollmentId) ||
    !Number.isSafeInteger(invitationCount) ||
    invitationCount < 1
  ) {
    throw new Error("ESSENTIAL_ALERT_SHORT_LINK_INPUT_INVALID");
  }

  const kindCode = compactKindCode(input.kind);
  const countCode = invitationCount.toString(36);
  const body = `1.${kindCode}.${enrollmentId}.${countCode}`;
  const signature = base64urlEncode(compactSignature(body));

  return `${body}.${signature}`;
}

export function verifyEssentialAlertCompactInvite(
  code: unknown,
): EssentialAlertCompactInviteReference | null {
  const raw = clean(code);
  const parts = raw.split(".");
  if (parts.length !== 5) return null;

  const [version, kindCode, enrollmentId, countCode, signature] = parts;
  if (version !== "1" || !kindCode || !enrollmentId || !countCode || !signature) {
    return null;
  }

  const kind = compactKindFromCode(kindCode);
  if (!kind || !/^[A-Za-z0-9_-]{8,120}$/.test(enrollmentId)) return null;

  const invitationCount = Number.parseInt(countCode, 36);
  if (!Number.isSafeInteger(invitationCount) || invitationCount < 1) return null;

  let actualSignature: Buffer;
  try {
    actualSignature = base64urlDecode(signature);
  } catch {
    return null;
  }

  const body = `${version}.${kindCode}.${enrollmentId}.${countCode}`;
  const expectedSignature = compactSignature(body);

  if (actualSignature.length !== expectedSignature.length) return null;
  if (!timingSafeEqual(actualSignature, expectedSignature)) return null;

  return {
    v: 1,
    kind,
    enrollmentId,
    invitationCount,
  };
}

export function signEssentialAlertToken(input: {
  tenantId: string;
  kind: EssentialAlertRecipientKind;
  studentId?: string | null;
  userId?: string | null;
  phoneFingerprint: string;
  now?: Date;
  ttlDays?: number;
}) {
  const tenantId = clean(input.tenantId);
  const studentId = clean(input.studentId);
  const userId = clean(input.userId);
  const phoneFingerprint = clean(input.phoneFingerprint).toLowerCase();

  if (!tenantId || !/^[a-f0-9]{64}$/.test(phoneFingerprint)) {
    throw new Error("ESSENTIAL_ALERT_TOKEN_INPUT_INVALID");
  }

  if (
    (input.kind === "GUARDIAN" && (!studentId || userId)) ||
    (input.kind === "STAFF" && (!userId || studentId))
  ) {
    throw new Error("ESSENTIAL_ALERT_TOKEN_SUBJECT_INVALID");
  }

  const now = input.now ? new Date(input.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error("ESSENTIAL_ALERT_TOKEN_TIME_INVALID");
  }

  const ttlDays = Math.min(
    Math.max(
      Number(input.ttlDays ?? ESSENTIAL_ALERT_POLICY.invitationTtlDays) ||
        ESSENTIAL_ALERT_POLICY.invitationTtlDays,
      1,
    ),
    30,
  );

  const iat = Math.floor(now.getTime() / 1000);
  const payload: EssentialAlertTokenPayload = {
    v: 1,
    scope: "ESSENTIAL_ALERTS",
    kind: input.kind,
    tid: tenantId,
    ...(studentId ? { sid: studentId } : {}),
    ...(userId ? { uid: userId } : {}),
    pf: phoneFingerprint,
    pv: ESSENTIAL_ALERT_POLICY.version,
    iat,
    exp: iat + ttlDays * 86_400,
  };

  const payloadB64 = base64urlEncode(
    Buffer.from(JSON.stringify(payload), "utf8"),
  );
  return `${payloadB64}.${signPayload(payloadB64)}`;
}

export function verifyEssentialAlertToken(
  token: unknown,
): EssentialAlertTokenPayload | null {
  const raw = clean(token);
  const parts = raw.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signatureB64] = parts;
  if (!payloadB64 || !signatureB64) return null;

  const expected = signPayload(payloadB64);
  const actualBuffer = Buffer.from(signatureB64, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const p = payload as Partial<EssentialAlertTokenPayload>;
  if (
    p.v !== 1 ||
    p.scope !== "ESSENTIAL_ALERTS" ||
    (p.kind !== "GUARDIAN" && p.kind !== "STAFF") ||
    typeof p.tid !== "string" ||
    !p.tid.trim() ||
    typeof p.pf !== "string" ||
    !/^[a-f0-9]{64}$/.test(p.pf) ||
    p.pv !== ESSENTIAL_ALERT_POLICY.version ||
    typeof p.iat !== "number" ||
    !Number.isFinite(p.iat) ||
    typeof p.exp !== "number" ||
    !Number.isFinite(p.exp)
  ) {
    return null;
  }

  if (
    (p.kind === "GUARDIAN" &&
      (typeof p.sid !== "string" || !p.sid.trim() || p.uid)) ||
    (p.kind === "STAFF" &&
      (typeof p.uid !== "string" || !p.uid.trim() || p.sid))
  ) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (p.exp < now || p.iat > now + 300 || p.exp <= p.iat) return null;

  return {
    v: 1,
    scope: "ESSENTIAL_ALERTS",
    kind: p.kind,
    tid: p.tid.trim(),
    ...(p.sid ? { sid: p.sid.trim() } : {}),
    ...(p.uid ? { uid: p.uid.trim() } : {}),
    pf: p.pf,
    pv: p.pv,
    iat: p.iat,
    exp: p.exp,
  };
}

export type { EssentialAlertTokenPayload };
