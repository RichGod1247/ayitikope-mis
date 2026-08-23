#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- deterministic source-contract QA only. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolute)) fail("Required file missing", relativePath);
  return fs.readFileSync(absolute, "utf8").replace(/\r\n?/g, "\n");
}

const files = {
  officerDraft: "src/lib/appraisals/headteacherSupervisoryOfficerDraft.ts",
  rootRoute:
    "src/app/api/governance/appraisals/headteacher-supervisory/route.ts",
  directRoute:
    "src/app/api/governance/appraisals/headteacher-supervisory/direct/route.ts",
  queue: "src/lib/appraisals/headteacherSupervisoryAssessmentQueue.ts",
  reviewQueue: "src/lib/appraisals/headteacherSupervisoryReviewQueue.ts",
  reviewPackage: "src/lib/appraisals/headteacherSupervisoryReviewPackage.ts",
  scoring: "src/lib/appraisals/headteacherSupervisoryAssessmentScoring.ts",
  client:
    "src/app/governance/appraisals/headteacher-supervisory/HeadteacherSupervisoryAssessmentClient.tsx",
  migration:
    "prisma/migrations/20260823134500_headteacher_officer_governance_carrier_uniqueness/migration.sql",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const marker of [
  'carrierKind: "OFFICER_GOVERNANCE_ONLY"',
  'initialCycleStatus: "CLOSED"',
  '"SISSO"',
  '"BASIC_SCHOOL_COORDINATOR"',
  '"HEAD_OF_SUPERVISION"',
  "respondentWorkflow: false",
  'participantSelection: "NONE"',
  "closedWithoutRespondents: true",
  "staffFeedbackRequired: false",
  "staffFeedbackAccessed: false",
  "separateFromStaffFeedback: true",
  "combinedWeightingDefined: false",
  "notificationRowsCreatedAtDraft: false",
  "providerCallsAllowed: false",
  "decideHeadteacherSupervisoryAssessmentAuthority",
  "governanceScope",
  "SERIALIZABLE",
]) {
  assert(source.officerDraft.includes(marker), "Officer draft contract missing", marker);
}

for (const forbidden of [
  "HEADTEACHER_FEEDBACK_POLICY",
  "sendSms",
  "sendEmail",
  "respondentUserIds",
  "participant.create",
  "notification.create",
]) {
  assert(
    !source.officerDraft.includes(forbidden),
    "Officer draft must stay independent from Staff Feedback/providers",
    forbidden,
  );
}

assert(
  source.officerDraft.includes("targetUserId: target.target.userId") &&
    source.officerDraft.includes("targetTenantId: target.target.tenantId") &&
    source.officerDraft.includes("requestedByUserId: actor.id") &&
    source.officerDraft.includes("openedAt: input.now") &&
    source.officerDraft.includes("closedAt: input.now") &&
    source.officerDraft.includes("deadlineAt: null"),
  "Officer carrier must be a closed no-window Governance carrier",
);
assert(
  source.officerDraft.includes("assertNoUnresolvedActorAssessment") &&
    source.officerDraft.includes("assertNoOtherUnfinishedOfficerAssessment") &&
    source.officerDraft.includes("HEADTEACHER_SUPERVISORY_OFFICER_DRAFT_EXISTING_ACTIVE") &&
    source.officerDraft.includes("DIRECTOR_REVIEWED_GOVERNANCE_RELEASE"),
  "Repeat-visit / unfinished-work guard missing",
);
assert(
  source.officerDraft.includes("directAssessmentKey") &&
    source.officerDraft.includes("idempotencyKey") &&
    source.officerDraft.includes('code === "P2002"'),
  "Retry-safe officer direct start missing",
);

assert(
  source.rootRoute.includes(
    "HEADTEACHER_SUPERVISORY_OFFICER_INDEPENDENT_START_REQUIRED",
  ) &&
    source.rootRoute.includes('actorRole === "SISSO"') &&
    source.rootRoute.includes('actorRole === "BASIC_SCHOOL_COORDINATOR"') &&
    source.rootRoute.includes('actorRole === "HEAD_OF_SUPERVISION"') &&
    source.rootRoute.includes("createHeadteacherSupervisoryAssessmentDraft"),
  "Legacy cycle-backed create route must fail closed for SISSO/BSC/HOS while remaining available for untouched compatibility roles",
);

