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
const studioPath = "src/app/teacher/lesson-notes/studio/ui/LessonNotesStudioClient.tsx";
const createFromSchemePath = "src/app/api/teachers/lesson-notes/create-from-scheme/route.ts";
const palettePath = "src/components/teacher/GhanaianLanguageCharacterPalette.tsx";
const list = read(listPath);
const editor = read(editorPath);
const studio = read(studioPath);
const createFromScheme = read(createFromSchemePath);
const palette = read(palettePath);

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

// GL-P1 U4K: native-language input follows the teacher across desktop and mobile.
has(editor, "activeLanguageField", "active Lesson Note field state for mobile language accessory");
has(editor, "onActiveChange={setActiveLanguageField}", "all editable Lesson Note fields report active focus");
has(editor, "mobileActive={Boolean(activeLanguageField)}", "mobile palette follows current active Lesson Note field");
has(editor, "languageStickyAnchorRef", "desktop language sticky transition anchor");
has(editor, "desktopLanguageCompact", "desktop keys-only sticky state");
has(editor, "anchor.getBoundingClientRect().top <= 96", "desktop compact state begins only when sticky threshold is reached");
has(editor, 'className="mt-2 space-y-2 md:sticky md:top-24 md:z-30"', "desktop sticky authority remains on long-lived Lesson Note section child");
has(editor, 'desktopLanguageCompact ? "md:hidden" : ""', "bulky language badge and copy disappear only while desktop palette is sticky");
has(editor, "desktopCompact={desktopLanguageCompact}", "palette receives desktop compact sticky state");
has(editor, 'lessonLanguage ? "pb-24 md:pb-4" : ""', "mobile editor reserves room for language keyboard accessory");
has(palette, "window.visualViewport", "mobile visual-viewport keyboard positioning");
has(palette, "props.desktopCompact", "desktop palette has distinct natural and sticky presentations");
has(palette, 'className="w-fit max-w-full rounded-xl', "sticky desktop presentation contains only a compact key surface");
has(palette, 'className="fixed inset-x-1.5 z-[65] md:hidden"', "compact mobile language keyboard accessory");
has(palette, "onPointerDown={(event) => event.preventDefault()}", "palette taps preserve active textarea focus and phone keyboard");
has(palette, "overflow-x-auto overscroll-x-contain", "compact horizontally scrollable mobile character strip");
lacks(palette, "Your phone keyboard stays open.", "bulky mobile helper copy inside active keyboard accessory");

// Approved Scheme remains level-scoped; exact classroom is bound only when a Lesson Note is created.
has(createFromScheme, 'classroomId: z.string().trim().min(1).max(160).optional().nullable()', "optional exact classroom request");
has(createFromScheme, "listUserAccessibleClassrooms", "existing teacher classroom authority reused");
has(createFromScheme, "resolveUserClassroomAccess", "server-side subject/class authority revalidation");
has(createFromScheme, "normalizeSchoolLevel", "Scheme level and classroom level canonical matching");
has(createFromScheme, 'code: "CLASSROOM_REQUIRED"', "ambiguous multi-stream class fails closed to explicit choice");
has(createFromScheme, 'code: "CLASSROOM_OUT_OF_SCOPE"', "forged classroom choice is rejected");
has(createFromScheme, 'code: "CLASSROOM_SCOPE_UNAVAILABLE"', "missing assigned classroom scope fails closed");
has(createFromScheme, 'status: { in: ["DRAFT", "REJECTED"] }', "only mutable legacy unbound notes may be rebound");
has(createFromScheme, '...(existing.classroomId ? {} : { classroomId })', "legacy mutable draft gains exact classroom without rewriting bound evidence");
has(createFromScheme, "classroomId,", "created Lesson Note is anchored to exact classroom");
lacks(createFromScheme, "schemeOfWork.update", "Lesson Note classroom binding must not mutate level-scoped Scheme authority");

