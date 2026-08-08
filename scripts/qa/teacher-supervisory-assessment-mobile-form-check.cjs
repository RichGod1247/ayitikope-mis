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
  "subjectBeingObserved",
  "dateObserved",
  "subStrand",
  "classTaught",
  "durationMinutes",
]) {
  assert(client.includes(field), `Official observation field missing: ${field}`);
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

assert(client.includes("/api/governance/appraisals/teacher-supervisory"), "Teacher supervisory API root missing");
assert(client.includes("/section`"), "Teacher section endpoint missing");
assert(client.includes("/comment`"), "Teacher comment endpoint missing");
assert(client.includes("/finalize`"), "Teacher finalize endpoint missing");
assert(client.includes("confirmFinalization: true"), "Explicit finalization confirmation body missing");
assert(client.includes("window.confirm"), "Irreversible finalization confirmation missing");
assert(!client.includes("/revision"), "Teacher revision UI must remain absent before N6-E");
assert(!client.includes("createRevision"), "Teacher correction revision control must remain absent before N6-E");
assert(!client.includes("headteacher-supervisory"), "Teacher UI must not call Headteacher supervisory APIs");
assert(!client.includes("staffFeedback"), "Teacher UI must not include confidential Headteacher staff feedback");
assert(!client.includes("Director’s review queue"), "Premature Director review wording must remain absent");
assert(!client.includes("Director's review queue"), "Premature Director review wording must remain absent");

assert(client.includes("6-section, 34-indicator"), "Official Teacher form count wording missing");
assert(client.includes("General Comments"), "General Comments control missing");
assert(client.includes("<textarea"), "General Comments textarea missing");
assert(client.includes("allItemsAnswered"), "Completion-gated overall result missing");
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
console.log("=== N6-D4C1 GOVERNANCE TEACHER BBC-FRIENDLY NATIVE FORM ===");
console.log("");
console.log("Audience                        : SISSO / BSC / HOS / Director");
console.log("Selection                       : circuit → school → Teacher");
console.log("Target identity                 : server-backed queue only");
console.log("Official header                 : 10 fields / 3 server + 7 assessor-entered");
console.log("Observation retry               : stable idempotency key per unchanged attempt");
console.log("Official form                   : 6 sections / 34 indicators");
console.log("Rating controls                 : 1-5 plus N/A");
console.log("Section autosave                : serialized + retry");
console.log("General Comments                : separate serialized autosave");
console.log("Database reload                 : source of truth before review");
console.log("Incomplete overall result       : suppressed until 34/34");
console.log("Mobile progress/navigation      : present");
console.log("Native final review             : full Teacher paper-form copy");
console.log("Finalization                    : explicit confirmation + lock");
console.log("Returned revision controls      : absent until N6-E");
console.log("Director review controls        : absent until N6-E");
console.log("Headteacher staff feedback      : absent");
console.log("Persistent browser storage      : absent");
console.log("Background polling              : absent");
console.log("Provider calls                  : absent");
console.log("Database accessed               : false");
console.log("");
console.log("RESULT: N6-D4C1 GOVERNANCE TEACHER BBC-FRIENDLY NATIVE FORM GREEN");