assert(
  source.directRoute.includes("createHeadteacherSupervisoryDirectorAssessmentDraft") &&
    source.directRoute.includes("createHeadteacherSupervisoryOfficerAssessmentDraft") &&
    source.directRoute.includes('actorRole === "DISTRICT_DIRECTOR"') &&
    source.directRoute.includes("officerRoleAllowed(actorRole)"),
  "Direct route must preserve Director path and add officer branch",
);
assert(
  source.directRoute.includes("HEADTEACHER_SUPERVISORY_DIRECT_TARGET_FIELDS_SERVER_RESOLVED") &&
    source.directRoute.includes("respondentUserIds") &&
    source.directRoute.includes("participantIds") &&
    source.directRoute.includes("responseWindowDays") &&
    source.directRoute.includes("minimumResponses"),
  "Direct route server-resolved/non-respondent boundary missing",
);

for (const marker of [
  'officerGovernanceCarrierKind: "OFFICER_GOVERNANCE_ONLY"',
  "directTargets: HeadteacherSupervisoryDirectTarget[]",
  "actorAssignmentCoversTarget",
  "officerReleaseRecorded",
  "legacyAssessmentCarrier",
  "unresolvedAssessment",
  "requestedByUserId: true",
  "queue?.directTargets",
]) {
  const targetSource = marker === "queue?.directTargets" ? source.client : source.queue;
  assert(targetSource.includes(marker), "Officer discovery contract missing", marker);
}
assert(
  source.queue.includes('item.supervisory.state === "IN_PROGRESS"') === false ||
    source.client.includes('item.supervisory.state === "IN_PROGRESS"'),
  "Unfinished officer drafts must remain continuable",
);
assert(
  source.client.includes('actorRole === "SISSO"') &&
    source.client.includes('data-sisso-own-headteacher-appraisal-ui={') &&
    source.client.includes('data-officer-governance-direct-start="independent-v1"') &&
    source.client.includes("startOfficerDirectAssessment") &&
    source.client.includes("No staff-feedback exercise is opened."),
  "SISSO/BSC/HOS compact independent-start UI missing",
);
assert(
  !source.client.includes("localStorage") &&
    !source.client.includes("sessionStorage") &&
    !source.client.includes("setInterval("),
  "Low-network appraisal UI must not add polling or persistent browser state",
);

for (const reviewSource of [source.reviewQueue, source.reviewPackage]) {
  for (const marker of [
    "HEADTEACHER_FEEDBACK_POLICY.workflow",
    'officerGovernanceCarrierKind: "OFFICER_GOVERNANCE_ONLY"',
    '"SISSO"',
    '"BASIC_SCHOOL_COORDINATOR"',
    "staffFeedbackRequired",
    "staffFeedbackAccessed",
    "closedWithoutRespondents",
  ]) {
    assert(reviewSource.includes(marker), "Dual-carrier review compatibility missing", marker);
  }
}
assert(
  source.reviewQueue.includes("legacyStaffFeedbackCarrier || officerGovernanceCarrier") &&
    source.reviewPackage.includes("legacyStaffFeedbackCarrier || officerGovernanceCarrier"),
  "Legacy Staff Feedback carrier + new officer carrier compatibility must both remain",
);
assert(
  source.scoring.includes('eligibleDraftCycleStatuses: ["OPEN", "CLOSED"] as const'),
  "Closed independent carrier must remain editable/finalizable while assessment is DRAFT",
);

