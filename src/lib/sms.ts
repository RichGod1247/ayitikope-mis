// src/lib/sms.ts
import { prisma } from "@/lib/prisma";

type SendSmsArgs = {
  tenantId: string;
  actorId?: string | null;
  to: string;
  message: string;
  from?: string | null;
  template?: string | null;
  payload?: any;
};

function normalizeGhanaPhone(raw: string): string | null {
  const s = String(raw ?? "").trim().replace(/\s+/g, "");
  if (!s) return null;

  // Already international
  if (s.startsWith("+")) return s;

  // 233XXXXXXXXX or 233XXXXXXXX
  if (s.startsWith("233") && s.length >= 12) return `+${s}`;

  // 0XXXXXXXXX (10 digits)
  if (s.startsWith("0") && s.length === 10) return `+233${s.slice(1)}`;

  // fallback: return as-is (better than dropping)
  return s;
}

export async function sendSms(args: SendSmsArgs) {
  const to = normalizeGhanaPhone(args.to);
  const from = (args.from ?? process.env.HUBTEL_SENDER_ID ?? "EduLife OS").trim();
  const body = String(args.message ?? "").trim();

  const baseLog = {
    to: to ?? String(args.to ?? ""),
    from,
    body,
    brand: "hubtel",
    tenantId: args.tenantId,
    actorId: args.actorId ?? null,
  };

  // Missing essentials
  if (!to || !body) {
    await prisma.smsLog.create({
      data: {
        ...baseLog,
        providerStatusDescription: "SKIPPED: invalid phone or empty message",
      },
    });
    return { ok: false, error: "Invalid phone or empty message" };
  }

  const clientId = process.env.HUBTEL_CLIENT_ID;
  const clientSecret = process.env.HUBTEL_CLIENT_SECRET;

  // If you already use Basic Auth in your own Hubtel plumbing, set these instead.
  const basicUser = process.env.HUBTEL_BASIC_USER;
  const basicPass = process.env.HUBTEL_BASIC_PASS;

  if ((!clientId || !clientSecret) && (!basicUser || !basicPass)) {
    await prisma.smsLog.create({
      data: {
        ...baseLog,
        providerStatusDescription: "SKIPPED: missing Hubtel credentials",
      },
    });
    return { ok: false, error: "Missing Hubtel credentials" };
  }

  try {
    const url = new URL("https://api.hubtel.com/v1/messages/send");
    // Query-param auth style (common in Hubtel examples)
    if (clientId && clientSecret) {
      url.searchParams.set("ClientId", clientId);
      url.searchParams.set("ClientSecret", clientSecret);
    }
    url.searchParams.set("From", from);
    url.searchParams.set("To", to);
    url.searchParams.set("Content", body);

    const headers: Record<string, string> = {};
    // Optional Basic Auth path (if you use it)
    if (basicUser && basicPass) {
      const token = Buffer.from(`${basicUser}:${basicPass}`).toString("base64");
      headers["Authorization"] = `Basic ${token}`;
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      // some providers return plain text
    }

    await prisma.smsLog.create({
      data: {
        ...baseLog,
        providerStatus: res.status,
        providerStatusDescription: res.ok ? "SENT" : "FAILED",
        providerRaw: json ?? { raw: text },
      },
    });

    // Optional audit row (template/payload)
    if (args.template || args.payload) {
      await prisma.sMSSendAudit.create({
        data: {
          tenantId: args.tenantId,
          toPhone: to,
          template: args.template ?? null,
          payload: args.payload ?? null,
        },
      });
    }

    return { ok: res.ok, status: res.status, raw: json ?? text };
  } catch (e: any) {
    await prisma.smsLog.create({
      data: {
        ...baseLog,
        providerStatusDescription: `ERROR: ${e?.message ?? "unknown"}`,
      },
    });
    return { ok: false, error: e?.message ?? "unknown" };
  }
}
