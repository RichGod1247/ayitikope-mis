#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally reads repository source files. */

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
  if (!fs.existsSync(absolute)) fail("Required source file missing", { relativePath });
  return fs.readFileSync(absolute, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function has(source, marker, label) {
  assert(source.includes(marker), `Missing ${label}`, { marker });
}

function lacks(source, marker, label) {
  assert(!source.includes(marker), `Forbidden ${label}`, { marker });
}

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260905083000_teacher_lesson_timetable_settings/migration.sql");
const timetableLib = read("src/lib/lessonNotes/teacherTimetable.ts");
const route = read("src/app/api/teacher/lesson-notes/settings/route.ts");
const settingsPage = read("src/app/teacher/lesson-notes/settings/page.tsx");
const settingsClient = read("src/app/teacher/lesson-notes/settings/TeacherLessonTimetableSettingsClient.tsx");
const listClient = read("src/app/teacher/lesson-notes/ui/LessonNotesListClient.tsx");
const printPage = read("src/app/teacher/lesson-notes/[id]/print/page.tsx");

// Schema is additive and recurring-period oriented.
for (const marker of [
  "model TeacherLessonTimetableEntry {",
  "teacherUserId String",
  "classroomId   String",
  "subjectNorm   String",
  "weekday       Int      @db.SmallInt",
  "startMinute   Int      @db.SmallInt",
  "endMinute     Int      @db.SmallInt",
  "isActive      Boolean  @default(true)",
  "retiredAt     DateTime? @db.Timestamptz(6)",
  'map: "TeacherLessonTimetableEntry_active_lookup_idx"',
  'map: "TeacherLessonTimetableEntry_class_time_idx"',
]) {
  has(schema, marker, "Teacher Lesson Timetable schema marker");
}

// Migration fails closed, preserves retired evidence, and prevents impossible overlaps.
for (const marker of [
  "LESSON_TIMETABLE_TABLE_ALREADY_EXISTS",
  "LESSON_TIMETABLE_INSERT_GUARD_ALREADY_EXISTS",
  "LESSON_TIMETABLE_EVIDENCE_GUARD_ALREADY_EXISTS",
  'CREATE TABLE edulife_os."TeacherLessonTimetableEntry"',
  'CHECK ("weekday" BETWEEN 1 AND 5)',
  '"endMinute" > "startMinute"',
  'CREATE UNIQUE INDEX "TeacherLessonTimetableEntry_active_exact_unique"',
  "LESSON_TIMETABLE_CLASSROOM_TENANT_SCOPE_INVALID",
  "LESSON_TIMETABLE_TEACHER_MEMBERSHIP_INACTIVE",
  "LESSON_TIMETABLE_TEACHER_OVERLAP",
  "LESSON_TIMETABLE_CLASSROOM_OVERLAP",
  "LESSON_TIMETABLE_EVIDENCE_DELETE_FORBIDDEN",
  "LESSON_TIMETABLE_RETIRED_EVIDENCE_IMMUTABLE",
  'CREATE TRIGGER "TeacherLessonTimetableEntry_insert_guard"',
  'CREATE TRIGGER "TeacherLessonTimetableEntry_evidence_guard"',
  "BEGIN;",
  "COMMIT;",
]) {
  has(migration, marker, "migration governance marker");
}

// Assignment authority is reused instead of inventing a timetable-only scope.
for (const marker of [
  "listUserAccessibleClassrooms",
  "resolveUserClassroomAccess",
  "subjectMatchesTeachingScope",
  "curriculumSubjectsForClass",
  "authorizeTeacherTimetableSelection",
  "readTeacherTimetableEntries",
  "readActiveTeacherTimetableEntries",
]) {
  has(timetableLib, marker, "shared timetable authority marker");
}

// API is teacher-only, tenant-scoped, no-store, serializable and audited.
for (const marker of [
  'requireRoleNames: ["TEACHER"]',
  '"Cache-Control": "no-store"',
  "authorizeTeacherTimetableSelection({",
  "Prisma.TransactionIsolationLevel.Serializable",
  "pg_advisory_xact_lock",
  "WITH lock_row AS MATERIALIZED",
  'SELECT 1::int AS "locked"',
  "LESSON_TIMETABLE_LOCK_NOT_ACQUIRED",
  'action: auditAction',
  'resource: "TeacherLessonTimetable"',
  '"isActive" = false',
  '"retiredAt" = now()',
  'INSERT INTO edulife_os."TeacherLessonTimetableEntry"',
  "TEACHER_OVERLAP",
  "CLASSROOM_OVERLAP",
]) {
  has(route, marker, "settings API contract marker");
}

lacks(route, "tenantId: parsed.data", "client-supplied tenant override");
lacks(route, "teacherUserId: parsed.data", "client-supplied teacher override");

// BBC/mobile/low-network workflow: subject first, class second, period cards, one GET + save response refresh.
for (const marker of [
  "Set your weekly lesson times",
  "Only your current teaching assignments are shown.",
  'htmlFor="lesson-setting-subject"',
  'htmlFor="lesson-setting-class"',
  "Choose Subject → Class → add every weekly day and time → Save.",
  "singleStreamClassOptions",
  "showMultipleStreams",
  "Multiple streams",
  "Off by default. Turn on to choose a class arm.",
  "visibleClasses.map",
  "setShowMultipleStreams(Boolean(editedClass && hasClassArm(editedClass)))",
  "+ Add another day/time",
  'type="time"',
  "Save lesson times",
  "Clear saved times",
  "Saved weekly timetable",
  'fetch("/api/teacher/lesson-notes/settings"',
  "setEntries(data.entries ?? [])",
]) {
  has(settingsClient, marker, "BBC/mobile/low-network UI marker");
}

has(settingsPage, 'requireRoleNames: ["TEACHER"]', "settings page role gate");
has(settingsPage, 'redirectTo: "/teacher/lesson-notes/settings"', "settings page auth callback");
has(listClient, 'router.push("/teacher/lesson-notes/settings")', "Lesson Notes settings discovery button");
has(listClient, "Lesson Note Settings", "Lesson Notes settings label");

// Print remains server-rendered and derives teacher/class/subject schedule without a browser fetch.
for (const marker of [
  "readTeacherTimetableEntries({",
  'asOf: note.status === "APPROVED" && note.approvedAt ? note.approvedAt : null',
  "teacherUserId: note.teacherUserId",
  "classroomId: note.classroomId",
  "subjectMatchesTeachingScope(row.subject, subject, timetableScopeLevel)",
  "groupTimetableEntriesForPrint",
  "timetablePrintGroups.length",
  "group.dayLabel",
  "group.times.map",
]) {
  has(printPage, marker, "Lesson Note print timetable marker");
}

lacks(printPage, 'fetch("/api/teacher/lesson-notes/settings"', "print-page client network dependency");

console.log("LESSON NOTE TIMETABLE SETTINGS CONTRACT: GREEN");
console.log("- teacher settings derive only from current teaching/classroom authority");
console.log("- single-stream classes are the default presentation; an explicit toggle reveals authorized class arms");
console.log("- editing a saved arm timetable automatically reveals multi-stream mode without changing server authority");
console.log("- one subject/class can hold multiple weekly periods, including multiple periods on one day");
console.log("- start/end times are required and overlapping teacher/class periods fail closed");
console.log("- edits retire prior rows instead of deleting timetable evidence; approved prints resolve the as-of approval timetable");
console.log("- writes are tenant/user server-owned, serializable and audit logged");
console.log("- settings UI is progressive, mobile-first and one-load/one-save low-network friendly");
console.log("- Lesson Note print resolves saved schedule server-side and prints time below each day");