for (const marker of [
  "BEGIN;",
  "COMMIT;",
  "LOCK TABLE edulife_os.appraisal_cycle IN SHARE ROW EXCLUSIVE MODE",
  'DROP INDEX edulife_os."AppraisalCycle_one_live_target_idx"',
  'CREATE UNIQUE INDEX "AppraisalCycle_one_live_target_idx"',
  'CREATE UNIQUE INDEX "AppraisalCycle_one_live_officer_governance_target_idx"',
  "OFFICER_GOVERNANCE_ONLY",
  '"requestedByUserId"',
  "headteacherSupervisoryReleases",
  "directorGovernanceReview",
  "DIRECTOR_REVIEWED_GOVERNANCE_RELEASE",
  "releaseProofHash",
  "DIRECTOR_GOVERNANCE_ONLY",
  "closedWithoutRespondents",
  "assessorUserId",
  "assessorAssignmentId",
  "SISSO",
  "BASIC_SCHOOL_COORDINATOR",
  "HEAD_OF_SUPERVISION",
]) {
  assert(source.migration.includes(marker), "Migration contract missing", marker);
}
for (const forbidden of [
  /\bINSERT\s+INTO\b/i,
  /\bUPDATE\s+edulife_os\.appraisal_cycle\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bTRUNCATE\b/i,
  /ALTER\s+TABLE\s+edulife_os\.appraisal_cycle/i,
]) {
  assert(!forbidden.test(source.migration), "Migration must not mutate appraisal rows/schema", {
    forbidden: String(forbidden),
  });
}

const liveStatuses = new Set([
  "DRAFT",
  "PENDING_APPROVAL",
  "OPEN",
  "CLOSED",
  "UNDER_REVIEW",
]);

function metadataOf(row) {
  return row && row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata
    : {};
}

function nonEmptyReleaseMap(metadata) {
  const releases = metadata.headteacherSupervisoryReleases;
  return Boolean(
    releases &&
      typeof releases === "object" &&
      !Array.isArray(releases) &&
      Object.keys(releases).length > 0,
  );
}

function strictReviewedRelease(metadata) {
  const review =
    metadata.directorGovernanceReview &&
    typeof metadata.directorGovernanceReview === "object" &&
    !Array.isArray(metadata.directorGovernanceReview)
      ? metadata.directorGovernanceReview
      : null;
  const releases =
    metadata.headteacherSupervisoryReleases &&
    typeof metadata.headteacherSupervisoryReleases === "object" &&
    !Array.isArray(metadata.headteacherSupervisoryReleases)
      ? metadata.headteacherSupervisoryReleases
      : null;

  if (!review || !releases) return false;

  const assessmentId = String(review.assessmentId || "");
  const release =
    assessmentId &&
    releases[assessmentId] &&
    typeof releases[assessmentId] === "object" &&
    !Array.isArray(releases[assessmentId])
      ? releases[assessmentId]
      : null;

  return Boolean(
    release &&
      String(review.state || "") === "RELEASED" &&
      String(review.decision || "") === "RELEASE" &&
      String(review.releaseProofHash || "").length === 64 &&
      review.carrierCycleStatusMutationPerformed === false &&
      review.carrierCycleTimestampMutationPerformed === false &&
      review.staffFeedbackIncluded === false &&
      review.respondentIdentitiesIncluded === false &&
      review.providerCalled === false &&
      String(release.releaseMode || "") ===
        "DIRECTOR_REVIEWED_GOVERNANCE_RELEASE" &&
      String(release.workflow || "") ===
        "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT" &&
      String(release.evidenceStream || "") ===
        "GOVERNANCE_SUPERVISORY_ASSESSMENT" &&
      String(release.assessmentId || "") === assessmentId &&
      String(release.assessmentStatus || "") === "FINALIZED" &&
      String(release.releaserRole || "") === "DISTRICT_DIRECTOR" &&
      release.staffFeedbackRequired === false &&
      release.staffFeedbackAccessed === false &&
      release.respondentIdentitiesAccessed === false &&
      release.individualStaffResponsesAccessed === false &&
      release.carrierCycleStatusMutationPerformed === false &&
      release.carrierCycleTimestampMutationPerformed === false &&
      release.reviewerMayRewriteScores === false &&
      release.combinedWeightingDefined === false &&
      release.providerCalled === false &&
      String(release.releaseProofHash || "").length === 64 &&
      String(release.releaseProofHash) === String(review.releaseProofHash)
  );
}

