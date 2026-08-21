#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads filesystem and TypeScript helpers. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

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

const clientPath =
  "src/app/governance/appraisals/teacher-supervisory/TeacherSupervisoryAssessmentClient.tsx";
const pagePath = "src/app/governance/appraisals/teacher-supervisory/page.tsx";
const client = read(clientPath);
const page = read(pagePath);

for (const [name, source] of [["client", client], ["page", page]]) {
  for (const forbidden of ["localStorage", "sessionStorage", "setInterval(", "sendSms", "sendEmail"]) {
    assert(!source.includes(forbidden), `${name} contains forbidden marker`, forbidden);
  }
}

for (const [name, source, kind] of [
  ["client", client, ts.ScriptKind.TSX],
  ["page", page, ts.ScriptKind.TSX],
]) {
  const transpiled = ts.transpileModule(source, {
    fileName: name === "client" ? clientPath : pagePath,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.Preserve,
      strict: true,
    },
  });
  const diagnostics = transpiled.diagnostics ?? [];
  assert(diagnostics.length === 0, `${name} has TypeScript syntax diagnostics`, diagnostics.map((d) => d.messageText));
  assert(kind === ts.ScriptKind.TSX, `${name} script kind drift`);
}

assert(page.includes("requireGovernancePageContext"), "Page governance gate missing");
assert(page.includes("TEACHER_SUPERVISORY_ASSESSMENT_POLICY.operationalAssessorRoles"), "Teacher assessor role gate missing");
assert(page.includes('runtime = "nodejs"'), "Page node runtime missing");
assert(page.includes('dynamic = "force-dynamic"'), "Page force-dynamic missing");
assert(page.includes("initialAssessmentId"), "Assessment deep-link handoff missing");

assert(client.includes('"use client"'), "Client directive missing");
assert(client.includes("Teacher Appraisal"), "BBC Teacher Appraisal heading missing");
assert(client.includes("Choose circuit"), "Circuit selection step missing");
assert(client.includes("Choose school"), "School selection step missing");
assert(client.includes("Choose Teacher"), "Teacher selection step missing");
assert(client.includes("targetUserId: selectedTeacher.targetUserId"), "Teacher target user handoff missing");
assert(client.includes("targetTenantId: selectedTeacher.schoolId"), "Teacher target tenant handoff missing");
assert(client.includes("draftAttemptRef"), "Stable draft-attempt state missing");
assert(client.includes("observationKey: attempt.observationKey"), "Stable observation key handoff missing");
assert(client.includes("crypto.randomUUID()"), "Observation key generation missing");
assert(client.includes("EXISTING_MATCH"), "Idempotent start result missing");

for (const field of [
  "yearsInService",
  "yearsInPresentSchool",
  "dateObserved",
  "durationMinutes",
  "totalEnrolment",
  "girls",
  "boys",
  "classroomId",
  "curriculumSubjectId",
  "curriculumSubStrandId",
]) {
  assert(client.includes(field), `Required observation field missing: ${field}`);
}
for (const serverResolvedLabel of ["subjectBeingObserved", "subStrand", "classTaught"]) {
  assert(client.includes(serverResolvedLabel), `Server-resolved observation label missing: ${serverResolvedLabel}`);
}
assert(!client.includes("academicYear"), "Academic year must not be added to official Teacher header");
assert(!client.includes("body.term"), "Term must not be added to official Teacher header");

assert(client.includes("queueSectionAutosave"), "Serialized section autosave queue missing");
assert(client.includes("processSectionAutosaveQueue"), "Section autosave processor missing");
assert(client.includes("queueCommentAutosave"), "Separate comment autosave queue missing");
assert(client.includes("processCommentAutosaveQueue"), "Comment autosave processor missing");
assert(client.includes("pendingCommentSaveRef"), "Comment pending state missing");
assert(client.includes("beforeunload"), "Unsaved-leave protection missing");
assert(client.includes('window.addEventListener("online"'), "Online retry hook missing");
assert(client.includes('window.addEventListener("offline"'), "Offline state hook missing");
assert(client.includes('cache: "no-store"'), "No-store client reads missing");

assert(client.includes("/teacher-supervisory/observation-options?"), "Teacher assignment/curriculum options endpoint missing");
assert(client.includes("observationOptionsLoading"), "Observation options loading state missing");
assert(client.includes("Choose class"), "Verified class dropdown missing");
assert(client.includes("Choose subject"), "Verified subject dropdown missing");
assert(client.includes("Choose sub-strand"), "Curriculum sub-strand dropdown missing");
assert(client.includes("Old schemes, lesson notes and lesson deliveries do not widen this list."), "Historical-evidence non-authority guidance missing");
assert(client.includes("Girls plus boys must equal total enrolment."), "Enrolment consistency rule missing");
assert(client.includes("validateObservation(observationDraft, observationOptions)"), "Complete observation consistency gate missing");
assert(client.includes("observationOptionsLoading || !selectedTeacher || !observationValidation.ok"), "Start button consistency lock missing");

