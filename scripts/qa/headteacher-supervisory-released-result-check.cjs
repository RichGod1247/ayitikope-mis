#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), `Required file missing: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function transpile(source, fileName) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      strict: true,
    },
    fileName,
    reportDiagnostics: true,
  });
  const errors = (output.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.strictEqual(
    errors.length,
    0,
    `TypeScript syntax failed: ${fileName}\n${errors.map((error) => String(error.messageText)).join("\n")}`,
  );
}

const servicePath = "src/lib/appraisals/headteacherSupervisoryReleasedResult.ts";
const detailRoutePath =
  "src/app/api/headteacher/appraisals/governance-released/[assessmentId]/route.ts";
const directReleasePath =
  "src/lib/appraisals/headteacherSupervisoryDirectorDirectRelease.ts";
const reviewedReleasePath =
  "src/lib/appraisals/headteacherDirectorGovernanceReview.ts";

const service = read(servicePath);
const detailRoute = read(detailRoutePath);
const directRelease = read(directReleasePath);
const reviewedRelease = read(reviewedReleasePath);

transpile(service, servicePath);

for (const marker of [
  "HEADTEACHER_SUPERVISORY_RELEASED_RESULT_POLICY",
  'audience: "RELEASED_HEADTEACHER_GOVERNANCE"',
  'requiredRole: "HEADTEACHER"',
  'requiredAssessmentStatus: "FINALIZED"',
  "minimumAssessmentRevision: 1",
  '"DIRECTOR_AUTHORED_DIRECT_RELEASE"',
  '"DIRECTOR_REVIEWED_GOVERNANCE_RELEASE"',
  "carrierCycleReleasedStatusRequired: false",
  "independentReleaseProofRequired: true",
  "releaseProofReverificationRequired: true",
  "expectedSectionCount: 4",
  "expectedItemCount: 34",
  "expectedRawMaximum: 170",
  "expectedSectionMaximums: [55, 45, 40, 30]",
  "commentsIncluded: false",
  "assessorOfficeIncluded: true",
  "assessorIdentityIncluded: false",
  "reviewerIdentityIncluded: false",
  "staffFeedbackIncluded: false",
  "staffResponsesIncluded: false",
  "respondentIdentitiesIncluded: false",
  "combinedScoreIncluded: false",
  "staffFeedbackPrerequisite: false",
  "calculateAppraisalScores",
  "visitDetailsFromEvidenceSnapshot",
  "HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY",
  "verifyDirectRelease",
  "verifyReviewedGovernanceRelease",
  "reviewedReviewEvidenceHash",
  "reviewEvidenceHash !== expectedReviewEvidenceHash",
  'clean(metadata.decisionAction) !== "RELEASE"',
  "verifyIndependentRelease",
  "computeHeadteacherSupervisoryDirectorDirectReleaseDecisionContractHash",
  "computeHeadteacherSupervisoryDirectorDirectReleaseRequestHash",
  "computeHeadteacherSupervisoryDirectorDirectReleaseEvidenceHash",
  "computeHeadteacherSupervisoryDirectorDirectReleaseProofHashFromMetadata",
  "computeHeadteacherDirectorGovernanceReleaseProofHashFromMetadata",
  "isHeadteacherDirectorGovernanceReviewedReleaseMetadata",
  "reviewedDecisionContractHash",
  "reviewedReleaseRequestHash",
  "reviewedReleaseEvidenceHash",
  "record.revision !== 1",
  "record.priorAssessmentId !== null",
  "record.reviews.length !== 0",
  'visitContext.assessorRole !== "DISTRICT_DIRECTOR"',
  'normalized(release.releaserRole) !== "DISTRICT_DIRECTOR"',
  'normalized(review.decision) !== "ACCEPTED"',
  "review.decidedAt.toISOString() !== releasedDate.toISOString()",
  "review.reviewerUserId === record.assessorUserId",
  "release.reviewRowsRequired !== true",
  "release.reviewRowsPresent !== true",
  "pendingDirectorReview",
  "release.staffFeedbackRequired !== false",
  "release.staffFeedbackAccessed !== false",
  "release.respondentIdentitiesAccessed !== false",
  "release.individualStaffResponsesAccessed !== false",
  "release.carrierCycleStatusMutationPerformed !== false",
  "release.carrierCycleTimestampMutationPerformed !== false",
  "release.participantMutationPerformed !== false",
  "release.reviewerMayRewriteScores !== false",
  "release.separateEvidenceStreams !== true",
  "release.combinedWeightingDefined !== false",
  "assessorOffice(visitContext.assessorRole)",
  "revision: record.revision",
  "readHeadteacherSupervisoryReleasedResult",
]) {
  assert(service.includes(marker), `Released-result dual-mode marker missing: ${marker}`);
}

