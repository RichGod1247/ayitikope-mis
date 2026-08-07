#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects and executes isolated source contracts. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix =
    detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);

  assert(fs.existsSync(absolutePath), "N6_B3_REQUIRED_FILE_MISSING", {
    relativePath,
  });

  return fs.readFileSync(absolutePath, "utf8");
}

function contains(source, marker, label) {
  assert(source.includes(marker), `N6_B3_MARKER_MISSING:${label}`, {
    marker,
  });
}

function transpilePublicUrl(source) {
  const output = ts.transpileModule(source, {
    fileName: "src/lib/publicUrl.ts",
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      strict: true,
    },
  });

  const errors = (output.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (errors.length) {
    fail("N6_B3_PUBLIC_URL_TYPESCRIPT_TRANSPILE_FAILED", {
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    });
  }

  return output.outputText;
}

function loadPublicUrl(compiledSource, environment) {
  const isolatedModule = { exports: {} };
  const isolatedProcess = { env: { ...environment } };

  const execute = new Function(
    "exports",
    "module",
    "require",
    "process",
    "URL",
    compiledSource,
  );

  execute(
    isolatedModule.exports,
    isolatedModule,
    require,
    isolatedProcess,
    URL,
  );

  assert(
    typeof isolatedModule.exports.getPublicBaseUrl === "function",
    "N6_B3_PUBLIC_URL_EXPORT_MISSING",
  );
  assert(
    typeof isolatedModule.exports.buildPublicUrl === "function",
    "N6_B3_BUILD_PUBLIC_URL_EXPORT_MISSING",
  );

  return isolatedModule.exports;
}

function expectBase(compiledSource, environment, expected, label) {
  const publicUrl = loadPublicUrl(compiledSource, environment);
  const actual = publicUrl.getPublicBaseUrl();

  assert(actual === expected, `N6_B3_PUBLIC_URL_CASE_FAILED:${label}`, {
    expected,
    actual,
    environment,
  });
}

function main() {
  const publicUrlSource = read("src/lib/publicUrl.ts");
  const emailSource = read("src/lib/email/sendEmail.ts");
  const smsSource = read("src/lib/sms/hubtel.ts");
  const inviteDeliverySource = read("src/lib/governance/inviteDelivery.ts");
  const packageJsonSource = read("package.json");

  contains(
    publicUrlSource,
    "EDULIFE_UAT_LOCAL_URLS",
    "public-url:explicit-uat-flag",
  );
  contains(
    publicUrlSource,
    'process.env.NODE_ENV !== "production"',
    "public-url:production-denial",
  );
  contains(
    publicUrlSource,
    'hostname === "127.0.0.1" || hostname === "localhost"',
    "public-url:exact-loopback-hosts",
  );
  contains(
    publicUrlSource,
    'url.port === "3001"',
    "public-url:exact-uat-port",
  );
  contains(
    publicUrlSource,
    'v.includes("0.0.0.0")',
    "public-url:wildcard-host-denial",
  );

  contains(
    emailSource,
    "EMAIL_TEST_RECIPIENT_NOT_CONFIGURED",
    "email:fail-closed-error",
  );
  contains(
    emailSource,
    "if (testMode && (!testTo || !isEmailLike(testTo)))",
    "email:fail-closed-guard",
  );

  contains(
    smsSource,
    "if (SMS_TEST_MODE)",
    "sms:test-mode-present",
  );
  contains(
    smsSource,
    "const res = await fetch(url.toString()",
    "sms:test-mode-still-provider-backed",
  );

  contains(
    inviteDeliverySource,
    "if (phone) {",
    "invite:sms-only-with-phone",
  );
  contains(
    inviteDeliverySource,
    'reason: "NO_PHONE"',
    "welcome:no-phone-skip",
  );

  let packageJson;

  try {
    packageJson = JSON.parse(packageJsonSource);
  } catch (error) {
    fail("N6_B3_PACKAGE_JSON_PARSE_FAILED", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  assert(
    packageJson?.scripts?.dev === "next dev",
    "N6_B3_PACKAGE_DEV_SCRIPT_MISMATCH",
    { actual: packageJson?.scripts?.dev ?? null },
  );

  const compiledPublicUrl = transpilePublicUrl(publicUrlSource);

  expectBase(
    compiledPublicUrl,
    {
      NODE_ENV: "development",
      APP_URL: "http://127.0.0.1:3001",
      EDULIFE_UAT_LOCAL_URLS: "true",
    },
    "http://127.0.0.1:3001",
    "explicit-loopback-uat-allowed",
  );

  expectBase(
    compiledPublicUrl,
    {
      NODE_ENV: "development",
      APP_URL: "http://localhost:3001",
      EDULIFE_UAT_LOCAL_URLS: "true",
    },
    "http://localhost:3001",
    "explicit-localhost-uat-allowed",
  );

  expectBase(
    compiledPublicUrl,
    {
      NODE_ENV: "development",
      APP_URL: "http://127.0.0.1:3001",
      EDULIFE_UAT_LOCAL_URLS: "false",
    },
    "https://edulifeos.com",
    "loopback-denied-without-flag",
  );

  expectBase(
    compiledPublicUrl,
    {
      NODE_ENV: "production",
      APP_URL: "http://127.0.0.1:3001",
      EDULIFE_UAT_LOCAL_URLS: "true",
    },
    "https://edulifeos.com",
    "loopback-denied-in-production",
  );

  expectBase(
    compiledPublicUrl,
    {
      NODE_ENV: "development",
      APP_URL: "http://127.0.0.1:3000",
      EDULIFE_UAT_LOCAL_URLS: "true",
    },
    "https://edulifeos.com",
    "operational-port-denied",
  );

  expectBase(
    compiledPublicUrl,
    {
      NODE_ENV: "development",
      APP_URL: "http://0.0.0.0:3001",
      EDULIFE_UAT_LOCAL_URLS: "true",
    },
    "https://edulifeos.com",
    "wildcard-host-denied",
  );

  expectBase(
    compiledPublicUrl,
    {
      NODE_ENV: "production",
      APP_URL: "https://uat.example.test",
      EDULIFE_UAT_LOCAL_URLS: "false",
    },
    "https://uat.example.test",
    "nonlocal-public-url-preserved",
  );

  const built = loadPublicUrl(compiledPublicUrl, {
    NODE_ENV: "development",
    APP_URL: "http://127.0.0.1:3001",
    EDULIFE_UAT_LOCAL_URLS: "true",
  }).buildPublicUrl("governance/invite/test-token");

  assert(
    built === "http://127.0.0.1:3001/governance/invite/test-token",
    "N6_B3_LOCAL_INVITE_URL_BUILD_FAILED",
    { built },
  );

  console.log("");
  console.log("=== N6-B3 HOS/BSC ISOLATED UAT RUNTIME CONTRACT ===");
  console.log("");
  console.log("Runtime bind target           : 127.0.0.1:3001");
  console.log("Local invite URL permission   : explicit non-production flag");
  console.log("Allowed local hosts           : 127.0.0.1 and localhost only");
  console.log("Allowed local port            : 3001 only");
  console.log("Operational port 3000         : denied");
  console.log("Wildcard host 0.0.0.0         : denied");
  console.log("Production local URL override : denied");
  console.log("Email without test target     : fails closed");
  console.log("Invitation SMS safety         : omit phone to skip provider");
  console.log("Welcome SMS safety            : blank phone returns NO_PHONE");
  console.log("Database accessed             : false");
  console.log("Provider called               : false");
  console.log("");
  console.log("RESULT: N6-B3 ISOLATED UAT RUNTIME CONTRACT GREEN");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
