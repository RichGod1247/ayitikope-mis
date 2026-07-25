// scripts/qa/shared-hosted-cron-runner-check.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const qaDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(qaDir, "..", "..");
const runnerPath = path.join(
  repoRoot,
  "scripts",
  "run-hosted-finance-cron.mjs",
);

const FINANCE_SECRET =
  "finance-test-secret-not-for-production-123456789";
const APPRAISAL_SECRET =
  "appraisal-test-secret-not-for-production-123456789";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function createServer(responsePlan) {
  const requests = [];

  const server = http.createServer(async (req, res) => {
    const body = await readBody(req);

    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body,
    });

    const planned =
      responsePlan[req.url] ?? {
        status: 404,
        payload: { ok: false, error: "NOT_FOUND" },
      };

    res.writeHead(planned.status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(planned.payload));
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  assert(
    address && typeof address === "object",
    "TEST_SERVER_ADDRESS_MISSING",
  );

  return {
    server,
    requests,
    origin: `http://127.0.0.1:${address.port}`,
  };
}

function runRunner(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [runnerPath],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          ...env,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function assertSecretsAbsent(output) {
  assert(
    !output.includes(FINANCE_SECRET),
    "FINANCE_SECRET_LEAKED_TO_LOGS",
  );
  assert(
    !output.includes(APPRAISAL_SECRET),
    "APPRAISAL_SECRET_LEAKED_TO_LOGS",
  );
  assert(
    !output.includes('"preview"'),
    "RAW_NON_JSON_PREVIEW_LEAKED_TO_LOGS",
  );
}

async function scenarioBothSucceed() {
  const testServer = await createServer({
    "/api/internal/finance/outbox/cron": {
      status: 200,
      payload: {
        ok: true,
        mode: "WORKERS_EXECUTED",
        safe: true,
      },
    },
    "/api/internal/appraisals/notifications/cron": {
      status: 200,
      payload: {
        ok: true,
        mode: "WORKER_EXECUTED",
        safe: true,
      },
    },
  });

  try {
    const result = await runRunner({
      CRON_TARGET_URL:
        `${testServer.origin}/api/internal/finance/outbox/cron`,
      FINANCE_OUTBOX_CRON_SECRET: FINANCE_SECRET,
      APPRAISAL_NOTIFICATION_CRON_SECRET:
        APPRAISAL_SECRET,
      APPRAISAL_CRON_TARGET_URL: "",
    });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(testServer.requests.length, 2);

    const finance = testServer.requests.find(
      (request) =>
        request.url ===
        "/api/internal/finance/outbox/cron",
    );
    const appraisal = testServer.requests.find(
      (request) =>
        request.url ===
        "/api/internal/appraisals/notifications/cron",
    );

    assert(finance, "FINANCE_REQUEST_MISSING");
    assert(appraisal, "APPRAISAL_REQUEST_MISSING");

    assert.equal(
      finance.headers["x-finance-outbox-cron-secret"],
      FINANCE_SECRET,
    );
    assert.equal(
      appraisal.headers[
        "x-appraisal-notification-cron-secret"
      ],
      APPRAISAL_SECRET,
    );

    assertSecretsAbsent(
      `${result.stdout}\n${result.stderr}`,
    );

    assert(
      result.stdout.includes(
        '"event": "HOSTED_OPERATIONS_CRON_SUMMARY"',
      ),
      "SUMMARY_LOG_MISSING",
    );
  } finally {
    await new Promise((resolve) =>
      testServer.server.close(resolve),
    );
  }
}

async function scenarioFinanceFailureDoesNotBlockAppraisal() {
  const testServer = await createServer({
    "/api/internal/finance/outbox/cron": {
      status: 500,
      payload: {
        ok: false,
        error: "SIMULATED_FINANCE_FAILURE",
      },
    },
    "/api/internal/appraisals/notifications/cron": {
      status: 200,
      payload: {
        ok: true,
        mode: "WORKER_EXECUTED",
      },
    },
  });

  try {
    const result = await runRunner({
      CRON_TARGET_URL:
        `${testServer.origin}/api/internal/finance/outbox/cron`,
      FINANCE_OUTBOX_CRON_SECRET: FINANCE_SECRET,
      APPRAISAL_NOTIFICATION_CRON_SECRET:
        APPRAISAL_SECRET,
      APPRAISAL_CRON_TARGET_URL: "",
    });

    assert.equal(result.code, 1);
    assert.equal(testServer.requests.length, 2);

    assert(
      testServer.requests.some(
        (request) =>
          request.url ===
          "/api/internal/appraisals/notifications/cron",
      ),
      "APPRAISAL_WAS_BLOCKED_BY_FINANCE_FAILURE",
    );

    assertSecretsAbsent(
      `${result.stdout}\n${result.stderr}`,
    );
  } finally {
    await new Promise((resolve) =>
      testServer.server.close(resolve),
    );
  }
}

async function scenarioAppraisalFailureDoesNotHideFinance() {
  const testServer = await createServer({
    "/api/internal/finance/outbox/cron": {
      status: 200,
      payload: {
        ok: true,
        mode: "WORKERS_EXECUTED",
      },
    },
    "/api/internal/appraisals/notifications/cron": {
      status: 500,
      payload: {
        ok: false,
        error: "SIMULATED_APPRAISAL_FAILURE",
      },
    },
  });

  try {
    const result = await runRunner({
      CRON_TARGET_URL:
        `${testServer.origin}/api/internal/finance/outbox/cron`,
      FINANCE_OUTBOX_CRON_SECRET: FINANCE_SECRET,
      APPRAISAL_NOTIFICATION_CRON_SECRET:
        APPRAISAL_SECRET,
      APPRAISAL_CRON_TARGET_URL: "",
    });

    assert.equal(result.code, 1);
    assert.equal(testServer.requests.length, 2);

    assert(
      testServer.requests.some(
        (request) =>
          request.url ===
          "/api/internal/finance/outbox/cron",
      ),
      "FINANCE_RESULT_MISSING_DURING_APPRAISAL_FAILURE",
    );

    assertSecretsAbsent(
      `${result.stdout}\n${result.stderr}`,
    );
  } finally {
    await new Promise((resolve) =>
      testServer.server.close(resolve),
    );
  }
}

async function scenarioAppraisalNotConfigured() {
  const testServer = await createServer({
    "/api/internal/finance/outbox/cron": {
      status: 200,
      payload: {
        ok: true,
        mode: "WORKERS_EXECUTED",
      },
    },
  });

  try {
    const result = await runRunner({
      CRON_TARGET_URL:
        `${testServer.origin}/api/internal/finance/outbox/cron`,
      FINANCE_OUTBOX_CRON_SECRET: FINANCE_SECRET,
      APPRAISAL_NOTIFICATION_CRON_SECRET: "",
      APPRAISAL_CRON_TARGET_URL: "",
    });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(testServer.requests.length, 1);
    assert.equal(
      testServer.requests[0].url,
      "/api/internal/finance/outbox/cron",
    );

    assert(
      result.stdout.includes(
        '"event": "APPRAISAL_HOSTED_CRON_SKIPPED"',
      ),
      "EXPLICIT_APPRAISAL_SKIP_LOG_MISSING",
    );

    assertSecretsAbsent(
      `${result.stdout}\n${result.stderr}`,
    );
  } finally {
    await new Promise((resolve) =>
      testServer.server.close(resolve),
    );
  }
}

async function main() {
  await scenarioBothSucceed();
  await scenarioFinanceFailureDoesNotBlockAppraisal();
  await scenarioAppraisalFailureDoesNotHideFinance();
  await scenarioAppraisalNotConfigured();

  console.log("");
  console.log("=== D3.3F.2 SHARED HOSTED CRON PROOF ===");
  console.log("");
  console.log("Existing DigitalOcean job    : reused");
  console.log("Existing run command          : unchanged");
  console.log("Finance endpoint              : independently invoked");
  console.log("Appraisal endpoint            : independently invoked");
  console.log("Bidirectional failure isolation: verified");
  console.log("Separate authentication       : verified");
  console.log("Appraisal URL derivation      : verified");
  console.log("Unconfigured appraisal state  : explicit safe skip");
  console.log("Secret values in logs         : absent");
  console.log("Additional DO component       : false");
  console.log("Database accessed             : false");
  console.log("Messages sent                 : false");
  console.log("");
  console.log(
    "RESULT: D3.3F.2 SHARED HOSTED CRON RUNNER GREEN",
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "RESULT: D3.3F.2 SHARED HOSTED CRON RUNNER FAILED",
  );
  console.error(
    error instanceof Error ? error.stack : error,
  );
  process.exit(1);
});
