// src/lib/email/sendEmail.ts
export type SendEmailArgs = {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
  replyTo?: string | null;
  idempotencyKey?: string | null;
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

function cleanIdempotencyKey(value: unknown) {
  const key = cleanStr(value).slice(0, 256);
  return key || null;
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const toRaw = cleanStr(args.to);
  const subject = cleanStr(args.subject);
  const text = cleanStr(args.text);
  const html = args.html ? String(args.html) : null;
  const idempotencyKey = cleanIdempotencyKey(args.idempotencyKey);

  const testMode =
    (process.env.EMAIL_TEST_MODE ?? "false").toLowerCase() === "true";
  const testTo = cleanStr(process.env.EMAIL_TEST_TO || "");

  if (!toRaw || !isEmailLike(toRaw) || !subject || !text) {
    return {
      ok: false,
      provider: "DISABLED",
      to: testMode ? testTo : toRaw,
      testMode,
      error: "INVALID_EMAIL_PAYLOAD",
    };
  }

  if (testMode && (!testTo || !isEmailLike(testTo))) {
    return {
      ok: false,
      provider: "DISABLED",
      to: testTo,
      testMode,
      error: "EMAIL_TEST_RECIPIENT_NOT_CONFIGURED",
    };
  }

  const to = testMode ? testTo : toRaw;

  const apiKey = cleanStr(process.env.RESEND_API_KEY || "");
  const from = cleanStr(process.env.EMAIL_FROM || "");
  const replyTo = cleanStr(
    args.replyTo || process.env.EMAIL_REPLY_TO || "",
  );

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
    const payload: {
      from: string;
      to: string[];
      subject: string;
      text: string;
      html?: string;
      reply_to?: string;
    } = {
      from,
      to: [to],
      subject,
      text,
    };

    if (html) payload.html = html;
    if (replyTo) payload.reply_to = replyTo;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const body = await response.json().catch(() => ({} as unknown));

    if (!response.ok) {
      return {
        ok: false,
        provider: "RESEND",
        to,
        testMode,
        providerResponse: body,
        error: `HTTP_${response.status}`,
      };
    }

    return {
      ok: true,
      provider: "RESEND",
      to,
      testMode,
      providerResponse: body,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      provider: "RESEND",
      to,
      testMode,
      error:
        error instanceof Error
          ? error.message
          : "EMAIL_SEND_FAILED",
    };
  }
}
