#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  shared:
    "src/app/api/governance/appraisals/teacher-supervisory/_shared.ts",
  revisionRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/[assessmentId]/revision/route.ts",
  revisionService:
    "src/lib/appraisals/teacherSupervisoryAssessmentRevision.ts",
  scoring:
    "src/lib/appraisals/teacherSupervisoryAssessmentScoring.ts",
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
  return fs.readFileSync(absolutePath, "utf8");
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const required of [
  "createReturnedTeacherSupervisoryAssessmentRevision",
  "requireTeacherSupervisoryGovernanceApiContext",
  "isUuidIdentifier",
  "requestIsJson",
  "readBoundedJsonObject",
  "bodyContainsOnlyAllowedFields",
  "ALLOWED_BODY_FIELDS",
  '"confirmRevision"',
  "parsed.body.confirmRevision !== true",
  "actorUserId: auth.ctx.userId",
  "actorRoleName: auth.ctx.roleName",
  "returnedAssessmentId: assessmentId",
  "reqId: meta.reqId",
  "ip: meta.ip",
  "userAgent: meta.userAgent",
  "jsonNoStore",
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  '"[TEACHER_SUPERVISORY_REVISION_API_ERROR]"',
]) {
  assert(
    source.revisionRoute.includes(required),
    "Revision API contract marker missing",
    required,
  );
}

assert(
  source.revisionRoute.includes("export async function POST"),
  "Teacher revision POST missing",
);

for (const forbiddenMethod of [
  "export async function GET",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
]) {
  assert(
    !source.revisionRoute.includes(forbiddenMethod),
    "Teacher revision endpoint must expose POST only",
    forbiddenMethod,
  );
}

assert(
  source.revisionRoute.includes(
    '"TEACHER_SUPERVISORY_REVISION_FIELDS_FORBIDDEN"',
  ),
  "Revision API must reject browser-supplied provenance/evidence fields",
);

assert(
  source.revisionRoute.includes(
    '"TEACHER_SUPERVISORY_REVISION_CONFIRMATION_REQUIRED"',
  ),
  "Explicit revision confirmation must be required",
);

assert(
  source.revisionRoute.includes(
    'result.outcome === "CREATED" ? 201 : 200',
  ),
  "Revision API CREATED/idempotent status mapping missing",
);

assert(
  source.revisionRoute.includes(
    "/governance/appraisals/teacher-supervisory?assessmentId=",
  ),
  "Revision workspace handoff missing",
);

for (const browserControlledField of [
  "actorUserId",
  "actorRoleName",
  "assessorUserId",
  "assessorAssignmentId",
  "cycleId",
  "revision",
  "priorAssessmentId",
  "reviewerUserId",
  "reviewerAssignmentId",
  "reviewStage",
  "returnReviewId",
  "returnReason",
  "assessmentHash",
  "observationContextHash",
  "reviewEvidenceHash",
  "decisionRequestHash",
  "decisionEvidenceHash",
  "scores",
  "generalComment",
  "evidenceSnapshotJson",
]) {
  assert(
    !source.revisionRoute.includes(`parsed.body.${browserControlledField}`),
    "Revision API must not trust browser-controlled authority/evidence fields",
    browserControlledField,
  );
}

assert(
  source.shared.includes("maxJsonBodyBytes: 16_384") &&
    source.shared.includes('"Cache-Control": "no-store, max-age=0"') &&
    source.shared.includes('"X-Content-Type-Options": "nosniff"') &&
    source.shared.includes('"Referrer-Policy": "no-referrer"'),
  "Existing bounded JSON / no-store security boundary missing",
);

for (const serviceMarker of [
  "verifyTeacherSupervisorySealedAssessmentEvidence",
  "planReturnedTeacherSupervisoryRevision",
  "planTeacherSupervisoryCorrectionContinuation",
  "decideTeacherSupervisoryAssessmentAuthority",
  "TEACHER_SUPERVISORY_REVISION_ORIGINAL_ASSESSOR_ONLY",
  'normalized(source.status) !== "RETURNED"',
  'status: "DRAFT"',
  "priorAssessmentId: source.id",
  'status: "SUPERSEDED"',
  "EXISTING_MATCH",
  'code === "P2002"',
  'code === "P2034"',
  "cycleMutationPerformed: false",
  "reviewMutationPerformed: false",
  "reviewerMayRewriteScores: false",
  "reviewerMayRewriteComment: false",
  "providerCalled: false",
]) {
  assert(
    source.revisionService.includes(serviceMarker),
    "Revision service safety marker missing",
    serviceMarker,
  );
}

assert(
  source.scoring.includes("metadata.correctionRevision !== true") &&
    source.scoring.includes(
      "TEACHER_SUPERVISORY_SCORING_CYCLE_NOT_EDITABLE",
    ) &&
    source.scoring.includes("assertCorrectionRevisionBoundary"),
  "N6-E4A narrow correction-editability bridge regression",
);

for (const forbidden of [
  "prisma.",
  "appraisalAssessment.create",
  "appraisalAssessment.update",
  "appraisalAssessmentScore.create",
  "appraisalAssessmentScore.createMany",
  "appraisalCycle.update",
  "appraisalReview.create",
  "appraisalReview.update",
  "auditLog.create",
  "teacherAppraisal",
  "sendSms",
  "sendEmail",
  "appraisalNotification",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(
    !source.revisionRoute.includes(forbidden),
    "Thin revision route contains forbidden direct mutation/provider marker",
    forbidden,
  );
}

console.log("");
console.log("=== N6-E4B GOVERNANCE TEACHER ORIGINAL-ASSESSOR REVISION THIN API ===");
console.log("");
console.log("Endpoint                         : teacher-supervisory/{assessmentId}/revision POST");
console.log("Audience                         : governance assessor auth boundary");
console.log("Creator custody                  : original assessor enforced by service");
console.log("Current assessor authority       : revalidated by service");
console.log("Assessment id                    : strict UUID");
console.log("Body                             : application/json + 16 KiB bound");
console.log("Allowed browser field            : confirmRevision only");
console.log("Explicit confirmation            : required");
console.log("Source assessment                : RETURNED sealed evidence");
console.log("Return provenance                : server resolved + reverified");
console.log("Revision number                  : server computed");
console.log("priorAssessmentId                : server controlled");
console.log("Scores / comment / evidence      : server copied from sealed source");
console.log("Source transition                : service-owned RETURNED -> SUPERSEDED");
console.log("New revision                     : service-owned DRAFT revision + 1");
console.log("Correction cycle                 : UNDER_REVIEW unchanged");
console.log("CREATED response                 : 201");
console.log("EXISTING_MATCH retry             : 200");
console.log("Workspace handoff                : returned revision assessment URL");
console.log("Direct Prisma mutation in route  : absent");
console.log("Authority/evidence body fields   : forbidden");
console.log("No-store / nosniff / no-referrer : complete");
console.log("Legacy TeacherAppraisal          : untouched");
console.log("Notifications/providers          : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-E4B GOVERNANCE TEACHER REVISION THIN API GREEN");
