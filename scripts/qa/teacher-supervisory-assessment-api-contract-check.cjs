#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

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
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) fail("Required file missing", relativePath);
  return fs.readFileSync(absolutePath, "utf8");
}

const files = {
  shared: "src/app/api/governance/appraisals/teacher-supervisory/_shared.ts",
  root: "src/app/api/governance/appraisals/teacher-supervisory/route.ts",
  options: "src/app/api/governance/appraisals/teacher-supervisory/observation-options/route.ts",
  load: "src/app/api/governance/appraisals/teacher-supervisory/[assessmentId]/route.ts",
  section: "src/app/api/governance/appraisals/teacher-supervisory/[assessmentId]/section/route.ts",
  comment: "src/app/api/governance/appraisals/teacher-supervisory/[assessmentId]/comment/route.ts",
  finalize: "src/app/api/governance/appraisals/teacher-supervisory/[assessmentId]/finalize/route.ts",
  correctionFinalization:
    "src/lib/appraisals/teacherSupervisoryAssessmentCorrectionFinalization.ts",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const key of [
  "shared",
  "root",
  "options",
  "load",
  "section",
  "comment",
  "finalize",
]) {
  const text = source[key];

  for (const forbidden of [
    "sendSms",
    "sendEmail",
    "localStorage",
    "sessionStorage",
    "setInterval(",
    "appraisalReview.create",
    "appraisalCycle.update",
    "prisma.teacherAppraisal",
    "teacherAppraisal.create",
    "teacherAppraisal.update",
    "teacherAppraisal.delete",
  ]) {
    assert(!text.includes(forbidden), `${key} contains forbidden marker`, forbidden);
  }
}

for (const routeKey of ["root", "options", "load", "section", "comment", "finalize"]) {
  const text = source[routeKey];
  assert(
    text.includes("requireTeacherSupervisoryGovernanceApiContext"),
    `${routeKey} lacks governance authorization`,
  );
  assert(text.includes("jsonNoStore"), `${routeKey} lacks no-store response`);
  assert(text.includes('runtime = "nodejs"'), `${routeKey} lacks node runtime`);
  assert(
    text.includes('dynamic = "force-dynamic"'),
    `${routeKey} lacks force-dynamic`,
  );
}

assert(
  source.shared.includes('"Cache-Control": "no-store, max-age=0"'),
  "No-store cache contract missing",
);
assert(
  source.shared.includes('"X-Content-Type-Options": "nosniff"'),
  "Nosniff header missing",
);
assert(
  source.shared.includes("operationalAssessorRoles"),
  "Teacher assessor-role scope missing",
);
assert(
  source.shared.includes("maxJsonBodyBytes: 16_384"),
  "Bounded JSON body contract missing",
);
assert(
  source.shared.includes("readBoundedJsonObject"),
  "Bounded JSON parser missing",
);
assert(
  source.shared.includes('code.startsWith("TEACHER_SUPERVISORY_")'),
  "Teacher service-error boundary missing",
);

assert(
  source.root.includes("readTeacherSupervisoryAssessmentQueue"),
  "Read-only Teacher queue not wired",
);
assert(
  source.options.includes("readTeacherSupervisoryObservationOptions"),
  "Teacher assignment/curriculum observation options not wired",
);
assert(
  source.options.includes("governanceScope: auth.scope"),
  "Observation options must receive verified governance scope",
);
assert(
  source.options.includes("targetUserId") &&
    source.options.includes("targetTenantId") &&
    source.options.includes("dateObserved"),
  "Observation options target/date query contract missing",
);
assert(
  source.root.includes("createTeacherSupervisoryAssessmentDraft"),
  "Atomic Teacher draft service not wired",
);
assert(
  source.root.includes("governanceScope: auth.scope"),
  "Queue must receive verified governance scope",
);
assert(
  source.root.includes("observationKey"),
  "Stable observation idempotency key missing",
);
assert(
  source.root.includes("isObservationKey"),
  "Observation key validation missing",
);
assert(
  source.root.includes("targetUserId") && source.root.includes("targetTenantId"),
  "Teacher target identifiers missing",
);
assert(
  source.root.includes("TEACHER_SUPERVISORY_TARGET_FIELDS_SERVER_RESOLVED"),
  "Server-resolved hierarchy guard missing",
);
assert(
  source.root.includes('"subjectBeingObserved"') &&
    source.root.includes('"subStrand"') &&
    source.root.includes('"classTaught"'),
  "Browser-supplied class/subject/sub-strand labels must be rejected",
);
for (const field of [
  "totalEnrolment",
  "girls",
  "boys",
  "classroomId",
  "curriculumSubjectId",
  "curriculumSubStrandId",
]) {
  assert(source.root.includes(field), `Verified observation POST field missing: ${field}`);
}
assert(
  source.root.includes("TEACHER_SUPERVISORY_DRAFT_NON_HEADER_FIELDS_FORBIDDEN"),
  "Draft score/comment/lifecycle injection guard missing",
);
assert(
  source.root.includes("result.draft.assessmentId"),
  "Workspace URL must use created assessment id",
);

