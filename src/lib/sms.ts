// src/lib/sms.ts
import { prisma } from '@/lib/prisma';

export type SMSProvider = 'MOCK' | 'HUBTEL';

type SendParams = {
  tenantId: string;
  to: string;           // E.164 without leading +, e.g., 233542516903
  body: string;
  senderId?: string;    // optional override; otherwise we map by tenant
};

function getProvider(): SMSProvider {
  const p = (process.env.SMS_PROVIDER || 'MOCK').toUpperCase();
  return (p === 'HUBTEL' ? 'HUBTEL' : 'MOCK');
}

/**
 * Map tenant -> Sender ID
 * Adjust this as you add more tenants or a Tenant.settings config.
 */
function pickSenderIdForTenant(tenantId: string): string {
  // Example hard-map for now. You can switch to slug-based later:
  // (await prisma.tenant.findUnique({select:{slug:true}})) and map on slug
  if (tenantId && tenantId.endsWith('fl')) {
    // your current test tenant—use AyitikopJHS by default
    return 'AyitikopJHS';
  }
  return process.env.HUBTEL_SENDER_ID || 'AyitikopJHS';
}

function credsForSender(senderId: string): { clientId: string; clientSecret: string } {
  const key = senderId.toUpperCase();
  const envId =
    process.env[`HUBTEL_CLIENT_ID_${key}`] ||
    process.env.HUBTEL_CLIENT_ID ||
    '';
  const envSecret =
    process.env[`HUBTEL_CLIENT_SECRET_${key}`] ||
    process.env.HUBTEL_CLIENT_SECRET ||
    '';

  if (!envId || !envSecret) {
    throw new Error(`Missing Hubtel credentials for senderId=${senderId}`);
  }
  return { clientId: envId, clientSecret: envSecret };
}

async function sendViaHubtel(params: SendParams) {
  const base = process.env.HUBTEL_BASE_URL || 'https://smsc.hubtel.com/v1/messages/send';
  const senderId = params.senderId || pickSenderIdForTenant(params.tenantId);
  const { clientId, clientSecret } = credsForSender(senderId);

  // Build the querystring URL
  const u = new URL(base);
  u.searchParams.set('clientid', clientId);
  u.searchParams.set('clientsecret', clientSecret);
  u.searchParams.set('from', senderId);
  u.searchParams.set('to', params.to);
  u.searchParams.set('content', params.body);

  let ok = false;
  let error: string | null = null;

  try {
    const rsp = await fetch(u.toString(), { method: 'GET' });
    // Hubtel's smsc endpoint often returns 200 OK even for logical errors; parse text
    const text = await rsp.text();
    if (!rsp.ok) {
      ok = false;
      error = `HTTP ${rsp.status} ${rsp.statusText}: ${text}`;
    } else {
      // Heuristic: if the gateway returns something other than a clean success token,
      // you can tighten this with Hubtel's exact response shape for your account.
      ok = true;
      // Optional: parse JSON if your account returns JSON
      // try { const j = JSON.parse(text); /* inspect j */ } catch {}
    }
  } catch (e: any) {
    ok = false;
    error = e?.message || 'Network error';
  }

  // Always audit
  await prisma.sMSSendAudit.create({
    data: {
      tenantId: params.tenantId,
      toPhone: params.to,
      // If you later add columns for messageBody / ok / error, record them here
      // messageBody: params.body,
      // ok,
      // error,
    },
  });

  if (!ok) {
    throw new Error(error || 'Hubtel send failed');
  }
}

async function sendViaMock(params: SendParams) {
  // Simulate a send and audit
  await prisma.sMSSendAudit.create({
    data: {
      tenantId: params.tenantId,
      toPhone: params.to,
    },
  });
}

export async function sendSMS(params: SendParams) {
  const provider = getProvider();
  if (provider === 'HUBTEL') {
    return sendViaHubtel(params);
  }
  return sendViaMock(params);
}
