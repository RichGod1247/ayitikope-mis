// src/lib/sms/hubtel.ts
// Bank-grade Hubtel SMS helper.
// Single valid sender: EDULIFEOS.
// Legacy sender names were revoked and must not be routed.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const BrandName = ["EDULIFEOS"] as const;
export type BrandName = (typeof BrandName)[number];

export const HUBTEL_BRAND: BrandName = "EDULIFEOS";

export type HubtelSendParams = {
  to: string;
  body: string;
  brand?: BrandName | string | null; // Backward-compatible input; normalized to EDULIFEOS.
  tenantId?: string;
  actorId?: string;
  meta?: Record<string, unknown>;
};

export type HubtelSendResult = {
  ok: boolean;
  brand: BrandName;
  from: string;
  to: string;
  testMode: boolean;
  providerResponse: unknown;
  httpStatus?: number;
  providerStatus?: number | null;
  providerStatusDescription?: string | null;
  providerMessageId?: string | null;
  error?: string;
};

type SmsLogModel = {
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
};

const SMS_PROVIDER = (process.env.SMS_PROVIDER ?? "HUBTEL").trim().toUpperCase();
const HUBTEL_BASE_URL = process.env.HUBTEL_BASE_URL ?? "https://smsc.hubtel.com";
const SMS_TEST_MODE =
  (process.env.SMS_TEST_MODE ?? "false").trim().toLowerCase() === "true";
const TEST_SMS_TO = process.env.TEST_SMS_TO ?? "";

function normalizeGhanaPhone(raw: string): string {
  const digits = String(raw ?? "").trim().replace(/[^\d]/g, "");
  if (!digits) return "";

  if (digits.startsWith("0") && digits.length === 10) {
    return `233${digits.slice(1)}`;
  }

  if (digits.startsWith("233") && digits.length >= 12) return digits;
  if (digits.length === 9) return `233${digits}`;

  return digits;
}

