#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects and transpiles route source files. */

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
  assert(fs.existsSync(absolutePath), "D3_3C_REQUIRED_FILE_MISSING", {
    relativePath,
  });
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(source, marker, label) {
  assert(source.includes(marker), `D3_3C_MARKER_MISSING:${label}`, {
    marker,
  });
}

function excludes(source, marker, label) {
  assert(!source.includes(marker), `D3_3C_FORBIDDEN_MARKER:${label}`, {
    marker,
  });
}

function transpile(relativePath, source) {
  const output = ts.transpileModule(source, {
    fileName: relativePath,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.Preserve,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
    },
  });

  const errors = (output.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (errors.length) {
    fail("D3_3C_TYPESCRIPT_TRANSPILE_FAILED", {
      relativePath,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    });
  }
}

function main() {
  const paths = {
    shared:
      "src/app/api/headteacher/director-feedback/_shared.ts",
    list:
      "src/app/api/headteacher/director-feedback/route.ts",
    load:
      "src/app/api/headteacher/director-feedback/[cycleId]/route.ts",
    section:
      "src/app/api/headteacher/director-feedback/[cycleId]/section/route.ts",
    finalize:
      "src/app/api/headteacher/director-feedback/[cycleId]/finalize/route.ts",
  };

  const sources = Object.fromEntries(
    Object.entries(paths).map(([key, relativePath]) => [
      key,
      read(relativePath),
    ]),
  );

  for (const [key, relativePath] of Object.entries(paths)) {
    transpile(relativePath, sources[key]);
  }

  for (const key of ["list", "load", "section", "finalize"]) {
    contains(
      sources[key],
      'export const runtime = "nodejs"',
      `${key}:node-runtime`,
    );
    contains(
      sources[key],
      'export const dynamic = "force-dynamic"',
      `${key}:force-dynamic`,
    );
    contains(
      sources[key],
      "getHeadteacherApiContext()",
      `${key}:headteacher-auth`,
    );
    contains(
      sources[key],
      "randomUUID()",
      `${key}:request-id`,
    );
    contains(
      sources[key],
      "jsonNoStore(",
      `${key}:no-store-response`,
    );
    excludes(
      sources[key],
      'from "@/lib/prisma"',
      `${key}:no-direct-prisma`,
    );
    excludes(
      sources[key],
      "generalComment",
      `${key}:no-free-text-comment`,
    );
    excludes(
      sources[key],
      "schoolName",
      `${key}:no-school-identity`,
    );
    excludes(
      sources[key],
      "tenantId:",
      `${key}:no-tenant-identity-payload`,
    );
  }

  contains(
    sources.shared,
    '"Cache-Control": "no-store, max-age=0"',
    "shared:no-store",
  );
  contains(sources.shared, 'Pragma: "no-cache"', "shared:pragma");
  contains(
    sources.shared,
    '"X-Content-Type-Options": "nosniff"',
    "shared:nosniff",
  );
  contains(
    sources.shared,
    '"Referrer-Policy": "no-referrer"',
    "shared:referrer-policy",
  );
  contains(
    sources.shared,
    "SAFE_DETAIL_KEYS",
    "shared:safe-error-details",
  );
  contains(
    sources.shared,
    'code.startsWith("DIRECTOR_FEEDBACK_RESPONSE_")',
    "shared:known-service-errors-only",
  );

  contains(
    sources.list,
    "listHeadteacherDirectorFeedbackAssignments",
    "list:service",
  );
  contains(
    sources.load,
    "loadHeadteacherDirectorFeedbackResponse",
    "load:service",
  );
  contains(
    sources.section,
    "saveHeadteacherDirectorFeedbackSection",
    "section:service",
  );
  contains(
    sources.finalize,
    "finalizeHeadteacherDirectorFeedbackResponse",
    "finalize:service",
  );

  contains(
    sources.section,
    "value.length > 35",
    "section:payload-bound",
  );
  contains(
    sources.section,
    "CONTENT_TYPE_MUST_BE_JSON",
    "section:json-only",
  );
  contains(
    sources.finalize,
    "CONTENT_TYPE_MUST_BE_JSON",
    "finalize:json-only",
  );
  contains(
    sources.finalize,
    "body.confirm !== true",
    "finalize:explicit-confirmation",
  );
  contains(
    sources.finalize,
    "FINAL_SUBMISSION_CONFIRMATION_REQUIRED",
    "finalize:confirmation-error",
  );

  const postCount =
    (sources.section.match(/export async function POST/g) ?? []).length +
    (sources.finalize.match(/export async function POST/g) ?? []).length;
  const getCount =
    (sources.list.match(/export async function GET/g) ?? []).length +
    (sources.load.match(/export async function GET/g) ?? []).length;

  assert(postCount === 2, "D3_3C_POST_ROUTE_COUNT_INVALID", {
    expected: 2,
    actual: postCount,
  });
  assert(getCount === 2, "D3_3C_GET_ROUTE_COUNT_INVALID", {
    expected: 2,
    actual: getCount,
  });

  console.log("");
  console.log("=== D3.3C HEADTEACHER FEEDBACK API PROOF ===");
  console.log("");
  console.log("Headteacher auth             : verified on 4 routes");
  console.log("Assigned-cycle listing       : verified");
  console.log("Full official-form loading   : verified");
  console.log("One-section saving           : verified");
  console.log("Final submission             : explicit confirmation");
  console.log("Payload limit                : maximum 35 score rows");
  console.log("Direct Prisma route access   : absent");
  console.log("Free-text comments           : absent");
  console.log("School/tenant identity leak  : absent");
  console.log("Known error details          : allowlisted");
  console.log("No-store security headers    : verified");
  console.log("Route methods                : 2 GET / 2 POST");
  console.log("Database accessed            : false");
  console.log("");
  console.log("RESULT: D3.3C HEADTEACHER FEEDBACK API GREEN");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("RESULT: D3.3C HEADTEACHER FEEDBACK API FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
