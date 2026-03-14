// src/lib/sms/hubtel.ts
// Hubtel SMS helper + logging into SmsLog (bank-grade logging)

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const BrandName = ["EDULIFEOS", "AYITIKOPJHS", "AYITIKPRIM", "AYITIADMIN"] as const;
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
  httpStatus?: number;
  providerStatus?: number | null;
  providerStatusDescription?: string | null;
  providerMessageId?: string | null;
};

type HubtelBrandConfig = {
  clientId: string;
  clientSecret: string;
  from: string;
};

const SMS_PROVIDER = process.env.SMS_PROVIDER ?? "HUBTEL";
const HUBTEL_BASE_URL = process.env.HUBTEL_BASE_URL ?? "https://smsc.hubtel.com";

const SMS_TEST_MODE = (process.env.SMS_TEST_MODE ?? "false").toLowerCase() === "true";
const TEST_SMS_TO = process.env.TEST_SMS_TO ?? "";

function normalizeBrandName(raw?: string | null): BrandName | null {
  const v = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (!v) return null;

  if (v === "EDULIFEOS" || v === "EDULIFE") return "EDULIFEOS";
  if (v === "AYITIKOPJHS") return "AYITIKOPJHS";
  if (v === "AYITIKPRIM") return "AYITIKPRIM";
  if (v === "AYITIADMIN") return "AYITIADMIN";

  return null;
}

const DEFAULT_BRAND: BrandName =
  normalizeBrandName(process.env.HUBTEL_DEFAULT_BRAND) ?? "EDULIFEOS";

function normalizeGhanaPhone(raw: string): string {
  const digits = (raw || "").trim().replace(/[^\d]/g, "");
  if (!digits) return "";

  if (digits.startsWith("0")) return "233" + digits.slice(1);
  if (digits.startsWith("233")) return digits;
  if (digits.length === 9) return "233" + digits;

  return digits;
}

function getBrandConfig(brand?: string): { brand: BrandName; config: HubtelBrandConfig } {
  const resolvedBrand = normalizeBrandName(brand) ?? DEFAULT_BRAND;

  if (resolvedBrand === "EDULIFEOS") {
    return {
      brand: resolvedBrand,
      config: {
        clientId: process.env.HUBTEL_EDULIFEOS_CLIENT_ID ?? "",
        clientSecret: process.env.HUBTEL_EDULIFEOS_CLIENT_SECRET ?? "",
        from: process.env.HUBTEL_EDULIFEOS_FROM ?? "EduLifeOS",
      },
    };
  }

  if (resolvedBrand === "AYITIKOPJHS") {
    return {
      brand: resolvedBrand,
      config: {
        clientId: process.env.HUBTEL_AYITIKOPJHS_CLIENT_ID ?? "",
        clientSecret: process.env.HUBTEL_AYITIKOPJHS_CLIENT_SECRET ?? "",
        from: process.env.HUBTEL_AYITIKOPJHS_FROM ?? "AyitikopJHS",
      },
    };
  }

  if (resolvedBrand === "AYITIKPRIM") {
    return {
      brand: resolvedBrand,
      config: {
        clientId: process.env.HUBTEL_AYITIKPRIM_CLIENT_ID ?? "",
        clientSecret: process.env.HUBTEL_AYITIKPRIM_CLIENT_SECRET ?? "",
        from: process.env.HUBTEL_AYITIKPRIM_FROM ?? "AyitikPRIM",
      },
    };
  }

  return {
    brand: "AYITIADMIN",
    config: {
      clientId: process.env.HUBTEL_AYITIADMIN_CLIENT_ID ?? "",
      clientSecret: process.env.HUBTEL_AYITIADMIN_CLIENT_SECRET ?? "",
      from: process.env.HUBTEL_AYITIADMIN_FROM ?? "AyitiAdmin",
    },
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return null;
  }
}

type SmsLogModel = {
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
};

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function pickString(data: unknown, keys: string[]): string | null {
  if (!isObj(data)) return null;
  for (const k of keys) {
    const v = (data as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickNumber(data: unknown, keys: string[]): number | null {
  if (!isObj(data)) return null;
  for (const k of keys) {
    const v = (data as Record<string, unknown>)[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

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
      console.warn("[SMS_LOG_WARN] prisma.smsLog.create is not available. Skipping log.");
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
        providerStatus: typeof args.providerStatus === "number" ? args.providerStatus : undefined,
        providerStatusDescription: args.providerStatusDescription ?? undefined,
        providerRaw: toJsonValue(args.providerRaw) ?? undefined,
      },
    });
  } catch (err) {
    console.error("[SMS_LOG_ERROR]", err);
  }
}

export async function sendViaHubtel(params: HubtelSendParams): Promise<HubtelSendResult> {
  if (SMS_PROVIDER.toUpperCase() !== "HUBTEL") {
    throw new Error(`SMS_PROVIDER is set to '${SMS_PROVIDER}', but sendViaHubtel was called.`);
  }
  if (!HUBTEL_BASE_URL) {
    throw new Error("Hubtel base URL missing in environment.");
  }

  const { brand, config } = getBrandConfig(params.brand);
  const { clientId, clientSecret, from } = config;

  if (!clientId || !clientSecret) {
    throw new Error(`Missing Hubtel credentials for brand ${brand}`);
  }

  const logicalTo = normalizeGhanaPhone(params.to);
  if (!logicalTo) {
    throw new Error("Invalid 'to' phone number.");
  }

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
    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const httpStatus = res.status;

    const text = await res.text();
    try {
      data = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      data = text || null;
    }

    const providerStatus =
      pickNumber(data, ["status", "Status", "code", "Code"]) ?? null;

    const providerStatusDescription =
      pickString(data, ["statusDescription", "StatusDescription", "message", "Message"]) ??
      (res.ok ? "HTTP_OK" : `HTTP_${httpStatus}`);

    const providerMessageId =
      pickString(data, ["messageId", "MessageId", "smsId", "SmsId"]) ?? null;

    await logSmsAttempt({
      to: actualTo,
      from,
      body: params.body,
      brand,
      tenantId: params.tenantId,
      actorId: params.actorId,
      providerMessageId,
      providerStatus: providerStatus ?? httpStatus,
      providerStatusDescription,
      providerRaw: {
        httpStatus,
        testMode,
        logicalTo,
        meta: params.meta ?? null,
        hubtel: data,
      },
    });

    if (!res.ok) {
      throw new Error(`Hubtel HTTP ${httpStatus}`);
    }

    return {
      ok: true,
      brand,
      from,
      to: actualTo,
      testMode,
      providerResponse: data,
      httpStatus,
      providerStatus,
      providerStatusDescription,
      providerMessageId,
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
      providerStatusDescription: "NETWORK_OR_FETCH_ERROR",
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