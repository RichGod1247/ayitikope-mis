// src/lib/sms.ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendViaHubtel } from "@/lib/sms/hubtel";

type SendSmsArgs = {
  tenantId: string;
  actorId?: string | null;
  to: string;
  message: string;
  from?: string | null; // kept for compatibility, normalized to EduLifeOS
  template?: string | null;
  payload?: unknown;
};

function normalizeGhanaPhone(raw: string): string | null {
  const s = String(raw ?? "").trim().replace(/\s+/g, "");
  if (!s) return null;

  if (s.startsWith("+")) return s;
  if (s.startsWith("233") && s.length >= 12) return `+${s}`;
  if (s.startsWith("0") && s.length === 10) return `+233${s.slice(1)}`;

  return s;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;

  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

export async function sendSms(args: SendSmsArgs) {
  const to = normalizeGhanaPhone(args.to);
  const body = String(args.message ?? "").trim();
  const fallbackFrom = process.env.HUBTEL_EDULIFEOS_FROM ?? "EduLifeOS";

  if (!to || !body) {
    await prisma.smsLog.create({
      data: {
        to: to ?? String(args.to ?? ""),
        from: fallbackFrom,
        body,
        brand: "EDULIFEOS",
        tenantId: args.tenantId,
        actorId: args.actorId ?? null,
        providerStatusDescription: "SKIPPED: invalid phone or empty message",
      },
    });

    return { ok: false, error: "Invalid phone or empty message" };
  }

  try {
    const result = await sendViaHubtel({
      to,
      body,
      brand: "EDULIFEOS",
      tenantId: args.tenantId,
      actorId: args.actorId ?? undefined,
      meta: {
        template: args.template ?? null,
        payload: args.payload ?? null,
        caller: "src/lib/sms.ts",
        requestedFrom: args.from ?? null,
        normalizedBrand: "EDULIFEOS",
      },
    });

    if (args.template || args.payload !== undefined) {
      const auditPayload = toJsonValue(args.payload);

      await prisma.sMSSendAudit.create({
        data: {
          tenantId: args.tenantId,
          toPhone: to,
          template: args.template ?? null,
          ...(auditPayload !== undefined ? { payload: auditPayload } : {}),
        },
      });
    }

    return {
      ok: result.ok,
      status: result.httpStatus ?? result.providerStatus ?? 200,
      raw: result.providerResponse,
      brand: result.brand,
      from: result.from,
      to: result.to,
      testMode: result.testMode,
      providerStatusDescription: result.providerStatusDescription,
      providerMessageId: result.providerMessageId,
      error: result.error,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    return {
      ok: false,
      error: msg,
      brand: "EDULIFEOS",
      to,
    };
  }
}