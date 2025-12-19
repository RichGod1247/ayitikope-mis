// src/lib/sms/hubtel.ts
// Hubtel SMS helper + logging into SmsLog

import { prisma } from "@/lib/prisma";

export const BrandName = ["AYITIKOPJHS", "AYITIKPRIM", "AYITIADMIN"] as const;
export type BrandName = (typeof BrandName)[number];

export type HubtelSendParams = {
  to: string;
  body: string;
  brand?: BrandName | string;
  tenantId?: string;
  actorId?: string;
  meta?: Record<string, any>;
};

export type HubtelSendResult = {
  ok: boolean;
  brand: string;
  from: string;
  to: string;
  testMode: boolean;
  providerResponse: any;
};

type HubtelBrandConfig = {
  clientId: string;
  clientSecret: string;
  from: string;
};

const SMS_PROVIDER = process.env.SMS_PROVIDER ?? "HUBTEL";
const HUBTEL_BASE_URL =
  process.env.HUBTEL_BASE_URL ?? "https://smsc.hubtel.com";

const SMS_TEST_MODE =
  (process.env.SMS_TEST_MODE ?? "false").toLowerCase() === "true";
const TEST_SMS_TO = process.env.TEST_SMS_TO ?? "";
const DEFAULT_BRAND: BrandName = "AYITIADMIN";

function normalizeGhanaPhone(raw: string): string {
  let digits = (raw || "").trim().replace(/[^\d]/g, "");

  if (!digits) return "";

  if (digits.startsWith("0")) {
    // 024xxxxxxx -> 23324xxxxxxx
    return "233" + digits.slice(1);
  }
  if (digits.startsWith("233")) {
    return digits;
  }
  // e.g. 24xxxxxxx -> 23324xxxxxxx
  if (digits.length === 9) {
    return "233" + digits;
  }

  return digits;
}

function getBrandConfig(brand?: string): HubtelBrandConfig {
  const b = (brand ?? DEFAULT_BRAND).toUpperCase();

  if (b === "AYITIKOPJHS") {
    const clientId = process.env.HUBTEL_AYITIKOPJHS_CLIENT_ID ?? "";
    const clientSecret = process.env.HUBTEL_AYITIKOPJHS_CLIENT_SECRET ?? "";
    const from = process.env.HUBTEL_AYITIKOPJHS_FROM ?? "AyitikopJHS";
    return { clientId, clientSecret, from };
  }

  if (b === "AYITIKPRIM") {
    const clientId = process.env.HUBTEL_AYITIKPRIM_CLIENT_ID ?? "";
    const clientSecret = process.env.HUBTEL_AYITIKPRIM_CLIENT_SECRET ?? "";
    const from = process.env.HUBTEL_AYITIKPRIM_FROM ?? "AyitikPRIM";
    return { clientId, clientSecret, from };
  }

  // default: AYITIADMIN
  const clientId = process.env.HUBTEL_AYITIADMIN_CLIENT_ID ?? "";
  const clientSecret = process.env.HUBTEL_AYITIADMIN_CLIENT_SECRET ?? "";
  const from = process.env.HUBTEL_AYITIADMIN_FROM ?? "AyitiAdmin";
  return { clientId, clientSecret, from };
}

/**
 * Log SMS attempt into SmsLog table.
 * Never throws; on error it only logs to console.
 * We go through `any` so we don't depend on the Prisma client
 * having a strongly-typed `smsLog` property (avoids TS error 2339).
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
  providerRaw?: any;
}): Promise<void> {
  try {
    const client: any = prisma as any;
    if (!client.smsLog || typeof client.smsLog.create !== "function") {
      // If the model is missing for some reason, don't crash sends.
      console.warn(
        "[SMS_LOG_WARN] prisma.smsLog.create is not available. Skipping log."
      );
      return;
    }

    await client.smsLog.create({
      data: {
        to: args.to,
        from: args.from ?? undefined,
        body: args.body,
        brand: args.brand ?? undefined,
        tenantId: args.tenantId ?? undefined,
        actorId: args.actorId ?? undefined,
        providerMessageId: args.providerMessageId ?? undefined,
        providerStatus:
          typeof args.providerStatus === "number"
            ? args.providerStatus
            : undefined,
        providerStatusDescription:
          args.providerStatusDescription ?? undefined,
        providerRaw: args.providerRaw ?? undefined,
      },
    });
  } catch (err) {
    console.error("[SMS_LOG_ERROR]", err);
  }
}

/**
 * Main SMS sender using Hubtel query-string API.
 * This is the single backbone all EduLife OS SMS features use.
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
    console.error("[HUBTEL] HUBTEL_BASE_URL is missing.");
    throw new Error("Hubtel base URL missing in environment.");
  }

  const brand = (params.brand ?? DEFAULT_BRAND).toString();
  const { clientId, clientSecret, from } = getBrandConfig(brand);

  if (!clientId || !clientSecret) {
    console.error(
      "[HUBTEL] One or more brand env vars are missing for",
      brand
    );
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
    if (testTo) {
      actualTo = testTo;
    }
  }

  const url = new URL("/v1/messages/send", HUBTEL_BASE_URL);

  url.searchParams.set("From", from);
  url.searchParams.set("To", actualTo);
  url.searchParams.set("Content", params.body);
  url.searchParams.set("ClientId", clientId);
  url.searchParams.set("ClientSecret", clientSecret);

  let res: Response;
  let data: any = null;

  try {
    res = await fetch(url.toString(), {
      method: "GET",
    });

    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text || null;
    }

    const statusCode =
      typeof (data as any)?.status === "number" ? (data as any).status : null;
    const statusDesc =
      typeof (data as any)?.statusDescription === "string"
        ? (data as any).statusDescription
        : null;
    const messageId =
      typeof (data as any)?.messageId === "string"
        ? (data as any).messageId
        : null;

    // Always log the attempt (success or failure)
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
      console.error("[HUBTEL_SMS_ERROR]", res.status, data);
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
  } catch (err: any) {
    // In case fetch itself fails, log a best-effort entry too.
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
        error: err?.message ?? String(err),
        testMode,
        logicalTo,
        meta: params.meta ?? null,
      },
    });

    throw err;
  }
}