function getEduLifeOsConfig() {
  const clientId = process.env.HUBTEL_EDULIFEOS_CLIENT_ID ?? "";
  const clientSecret = process.env.HUBTEL_EDULIFEOS_CLIENT_SECRET ?? "";
  const from = process.env.HUBTEL_EDULIFEOS_FROM ?? "EduLifeOS";

  return {
    brand: HUBTEL_BRAND,
    clientId,
    clientSecret,
    from,
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;

  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function responseIsEmpty(data: unknown): boolean {
  if (data === null || data === undefined) return true;
  if (typeof data === "string") return data.trim().length === 0;
  if (Array.isArray(data)) return data.length === 0;
  if (isObj(data)) return Object.keys(data).length === 0;
  return false;
}

function stringifyProvider(data: unknown): string {
  try {
    if (typeof data === "string") return data;
    return JSON.stringify(data);
  } catch {
    return "";
  }
}

function pickString(data: unknown, keys: string[]): string | null {
  if (!isObj(data)) return null;

  for (const key of keys) {
    const value = data[key];

    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return null;
}

function pickNumber(data: unknown, keys: string[]): number | null {
  if (!isObj(data)) return null;

  for (const key of keys) {
    const value = data[key];

    if (typeof value === "number" && Number.isFinite(value)) return value;

    if (typeof value === "string" && value.trim()) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }

  return null;
}

function providerAccepted(input: {
  httpOk: boolean;
  data: unknown;
  providerStatus: number | null;
  providerStatusDescription: string | null;
  providerMessageId: string | null;
}) {
  if (!input.httpOk) return false;
  if (responseIsEmpty(input.data)) return false;

  const rawText = `${input.providerStatusDescription ?? ""} ${stringifyProvider(
    input.data
  )}`.toLowerCase();

  const failureWords = [
    "fail",
    "failed",
    "error",
    "invalid",
    "unauthor",
    "forbid",
    "insufficient",
    "missing",
    "blank",
    "empty",
    "rejected",
    "denied",
  ];

  if (failureWords.some((word) => rawText.includes(word))) return false;

  if (input.providerMessageId) return true;

  if (typeof input.providerStatus === "number") {
    if (input.providerStatus === 0) return true;
    if (input.providerStatus >= 200 && input.providerStatus < 300) return true;
    if (input.providerStatus >= 400) return false;
  }

  const successWords = [
    "success",
    "accepted",
    "submitted",
    "queued",
    "sent",
    "ok",
    "delivered",
  ];

  if (successWords.some((word) => rawText.includes(word))) return true;

  // Final controlled fallback: HTTP was OK and Hubtel returned non-empty data.
  // This prevents blank dashboard rows from being treated as accepted.
  return true;
}

async function logSmsAttempt(args: {
  to: string;
  from: string | null;
  body: string;
  tenantId?: string;
  actorId?: string;
  providerMessageId?: string | null;
  providerStatus?: number | null;
  providerStatusDescription?: string | null;
  providerRaw?: unknown;
}) {
  try {
    const client = prisma as unknown as { smsLog?: SmsLogModel };
    const smsLog = client.smsLog;

    if (!smsLog || typeof smsLog.create !== "function") {
      console.warn("[SMS_LOG_WARN] prisma.smsLog.create is not available.");
      return;
    }

    await smsLog.create({
      data: {
        to: args.to,
        from: args.from ?? undefined,
        body: args.body,
        brand: HUBTEL_BRAND,
        tenantId: args.tenantId ?? undefined,
        actorId: args.actorId ?? undefined,
        providerMessageId: args.providerMessageId ?? undefined,
        providerStatus:
          typeof args.providerStatus === "number" ? args.providerStatus : undefined,
        providerStatusDescription: args.providerStatusDescription ?? undefined,
        providerRaw: toJsonValue(args.providerRaw),
      },
    });
  } catch (err) {
    console.error("[SMS_LOG_ERROR]", err);
  }
}

export async function sendViaHubtel(
  params: HubtelSendParams
): Promise<HubtelSendResult> {
  if (SMS_PROVIDER !== "HUBTEL") {
    throw new Error(
      `SMS_PROVIDER is set to '${SMS_PROVIDER}', but Hubtel SMS was requested.`
    );
  }

  const requestedBrand = String(params.brand ?? HUBTEL_BRAND)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (requestedBrand && requestedBrand !== HUBTEL_BRAND) {
    console.warn(
      `[SMS_BRAND_NORMALIZED] Requested revoked sender '${requestedBrand}', using EDULIFEOS instead.`
    );
  }

  const config = getEduLifeOsConfig();

  if (!config.clientId || !config.clientSecret) {
    throw new Error("Missing Hubtel EduLifeOS credentials.");
  }

  const logicalTo = normalizeGhanaPhone(params.to);

  if (!logicalTo) {
    throw new Error("Invalid recipient phone number.");
  }

  let actualTo = logicalTo;

  if (SMS_TEST_MODE) {
    const testTo = normalizeGhanaPhone(TEST_SMS_TO);
    if (!testTo) {
      throw new Error("SMS_TEST_MODE is true, but TEST_SMS_TO is not configured.");
    }
    actualTo = testTo;
  }

  const body = String(params.body ?? "").trim();

  if (!body) {
    throw new Error("SMS body is empty.");
  }

  const url = new URL("/v1/messages/send", HUBTEL_BASE_URL);
  url.searchParams.set("From", config.from);
  url.searchParams.set("To", actualTo);
  url.searchParams.set("Content", body);
  url.searchParams.set("ClientId", config.clientId);
  url.searchParams.set("ClientSecret", config.clientSecret);

  let data: unknown = null;
  let httpStatus = 0;

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

    httpStatus = res.status;

    const text = await res.text();

    try {
      data = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      data = text || null;
    }

    const providerStatus =
      pickNumber(data, [
        "status",
        "Status",
        "code",
        "Code",
        "responseCode",
        "ResponseCode",
      ]) ?? null;

    const providerStatusDescription =
      pickString(data, [
        "statusDescription",
        "StatusDescription",
        "message",
        "Message",
        "description",
        "Description",
        "statusText",
        "StatusText",
      ]) ?? (res.ok ? "HTTP_OK_WITH_UNRECOGNIZED_PROVIDER_RESPONSE" : `HTTP_${httpStatus}`);

    const providerMessageId =
      pickString(data, [
        "messageId",
        "MessageId",
        "smsId",
        "SmsId",
        "message_id",
        "sms_id",
        "transactionId",
        "TransactionId",
        "id",
        "Id",
      ]) ?? null;

    const accepted = providerAccepted({
      httpOk: res.ok,
      data,
      providerStatus,
      providerStatusDescription,
      providerMessageId,
    });

    const providerStatusForLog = providerStatus ?? httpStatus;
    const descriptionForLog = accepted
      ? providerStatusDescription
      : `NOT_ACCEPTED: ${providerStatusDescription}`;

    await logSmsAttempt({
      to: actualTo,
      from: config.from,
      body,
      tenantId: params.tenantId,
      actorId: params.actorId,
      providerMessageId,
      providerStatus: providerStatusForLog,
      providerStatusDescription: descriptionForLog,
      providerRaw: {
        httpStatus,
        accepted,
        testMode: SMS_TEST_MODE,
        logicalTo,
        actualTo,
        brand: HUBTEL_BRAND,
        requestedBrand,
        meta: params.meta ?? null,
        hubtel: data,
      },
    });

    return {
      ok: accepted,
      brand: HUBTEL_BRAND,
      from: config.from,
      to: actualTo,
      testMode: SMS_TEST_MODE,
      providerResponse: data,
      httpStatus,
      providerStatus,
      providerStatusDescription: descriptionForLog,
      providerMessageId,
      ...(accepted
        ? {}
        : {
            error: `Hubtel did not clearly accept SMS: ${providerStatusDescription}`,
          }),
    };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "Unknown Hubtel SMS error";

    await logSmsAttempt({
      to: actualTo || logicalTo,
      from: config.from,
      body,
      tenantId: params.tenantId,
      actorId: params.actorId,
      providerMessageId: null,
      providerStatus: httpStatus || null,
      providerStatusDescription: "NETWORK_OR_FETCH_ERROR",
      providerRaw: {
        error: msg,
        httpStatus,
        testMode: SMS_TEST_MODE,
        logicalTo,
        actualTo,
        brand: HUBTEL_BRAND,
        requestedBrand,
        meta: params.meta ?? null,
      },
    });

    throw err;
  }
}