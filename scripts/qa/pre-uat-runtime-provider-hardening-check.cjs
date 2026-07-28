#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects and executes isolated source contracts. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix =
    detail === undefined
      ? ""
      : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);

  assert(
    fs.existsSync(absolutePath),
    "PRE_UAT_HARDENING_REQUIRED_FILE_MISSING",
    { relativePath },
  );

  return fs.readFileSync(absolutePath, "utf8");
}

function contains(source, marker, label) {
  assert(
    source.includes(marker),
    `PRE_UAT_HARDENING_MARKER_MISSING:${label}`,
    { marker },
  );
}

function excludes(source, marker, label) {
  assert(
    !source.includes(marker),
    `PRE_UAT_HARDENING_FORBIDDEN_MARKER:${label}`,
    { marker },
  );
}

function transpileEmail(source) {
  const output = ts.transpileModule(source, {
    fileName: "src/lib/email/sendEmail.ts",
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      strict: true,
    },
  });

  const errors = (output.diagnostics ?? []).filter(
    (diagnostic) =>
      diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (errors.length) {
    fail("PRE_UAT_EMAIL_TYPESCRIPT_TRANSPILE_FAILED", {
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          "\n",
        ),
      ),
    });
  }

  return output.outputText;
}

function loadSendEmail(compiledSource, environment, fetchImpl) {
  const isolatedModule = { exports: {} };
  const isolatedProcess = {
    env: { ...environment },
  };

  const execute = new Function(
    "exports",
    "module",
    "require",
    "process",
    "fetch",
    compiledSource,
  );

  execute(
    isolatedModule.exports,
    isolatedModule,
    require,
    isolatedProcess,
    fetchImpl,
  );

  assert(
    typeof isolatedModule.exports.sendEmail === "function",
    "PRE_UAT_EMAIL_EXPORT_MISSING",
  );

  return isolatedModule.exports.sendEmail;
}

function successfulFetch(calls) {
  return async (url, init) => {
    calls.push({ url, init });

    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "test-email-id" }),
    };
  };
}

