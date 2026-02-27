// src/lib/email/sendEmail.ts
export type SendEmailArgs = {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
  replyTo?: string | null;
  meta?: Record<string, unknown>;
};

export type SendEmailResult = {
  ok: boolean;
  provider: "RESEND" | "DISABLED";
  to: string;
  testMode: boolean;
  providerResponse?: unknown;
  error?: string;
};

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function isEmailLike(v: string) {
  return v.includes("@");
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const toRaw = cleanStr(args.to);
  const subject = cleanStr(args.subject);
  const text = cleanStr(args.text);
  const html = args.html ? String(args.html) : null;

  const testMode = (process.env.EMAIL_TEST_MODE ?? "false").toLowerCase() === "true";
  const testTo = cleanStr(process.env.EMAIL_TEST_TO || "");

  let to = toRaw;
  if (testMode && testTo) to = testTo;

  if (!to || !isEmailLike(to) || !subject || !text) {
    return {
      ok: false,
      provider: "DISABLED",
      to,
      testMode,
      error: "INVALID_EMAIL_PAYLOAD",
    };
  }

  const apiKey = cleanStr(process.env.RESEND_API_KEY || "");
  const from = cleanStr(process.env.EMAIL_FROM || "");
  const replyTo = cleanStr(args.replyTo || process.env.EMAIL_REPLY_TO || "");

  if (!apiKey || !from) {
    return {
      ok: false,
      provider: "DISABLED",
      to,
      testMode,
      error: "EMAIL_NOT_CONFIGURED",
    };
  }

  try {
    const payload: any = {
      from,
      to: [to],
      subject,
      text,
    };
    if (html) payload.html = html;
    if (replyTo) payload.reply_to = replyTo;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const body = await r.json().catch(() => ({} as any));

    if (!r.ok) {
      return {
        ok: false,
        provider: "RESEND",
        to,
        testMode,
        providerResponse: body,
        error: `HTTP_${r.status}`,
      };
    }

    return {
      ok: true,
      provider: "RESEND",
      to,
      testMode,
      providerResponse: body,
    };
  } catch (e: any) {
    return {
      ok: false,
      provider: "RESEND",
      to,
      testMode,
      error: String(e?.message || "EMAIL_SEND_FAILED"),
    };
  }
}