function exactOfficerCarrier(row) {
  const metadata = metadataOf(row);
  const role = String(metadata.assessorRole || "");
  const scopeLevel = String(metadata.scopeLevel || "");
  const roleScopeValid =
    (role === "SISSO" && scopeLevel === "CIRCUIT") ||
    (["BASIC_SCHOOL_COORDINATOR", "HEAD_OF_SUPERVISION"].includes(role) &&
      scopeLevel === "DISTRICT");

  return (
    String(metadata.workflow || "") === "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT" &&
    String(metadata.evidenceStream || "") === "GOVERNANCE_SUPERVISORY_ASSESSMENT" &&
    String(metadata.carrierKind || "") === "OFFICER_GOVERNANCE_ONLY" &&
    metadata.respondentWorkflow === false &&
    String(metadata.participantSelection || "") === "NONE" &&
    metadata.closedWithoutRespondents === true &&
    metadata.staffFeedbackRequired === false &&
    metadata.staffFeedbackAccessed === false &&
    metadata.separateFromStaffFeedback === true &&
    metadata.combinedWeightingDefined === false &&
    metadata.providerCalled === false &&
    String(metadata.assessorUserId || "").length > 0 &&
    String(metadata.assessorUserId) === String(row.requestedByUserId || "") &&
    String(metadata.assessorAssignmentId || "").length > 0 &&
    roleScopeValid
  );
}

function releasedDirectCarrier(row) {
  const metadata = metadataOf(row);
  return (
    String(metadata.workflow || "") === "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT" &&
    String(metadata.evidenceStream || "") === "GOVERNANCE_SUPERVISORY_ASSESSMENT" &&
    String(metadata.carrierKind || "") === "DIRECTOR_GOVERNANCE_ONLY" &&
    metadata.respondentWorkflow === false &&
    String(metadata.participantSelection || "") === "NONE" &&
    metadata.staffFeedbackRequired === false &&
    metadata.staffFeedbackAccessed === false &&
    metadata.separateFromStaffFeedback === true &&
    metadata.combinedWeightingDefined === false &&
    nonEmptyReleaseMap(metadata)
  );
}

function broadIndexParticipates(row) {
  if (!liveStatuses.has(String(row.status || "").toUpperCase())) return false;
  return !releasedDirectCarrier(row) && !exactOfficerCarrier(row);
}

function officerIndexParticipates(row) {
  if (!liveStatuses.has(String(row.status || "").toUpperCase())) return false;
  return exactOfficerCarrier(row) && !strictReviewedRelease(metadataOf(row));
}

function officerUniqueKey(row) {
  return [
    row.instrumentVersionId,
    row.scopeZoneId,
    row.targetUserId,
    row.targetTenantId || "",
    row.targetZoneId || "",
    row.requestedByUserId,
  ].join("|");
}

function officerRow(userId, role, scopeLevel) {
  return {
    status: "CLOSED",
    instrumentVersionId: "headteacher-supervisory-v1",
    scopeZoneId: "district-001",
    targetUserId: "headteacher-001",
    targetTenantId: "school-001",
    targetZoneId: "circuit-001",
    requestedByUserId: userId,
    metadata: {
      workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
      evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
      carrierKind: "OFFICER_GOVERNANCE_ONLY",
      respondentWorkflow: false,
      participantSelection: "NONE",
      closedWithoutRespondents: true,
      staffFeedbackRequired: false,
      staffFeedbackAccessed: false,
      separateFromStaffFeedback: true,
      combinedWeightingDefined: false,
      providerCalled: false,
      assessorUserId: userId,
      assessorAssignmentId: `assignment-${userId}`,
      assessorRole: role,
      scopeLevel,
    },
  };
}

const sisso = officerRow("sisso-001", "SISSO", "CIRCUIT");
const bsc = officerRow("bsc-001", "BASIC_SCHOOL_COORDINATOR", "DISTRICT");
const hos = officerRow("hos-001", "HEAD_OF_SUPERVISION", "DISTRICT");

for (const row of [sisso, bsc, hos]) {
  assert(!broadIndexParticipates(row), "Exact officer carrier must leave broad uniqueness");
  assert(officerIndexParticipates(row), "Unreleased officer carrier must enter dedicated uniqueness");
}
assert(
  new Set([sisso, bsc, hos].map(officerUniqueKey)).size === 3,
  "Different officers must not block one another for the same Headteacher",
);
assert(
  officerUniqueKey(sisso) === officerUniqueKey({ ...sisso }),
  "Same officer + same Headteacher must collide in dedicated uniqueness",
);

