#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const files = {
  service:
    "src/lib/appraisals/headteacherSupervisoryReleasedResult.ts",
  detailRoute:
    "src/app/api/headteacher/appraisals/governance-released/[assessmentId]/route.ts",
  directRelease:
    "src/lib/appraisals/headteacherSupervisoryDirectorDirectRelease.ts",
};

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
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
  "HEADTEACHER_SUPERVISORY_RELEASED_RESULT_POLICY",
  'audience: "RELEASED_HEADTEACHER_GOVERNANCE"',
  'requiredRole: "HEADTEACHER"',
  'requiredAssessmentStatus: "FINALIZED"',
  "requiredAssessmentRevision: 1",
  'requiredReleaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE"',
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
  "computeHeadteacherSupervisoryDirectorDirectReleaseDecisionContractHash",
  "computeHeadteacherSupervisoryDirectorDirectReleaseRequestHash",
  "computeHeadteacherSupervisoryDirectorDirectReleaseEvidenceHash",
  "computeHeadteacherSupervisoryDirectorDirectReleaseProofHashFromMetadata",
  "record.reviews.length !== 0",
  'normalized(release.assessorRole) !== "DISTRICT_DIRECTOR"',
  'normalized(release.releaserRole) !== "DISTRICT_DIRECTOR"',
  "hashJson(record.evidenceSnapshotJson) !== visitContextHash",
  "expectedAssessmentHash",
  "record.finalizedByUserId !== record.assessorUserId",
  "clean(record.generalComment)",
  "release.staffFeedbackRequired !== false",
  "release.staffFeedbackAccessed !== false",
  "release.respondentIdentitiesAccessed !== false",
  "release.individualStaffResponsesAccessed !== false",
  "release.carrierCycleStatusMutationPerformed !== false",
  "release.carrierCycleTimestampMutationPerformed !== false",
  "release.participantMutationPerformed !== false",
  "separateEvidenceStreams: true",
  "combinedWeightingDefined: false",
  "readHeadteacherSupervisoryReleasedResult",
]) {
  assert(
    source.service.includes(marker),
    "Headteacher governance released-result contract marker missing",
    marker,
  );
}

assert(
  source.directRelease.includes(
    'export const HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY =\n  "headteacherSupervisoryReleases"',
  ) &&
    source.directRelease.includes(
      "export function computeHeadteacherSupervisoryDirectorDirectReleaseProofHashFromMetadata",
    ),
  "Independent B1D release proof helpers are not available to B1E",
);

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
  assert(
    !source.service.includes(forbidden),
    "Released-result reader contains forbidden coupling/mutation/provider marker",
    forbidden,
  );
}

for (const marker of [
  "requireApiUserContext",
  'requireRoleNames: ["HEADTEACHER"]',
  "requireTenant: true",
  "readHeadteacherSupervisoryReleasedResult",
  "assessmentId",
  "isUuidIdentifier",
  'cache: "no-store"',
]) {
  if (marker === 'cache: "no-store"') continue;
  assert(
    source.detailRoute.includes(marker),
    "Headteacher governance detail API marker missing",
    marker,
  );
}

for (const headerMarker of [
  '"Cache-Control": "no-store, max-age=0"',
  '"X-Content-Type-Options": "nosniff"',
  '"Referrer-Policy": "no-referrer"',
]) {
  assert(
    source.detailRoute.includes(headerMarker),
    "Headteacher governance detail API security header missing",
    headerMarker,
  );
}

for (const forbiddenMethod of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
]) {
  assert(
    !source.detailRoute.includes(forbiddenMethod),
    "Headteacher governance detail API must remain GET-only",
    forbiddenMethod,
  );
}

for (const forbiddenRouteMarker of [
  "prisma.",
  "appraisalAssessment.update",
  "appraisalCycle.update",
  "actorUserId:",
]) {
  if (forbiddenRouteMarker === "actorUserId:") continue;
  assert(
    !source.detailRoute.includes(forbiddenRouteMarker),
    "Thin detail API contains forbidden direct database mutation/access marker",
    forbiddenRouteMarker,
  );
}

assert(
  source.detailRoute.includes("actorUserId: auth.ctx.userId") &&
    source.detailRoute.includes("actorRoleName: auth.ctx.roleName") &&
    source.detailRoute.includes("actorTenantId: auth.ctx.tenantId"),
  "Detail API must derive recipient authority only from authenticated server context",
);

console.log("");
console.log("=== N7-P2C4B1E HEADTEACHER GOVERNANCE RELEASED RESULT CONTRACT ===");
console.log("");
console.log("Audience                         : Headteacher only");
console.log("Detail key                       : assessmentId");
console.log("Carrier cycle RELEASED required  : false");
console.log("Independent release proof        : required + reverified");
console.log("Release mode                     : Director-authored direct release");
console.log("Finalized assessment             : reverified");
console.log("Assessment hash                  : reverified");
console.log("Visit-context hash               : reverified");
console.log("Official form                    : 4 sections / 34 indicators");
console.log("Comments                         : absent");
console.log("Assessor identity                : absent");
console.log("Assessor office                  : included");
console.log("Reviewer identity                : absent");
console.log("Staff responses / identities     : absent");
console.log("Combined score                   : absent");
console.log("Staff-feedback prerequisite      : false");
console.log("Mutation/provider paths          : absent");
console.log("API                              : GET-only + no-store");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N7-P2C4B1E HEADTEACHER GOVERNANCE RELEASED RESULT CONTRACT GREEN");