for (const marker of [
  'case "SISSO"',
  'return "SISSO"',
  'case "BASIC_SCHOOL_COORDINATOR"',
  'return "Basic School Coordinator"',
  'case "HEAD_OF_SUPERVISION"',
  'return "Head of Supervision"',
  'case "DISTRICT_DIRECTOR"',
  'return "District Director"',
]) {
  assert(service.includes(marker), `Assessor-office mapping missing: ${marker}`);
}

for (const forbidden of [
  "readHeadteacherFeedbackAggregateReadiness",
  "headteacherFeedbackResponse",
  "appraisalResponse",
  "appraisalParticipant",
  "respondentUserId",
  "appraisalAssessment.update",
  "appraisalAssessment.updateMany",
  "appraisalCycle.update",
  "appraisalCycle.updateMany",
  "appraisalReview.create",
  "auditLog.create",
  "sendSms",
  "sendEmail",
  "appraisalNotification",
]) {
  assert(!service.includes(forbidden), `Released-result reader contains forbidden mutation/coupling marker: ${forbidden}`);
}

assert(
  directRelease.includes(
    'export const HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY =\n  "headteacherSupervisoryReleases"',
  ) &&
    directRelease.includes(
      "export function computeHeadteacherSupervisoryDirectorDirectReleaseProofHashFromMetadata",
    ),
  "Director-authored direct-release proof helpers changed or disappeared",
);

for (const marker of [
  'releaseMode: "DIRECTOR_REVIEWED_GOVERNANCE_RELEASE"',
  "computeHeadteacherDirectorGovernanceReleaseProofHashFromMetadata",
  "isHeadteacherDirectorGovernanceReviewedReleaseMetadata",
  "reviewRowsRequired: true",
  "reviewRowsPresent: true",
  "staffFeedbackRequired: false",
  "staffFeedbackAccessed: false",
  "carrierCycleStatusMutationPerformed: false",
  "carrierCycleTimestampMutationPerformed: false",
]) {
  assert(reviewedRelease.includes(marker), `B1 reviewed-release source marker missing: ${marker}`);
}

for (const marker of [
  "requireApiUserContext",
  'requireRoleNames: ["HEADTEACHER"]',
  "requireTenant: true",
  "readHeadteacherSupervisoryReleasedResult",
  "assessmentId",
  "isUuidIdentifier",
  '"Cache-Control": "no-store, max-age=0"',
  '"X-Content-Type-Options": "nosniff"',
  '"Referrer-Policy": "no-referrer"',
]) {
  assert(detailRoute.includes(marker), `Headteacher Governance detail API marker missing: ${marker}`);
}

for (const forbiddenMethod of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
]) {
  assert(!detailRoute.includes(forbiddenMethod), `Headteacher Governance detail API must remain GET-only: ${forbiddenMethod}`);
}

for (const forbidden of ["prisma.", "appraisalAssessment.update", "appraisalCycle.update"] ) {
  assert(!detailRoute.includes(forbidden), `Thin detail API contains forbidden direct database marker: ${forbidden}`);
}

assert(
  detailRoute.includes("actorUserId: auth.ctx.userId") &&
    detailRoute.includes("actorRoleName: auth.ctx.roleName") &&
    detailRoute.includes("actorTenantId: auth.ctx.tenantId"),
  "Detail API must derive recipient authority from authenticated server context",
);

console.log("");
console.log("=== N7 GOVERNANCE INDEPENDENCE — SLICE B2 RELEASED RESULT CONTRACT ===");
console.log("");
console.log("Audience                         : Headteacher only");
console.log("Detail key                       : assessmentId");
console.log("Release modes                    : direct-release + Director-reviewed Governance");
console.log("Direct-release proof             : preserved + reverified");
console.log("Reviewed release proof           : decision/request/evidence/proof rehashed");
console.log("Reviewed release review row      : accepted Director row required");
console.log("Director self-review             : forbidden + reverified");
console.log("Corrected assessment revision    : supported");
console.log("Assessor office                  : SISSO / BSC / HOS / Director");
console.log("Assessor identity                : absent from recipient result");
console.log("Reviewer identity                : absent from recipient result");
console.log("Staff responses / identities     : absent");
console.log("Combined score                   : absent");
console.log("Carrier cycle RELEASED required  : false");
console.log("Mutation/provider paths          : absent");
console.log("API                              : GET-only + no-store");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N7 GOVERNANCE INDEPENDENCE SLICE B2 RELEASED RESULT GREEN");
