// scripts/run-hosted-finance-cron.mjs

const DEFAULT_TIMEOUT_MS = 90_000;

function clean(value) {
  return String(value ?? "").trim();
}

function trimTrailingSlash(value) {
  return clean(value).replace(/\/+$/, "");
}

function resolveTargetUrl() {
  const direct = clean(process.env.CRON_TARGET_URL);

  if (direct) return direct;

  const base =
    trimTrailingSlash(process.env.APP_URL) ||
    trimTrailingSlash(process.env.NEXT_PUBLIC_APP_URL) ||
    trimTrailingSlash(process.env.NEXTAUTH_URL);

  if (!base) {
    throw new Error(
      "CRON_TARGET_URL is missing. Set it to https://edulifeos.com/api/internal/finance/outbox/cron"
    );
  }

  return `${base}/api/internal/finance/outbox/cron`;
}

async function main() {
  const targetUrl = resolveTargetUrl();
  const secret = clean(process.env.FINANCE_OUTBOX_CRON_SECRET);

  if (!secret) {
    throw new Error("FINANCE_OUTBOX_CRON_SECRET is missing.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const startedAt = new Date().toISOString();

  console.log(
    JSON.stringify(
      {
        ok: true,
        event: "FINANCE_HOSTED_CRON_START",
        startedAt,
        targetUrl,
        secretPresent: true,
        secretLength: secret.length,
      },
      null,
      2
    )
  );

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "EduLifeOS-FinanceCron/1.0",
        "x-finance-outbox-cron-secret": secret,
      },
      body: JSON.stringify({
        source: "digitalocean-scheduled-job",
        requestedAt: startedAt,
      }),
      signal: controller.signal,
    });

    const text = await res.text();

    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text.slice(0, 2000) };
    }

    console.log(
      JSON.stringify(
        {
          ok: res.ok,
          event: "FINANCE_HOSTED_CRON_RESPONSE",
          status: res.status,
          statusText: res.statusText,
          finishedAt: new Date().toISOString(),
          payload,
        },
        null,
        2
      )
    );

    if (!res.ok || payload?.ok === false) {
      process.exitCode = 1;
    }
  } finally {
    clearTimeout(timeout);
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        event: "FINANCE_HOSTED_CRON_FAILED",
        error: err instanceof Error ? err.message : String(err),
        failedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  process.exit(1);
});