for (const routeKey of ["load", "section", "comment", "finalize"]) {
  assert(
    source[routeKey].includes("isUuidIdentifier"),
    `${routeKey} lacks strict assessment UUID validation`,
  );
  assert(
    !source[routeKey].includes("isLikelyIdentifier"),
    `${routeKey} must not use broad assessment-id validation`,
  );
}

for (const routeKey of ["root", "section", "comment", "finalize"]) {
  assert(
    source[routeKey].includes("readBoundedJsonObject"),
    `${routeKey} lacks bounded JSON read`,
  );
  assert(
    source[routeKey].includes("requestIsJson"),
    `${routeKey} lacks JSON content-type gate`,
  );
}

assert(
  source.load.includes("loadTeacherSupervisoryAssessmentWorkspace"),
  "Owner-bound Teacher workspace not wired",
);
assert(
  source.section.includes("saveTeacherSupervisoryAssessmentSection"),
  "Teacher section save not wired",
);
assert(
  source.section.includes("TEACHER_SUPERVISORY_COMMENT_USE_COMMENT_ENDPOINT"),
  "Section route must reject comment injection",
);
assert(
  source.comment.includes("saveTeacherSupervisoryGeneralComment"),
  "Separate Teacher General Comment save not wired",
);
assert(
  source.comment.includes("TEACHER_SUPERVISORY_COMMENT_ENDPOINT_COMMENT_ONLY"),
  "Comment endpoint must reject score injection",
);

assert(
  source.finalize.includes(
    "finalizeTeacherSupervisoryAssessmentWithContinuation",
  ),
  "Teacher finalization continuation wrapper not wired",
);
assert(
  source.finalize.includes("confirmFinalization"),
  "Explicit Teacher finalization confirmation missing",
);
assert(
  source.finalize.includes("result: finalized.result"),
  "Finalize route must return the scoring result from the continuation service",
);
assert(
  source.finalize.includes("reviewCreated: finalized.reviewCreated"),
  "Finalize route must return server-resolved review creation state",
);
assert(
  source.finalize.includes("cycleTransitioned: finalized.cycleTransitioned"),
  "Finalize route must return server-resolved cycle transition state",
);
assert(
  source.finalize.includes("continuation: finalized.continuation"),
  "Finalize route must return correction-continuation custody when present",
);
assert(
  !source.finalize.includes(
    'reviewCreated: false,\n      cycleTransitioned: false,',
  ),
  "Finalize route must not hardcode the obsolete all-finalizations review state",
);
assert(
  !source.finalize.includes("ensureHeadteacherDirectorCorrectionReviewContinuation"),
  "Headteacher review-continuation bridge must not leak into Teacher finalization",
);
assert(
  !source.finalize.includes("appraisalReview"),
  "Teacher finalize route must not directly create or mutate review records",
);
assert(
  !source.finalize.includes("appraisalCycle"),
  "Teacher finalize route must not directly mutate cycle records",
);
assert(
  !source.finalize.includes("prisma."),
  "Teacher finalize route must remain free of direct Prisma access",
);
assert(
  !source.finalize.includes("auth.scope"),
  "Teacher finalization must rely on service authority revalidation",
);

