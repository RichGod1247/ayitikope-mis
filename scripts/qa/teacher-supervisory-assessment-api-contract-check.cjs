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
  load: "src/app/api/governance/appraisals/teacher-supervisory/[assessmentId]/route.ts",
  section: "src/app/api/governance/appraisals/teacher-supervisory/[assessmentId]/section/route.ts",
  comment: "src/app/api/governance/appraisals/teacher-supervisory/[assessmentId]/comment/route.ts",
  finalize: "src/app/api/governance/appraisals/teacher-supervisory/[assessmentId]/finalize/route.ts",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const [key, text] of Object.entries(source)) {
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

for (const routeKey of ["root", "load", "section", "comment", "finalize"]) {
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
  source.finalize.includes("finalizeTeacherSupervisoryAssessment"),
  "Teacher finalization not wired",
);
assert(
  source.finalize.includes("confirmFinalization"),
  "Explicit Teacher finalization confirmation missing",
);
assert(
  source.finalize.includes("reviewCreated: false"),
  "N6-D4B must state that review creation is absent",
);
assert(
  source.finalize.includes("cycleTransitioned: false"),
  "N6-D4B must state that cycle transition is absent",
);
assert(
  !source.finalize.includes("ensureHeadteacherDirectorCorrectionReviewContinuation"),
  "Headteacher review-continuation bridge must not leak into Teacher D4B",
);
assert(
  !source.finalize.includes("appraisalReview"),
  "Teacher D4B finalization must not create review records",
);
assert(
  !source.finalize.includes("auth.scope"),
  "Teacher finalization must rely on service authority revalidation",
);

console.log("");
console.log("=== N6-D4B GOVERNANCE TEACHER THIN API CONTRACT ===");
console.log("");
console.log("API audience                     : SISSO / BSC / HOS / Director");
console.log("Circuit Supervisor alias         : policy-canonical SISSO office");
console.log("Queue GET                        : read-only eligible Teacher discovery");
console.log("Draft POST                       : atomic N6-D3 observation start");
console.log("Observation idempotency          : stable caller key required");
console.log("Hierarchy/names                  : revalidated + server resolved");
console.log("Workspace GET                    : original assessor only");
console.log("Section POST                     : D4A section service only");
console.log("Comment POST                     : separate D4A comment service only");
console.log("Finalize POST                    : explicit confirmation + D4A finalizer");
console.log("JSON body                        : application/json + 16 KiB bound");
console.log("Assessment IDs                   : strict UUID validation");
console.log("No-store headers                 : complete");
console.log("Legacy TeacherAppraisal          : untouched");
console.log("Review creation                  : absent in N6-D4B");
console.log("Cycle transition                 : absent in N6-D4B");
console.log("Headteacher continuation bridge  : absent");
console.log("Notifications/providers          : absent");
console.log("Database accessed                : false");
console.log("");
console.log("RESULT: N6-D4B GOVERNANCE TEACHER THIN API GREEN");
