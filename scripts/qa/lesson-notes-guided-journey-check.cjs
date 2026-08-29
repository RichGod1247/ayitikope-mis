#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally reads repository source files. */

const crypto = require("crypto");
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
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function canonicalHash(relativePath) {
  const canonical = read(relativePath).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return crypto.createHash("sha256").update(Buffer.from(canonical, "utf8")).digest("hex").toUpperCase();
}

function has(source, marker, label) {
  assert(source.includes(marker), `Missing ${label}`, { marker });
}

function lacks(source, marker, label) {
  assert(!source.includes(marker), `Forbidden ${label}`, { marker });
}

const listPath = "src/app/teacher/lesson-notes/ui/LessonNotesListClient.tsx";
const editorPath = "src/app/teacher/lesson-notes/[id]/ui/LessonNoteEditorClient.tsx";
const list = read(listPath);
const editor = read(editorPath);

// Lesson Notes list: status-first guidance + low-network filter behavior.
has(list, 'const [filtersOpen, setFiltersOpen] = useState(false);', "progressive filter disclosure");
has(list, 'const [appliedFilters, setAppliedFilters] = useState<FilterState>(EMPTY_FILTERS);', "explicit applied-filter state");
has(list, '}, [appliedFilters]);', "query tied only to applied filters");
has(list, "EduLife will not reload while you are still typing.", "low-network filter guidance");
has(list, "Apply filters", "explicit filter apply action");
has(list, 'className="grid gap-3 md:hidden"', "mobile Lesson Note cards");
has(list, 'className="mt-4 hidden overflow-x-auto', "desktop table preservation");
has(list, 'case "SUBMITTED":\n      return "Waiting for Headteacher";', "submitted human status label");
has(list, 'case "REJECTED":\n      return "Correction required";', "rejected human status label");
has(list, 'return "Read feedback & correct";', "rejected primary action");
has(list, 'return "Continue Lesson Note";', "draft primary action");
has(list, 'return "View approved note";', "approved primary action");
has(list, 'router.push("/teacher/schemes")', "new Lesson Note routes through Scheme journey");
lacks(list, '/teacher/lesson-notes/studio', "direct Studio creation bypass in Lesson Notes list");
has(list, 'status === "APPROVED"', "approved comment tone branch");
has(list, 'status === "REJECTED"', "returned/correction comment tone branch");

// Editor: persisted status determines the one next action.
has(editor, 'const isSubmitted = note.status === "SUBMITTED";', "submitted editor state");
has(editor, 'const isApproved = note.status === "APPROVED";', "approved editor state");
has(editor, 'const isRejected = note.status === "REJECTED";', "rejected editor state");
has(editor, 'eyebrow: "WAITING FOR HEADTEACHER"', "submitted waiting guide");
has(editor, 'eyebrow: "CORRECTION REQUIRED"', "rejected correction guide");
has(editor, 'eyebrow: "READY TO SUBMIT"', "draft ready guide");
has(editor, 'title: "Lesson Note complete"', "approved complete guide");
has(editor, 'title: "Save your changes first"', "saved-version submission protection");
has(editor, 'disabled={submitting}', "submit action state guard");
has(editor, 'const submitLabel = isRejected ? "Resubmit to Headteacher" : "Submit to Headteacher";', "status-aware submit wording");
has(editor, '"border-emerald-300/20 bg-emerald-400/12 text-emerald-100"', "approved comment success tone");
has(editor, '"border-rose-300/20 bg-rose-400/12 text-rose-100"', "rejected comment correction tone");
has(editor, 'Approved Scheme linked', "approved Scheme checklist wording");
has(editor, 'Choose indicator from approved Scheme', "BBC Scheme-item picker wording");
has(editor, '<summary className="cursor-pointer text-xs font-semibold text-[#D7DCE5]">Having trouble finding the indicator?</summary>', "advanced picker troubleshooting disclosure");
has(editor, 'id="lesson-note-fields"', "continue-to-fields anchor");