async function main() {
  const packageJson = read("package.json");
  const lfs = read("scripts/lfs-pull-optional.mjs");
  const prismaPostinstall = read(
    "scripts/prisma-postinstall.mjs",
  );
  const financeGate = read(
    "scripts/finance-sprint9-qa-gate.mjs",
  );
  const email = read("src/lib/email/sendEmail.ts");
  const notificationWorker = read(
    "src/lib/appraisals/notificationWorker.ts",
  );

  contains(
    packageJson,
    '"node": "22.x"',
    "package:node-22-contract",
  );

  contains(
    lfs,
    'process.platform === "win32" ? "git.exe" : "git"',
    "lfs:explicit-git-executable",
  );
  contains(lfs, "shell: false", "lfs:no-shell");
  contains(
    lfs,
    'run(["lfs", "pull", "--include=public/**"])',
    "lfs:argument-array",
  );
  contains(
    lfs,
    "Continuing build without failing deployment.",
    "lfs:optional-failure-preserved",
  );
  excludes(
    lfs,
    "shell: process.platform",
    "lfs:no-platform-shell",
  );
  excludes(lfs, "shell: true", "lfs:no-shell-true");

  contains(
    prismaPostinstall,
    "process.execPath",
    "prisma:node-executable",
  );
  contains(
    prismaPostinstall,
    '"node_modules",\n  "prisma",\n  "build",\n  "index.js"',
    "prisma:local-cli",
  );
  contains(
    prismaPostinstall,
    "shell: false",
    "prisma:no-shell",
  );
  excludes(
    prismaPostinstall,
    'spawnSync("npx"',
    "prisma:no-npx-cmd",
  );
  excludes(
    prismaPostinstall,
    "shell: process.platform",
    "prisma:no-platform-shell",
  );

  contains(
    financeGate,
    "executable: process.execPath",
    "finance:direct-node-executable",
  );
  contains(
    financeGate,
    'args: [typescriptCli, "-p", "tsconfig.json", "--noEmit"]',
    "finance:typecheck-arguments",
  );
  contains(
    financeGate,
    'args: [nextCli, "build"]',
    "finance:next-build-arguments",
  );
  contains(
    financeGate,
    "spawnSync(step.executable, step.args",
    "finance:structured-spawn",
  );
  contains(
    financeGate,
    "shell: false",
    "finance:no-shell",
  );
  excludes(
    financeGate,
    "shell: true",
    "finance:no-shell-true",
  );
  excludes(
    financeGate,
    "spawnSync(step.command",
    "finance:no-command-string-spawn",
  );

  contains(
    email,
    "EMAIL_TEST_RECIPIENT_NOT_CONFIGURED",
    "email:fail-closed-error",
  );
  contains(
    email,
    "if (testMode && (!testTo || !isEmailLike(testTo)))",
    "email:fail-closed-guard",
  );
  contains(
    email,
    "const to = testMode ? testTo : toRaw;",
    "email:explicit-recipient-selection",
  );

  contains(
    notificationWorker,
    'import { sendEmail } from "@/lib/email/sendEmail";',
    "worker:central-email-adapter",
  );
  excludes(
    notificationWorker,
    "api.resend.com",
    "worker:no-direct-resend",
  );

  const compiledEmail = transpileEmail(email);
  const baseEnvironment = {
    EMAIL_TEST_MODE: "true",
    RESEND_API_KEY: "test-resend-key",
    EMAIL_FROM: "EduLife OS <noreply@example.test>",
  };
  const message = {
    to: "real.user@example.com",
    subject: "Test subject",
    text: "Test body",
    idempotencyKey: "pre-uat-test-key",
  };

  {
    const calls = [];
    const sendEmail = loadSendEmail(
      compiledEmail,
      baseEnvironment,
      successfulFetch(calls),
    );
    const result = await sendEmail(message);

    assert(
      result.ok === false,
      "PRE_UAT_EMAIL_MISSING_TEST_TO_MUST_FAIL",
      result,
    );
    assert(
      result.provider === "DISABLED",
      "PRE_UAT_EMAIL_MISSING_TEST_TO_PROVIDER_MUST_BE_DISABLED",
      result,
    );
    assert(
      result.error === "EMAIL_TEST_RECIPIENT_NOT_CONFIGURED",
      "PRE_UAT_EMAIL_MISSING_TEST_TO_ERROR_MISMATCH",
      result,
    );
    assert(
      calls.length === 0,
      "PRE_UAT_EMAIL_MISSING_TEST_TO_CALLED_PROVIDER",
      calls,
    );
  }

  {
    const calls = [];
    const sendEmail = loadSendEmail(
      compiledEmail,
      {
        ...baseEnvironment,
        EMAIL_TEST_TO: "not-an-email",
      },
      successfulFetch(calls),
    );
    const result = await sendEmail(message);

    assert(
      result.ok === false,
      "PRE_UAT_EMAIL_INVALID_TEST_TO_MUST_FAIL",
      result,
    );
    assert(
      result.error === "EMAIL_TEST_RECIPIENT_NOT_CONFIGURED",
      "PRE_UAT_EMAIL_INVALID_TEST_TO_ERROR_MISMATCH",
      result,
    );
    assert(
      calls.length === 0,
      "PRE_UAT_EMAIL_INVALID_TEST_TO_CALLED_PROVIDER",
      calls,
    );
  }

  {
    const calls = [];
    const sendEmail = loadSendEmail(
      compiledEmail,
      {
        ...baseEnvironment,
        EMAIL_TEST_TO: "safe.test@example.com",
      },
      successfulFetch(calls),
    );
    const result = await sendEmail(message);

    assert(
      result.ok === true,
      "PRE_UAT_EMAIL_VALID_TEST_TO_SHOULD_SEND",
      result,
    );
    assert(
      result.to === "safe.test@example.com",
      "PRE_UAT_EMAIL_TEST_TO_NOT_USED",
      result,
    );
    assert(
      calls.length === 1,
      "PRE_UAT_EMAIL_VALID_TEST_TO_PROVIDER_CALL_COUNT",
      calls,
    );

    const payload = JSON.parse(calls[0].init.body);
    assert(
      Array.isArray(payload.to) &&
        payload.to.length === 1 &&
        payload.to[0] === "safe.test@example.com",
      "PRE_UAT_EMAIL_PROVIDER_PAYLOAD_RECIPIENT_MISMATCH",
      payload,
    );
    assert(
      !JSON.stringify(payload).includes("real.user@example.com"),
      "PRE_UAT_EMAIL_REAL_RECIPIENT_LEAKED_TO_PROVIDER",
      payload,
    );
  }

  {
    const calls = [];
    const sendEmail = loadSendEmail(
      compiledEmail,
      {
        EMAIL_TEST_MODE: "false",
        RESEND_API_KEY: "test-resend-key",
        EMAIL_FROM: "EduLife OS <noreply@example.test>",
      },
      successfulFetch(calls),
    );
    const result = await sendEmail(message);

    assert(
      result.ok === true,
      "PRE_UAT_EMAIL_PRODUCTION_MODE_SHOULD_SEND",
      result,
    );
    assert(
      result.to === "real.user@example.com",
      "PRE_UAT_EMAIL_PRODUCTION_RECIPIENT_MISMATCH",
      result,
    );
    assert(
      calls.length === 1,
      "PRE_UAT_EMAIL_PRODUCTION_PROVIDER_CALL_COUNT",
      calls,
    );
  }

  console.log("");
  console.log("=== PRE-UAT RUNTIME AND PROVIDER HARDENING ===");
  console.log("");
  console.log("Project runtime contract       : Node 22.x");
  console.log("LFS child process              : direct git executable");
  console.log("Prisma postinstall             : direct local CLI");
  console.log("Finance QA child processes     : structured executable + args");
  console.log("Shell concatenation            : absent");
  console.log("Optional LFS failure behavior  : preserved");
  console.log("Email test mode without target : fails closed");
  console.log("Email provider call on failure : absent");
  console.log("Email safe test redirect       : verified");
  console.log("Production email recipient     : preserved");
  console.log("Appraisal worker adapter       : central sendEmail only");
  console.log("Database accessed              : false");
  console.log("Provider called                : mocked only");
  console.log("");
  console.log(
    "RESULT: PRE-UAT RUNTIME AND PROVIDER HARDENING GREEN",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
