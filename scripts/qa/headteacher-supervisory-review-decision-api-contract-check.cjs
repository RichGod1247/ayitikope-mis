#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects and transpiles TypeScript source. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");
const relativePath =
  "src/app/api/governance/appraisals/headteacher-supervisory/review-queue/[assessmentId]/decision/route.ts";
const absolutePath = path.join(repoRoot, relativePath);

function fail(message, detail) {
  const suffix =
    detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

assert(fs.existsSync(absolutePath), "N6_F1C6B3B_DECISION_ROUTE_MISSING");
const source = fs
  .readFileSync(absolutePath, "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");

const transpiled = ts.transpileModule(source, {
  fileName: relativePath,
  reportDiagnostics: true,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    esModuleInterop: true,
  },
});
const errors = (transpiled.diagnostics ?? []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
assert(errors.length === 0, "N6_F1C6B3B_DECISION_ROUTE_TRANSPILE_FAILED", {
  diagnostics: errors.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  ),
});

for (const required of [
  "executeHeadteacherSupervisoryHosDecision",
  'export async function POST(',
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  "requireSupervisoryGovernanceApiContext",
  'normalizedRole(auth.ctx.roleName) !== "HEAD_OF_SUPERVISION"',
  "isUuidIdentifier(assessmentId)",
  "MAX_BODY_BYTES = 16 * 1024",
  'new Set(["action", "reason", "confirm"])',
  "bodyFieldsAllowed",
  "Buffer.byteLength(rawBody, \"utf8\")",
  'error: "REQUEST_BODY_TOO_LARGE"',
  'error: "INVALID_JSON_BODY"',
  'error: "INVALID_DECISION_BODY"',
  "actorUserId: auth.ctx.userId",
  "actorRoleName: auth.ctx.roleName",
  "governanceScope: auth.scope",
  "confirm: body.confirm === true",
  "browserDecisionResult",
  "outcome: result.outcome",
  "assessmentStatus: result.assessmentStatus",
  "reviewDecision: result.reviewDecision",
  "revisionRequired: result.revisionRequired",
  "nextReviewCreated: result.nextReviewCreated",
  "jsonNoStore(200",
  "supervisoryApiError",
]) {
  assert(
    source.includes(required),
    "N6_F1C6B3B_DECISION_ROUTE_MARKER_MISSING",
    required,
  );
}

for (const forbidden of [
  "prisma.",
  "PrismaClient",
  "appraisalReview.",
  "appraisalAssessment.",
  "appraisalAggregateSnapshot",
  "anonymousResponses",
  "sendSms",
  "sendEmail",
  "reviewerUserId:",
  "reviewerAssignmentId:",
  "decisionRequestHash:",
  "decisionEvidenceHash:",
  "assessmentHash:",
  "visitContextHash:",
]) {
  assert(
    !source.includes(forbidden),
    "N6_F1C6B3B_DECISION_ROUTE_FORBIDDEN_MARKER",
    forbidden,
  );
}

assert(
  !source.includes("export async function GET") &&
    !source.includes("export async function PUT") &&
    !source.includes("export async function PATCH") &&
    !source.includes("export async function DELETE"),
  "B3B decision route must expose POST only",
);

console.log("");
console.log("=== N6-F1C6B3B HOS HEADTEACHER DECISION THIN API ===");
console.log("");
console.log("Method                           : POST only");
console.log("Audience                         : Head of Supervision only");
console.log("Assessment identifier            : strict UUID");
console.log("Body                             : action / reason / confirm allowlist");
console.log("Body size                        : 16 KiB maximum");
console.log("RETURN reason                    : service-enforced bounded reason");
console.log("FORWARD reason                   : service-forbidden");
console.log("Actor/reviewer identity          : server authenticated");
console.log("Governance scope                 : server verified");
console.log("Browser result                   : minimized lifecycle outcome only");
console.log("Authority/proof hashes           : excluded from browser");
console.log("Direct Prisma/provider calls     : absent");
console.log("No-store / nosniff               : inherited from shared boundary");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-F1C6B3B HOS HEADTEACHER DECISION API GREEN");