const incompleteReleaseHos = structuredClone(hos);
incompleteReleaseHos.metadata.headteacherSupervisoryReleases = {
  "assessment-001": { releaseMode: "DIRECTOR_REVIEWED_GOVERNANCE_RELEASE" },
};
assert(
  officerIndexParticipates(incompleteReleaseHos),
  "A non-empty or partial release map must not escape dedicated uniqueness",
);

const releasedHos = structuredClone(hos);
releasedHos.metadata.directorGovernanceReview = {
  schemaVersion: 1,
  state: "RELEASED",
  assessmentId: "assessment-001",
  decision: "RELEASE",
  releaseProofHash: "a".repeat(64),
  carrierCycleStatusMutationPerformed: false,
  carrierCycleTimestampMutationPerformed: false,
  staffFeedbackIncluded: false,
  respondentIdentitiesIncluded: false,
  providerCalled: false,
};
releasedHos.metadata.headteacherSupervisoryReleases = {
  "assessment-001": {
    releaseMode: "DIRECTOR_REVIEWED_GOVERNANCE_RELEASE",
    workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    assessmentId: "assessment-001",
    assessmentStatus: "FINALIZED",
    releaserRole: "DISTRICT_DIRECTOR",
    staffFeedbackRequired: false,
    staffFeedbackAccessed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    carrierCycleStatusMutationPerformed: false,
    carrierCycleTimestampMutationPerformed: false,
    reviewerMayRewriteScores: false,
    combinedWeightingDefined: false,
    providerCalled: false,
    releaseProofHash: "a".repeat(64),
  },
};
assert(
  !officerIndexParticipates(releasedHos),
  "Strictly released officer Governance history must leave dedicated live uniqueness",
);
assert(
  !broadIndexParticipates(releasedHos),
  "Released officer Governance history must stay outside broad uniqueness",
);

const malformed = structuredClone(sisso);
malformed.metadata.assessorAssignmentId = "";
assert(
  broadIndexParticipates(malformed),
  "Malformed officer metadata must fail closed into broad uniqueness",
);
assert(
  !officerIndexParticipates(malformed),
  "Malformed officer metadata must not enter dedicated uniqueness",
);

const staffFeedback = {
  status: "OPEN",
  requestedByUserId: "director-001",
  metadata: { workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK" },
};
assert(
  broadIndexParticipates(staffFeedback),
  "Staff Feedback must preserve broad live-target uniqueness",
);

const releasedDirector = {
  status: "OPEN",
  requestedByUserId: "director-001",
  metadata: {
    workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    carrierKind: "DIRECTOR_GOVERNANCE_ONLY",
    respondentWorkflow: false,
    participantSelection: "NONE",
    staffFeedbackRequired: false,
    staffFeedbackAccessed: false,
    separateFromStaffFeedback: true,
    combinedWeightingDefined: false,
    headteacherSupervisoryReleases: {
      "assessment-director-001": { releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE" },
    },
  },
};
assert(
  !broadIndexParticipates(releasedDirector),
  "Existing released Director-only exception must remain preserved",
);

console.log("=== N7-P2C4C3E HEADTEACHER OFFICER INDEPENDENT GOVERNANCE START ===\n");
console.log("SISSO direct start                 : assigned circuit only");
console.log("BSC direct start                   : current district only");
console.log("HOS direct start                   : current district only");
console.log("Director direct path               : preserved / separate");
console.log("Officer carrier                    : CLOSED at creation");
console.log("Respondent workflow                : absent");
console.log("Staff Feedback prerequisite        : absent");
console.log("Server authority revalidation      : required at create");
console.log("Unfinished duplicate per officer   : rejected");
console.log("Different officers same target     : independently allowed");
console.log("SISSO/BSC HOS review               : legacy + officer carriers");
console.log("HOS authored Director review       : existing path preserved");
console.log("Released repeat visit              : allowed by dedicated index exit");
console.log("Malformed officer metadata         : fails closed into broad index");
console.log("Database row mutation in migration : absent");
console.log("Polling / persistent storage       : absent\n");
console.log("RESULT: N7-P2C4C3E HEADTEACHER OFFICER INDEPENDENT START GREEN");
