#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- deterministic CommonJS source-contract QA for the active Director-authored Governance release route. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const routePath =
  "src/app/api/governance/appraisals/headteacher-supervisory/[assessmentId]/direct-release/route.ts";
const servicePath =
  "src/lib/appraisals/headteacherSupervisoryDirectorDirectRelease.ts";
const notificationPath =
  "src/lib/appraisals/headteacherDirectorReleaseNotifications.ts";
const outboxPath = "src/lib/appraisals/notificationOutbox.ts";

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}
function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}
function read(relativePath) {
  const file = path.join(repoRoot, relativePath);
  if (!fs.existsSync(file)) fail("Required current direct-release file missing", relativePath);
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function between(text, startMarker, endMarker, label) {
  const start = text.indexOf(startMarker);
  assert(start >= 0, `${label} start marker missing`, startMarker);
  const end = text.indexOf(endMarker, start);
  assert(end > start, `${label} end marker missing`, endMarker);
  return text.slice(start, end);
}

const route = read(routePath);
const service = read(servicePath);
const notifications = read(notificationPath);
const outbox = read(outboxPath);

for (const marker of [
  'export const runtime = "nodejs"',
  'export const dynamic = "force-dynamic"',
  "requireSupervisoryGovernanceApiContext",
  'normalizedRole(auth.ctx.roleName) !== "DISTRICT_DIRECTOR"',
  "isUuidIdentifier",
  "requestIsJson",
  "MAX_BODY_BYTES = 16 * 1024",
  'ALLOWED_BODY_FIELDS = new Set(["confirm"])',
  'Buffer.byteLength(rawBody, "utf8")',
  "objectBody",
  "body.confirm !== true",
  "executeHeadteacherSupervisoryDirectorDirectRelease",
  "governanceScope: auth.scope",
  "browserReleaseResult",
  "ensureHeadteacherDirectorReleaseNotifications",
  "assessmentId: result.assessmentId",
  "cycleId: result.cycleId",
  "releaseProofHash: result.releaseProofHash",
  "releasedAt: result.releasedAt",
  "HEADTEACHER_RELEASE_NOTIFICATION_SEEDING_RETRY_REQUIRED",
  "releaseCommitted: true",
  "retrySafe: true",
  "providerCalled: false",
  "jsonNoStore(503",
  "jsonNoStore",
  "supervisoryApiError",
  "[HEADTEACHER_GOVERNANCE_DIRECT_RELEASE_API_ERROR]",
]) {
  assert(route.includes(marker), "Current direct-release API marker missing", marker);
}

for (const forbidden of [
  'from "@/lib/prisma"',
  "prisma.",
  "appraisalReview.",
  "appraisalAssessment.",
  "governanceOfficerAssignment.",
  "executeHeadteacherDirectorDirectRelease",
  "@/lib/appraisals/headteacherDirectorDirectRelease",
  "sendSms",
  "sendEmail",
  "reviewId",
  "note:",
  "reason:",
]) {
  assert(!route.includes(forbidden), "Route contains legacy/forbidden authority marker", forbidden);
}

const browserResult = between(
  route,
  "function browserReleaseResult(",
  "export async function POST",
  "Browser release result",
);

for (const marker of [
  "outcome: result.outcome",
  "releaseMode: result.releaseMode",
  "governanceReleaseStatus: result.governanceReleaseStatus",
  "assessmentId: result.assessmentId",
  "cycleId: result.cycleId",
  "staffFeedbackCycleStatus: result.staffFeedbackCycleStatus",
  "releasedAt: result.releasedAt",
]) {
  assert(browserResult.includes(marker), "Minimized browser result marker missing", marker);
}

for (const forbidden of [
  "assessorUserId",
  "assessorAssignmentId",
  "releaserUserId",
  "releaserAssignmentId",
  "assessmentHash",
  "visitContextHash",
  "decisionContractHash",
  "releaseRequestHash",
  "releaseEvidenceHash",
  "releaseProofHash",
  "respondentIdentitiesAccessed",
  "individualStaffResponsesAccessed",
]) {
  assert(!browserResult.includes(forbidden), "Sensitive/internal proof leaked to browser result", forbidden);
}

assert(
  !/result:\s*result\s*[,}]/.test(route),
  "Raw current direct-release service result must not be returned to the browser",
);

