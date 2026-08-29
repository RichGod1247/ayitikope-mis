#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- static repository contract harness */

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
  assert(fs.existsSync(absolutePath), "Required file is missing.", { relativePath });
  return fs.readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function assertContains(source, marker, label) {
  assert(source.includes(marker), `Missing contract marker: ${label}`, { marker });
}

function assertNotContains(source, marker, label) {
  assert(!source.includes(marker), `Forbidden contract marker present: ${label}`, { marker });
}

function assertBefore(source, first, second, label) {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  assert(a >= 0 && b >= 0 && a < b, `Contract ordering failed: ${label}`, { first, second, a, b });
}

function assertParses(relativePath, source) {
  const kind = relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, kind);
  const diagnostics = file.parseDiagnostics || [];
  assert(diagnostics.length === 0, "TypeScript parser diagnostics found.", {
    relativePath,
    diagnostics: diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")),
  });
}

const files = {
  helper: "src/lib/lessonNotes/approvedScheme.ts",
  createFromScheme: "src/app/api/teachers/lesson-notes/create-from-scheme/route.ts",
  create: "src/app/api/teachers/lesson-notes/create/route.ts",
  generate: "src/app/api/teachers/lesson-notes/generate-from-curriculum/route.ts",
  upsert: "src/app/api/teachers/lesson-notes/upsert/route.ts",
  linkUnit: "src/app/api/teachers/lesson-notes/link-unit/route.ts",
  submit: "src/app/api/teachers/lesson-notes/submit/route.ts",
  units: "src/app/api/teachers/lesson-notes/units/route.ts",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => {
    const text = read(relativePath);
    assertParses(relativePath, text);
    return [key, text];
  }),
);

// Shared authority: tenant + teacher + APPROVED + canonical teaching scope. Classroom association is preference-only.
assertContains(source.helper, "export async function loadOwnedSchemeItem", "owned Scheme item loader exists");
assertContains(source.helper, 'status: "APPROVED"', "approved Scheme lookup is server-side");
assertContains(source.helper, "tenantId: scope.tenantId", "approved lookup is tenant-scoped");
assertContains(source.helper, "teacherUserId: scope.teacherUserId", "approved lookup is teacher-scoped");
assertContains(source.helper, "item.scheme.tenantId !== scope.tenantId", "post-validation rechecks tenant ownership");
assertContains(source.helper, "item.scheme.teacherUserId !== scope.teacherUserId", "post-validation rechecks teacher ownership");
assertContains(source.helper, "item.weekNumber !== scope.weekNumber", "post-validation rechecks week");
assertContains(source.helper, "aa === bb", "subject post-validation uses canonical equality");
assertNotContains(source.helper, "aa.endsWith(bb)", "subject suffix alone cannot authorize another subject");
assertNotContains(source.helper, "endsWith:", "approved-Scheme subject query does not rely on suffix matching");
assertContains(source.helper, "indicatorId?: string | null", "indicator-id specific approved lookup supported");
assertContains(source.helper, "requestedIndicatorId !== itemIndicatorId", "indicator id must match when requested");
assertContains(source.helper, "requestedIndicatorCode !== itemIndicatorCode", "indicator code must match when requested");
assertNotContains(source.helper, "item.scheme.classroomId !== requestedClassroomId", "classroom association cannot become a false authorization gate");
assertNotContains(source.helper, "classroomId: requestedClassroomId }, { classroomId: null", "approved lookup must not exclude a reusable same-level Scheme by classroom association");
assertContains(source.helper, "classroomPreference", "classroom association is retained only as duplicate-record preference");
assertContains(source.helper, "classroomId === requestedClassroomId", "exact classroom association is preferred when duplicate approved Schemes exist");
assertNotContains(source.helper, "as any", "new shared authority introduces no explicit-any lint debt");

// Explicit create-from-Scheme keeps original not-found semantics, then applies approval gate.
assertContains(source.createFromScheme, "loadOwnedSchemeItem", "create-from-scheme resolves owned item first");
assertContains(source.createFromScheme, 'return json(404, { ok: false, error: "Scheme item not found." });', "missing item stays 404");
assertContains(source.createFromScheme, 'toUpperCase() !== "APPROVED"', "create-from-scheme requires approved parent Scheme");
assertContains(source.createFromScheme, 'code: "APPROVED_SCHEME_REQUIRED"', "create-from-scheme has explicit approval error contract");
assertContains(source.createFromScheme, "schemeOfWorkItemId: item.id", "create-from-scheme retains Scheme evidence anchor");

// Direct create cannot bypass approval. Existing non-null evidence anchors are never silently overwritten.
assertContains(source.create, "findApprovedSchemeItemForScope(approvedScope)", "direct create resolves approved Scheme coverage");
assertContains(source.create, "approvedSchemeItemMatchesScope(existingSchemeItem, approvedScope)", "recent draft reuse must already be approved-backed");
assertContains(source.create, "if (existing.schemeOfWorkItemId)", "existing Scheme evidence is inspected before reuse");
assertContains(source.create, "if (existingSchemeItem && approvedSchemeItemMatchesScope", "only valid approved-backed existing draft is reused");
assertContains(source.create, "data: { schemeOfWorkItemId: approvedSchemeItem.id }", "only an unanchored recent draft is given the approved anchor");
assertContains(source.create, "schemeOfWorkItemId: approvedSchemeItem.id", "new direct draft is approved-Scheme anchored");
assertContains(source.create, 'code: "APPROVED_SCHEME_REQUIRED"', "direct create fails closed without approved Scheme");