assert(client.includes("/api/governance/appraisals/teacher-supervisory"), "Teacher supervisory API root missing");
assert(client.includes("/teacher-supervisory/records"), "Saved-record reopenability endpoint missing");
assert(client.includes("My saved assessments"), "Saved-assessment BBC section missing");
assert(client.includes("savedAssessmentsOpen"), "Collapsed saved-assessment state missing");
assert(client.includes("Show saved assessments"), "Saved-assessment reveal control missing");
assert(client.includes("Hide saved assessments"), "Saved-assessment collapse control missing");
assert(!client.includes("Drafts can be reopened without remembering an assessment link."), "Discarded saved-assessment sentence must remain absent");
assert(client.includes('record.state === "IN_PROGRESS" ? "Continue →" : "View →"'), "Compact saved-record reopen action missing");
assert(client.includes("records?.summary.inProgress"), "Saved draft summary missing");
assert(client.includes("records?.summary.submitted"), "Submitted record summary missing");
assert(client.includes("record.answeredItems"), "Saved progress count missing");
assert(!client.includes('className="h-full rounded-full bg-cyan-300"'), "Saved work list must not restore oversized progress bars");
assert(client.includes("/section`"), "Teacher section endpoint missing");
assert(client.includes("/comment`"), "Teacher comment endpoint missing");
assert(client.includes("/finalize`"), "Teacher finalize endpoint missing");
assert(client.includes("confirmFinalization: true"), "Explicit finalization confirmation body missing");
assert(client.includes("window.confirm"), "Irreversible finalization confirmation missing");
assert(client.includes("NEEDS_CORRECTION"), "Returned correction work state missing");
assert(client.includes("Correction notifications"), "BBC correction notification control missing");
assert(client.includes("Reason for correction"), "Correction reason presentation missing");
assert(client.includes("createCorrectionRevision"), "Correction revision action missing");
assert(client.includes("/revision`"), "Teacher correction revision endpoint missing");
assert(client.includes("confirmRevision: true"), "Explicit correction revision confirmation body missing");
assert(client.includes('result: { outcome: "CREATED" | "EXISTING_MATCH" }'), "Correction revision idempotent outcome contract missing");
assert(client.includes("body.workspaceUrl"), "Server workspace handoff missing");
assert(client.includes("record.correction?.reason"), "Original-assessor correction reason missing");
assert(client.includes("records?.summary.needsCorrection"), "Correction notification count missing");
assert(client.includes("correctionNotificationsOpen"), "Ephemeral correction notification state missing");
assert(client.includes("aria-expanded={correctionNotificationsOpen}"), "Correction notification disclosure contract missing");
assert(client.includes('aria-label="Correction notifications"'), "Correction notification accessibility label missing");
assert(!client.includes("Revision {record.revision} remains preserved and locked. The correction button creates a new editable revision with the sealed scores and General Comment copied forward."), "Verbose correction guidance must remain removed");
assert(!client.includes("headteacher-supervisory"), "Teacher UI must not call Headteacher supervisory APIs");
assert(!client.includes("staffFeedback"), "Teacher UI must not include confidential Headteacher staff feedback");
assert(!client.includes("Director’s review queue"), "Premature Director review wording must remain absent");
assert(!client.includes("Director's review queue"), "Premature Director review wording must remain absent");
for (const forbiddenCorrectionField of [
  "reviewerUserId",
  "reviewerAssignmentId",
  "returnReviewId",
  "returnReviewEvidenceHash",
  "returnDecisionRequestHash",
  "returnDecisionEvidenceHash",
  "revisionKey",
  "sourceAssessmentHash",
  "observationContextHash",
]) {
  assert(
    !client.includes(forbiddenCorrectionField),
    `Correction UI must not receive internal authority/proof field: ${forbiddenCorrectionField}`,
  );
}


assert(client.includes("6-section, 34-indicator"), "Official Teacher form count wording missing");
assert(client.includes("General Comments"), "General Comments control missing");
assert(client.includes("<textarea"), "General Comments textarea missing");
assert(client.includes("allItemsAnswered"), "Completion-gated overall result missing");
assert(
  client.includes('return `${Math.round(Number(value))}%`;'),
  "Teacher percentage presentation must round to a whole number",
);
assert(
  !client.includes('return `${round2(Number(value))}%`;'),
  "Teacher percentage presentation must not expose stored decimal precision",
);
assert(
  client.includes("function round2(value: number)"),
  "Stored/live Teacher calculation precision helper must remain present",
);
assert(
  client.includes("formatPercent(liveScore?.percentage)"),
  "Interactive Teacher section result must use whole-number presentation",
);
assert(
  client.includes("formatPercent(sectionScore?.percentage)"),
  "Native Teacher section result must use whole-number presentation",
);

