// scripts/run-hosted-finance-cron.mjs
// Backward-compatible hosted operations runner.
// The existing DigitalOcean finance-cron job keeps its current run command,
// while independently waking both the finance and appraisal worker endpoints.

const DEFAULT_TIMEOUT_MS = 90_000;
function clean(value) {
  return String(value ?? "").trim();
}

function trimTrailingSlash(value) {
  return clean(value).replace(/\/+$/, "");
}

function resolveFinanceTargetUrl() {
  const direct = clean(process.env.CRON_TARGET_URL);

  if (direct) return direct;

  const base =
    trimTrailingSlash(process.env.APP_URL) ||
    trimTrailingSlash(process.env.NEXT_PUBLIC_APP_URL) ||
    trimTrailingSlash(process.env.NEXTAUTH_URL);

  if (!base) {
    throw new Error(
      "CRON_TARGET_URL is missing. Set it to the protected finance cron endpoint.",
    );
  }

  return `${base}/api/internal/finance/outbox/cron`;
}

function resolveAppraisalTargetUrl(financeTargetUrl) {
  const direct = clean(process.env.APPRAISAL_CRON_TARGET_URL);

  if (direct) return direct;

  let origin = "";

  try {
    origin = new URL(financeTargetUrl).origin;
  } catch {
    throw new Error("CRON_TARGET_URL must be a valid absolute URL.");
  }

  return `${origin}/api/internal/appraisals/notifications/cron`;
}

function parseResponsePayload(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return {
      nonJsonResponse: true,
      responseLength: text.length,
    };
  }
}

function errorMessage(error) {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "REQUEST_TIMEOUT";
    return error.message;
  }

  return String(error ?? "UNKNOWN_ERROR");
}

function writeLog(payload, error = false) {
  const serialized = JSON.stringify(payload, null, 2);

  if (error) {
    console.error(serialized);
    return;
  }

  console.log(serialized);
}

async function invokeProtectedCron(input) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const startedAt = new Date().toISOString();

  writeLog({
    ok: true,
    event: `${input.eventPrefix}_START`,
    startedAt,
    targetUrl: input.targetUrl,
    secretPresent: true,
  });

  try {
    const response = await fetch(input.targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": input.userAgent,
        [input.secretHeader]: input.secret,
      },
      body: JSON.stringify({
        source: "digitalocean-scheduled-job",
        requestedAt: startedAt,
        operation: input.operation,
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = parseResponsePayload(text);
    const ok = response.ok && payload?.ok !== false;

    writeLog(
      {
        ok,
        event: `${input.eventPrefix}_RESPONSE`,
        status: response.status,
        statusText: response.statusText,
        finishedAt: new Date().toISOString(),
        payload,
      },
      !ok,
    );

    return {
      operation: input.operation,
      ok,
      skipped: false,
      status: response.status,
    };
  } catch (error) {
    const message = errorMessage(error);

    writeLog(
      {
        ok: false,
        event: `${input.eventPrefix}_FAILED`,
        error: message,
        failedAt: new Date().toISOString(),
      },
      true,
    );

    return {
      operation: input.operation,
      ok: false,
      skipped: false,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const financeTargetUrl = resolveFinanceTargetUrl();
  const financeSecret = clean(
    process.env.FINANCE_OUTBOX_CRON_SECRET,
  );

  if (!financeSecret) {
    throw new Error("FINANCE_OUTBOX_CRON_SECRET is missing.");
  }

  const appraisalSecret = clean(
    process.env.APPRAISAL_NOTIFICATION_CRON_SECRET,
  );

  const financeTask = invokeProtectedCron({
    operation: "finance",
    eventPrefix: "FINANCE_HOSTED_CRON",
    targetUrl: financeTargetUrl,
    secret: financeSecret,
    secretHeader: "x-finance-outbox-cron-secret",
    userAgent: "EduLifeOS-FinanceCron/2.0",
  });

  let appraisalTask;

  if (appraisalSecret) {
    appraisalTask = invokeProtectedCron({
      operation: "appraisal-notifications",
      eventPrefix: "APPRAISAL_HOSTED_CRON",
      targetUrl: resolveAppraisalTargetUrl(financeTargetUrl),
      secret: appraisalSecret,
      secretHeader: "x-appraisal-notification-cron-secret",
      userAgent: "EduLifeOS-AppraisalCron/1.0",
    });
  } else {
    writeLog({
      ok: true,
      event: "APPRAISAL_HOSTED_CRON_SKIPPED",
      reason: "APPRAISAL_NOTIFICATION_CRON_SECRET_NOT_CONFIGURED",
      skippedAt: new Date().toISOString(),
    });

    appraisalTask = Promise.resolve({
      operation: "appraisal-notifications",
      ok: true,
      skipped: true,
    });
  }

  const [finance, appraisal] = await Promise.all([
    financeTask,
    appraisalTask,
  ]);

  const ok = finance.ok && appraisal.ok;

  writeLog(
    {
      ok,
      event: "HOSTED_OPERATIONS_CRON_SUMMARY",
      finishedAt: new Date().toISOString(),
      results: {
        finance,
        appraisal,
      },
    },
    !ok,
  );

  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  writeLog(
    {
      ok: false,
      event: "HOSTED_OPERATIONS_CRON_FAILED",
      error: errorMessage(error),
      failedAt: new Date().toISOString(),
    },
    true,
  );

  process.exit(1);
});
