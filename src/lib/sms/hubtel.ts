// src/lib/sms/hubtel.ts
// Hubtel SMS helper + logging into SmsLog

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const BrandName = ["AYITIKOPJHS", "AYITIKPRIM", "AYITIADMIN"] as const;
export type BrandName = (typeof BrandName)[number];

export type HubtelSendParams = {
  to: string;
  body: string;
  brand?: BrandName | string;
  tenantId?: string;
  actorId?: string;
  meta?: Record<string, unknown>;
};

export type HubtelSendResult = {
  ok: boolean;
  brand: string;
  from: string;
  to: string;
  testMode: boolean;
  providerResponse: unknown;
};

type HubtelBrandConfig = {
  clientId: string;
  clientSecret: string;
  from: string;
};

const SMS_PROVIDER = process.env.SMS_PROVIDER ?? "HUBTEL";
const HUBTEL_BASE_URL = process.env.HUBTEL_BASE_URL ?? "https://smsc.hubtel.com";

const SMS_TEST_MODE =
  (process.env.SMS_TEST_MODE ?? "false").toLowerCase() === "true";
const TEST_SMS_TO = process.env.TEST_SMS_TO ?? "";
const DEFAULT_BRAND: BrandName = "AYITIADMIN";

function normalizeGhanaPhone(raw: string): string {
  const digits = (raw || "").trim().replace(/[^\d]/g, "");
  if (!digits) return "";

  if (digits.startsWith("0")) return "233" + digits.slice(1);
  if (digits.startsWith("233")) return digits;
  if (digits.length === 9) return "233" + digits;

  return digits;
}

function getBrandConfig(brand?: string): HubtelBrandConfig {
  const b = (brand ?? DEFAULT_BRAND).toUpperCase();

  if (b === "AYITIKOPJHS") {
    return {
      clientId: process.env.HUBTEL_AYITIKOPJHS_CLIENT_ID ?? "",
      clientSecret: process.env.HUBTEL_AYITIKOPJHS_CLIENT_SECRET ?? "",
      from: process.env.HUBTEL_AYITIKOPJHS_FROM ?? "AyitikopJHS",
    };
  }

  if (b === "AYITIKPRIM") {
    return {
      clientId: process.env.HUBTEL_AYITIKPRIM_CLIENT_ID ?? "",
      clientSecret: process.env.HUBTEL_AYITIKPRIM_CLIENT_SECRET ?? "",
      from: process.env.HUBTEL_AYITIKPRIM_FROM ?? "AyitikPRIM",
    };
  }

  return {
    clientId: process.env.HUBTEL_AYITIADMIN_CLIENT_ID ?? "",
    clientSecret: process.env.HUBTEL_AYITIADMIN_CLIENT_SECRET ?? "",
    from: process.env.HUBTEL_AYITIADMIN_FROM ?? "AyitiAdmin",
  };
}

// Safer JSON storage for Prisma Json columns
function toJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return null;
  }
}

function getObjProp(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  return (obj as Record<string, unknown>)[key];
}

function getNumber(obj: unknown, key: string): number | null {
  const v = getObjProp(obj, key);
  return typeof v === "number" ? v : null;
}

function getString(obj: unknown, key: string): string | null {
  const v = getObjProp(obj, key);
  return typeof v === "string" ? v : null;
}

type SmsLogModel = {
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
};

/**
 * Log SMS attempt into SmsLog table.
 * Never throws; on error it only logs to console.
 * Uses a guarded access so sends never crash if smsLog model isn't present.
 */
async function logSmsAttempt(args: {
  to: string;
  from: string | null;
  body: string;
  brand: string | null;
  tenantId?: string;
  actorId?: string;
  providerMessageId?: string | null;
  providerStatus?: number | null;
  providerStatusDescription?: string | null;
  providerRaw?: unknown;
}): Promise<void> {
  try {
    const client = prisma as unknown as { smsLog?: SmsLogModel };
    const smsLog = client.smsLog;

    if (!smsLog || typeof smsLog.create !== "function") {
      console.warn(
        "[SMS_LOG_WARN] prisma.smsLog.create is not available. Skipping log."
      );
      return;
    }

    await smsLog.create({
      data: {
        to: args.to,
        from: args.from ?? undefined,
        body: args.body,
        brand: args.brand ?? undefined,
        tenantId: args.tenantId ?? undefined,
        actorId: args.actorId ?? undefined,
        providerMessageId: args.providerMessageId ?? undefined,
        providerStatus:
          typeof args.providerStatus === "number" ? args.providerStatus : undefined,
        providerStatusDescription: args.providerStatusDescription ?? undefined,
        providerRaw: toJsonValue(args.providerRaw) ?? undefined,
      },
    });
  } catch (err) {
    console.error("[SMS_LOG_ERROR]", err);
  }
}

/**
 * Main SMS sender using Hubtel query-string API.
 */
export async function sendViaHubtel(
  params: HubtelSendParams
): Promise<HubtelSendResult> {
  if (SMS_PROVIDER.toUpperCase() !== "HUBTEL") {
    throw new Error(
      `SMS_PROVIDER is set to '${SMS_PROVIDER}', but sendViaHubtel was called.`
    );
  }

  if (!HUBTEL_BASE_URL) {
    throw new Error("Hubtel base URL missing in environment.");
  }

  const brand = (params.brand ?? DEFAULT_BRAND).toString();
  const { clientId, clientSecret, from } = getBrandConfig(brand);

  if (!clientId || !clientSecret) {
    throw new Error(`Missing Hubtel credentials for brand ${brand}`);
  }

  const logicalTo = normalizeGhanaPhone(params.to);
  if (!logicalTo) throw new Error("Invalid 'to' phone number.");

  let actualTo = logicalTo;
  const testMode = SMS_TEST_MODE;

  if (SMS_TEST_MODE) {
    const testTo = normalizeGhanaPhone(TEST_SMS_TO);
    if (testTo) actualTo = testTo;
  }

  const url = new URL("/v1/messages/send", HUBTEL_BASE_URL);
  url.searchParams.set("From", from);
  url.searchParams.set("To", actualTo);
  url.searchParams.set("Content", params.body);
  url.searchParams.set("ClientId", clientId);
  url.searchParams.set("ClientSecret", clientSecret);

  let data: unknown = null;

  try {
    const res = await fetch(url.toString(), { method: "GET" });

    const text = await res.text();
    try {
      data = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      data = text || null;
    }

    const statusCode = getNumber(data, "status");
    const statusDesc = getString(data, "statusDescription");
    const messageId = getString(data, "messageId");

    await logSmsAttempt({
      to: actualTo,
      from,
      body: params.body,
      brand,
      tenantId: params.tenantId,
      actorId: params.actorId,
      providerMessageId: messageId,
      providerStatus: statusCode,
      providerStatusDescription: statusDesc,
      providerRaw: {
        httpStatus: res.status,
        testMode,
        logicalTo,
        meta: params.meta ?? null,
        hubtel: data,
      },
    });

    if (!res.ok) {
      throw new Error(`Hubtel error ${res.status}`);
    }

    return {
      ok: true,
      brand,
      from,
      to: actualTo,
      testMode,
      providerResponse: data,
    };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";

    await logSmsAttempt({
      to: actualTo,
      from,
      body: params.body,
      brand,
      tenantId: params.tenantId,
      actorId: params.actorId,
      providerMessageId: null,
      providerStatus: null,
      providerStatusDescription: "Network/Fetch error",
      providerRaw: {
        error: msg,
        testMode,
        logicalTo,
        meta: params.meta ?? null,
      },
    });

    throw err;
  }
}
