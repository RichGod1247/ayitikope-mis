#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  route:
    "src/app/api/teacher/appraisals/governance-released/[cycleId]/route.ts",
  released:
    "src/lib/appraisals/teacherSupervisoryReleasedResult.ts",
  legacyTeacher:
    "src/app/api/teacher/appraisals/route.ts",
};

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
  if (!fs.existsSync(absolutePath)) fail("Required file missing", relativePath);
  return fs
    .readFileSync(absolutePath, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const marker of [
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  "requireApiUserContext",
  "readTeacherSupervisoryReleasedResult",
  "TeacherSupervisoryReleasedResultError",
  "export async function GET",
  "requireTenant: true",
  'requireRoleNames: ["TEACHER"]',
  "authResponseNoStore(auth.res)",
  "actorUserId = clean(auth.ctx.userId)",
  "actorTenantId = clean(auth.ctx.tenantId)",
  'actorRoleName: "TEACHER"',
  "actorTenantId,",
  "cycleId,",
  "isCycleIdentifier(cycleId)",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_INVALID_CYCLE_ID",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_AUTH_CONTEXT_INVALID",
  "error instanceof TeacherSupervisoryReleasedResultError",
  "error: error.code",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_FAILED",
]) {
  assert(
    source.route.includes(marker),
    "Teacher released-result route contract marker missing",
    marker,
  );
}

for (const securityHeader of [
  '"Cache-Control", "no-store, max-age=0"',
  '"Pragma", "no-cache"',
  '"X-Content-Type-Options", "nosniff"',
  '"Referrer-Policy", "no-referrer"',
]) {
  assert(
    source.route.includes(securityHeader),
    "Teacher released-result no-store/security header missing",
    securityHeader,
  );
}

for (const forbiddenMethod of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
]) {
  assert(
    !source.route.includes(forbiddenMethod),
    "Teacher released-result route must be GET only",
    forbiddenMethod,
  );
}

for (const forbiddenRouteMarker of [
  "prisma.",
  "TeacherAppraisalStatus",
  "teacherAppraisal",
  "appraisalCycle.",
  "appraisalAssessment.",
  "appraisalReview.",
  "create(",
  "update(",
  "updateMany(",
  "delete(",
  "deleteMany(",
  "upsert(",
  "auditLog",
  "sendSms",
  "sendEmail",
  "appraisalNotification",
  "localStorage",
  "sessionStorage",
  "setInterval(",
  "request.json(",
  "searchParams",
]) {
  assert(
    !source.route.includes(forbiddenRouteMarker),
    "Teacher released-result route contains forbidden direct data/mutation/browser marker",
    forbiddenRouteMarker,
  );
}

for (const forbiddenBrowserAuthorityField of [
  "assessmentId",
  "reviewId",
  "reviewStage",
  "reviewerUserId",
  "reviewerAssignmentId",
  "assessorUserId",
  "assessorAssignmentId",
  "assessmentHash",
  "observationContextHash",
  "reviewEvidenceHash",
  "releaseProofHash",
  "releaseEvidenceHash",
]) {
  assert(
    !source.route.includes(`searchParams.get("${forbiddenBrowserAuthorityField}")`) &&
      !source.route.includes(`body.${forbiddenBrowserAuthorityField}`),
    "Teacher released-result API must not accept browser-controlled authority/evidence identifiers",
    forbiddenBrowserAuthorityField,
  );
}

for (const marker of [
  'audience: "RELEASED_TEACHER"',
  'requiredRole: "TEACHER"',
  'requiredCycleStatus: "RELEASED"',
  "databaseWritesAllowed: false",
  "reviewerIdentityIncluded: false",
  "assessorIdentityIncluded: false",
  "reviewNotesIncluded: false",
  "returnReasonsIncluded: false",
  "rawEvidenceSnapshotIncluded: false",
  "rawMetadataIncluded: false",
  "legacyTeacherAppraisalIncluded: false",
  "combinedWeightingDefined: false",
  "releaseProofHashVerified: true",
  "correctionLineageVerified: true",
]) {
  assert(
    source.released.includes(marker),
    "Released-result service privacy/integrity regression",
    marker,
  );
}

assert(
  source.legacyTeacher.includes(
    'import { TeacherAppraisalStatus } from "@prisma/client";',
  ) &&
    source.legacyTeacher.includes("prisma.teacherAppraisal") &&
    source.legacyTeacher.includes(
      "status: TeacherAppraisalStatus.FINALIZED",
    ),
  "Legacy Teacher appraisal endpoint contract drift",
);

assert(
  !source.legacyTeacher.includes(
    "readTeacherSupervisoryReleasedResult",
  ) &&
    !source.legacyTeacher.includes(
      "teacherSupervisoryReleasedResult",
    ),
  "Governance released-result flow must remain separate from legacy TeacherAppraisal endpoint",
);

console.log("");
console.log("=== N6-E5D2 GOVERNANCE TEACHER RELEASED-RESULT THIN GET API ===");
console.log("");
console.log("Endpoint                         : teacher/appraisals/governance-released/{cycleId} GET");
console.log("Audience                         : authenticated Teacher only");
console.log("Tenant                           : required authenticated tenant");
console.log("Actor user                       : server-authenticated context");
console.log("Actor role                       : server-fixed TEACHER");
console.log("Cycle id                         : path identifier only");
console.log("Request body                     : absent");
console.log("Query authority fields           : absent");
console.log("Released-result verification     : E5D1 service only");
console.log("Finalized assessment proof       : service-owned");
console.log("Release proof verification       : service-owned");
console.log("Correction lineage               : service-owned");
console.log("Direct Prisma in route           : absent");
console.log("Mutation HTTP methods            : absent");
console.log("Legacy TeacherAppraisal          : separate + untouched");
console.log("No-store                         : success + auth/error responses");
console.log("Nosniff / no-referrer            : complete");
console.log("Notifications/providers          : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-E5D2 GOVERNANCE TEACHER RELEASED-RESULT THIN GET API GREEN");