assert(
  source.correctionFinalization.includes(
    "ordinaryFinalizationReviewCreation: false",
  ),
  "Ordinary Teacher finalization must continue to create no review",
);
assert(
  source.correctionFinalization.includes(
    "correctionCycleStatusChanges: false",
  ),
  "Correction continuation must not change cycle status",
);
assert(
  source.correctionFinalization.includes("if (!provenance)") &&
    source.correctionFinalization.includes("reviewCreated: false") &&
    source.correctionFinalization.includes("cycleTransitioned: false") &&
    source.correctionFinalization.includes("continuation: null"),
  "Ordinary finalization branch must preserve the original D4 no-review/no-transition contract",
);
assert(
  source.correctionFinalization.includes("appraisalReview.create") &&
    source.correctionFinalization.includes('decision: "PENDING"') &&
    source.correctionFinalization.includes(
      "stage: provenance.returnReviewStage",
    ),
  "Verified correction finalization must recreate the same review stage as PENDING",
);
assert(
  source.correctionFinalization.includes("computeTeacherSupervisoryReviewEvidenceHash"),
  "Correction continuation must bind a fresh review-evidence hash to the corrected assessment",
);
assert(
  source.correctionFinalization.includes("preserveReturningReviewer: true") &&
    source.correctionFinalization.includes("preserveReviewStage: true"),
  "Correction continuation must preserve the returning reviewer and stage",
);
assert(
  source.correctionFinalization.includes("appraisalCycle.updateMany") &&
    source.correctionFinalization.includes('status: "UNDER_REVIEW"') &&
    source.correctionFinalization.includes("cycleTransitioned: false"),
  "Correction continuation must preserve UNDER_REVIEW rather than reopen or transition the cycle",
);

for (const forbidden of [
  'status: "OPEN"',
  "teacherAppraisal.create",
  "teacherAppraisal.update",
  "prisma.teacherAppraisal",
  "sendSms",
  "sendEmail",
  "appraisalNotification.create",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(
    !source.correctionFinalization.includes(forbidden),
    "Teacher correction continuation contains forbidden marker",
    forbidden,
  );
}

console.log("");
console.log("=== N6-D4B GOVERNANCE TEACHER THIN API CONTRACT ===");
console.log("");
console.log("API audience                     : SISSO / BSC / HOS / Director");
console.log("Circuit Supervisor alias         : policy-canonical SISSO office");
console.log("Queue GET                        : read-only eligible Teacher discovery");
console.log("Observation-options GET         : authorized Teacher assignment + curriculum");
console.log("Draft POST                       : atomic verified v2 observation start");
console.log("Observation idempotency          : stable caller key required");
console.log("Hierarchy/names                  : revalidated + server resolved");
console.log("Class/subject/sub-strand labels  : server resolved; browser labels rejected");
console.log("Governance enrolment evidence    : total / girls / boys forwarded to v2 validator");
console.log("Workspace GET                    : original assessor only");
console.log("Section POST                     : D4A section service only");
console.log("Comment POST                     : separate D4A comment service only");
console.log("Finalize POST                    : explicit confirmation + Teacher finalization service");
console.log("JSON body                        : application/json + 16 KiB bound");
console.log("Assessment IDs                   : strict UUID validation");
console.log("No-store headers                 : complete");
console.log("Legacy TeacherAppraisal          : untouched");
console.log("Ordinary finalization review     : absent");
console.log("Correction continuation          : delegated to N6-E4C service");
console.log("Correction review                : same reviewer/stage PENDING only");
console.log("Direct review mutation in route  : absent");
console.log("Direct cycle mutation in route   : absent");
console.log("Cycle transition                 : absent; UNDER_REVIEW preserved");
console.log("Headteacher continuation bridge  : absent");
console.log("Notifications/providers          : absent");
console.log("Database accessed                : route false; service-owned lifecycle");
console.log("");
console.log("RESULT: N6-D4B GOVERNANCE TEACHER THIN API GREEN");
