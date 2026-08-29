#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally reads repository sources. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function read(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolute)) fail("Required source file is missing.", { relativePath });
  return fs.readFileSync(absolute, "utf8");
}

function assertIncludes(source, marker, label) {
  if (!source.includes(marker)) fail(`${label}: required marker missing.`, { marker });
}

function assertExcludes(source, marker, label) {
  if (source.includes(marker)) fail(`${label}: forbidden marker present.`, { marker });
}

const dashboard = read("src/app/teacher/dashboard/page.tsx");
const schemes = read("src/app/teacher/schemes/page.tsx");
const schemeDetail = read("src/app/teacher/schemes/[id]/page.tsx");
const curriculum = read("src/components/TeacherCurriculumExplorerClient.tsx");
const lessonList = read("src/app/teacher/lesson-notes/ui/LessonNotesListClient.tsx");
const studioPage = read("src/app/teacher/lesson-notes/studio/page.tsx");
const studioClient = read("src/app/teacher/lesson-notes/studio/ui/LessonNotesStudioClient.tsx");
const authority = read("src/lib/lessonNotes/approvedScheme.ts");

// Security remains server-owned.
assertIncludes(authority, 'status: "APPROVED"', "approved-Scheme authority");
assertIncludes(authority, "item.scheme.tenantId !== scope.tenantId", "tenant scope");
assertIncludes(authority, "item.scheme.teacherUserId !== scope.teacherUserId", "teacher scope");

// Dashboard teaches the sequence without inventing runtime state there.
assertIncludes(
  dashboard,
  'subtitle: "Prepare → Submit → Approval → Lesson Notes"',
  "dashboard Scheme journey",
);
assertIncludes(
  dashboard,
  'desc: "View existing lesson notes or start a new one from an approved Scheme of Work."',
  "dashboard Lesson Notes journey",
);

// Scheme overview derives the guide from persisted Scheme status.
for (const status of ["DRAFT", "SUBMITTED", "RETURNED", "APPROVED"]) {
  assertIncludes(schemes, `selectedScheme.status === "${status}"`, `Scheme overview ${status}`);
}
assertIncludes(schemes, "No Scheme of Work has been prepared yet.", "Scheme overview NONE state");
assertIncludes(schemes, "Prepare Scheme of Work", "Scheme overview prepare action");
assertIncludes(schemes, "Waiting for approval", "Scheme overview submitted state");
assertIncludes(schemes, "Correct Scheme", "Scheme overview returned state");
assertIncludes(schemes, "Prepare Lesson Notes", "Scheme overview approved action");
assertIncludes(schemes, 'p.set("schemeId", scheme.id);', "exact Scheme correction context");
assertIncludes(schemes, 'p.set("return", `/teacher/schemes/${scheme.id}`);', "exact Scheme return path");
assertExcludes(schemes, 'href="/teacher/lesson-notes"', "Scheme overview competing Lesson Notes CTA");
assertExcludes(schemes, "Open in Studio", "Scheme overview technical Studio wording");

// Detail page must not reveal Lesson Note creation before approval.
assertIncludes(
  schemeDetail,
  'scheme.status === "APPROVED" && (',
  "Scheme detail approval reveal",
);
assertIncludes(schemeDetail, "Prepare Lesson Note", "Scheme detail approved CTA");
assertIncludes(schemeDetail, "Continue Scheme", "Scheme detail draft action");
assertIncludes(schemeDetail, "Resubmit for Approval", "Scheme detail returned action");
assertIncludes(schemeDetail, "Waiting for approval", "Scheme detail submitted state");
assertExcludes(schemeDetail, "Open in Studio", "Scheme detail technical Studio wording");

// Scheme preparation reuses existing calls but removes the extra summary/poll-like readiness fetch.
assertIncludes(curriculum, 'const urlSchemeId = (searchParams.get("schemeId") ?? "").trim();', "Scheme exact-id context");
assertIncludes(curriculum, "Back to Scheme", "Scheme preparation return action");
assertIncludes(curriculum, "Add to Week", "Scheme preparation week action");
assertIncludes(curriculum, "urlSchemeId && data.items.some", "Scheme preparation exact-id selection");
assertExcludes(curriculum, "loadSchemeSummary", "extra Scheme summary fetch");
assertExcludes(curriculum, "canReturnToLessonNotes", "premature Lesson Notes readiness");
assertExcludes(curriculum, "Return to Lesson Notes", "premature Lesson Notes return");
assertExcludes(curriculum, "Sync term/year to URL", "technical URL control");

// Lesson Notes list remains historical workspace; new work starts from Scheme.
assertIncludes(
  lessonList,
  'onClick={() => router.push("/teacher/schemes")}',
  "Lesson Notes guided start",
);
assertIncludes(lessonList, "start from an approved Scheme of Work", "Lesson Notes explanation");
assertExcludes(
  lessonList,
  'router.push("/teacher/lesson-notes/studio")',
  "direct Studio start",
);
assertExcludes(lessonList, "New lesson note", "direct new-note CTA");

// Direct Studio entry is fail-closed to the Scheme journey.
assertIncludes(
  studioPage,
  'if (!initialSchemeItemId) {\n    redirect("/teacher/schemes");\n  }',
  "Studio direct-entry redirect",
);
assertIncludes(
  studioClient,
  "The server rechecks the approved Scheme before the Lesson Note is created.",
  "Studio server-truth explanation",
);
assertIncludes(studioClient, "Choose another Scheme", "Studio alternate path");
assertExcludes(studioClient, "Use manual mode", "Studio manual-mode CTA");

console.log("SCHEME GUIDED JOURNEY CONTRACT: GREEN");
console.log("- NONE/DRAFT/SUBMITTED/RETURNED/APPROVED states are progressively disclosed");
console.log("- Lesson Note creation is revealed only from an APPROVED Scheme");
console.log("- returned/draft Scheme editing carries exact scheme context back to preparation");
console.log("- Lesson Notes list preserves historical work and routes new preparation to Scheme");
console.log("- direct Studio entry without a Scheme item returns to the Scheme journey");
console.log("- Scheme preparation removes the extra summary readiness fetch and premature Lesson Notes return");
console.log("- server-approved Scheme authority remains the security source of truth");