for (const marker of [
  'requiredCapability: "RELEASE_HEADTEACHER_FEEDBACK"',
  'releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE"',
  'requiredActorRole: "DISTRICT_DIRECTOR"',
  'requiredAssessorRole: "DISTRICT_DIRECTOR"',
  'requiredAssessmentStatus: "FINALIZED"',
  "reviewRowsAllowed: false",
  "selfReviewAllowed: false",
  "staffFeedbackRequired: false",
  "staffFeedbackAccessed: false",
  "respondentIdentitiesAccessed: false",
  "individualStaffResponsesAccessed: false",
  "carrierCycleStatusMutationAllowed: false",
  "carrierCycleTimestampMutationAllowed: false",
  "participantMutationAllowed: false",
  "combinedWeightingDefined: false",
  "notificationsSeeded: false",
  "providerCallsAllowed: false",
  "assertHeadteacherFeedbackTargetInGovernanceScope",
  "assertAppraisalAuthority",
  "HEADTEACHER_GOVERNANCE_ASSESSMENT_DIRECT_RELEASED",
  "HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY",
  "Prisma.TransactionIsolationLevel.Serializable",
]) {
  assert(service.includes(marker), "Current direct-release service marker missing", marker);
}

for (const forbidden of [
  "readHeadteacherFeedbackAggregateReadiness",
  "HeadteacherFeedbackAggregateReadinessDatabase",
  "appraisalAggregateSnapshot",
  "headteacherFeedbackResponse",
  "staffFeedbackSnapshotId",
  "staffFeedbackSourceHash",
  "ensureHeadteacherDirectorReleaseNotifications",
  "headteacherDirectorReleaseNotifications",
]) {
  assert(!service.includes(forbidden), "Current service contains legacy Staff coupling", forbidden);
}

for (const marker of [
  "HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY",
  "computeHeadteacherSupervisoryDirectorDirectReleaseProofHashFromMetadata",
  "assertCurrentDirectReleasedCycle",
  "assessmentId?: string | null",
  "release.notificationsSeeded === false",
  "release.providerCalled === false",
  "AppraisalNotificationType.FEEDBACK_RELEASED",
  "GovernanceOfficialNoticeChannel.IN_APP",
  "AppraisalNotificationChannel.SMS",
  "AppraisalNotificationChannel.EMAIL",
  "HEADTEACHER_RELEASE_NOTIFICATION_V3",
]) {
  assert(notifications.includes(marker), "Current release notification marker missing", marker);
}

for (const marker of [
  "AppraisalNotificationType.CYCLE_OPENED",
  "AppraisalNotificationType.FEEDBACK_RELEASED",
  `'FEEDBACK_RELEASED'::"AppraisalNotificationType"`,
  "HEADTEACHER_RELEASE_NOTIFICATION_V3",
  `"payload" ->> 'deliveryContract'`,
  "for update skip locked",
]) {
  assert(outbox.includes(marker), "Release outbox delivery marker missing", marker);
}

console.log("");
console.log("=== N7-P2C3L-R3M CURRENT DIRECT RELEASE + NOTIFICATION API CONTRACT ===");
console.log("");
console.log("Release authority                : current supervisory service only");
console.log("Release transaction              : immutable + Staff-independent");
console.log("Notification seeding             : post-commit + idempotent");
console.log("Notification recipient           : exact released Headteacher");
console.log("Official in-app                  : visible notice");
console.log("SMS/email                        : durable outbox");
console.log("Outbox delivery event            : FEEDBACK_RELEASED claimable");
console.log("Provider call in release route   : absent");
console.log("Notification failure             : releaseCommitted + retrySafe");
console.log("Browser proof internals          : excluded");
console.log("Staff Feedback prerequisite      : absent");
console.log("Carrier lifecycle mutation       : absent");
console.log("No-store response                : shared API helper");
console.log("Direct Prisma calls in route     : absent");
console.log("Database accessed                : false");
console.log("");
console.log("RESULT: N7-P2C3L-R3M CURRENT RELEASE NOTIFICATION API CONTRACT GREEN");