// Curriculum generation requires approved week coverage, and slice mode resolves the exact approved indicator.
assertNotContains(source.generate, "async function requireSchemePrecondition", "legacy any-status Scheme gate removed");
assertContains(source.generate, "findApprovedSchemeItemForScope({", "generation starts from approved Scheme coverage");
assertContains(source.generate, "approvedSchemeItemMatchesScope(existingSchemeItem, approvedScope)", "existing draft reuse validates its current approved anchor");
assertContains(source.generate, "let canReuseExisting = !existing.schemeOfWorkItemId", "unanchored existing draft may be safely repaired");
assertContains(source.generate, "indicatorId: indicator.id", "slice mode resolves exact approved indicator id");
assertContains(source.generate, "indicatorCode,", "slice mode also validates indicator code");
assertContains(source.generate, "const approvedIndicatorSchemeItem = await findApprovedSchemeItemForScope", "slice mode has indicator-specific approved lookup");
assertContains(source.generate, "schemeOfWorkItemId: approvedIndicatorSchemeItem.id", "slice-generated draft anchors exact approved item");
assertContains(source.generate, 'code: "APPROVED_SCHEME_INDICATOR_MISMATCH"', "unapproved indicator fails closed");

// Save/upsert is the real editor persistence authority and revalidates the effective Scheme relationship.
assertContains(source.upsert, "loadOwnedSchemeItem", "upsert distinguishes missing from unapproved Scheme item");
assertContains(source.upsert, 'error: "Selected scheme item not found."', "upsert preserves missing-item semantics");
assertContains(source.upsert, 'toUpperCase() !== "APPROVED"', "upsert rejects unapproved Scheme item");
assertContains(source.upsert, "approvedSchemeItemMatchesScope(ownedItem, approvedScope)", "upsert verifies full teaching scope");
assertContains(source.upsert, "findApprovedSchemeItemForScope(approvedScope)", "curriculum-only save still requires approved Scheme coverage");
assertContains(source.upsert, 'code: "APPROVED_SCHEME_REQUIRED"', "upsert has explicit approval error contract");
assertBefore(source.upsert, 'if (currentStatus === "SUBMITTED")', "const approvedScope =", "existing submitted lock remains before new approval enforcement");
assertBefore(source.upsert, 'if (currentStatus === "APPROVED")', "const approvedScope =", "existing approved lock remains before new approval enforcement");

// Unit linking cannot attach an unapproved Scheme. Direct curriculum linking becomes approved-Scheme anchored.
assertContains(source.linkUnit, "findApprovedSchemeItemForScope({", "curriculum-unit linking proves approved coverage");
assertContains(source.linkUnit, "schemeOfWorkItemId: approvedItem.id", "curriculum-unit linking retains approved Scheme anchor");
assertContains(source.linkUnit, "loadOwnedSchemeItem", "scheme-item linking resolves owned item first");
assertContains(source.linkUnit, 'return Notice(404, { ok: false, error: "Scheme item not found." });', "link-unit preserves missing-item 404");
assertContains(source.linkUnit, 'toUpperCase() !== "APPROVED"', "link-unit rejects draft/submitted/returned Scheme item");
assertContains(source.linkUnit, "approvedSchemeItemMatchesScope(item", "link-unit verifies teaching scope");
assertContains(source.linkUnit, 'code: "APPROVED_SCHEME_REQUIRED"', "link-unit has explicit approval error contract");

// Submission is a final server-side backstop; existing notification/transition behavior is preserved.
assertContains(source.submit, "loadOwnedSchemeItem", "submit resolves current Scheme link");
assertContains(source.submit, 'error: "Scheme link is invalid: scheme item not found for this teacher."', "submit preserves invalid-link error");
assertContains(source.submit, 'toUpperCase() !== "APPROVED"', "submit rejects unapproved linked Scheme");
assertContains(source.submit, "approvedSchemeItemMatchesScope(si", "submit verifies linked Scheme scope");
assertContains(source.submit, "findApprovedSchemeItemForScope({", "curriculum-only submit fallback requires approved Scheme");
assertNotContains(source.submit, 'status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] }', "old any-preapproval fallback removed");
assertContains(source.submit, "void notifyLessonNoteSubmitted({", "existing submit notification workflow preserved");
assertContains(source.submit, 'status: "SUBMITTED"', "existing Lesson Note submission transition preserved");
assertBefore(source.submit, 'if (status === "SUBMITTED" || status === "APPROVED")', "const hasCurriculum", "historical submitted/approved idempotency remains intact");

// Editor unit chooser exposes approved Scheme items only; it does not redesign the working editor.
assertContains(source.units, 'status: "APPROVED"', "unit chooser limits Scheme candidates to approved");
assertContains(source.units, 'reason: "NO_APPROVED_SCHEME_MATCH"', "unit chooser reports approval absence explicitly");
assertNotContains(source.units, 'reason: "NO_SCHEME_MATCH"', "legacy ambiguous no-Scheme reason removed");

console.log("APPROVED-SCHEME LESSON-NOTE AUTHORING CONTRACT: GREEN");
console.log("- only APPROVED Scheme of Work authorizes new Lesson Note preparation");
console.log("- tenant + teacher + subject + level + term + year + week are revalidated server-side");
console.log("- selected curriculum indicators must exist in the approved Scheme week");
console.log("- create/create-from-scheme/generate/save/link/submit/units paths are covered");
console.log("- historical submitted/approved Lesson Note behavior and submit notifications are preserved");
console.log("- no Scheme lifecycle, Headteacher review, schema, migration or UI-guide change is in this slice");
