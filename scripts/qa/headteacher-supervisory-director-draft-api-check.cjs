#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness performs deterministic source-contract checks only. */

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
function contains(source, marker, label) {
  assert(source.includes(marker), `Missing marker: ${label}`, marker);
}
function excludes(source, marker, label) {
  assert(!source.includes(marker), `Forbidden marker: ${label}`, marker);
}

function main() {
  const files = {
    route:
      "src/app/api/governance/appraisals/headteacher-supervisory/direct/route.ts",
    shared:
      "src/app/api/governance/appraisals/headteacher-supervisory/_shared.ts",
    service:
      "src/lib/appraisals/headteacherSupervisoryDirectorDraft.ts",
    queue:
      "src/lib/appraisals/headteacherSupervisoryAssessmentQueue.ts",
    client:
      "src/app/governance/appraisals/headteacher-supervisory/HeadteacherSupervisoryAssessmentClient.tsx",
    oldDraft:
      "src/lib/appraisals/headteacherSupervisoryAssessmentDraft.ts",
    directRelease:
      "src/lib/appraisals/headteacherSupervisoryDirectorDirectRelease.ts",
  };

  const source = Object.fromEntries(
    Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
  );

  for (const [marker, label] of [
    ['runtime = "nodejs"', "Node runtime"],
    ['dynamic = "force-dynamic"', "force-dynamic route"],
    ["requireSupervisoryGovernanceApiContext", "Governance auth"],
    ["canonicalHeadteacherSupervisoryAssessorRole", "canonical Director gate"],
    ['!==\n      "DISTRICT_DIRECTOR"', "Director-only route"],
    ["requestIsJson", "JSON content gate"],
    ["readBoundedJsonObject", "bounded JSON body"],
    ["isDirectAssessmentKey", "direct key validation"],
    ["isIsoDate", "visit date validation"],
    ["submittedServerResolvedField", "server-resolved field rejection"],
    ["createHeadteacherSupervisoryDirectorAssessmentDraft", "Director draft service"],
    ["governanceScope: auth.scope", "server governance scope"],
    ["workspaceUrl", "direct workspace handoff"],
    ["jsonNoStore", "no-store responses"],
    ["supervisoryApiError", "bounded error contract"],
  ]) {
    contains(source.route, marker, label);
  }

  for (const forbidden of [
    "prisma.",
    "requestedRespondentUserIds",
    "respondentTenantId",
    "sendSms(",
    "sendEmail(",
  ]) {
    excludes(source.route, forbidden, `direct route ${forbidden}`);
  }

  for (const [marker, label] of [
    ["MAX_JSON_BODY_BYTES", "bounded shared body size"],
    ["REQUEST_BODY_TOO_LARGE", "oversized body rejection"],
    ["INVALID_JSON_BODY", "invalid JSON rejection"],
    ["JSON_OBJECT_REQUIRED", "object-only body"],
    ["isDirectAssessmentKey", "direct assessment key helper"],
    ['"Cache-Control": "no-store, max-age=0"', "no-store cache contract"],
  ]) {
    contains(source.shared, marker, label);
  }

  for (const [marker, label] of [
    ['directorGovernanceCarrierKind: "DIRECTOR_GOVERNANCE_ONLY"', "queue carrier kind"],
    ["directorGovernanceCarrierVisibleToDirectorOnly: true", "Director-only queue visibility"],
    ['actorRole === "DISTRICT_DIRECTOR"', "Director queue gate"],
    ['clean(metadata.carrierKind) ===', "carrier metadata validation"],
    ['instrument.purpose === "HEADTEACHER_SUPERVISORY_ASSESSMENT"', "Governance instrument contract"],
    ["cycle.responseWindowDays === 0", "zero response window queue proof"],
    ["cycle._count.participants === 0", "zero participants queue proof"],
    ['? "Independent Governance assessment"', "Governance-only queue label"],
    ["HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY", "assessment-keyed release metadata read"],
    ["canDirectRelease: true", "unreleased finalized direct assessment can release"],
    ["releasedToHeadteacher", "server-derived released presentation state"],
  ]) {
    contains(source.queue, marker, label);
  }

  contains(
    source.oldDraft,
    "HEADTEACHER_FEEDBACK_POLICY",
    "legacy SISSO/HOS/BSC Staff-backed draft path preserved",
  );
  contains(
    source.oldDraft,
    "HEADTEACHER_SUPERVISORY_PARENT_CYCLE_CONTRACT_INVALID",
    "legacy parent-cycle contract preserved",
  );

  for (const [marker, label] of [
    ["staffFeedbackRequired: false", "direct release Staff independence"],
    ["staffFeedbackAccessed: false", "direct release does not read Staff evidence"],
    ["carrierCycleStatusMutationPerformed: false", "release carrier status immutability"],
    ["carrierCycleTimestampMutationPerformed: false", "release carrier timestamp immutability"],
    ['releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE"', "existing Director direct release"],
  ]) {
    contains(source.directRelease, marker, label);
  }

  for (const [marker, label] of [
    ['data-director-governance-direct-start="independent-v1"', "Director independent-start UI"],
    ["Search Headteacher or school", "local Headteacher search"],
    ["Choose circuit", "Circuit selector"],
    ["Choose school", "School selector"],
    ["EduLife OS will check your choice again before starting.", "BBC server recheck explanation"],
    ["Visit details", "visit header entry"],
    ["Start official assessment", "BBC direct-start action"],
    ["HEADTEACHER-GOVERNANCE-DIRECT:", "ephemeral direct key"],
    ["window.crypto.randomUUID()", "random direct key source"],
    ['"/api/governance/appraisals/headteacher-supervisory/direct"', "direct API endpoint"],
    ["/direct-release`", "Director direct-release endpoint wiring"],
    ["body: JSON.stringify({ confirm: true })", "release confirmation body only"],
    ["Release to Headteacher", "BBC release action"],
    ["Released to Headteacher", "released presentation state"],
    ["releaseDirectorSubmittedAssessment", "submitted-list release handler"],
    ["await loadQueue();", "explicit queue refresh after release"],
    ["targetUserId: target.targetHeadteacherUserId", "browser sends discovered target ID only"],
    ["targetTenantId: target.targetTenantId", "browser sends discovered tenant ID only"],
    ["await readApiBody(response)", "bounded response parsing"],
    ["clearWorkspaceForAssessmentChange();", "safe workspace switch"],
    ["Staff feedback is not a prerequisite", "Staff independence wording"],
    ["score is never combined", "no combined score wording"],
    ["No Teachers are invited here.", "no respondents BBC wording"],
    ["No 7-day feedback window is opened.", "no Staff window BBC wording"],
    ["staffFeedbackResultMessage", "BBC Staff Feedback result wording"],
    ["No new staff feedback was started.", "plain-English preserved-cycle wording"],
  ]) {
    contains(source.client, marker, label);
  }

  excludes(
    source.client,
    'data-director-governance-selected-target="server-revalidated"',
    "duplicate selected Headteacher summary card",
  );
  excludes(
    source.client,
    "Staff feedback is separate and is not required for this assessment.",
    "redundant Staff Feedback text in start confirmation",
  );
  contains(
    source.client,
    'data-director-governance-server-recheck="selected-target"',
    "single non-duplicating server recheck note",
  );

  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "setInterval(",
    "respondentUserId",
    "respondentTenantId",
    "requestedRespondentUserIds",
    "participantIds",
    "releaseProofHash",
    "releaseRequestHash",
    "releaseEvidenceHash",
    "releaserUserId",
    "releaserAssignmentId",
  ]) {
    excludes(source.client, forbidden, `client ${forbidden}`);
  }

  const directStartBegin = source.client.indexOf(
    "async function startDirectorDirectAssessment()",
  );
  const directStartEnd = source.client.indexOf(
    "async function createDraft()",
    directStartBegin,
  );
  assert(
    directStartBegin >= 0 && directStartEnd > directStartBegin,
    "Unable to isolate Director direct-start function",
  );
  const directStart = source.client.slice(directStartBegin, directStartEnd);
  contains(directStart, "validateVisitDetails", "client visit validation");
  contains(directStart, "window.confirm(", "explicit Director confirmation");
  contains(directStart, "directAssessmentKey: command.key", "retry-safe key sent");
  contains(directStart, "dateObserved", "visit date sent");
  contains(directStart, "...validation.values", "validated visit details sent");
  excludes(directStart, "cycleId", "new direct start must not require Staff carrier ID");
  excludes(directStart, "respondent", "direct start must not send respondent data");

  const directReleaseBegin = source.client.indexOf(
    "async function releaseDirectorSubmittedAssessment(",
  );
  const directReleaseEnd = source.client.indexOf(
    "async function createDraft()",
    directReleaseBegin,
  );
  assert(
    directReleaseBegin >= 0 && directReleaseEnd > directReleaseBegin,
    "Unable to isolate Director submitted-assessment release function",
  );
  const directRelease = source.client.slice(
    directReleaseBegin,
    directReleaseEnd,
  );
  contains(
    directRelease,
    'queue?.actorRole !== "DISTRICT_DIRECTOR"',
    "release UI exact Director gate",
  );
  contains(
    directRelease,
    'item.supervisory.state !== "SUBMITTED"',
    "release UI submitted-only gate",
  );
  contains(
    directRelease,
    "item.release.canDirectRelease !== true",
    "release UI requires server-derived eligibility",
  );
  contains(
    directRelease,
    "window.confirm(",
    "release UI explicit confirmation",
  );
  contains(
    directRelease,
    "/direct-release`",
    "release UI current endpoint",
  );
  contains(
    directRelease,
    "body: JSON.stringify({ confirm: true })",
    "release UI confirm-only body",
  );
  contains(
    directRelease,
    "await loadQueue();",
    "release UI explicit post-success refresh",
  );
  excludes(
    directRelease,
    "staffFeedback",
    "release UI must not send or inspect Staff Feedback",
  );
  excludes(
    directRelease,
    "respondent",
    "release UI must not send or inspect respondents",
  );
  excludes(
    directRelease,
    "releaseProofHash",
    "release proof must not enter browser release handler",
  );

  console.log("");
  console.log("=== N7-P2C3L2 DIRECTOR INDEPENDENT HEADTEACHER API + UI CONTRACT ===");
  console.log("");
  console.log("API route                     : dedicated Director direct-start endpoint");
  console.log("JSON body                     : bounded + object-only");
  console.log("Director authority            : explicit + server revalidated");
  console.log("Browser authority             : discovery only, never trusted");
  console.log("Target search                 : local / low-network");
  console.log("Target hierarchy              : Circuit → School → Headteacher");
  console.log("Independent carrier           : Director-only Governance cycle");
  console.log("Legacy HOS/BSC/SISSO draft    : preserved Staff-backed path");
  console.log("Queue                         : adds Governance-only carriers for Director only");
  console.log("Official form                 : existing Headteacher supervisory workspace");
  console.log("Staff Feedback prerequisite   : none");
  console.log("Respondent identifiers        : absent");
  console.log("7-day Staff window            : absent");
  console.log("Direct release                : existing Staff-independent service preserved");
  console.log("Director release UI           : submitted list → confirm → current API");
  console.log("Release presentation          : server-derived; proof internals excluded");
  console.log("BBC Staff result wording      : plain English");
  console.log("Persistent browser storage    : absent");
  console.log("Background polling            : absent");
  console.log("Direct Prisma in route        : absent");
  console.log("Database accessed by QA       : false");
  console.log("");
  console.log("RESULT: N7-P2C3L2 DIRECTOR INDEPENDENT HEADTEACHER API + UI CONTRACT GREEN");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("RESULT: N7-P2C3L2 DIRECTOR INDEPENDENT HEADTEACHER API + UI CONTRACT FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