// Existing server-side authority and workflow must remain byte-identical to grounded df54691 source.
const protectedHashes = {
  "prisma/schema.prisma": "212460F7EC0E6163C4C39A308BCE63266018C810463D4167D1A7099ABBEDF8B6",
  "src/lib/lessonNotes/approvedScheme.ts": "36D10F64CBA812E9C448CE9FCD4141B40CB38BD98E195D5AD66C91A1056B39E3",
  "src/app/api/teachers/lesson-notes/create-from-scheme/route.ts": "6715EECCA60D2163A6DA6B10185A0D9783484DC44FF3320C1621ED71E3EEDCED",
  "src/app/api/teachers/lesson-notes/from-scheme-item/route.ts": "35EC18A52D63DE6BA00AFC90F9C2151B4F16B9C90A3B3765079B7F8AB3E53468",
  "src/app/api/teachers/lesson-notes/list/route.ts": "45ADEDEC1526FF0395102571AB8657C00701D041C1549E6924753E60006DA147",
  "src/app/api/teachers/lesson-notes/item/[id]/route.ts": "FC1EA0BD9CE47104902FEDF51D43A1006D8F7B8964EEA4F7EFF4D0533CD21EB6",
  "src/app/api/teachers/lesson-notes/upsert/route.ts": "B9D3A71F5E74A7A5FFCDF38FB44E912ED3A885D24225CF19180C1466E6E0F8FB",
  "src/app/api/teachers/lesson-notes/submit/route.ts": "05696E70C5CA5683A8863FD9608DCB26BAB62DF97BA57D93C74C4F4ADFD027B9",
  "src/app/api/teachers/lesson-notes/delete/route.ts": "34DB743DA56ACD1CA4144C72839204022CE32D9E259B6866FA06FF03A0674783",
  "src/app/api/headteacher/lesson-notes/review/route.ts": "7E1C276FA1FF978AEB68FEB17C0703EEB5DBEB26BEAF7BF719C02DDA2F5D1BB2",
  "src/lib/lessonNotes/submitNotifications.ts": "7CB34AA8A07CE0B6EC6F417BA201F3B418B282B738504E65158A1CB64D766830",
};

for (const [relativePath, expectedHash] of Object.entries(protectedHashes)) {
  const actualHash = canonicalHash(relativePath);
  assert(actualHash === expectedHash, "Protected Lesson Note authority drift", {
    relativePath,
    expectedHash,
    actualHash,
  });
}

const submitRoute = read("src/app/api/teachers/lesson-notes/submit/route.ts");
has(submitRoute, "notifyLessonNoteSubmitted", "existing Lesson Note submit notification call");
has(submitRoute, 'status !== "DRAFT" && status !== "REJECTED"', "existing submit transition gate");

const reviewRoute = read("src/app/api/headteacher/lesson-notes/review/route.ts");
has(reviewRoute, 'action !== "APPROVE" && action !== "REJECT"', "Headteacher review actions");
has(reviewRoute, 'current.status as LessonNoteStatus) !== "SUBMITTED"', "Headteacher submitted-only review gate");

console.log("LESSON NOTES GUIDED JOURNEY CONTRACT: GREEN");
console.log("- new Lesson Notes still originate from the approved-Scheme server authority");
console.log("- list uses compact mobile status cards and keeps desktop capability");
console.log("- filters are progressive and apply once instead of fetching while the teacher types");
console.log("- DRAFT guides completion/save/submit; SUBMITTED guides waiting");
console.log("- REJECTED guides feedback/correction/resubmission; APPROVED guides view/print");
console.log("- Headteacher comments use status-aware success/correction tones");
console.log("- advanced Scheme-item troubleshooting is hidden behind progressive disclosure");
console.log("- Headteacher review, submit notifications, delete rules, schema and server authority are unchanged");