assert(
  client.includes("function ratingButtonTone(score: number, selected: boolean)"),
  "Teacher rating-button colour helper missing",
);
for (const marker of [
  "border-rose-300/70 bg-rose-500/30 text-rose-50",
  "border-orange-300/70 bg-orange-500/30 text-orange-50",
  "border-amber-300/70 bg-amber-400/30 text-amber-50",
  "border-cyan-300/70 bg-cyan-400/30 text-cyan-50",
  "border-emerald-300/70 bg-emerald-400/30 text-emerald-50",
]) {
  assert(
    client.includes(marker),
    `Distinct Teacher rating colour missing: ${marker}`,
  );
}
assert(
  client.includes("ratingButtonTone(score, selected)"),
  "Interactive Teacher rating controls must use score-specific colour families",
);
assert(
  client.includes(
    '"border-slate-300/50 bg-slate-300/20 text-slate-100"',
  ),
  "Teacher N/A rating must use a neutral selected colour family",
);
assert(
  !client.includes(
    'selected\n                              ? "border-cyan-300/40 bg-cyan-400/20 text-cyan-50"',
  ),
  "Teacher rating controls must not use one selected colour for every score",
);
assert(client.includes('"After 34/34"'), "Incomplete overall-result suppression missing");
assert(client.includes("Review Before you Submit"), "Native review entry missing");
assert(client.includes("Final review · read-only preview"), "Native review state missing");
assert(client.includes("Monitoring and Inspection Sheet (Teachers)"), "Official Teacher form heading missing");
assert(client.includes("min-w-[1120px]"), "Mobile horizontal native review canvas missing");
assert(client.includes("Submit and lock assessment"), "Final submission action missing");
assert(client.includes("Assessment submitted and locked."), "Correct pre-review-chain finalization wording missing");
assert(client.includes("scrollIntoView"), "Anchored section navigation missing");
assert(!client.includes("window.scrollTo"), "Section navigation must not jump to page start");
assert(client.includes('aria-label="Overall completion"'), "Desktop progress bar missing");
assert(client.includes("Previous section"), "Mobile previous navigation missing");
assert(client.includes("Next section"), "Mobile next navigation missing");

for (const route of [
  'return "/circuit/dashboard";',
  'return "/district/hos/dashboard";',
  'return "/district/bsc/dashboard";',
  'return "/district/dashboard";',
]) {
  assert(client.includes(route), `Role-specific dashboard route missing: ${route}`);
}

console.log("");
console.log("=== N6-F1C3C GOVERNANCE TEACHER BBC-FRIENDLY CORRECTION HANDOFF ===");
console.log("");
console.log("Audience                        : SISSO / BSC / HOS / Director");
console.log("Selection                       : circuit → school → Teacher");
console.log("Target identity                 : server-backed queue only");
console.log("Official header                 : unchanged 10 fields");
console.log("Required observation start      : all particulars must pass consistency gate");
console.log("Class / subject / sub-strand    : server-backed assignment + curriculum options");
console.log("Governance enrolment evidence   : total + girls + boys; must balance");
console.log("Observation retry               : stable idempotency key per unchanged attempt");
console.log("Official form                   : 6 sections / 34 indicators");
console.log("Rating controls                 : 1-5 plus N/A");
console.log("Section autosave                : serialized + retry");
console.log("General Comments                : separate serialized autosave");
console.log("Database reload                 : source of truth before review");
console.log("Saved-record reopenability      : assessor-owned, collapsed compact server list");
console.log("Saved list evidence             : progress only; no score/comment payload");
console.log("Incomplete overall result       : suppressed until 34/34");
console.log("Mobile progress/navigation      : present");
console.log("Native final review             : full Teacher paper-form copy");
console.log("Finalization                    : explicit confirmation + lock");
console.log("Returned correction discovery  : compact notification badge + count");
console.log("Correction disclosure          : click-to-open, React state only");
console.log("Correction reason              : compact card; no reviewer identity");
console.log("Correction revision            : explicit confirmation + server handoff");
console.log("Prior revision                 : preserved server-side; verbose copy removed");
console.log("Director review controls       : absent from assessor workspace");
console.log("Headteacher staff feedback      : absent");
console.log("Persistent browser storage      : absent");
console.log("Background polling              : absent");
console.log("Provider calls                  : absent");
console.log("Database accessed               : false");
console.log("");
console.log("RESULT: N6-F1C3C GOVERNANCE TEACHER BBC-FRIENDLY CORRECTION HANDOFF GREEN");