// Create-from-Scheme is idempotent under double-click/retry/concurrent requests.
// The server serializes the same canonical tenant/teacher/class/subject/term/year/week/level
// identity before running the existing-note read/create decision.
has(createFromScheme, "function lessonNoteCreationLockKey", "canonical Lesson Note creation lock-key helper");
has(createFromScheme, '"LESSON_NOTE_CREATE_FROM_SCHEME_V1"', "versioned Lesson Note creation lock namespace");
has(createFromScheme, "const creationLockKey = lessonNoteCreationLockKey({", "server-derived canonical creation lock key");
has(createFromScheme, "pg_advisory_xact_lock", "transaction-scoped Lesson Note creation serialization");
has(createFromScheme, '::text AS "lockResult"', "Prisma-supported scalar cast for advisory-lock result");
has(createFromScheme, "hashtextextended", "64-bit database advisory lock hashing");
has(createFromScheme, "const existingExact = await tx.lessonNote.findFirst({", "existing-note recheck occurs inside serialized transaction");
has(studio, 'data.code === "CLASSROOM_REQUIRED"', "Studio handles exact-class choice response");
has(studio, "Which class is this Lesson Note for?", "BBC exact-class prompt");
has(studio, "The approved Scheme can cover the level.", "level-scoped Scheme explanation");
has(studio, "singleStreamClassroomChoices", "single-stream default classroom presentation");
has(studio, "showMultipleStreams", "progressive multi-stream state");
has(studio, "Multiple streams", "BBC multi-stream toggle label");
has(studio, "Off by default. Turn on to choose a class arm.", "single-stream default guidance");
has(studio, "visibleClassroomChoices.map((classroom) =>", "only presentation-filtered server-returned options render");
has(studio, "defaultChoices.length === 1 ? defaultChoices[0]!.id :", "single canonical class is preselected");
has(studio, '...(classroomId ? { classroomId } : {})', "class choice is retried in the existing create POST");
lacks(studio, '/api/teachers/classrooms/list', "exact-class bridge adds no extra classroom-list browser fetch");

// Existing server-side authority and workflow remain exact. GL-P1 intentionally extends the teacher item GET and upsert routes with frozen Ghanaian-language evidence; their exact new hashes and language-only markers are pinned below.
const protectedHashes = {
  "src/lib/lessonNotes/approvedScheme.ts": "36D10F64CBA812E9C448CE9FCD4141B40CB38BD98E195D5AD66C91A1056B39E3",
  "src/app/api/teachers/lesson-notes/from-scheme-item/route.ts": "35EC18A52D63DE6BA00AFC90F9C2151B4F16B9C90A3B3765079B7F8AB3E53468",
  "src/app/api/teachers/lesson-notes/list/route.ts": "45ADEDEC1526FF0395102571AB8657C00701D041C1549E6924753E60006DA147",
  "src/app/api/teachers/lesson-notes/item/[id]/route.ts": "3CFA90BE7517F74C43368A3F57E3438F1A7E7A09A24902CE2D30DEA4346BB6E5",
  "src/app/api/teachers/lesson-notes/upsert/route.ts": "CE5D3BA4A34DF7EFC1C53E72C2C31772FDF7DB2F94292D94554CB864672C03FE",
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

// GL-P1 extends two protected routes only to expose/freeze server-owned language evidence; tenant/teacher ownership and existing workflow authority stay pinned.
const itemRoute = read("src/app/api/teachers/lesson-notes/item/[id]/route.ts");
has(itemRoute, "lessonLanguageCode: true,", "frozen lesson-language field in teacher item response");
has(itemRoute, "languageRegistryVersion: true,", "frozen language-registry version in teacher item response");
has(itemRoute, "where: { id, tenantId: ctx.tenantId, teacherUserId: ctx.userId },", "existing tenant + teacher ownership gate on teacher item GET");

const upsertRoute = read("src/app/api/teachers/lesson-notes/upsert/route.ts");
has(upsertRoute, "normalizeEducationalTextNullable", "Unicode-safe editable Lesson Note text normalization");
has(upsertRoute, "resolveTeacherLessonLanguageForNote", "server-owned lesson-language resolution during upsert");
has(upsertRoute, "existing.lessonLanguageCode && !isGhanaianLanguageSubject(effectiveSubject)", "frozen Ghanaian-language subject-change guard");
has(upsertRoute, "where: { id: lessonNoteId, tenantId: ctx.tenantId, teacherUserId: ctx.userId },", "existing tenant + teacher ownership gate on Lesson Note upsert");

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
console.log("- approved Scheme stays level-scoped; exact classroom is bound only at Lesson Note creation");
console.log("- Lesson Note class choice defaults to the canonical single stream and progressively reveals authorized arms");
console.log("- ambiguous multi-stream scope asks one BBC-friendly class question and validates it server-side");
console.log("- create-from-Scheme serializes canonical Lesson Note identity so retries/double-clicks reuse one draft");
console.log("- advisory-lock result is cast to text so Prisma does not deserialize PostgreSQL void");
console.log("- Ghanaian-language input follows the active field: sticky desktop palette + mobile keyboard accessory");
console.log("- desktop palette is full at its natural position, then collapses to keys-only once the sticky threshold is reached");
console.log("- mobile accessory is keys-only, compact, horizontally scrollable and visual-viewport aware");
console.log("- Headteacher review, submit notifications and delete rules remain unchanged; teacher item/upsert authority is extended only with exact frozen-language evidence + Unicode-safe text handling");
