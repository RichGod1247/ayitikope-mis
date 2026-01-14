// src/lib/sms.ts
import { prisma } from "@/lib/prisma";
import { sendViaHubtel, type BrandName } from "@/lib/sms/hubtel";

export type SMSProvider = "MOCK" | "HUBTEL";

export type SendParams = {
  tenantId: string;
  to: string;     // digits only, e.g. 23324xxxxxxx
  body: string;
  brand?: BrandName | string; // optional override
  actorId?: string;
  meta?: Record<string, any>;
};

function getProvider(): SMSProvider {
  const p = (process.env.SMS_PROVIDER ?? "MOCK").toUpperCase();
  return p === "HUBTEL" ? "HUBTEL" : "MOCK";
}

/**
 * Production-grade rule:
 * - No hacks like tenantId.endsWith('fl')
 * - Resolve brand by tenant.slug (until you add tenant.settings.smsBrand)
 */
async function resolveBrandForTenant(tenantId: string): Promise<BrandName> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  });

  const slug = (t?.slug ?? "").toLowerCase();

  if (slug.includes("jhs")) return "AYITIKOPJHS";
  if (slug.includes("prim")) return "AYITIKPRIM";
  return "AYITIADMIN";
}

async function sendViaMock(params: SendParams) {
  // In production, MOCK is unacceptable.
  if (process.env.NODE_ENV === "production") {
    throw new Error("SMS_PROVIDER_MOCK_NOT_ALLOWED_IN_PRODUCTION");
  }

  // Optional audit (keep if your schema has it)
  await prisma.sMSSendAudit.create({
    data: {
      tenantId: params.tenantId,
      toPhone: params.to,
    },
  });

  console.log("[SMS_MOCK]", {
    tenantId: params.tenantId,
    to: params.to,
    body: params.body,
  });
}

export async function sendSMS(params: SendParams) {
  const provider = getProvider();

  if (provider === "HUBTEL") {
    const brand = params.brand ?? (await resolveBrandForTenant(params.tenantId));
    return sendViaHubtel({
      to: params.to,
      body: params.body,
      brand,
      tenantId: params.tenantId,
      actorId: params.actorId,
      meta: params.meta,
    });
  }

  return sendViaMock(params);
}
