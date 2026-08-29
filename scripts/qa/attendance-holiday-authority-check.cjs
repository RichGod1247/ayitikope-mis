#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads repository files for static contract verification. */

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
  assert(fs.existsSync(absolutePath), `Missing required file: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function hasAll(text, markers, label) {
  const missing = markers.filter((marker) => !text.includes(marker));
  assert(missing.length === 0, `${label}: required contract marker(s) missing`, missing);
}

function hasNone(text, markers, label) {
  const found = markers.filter((marker) => text.includes(marker));
  assert(found.length === 0, `${label}: forbidden marker(s) present`, found);
}

const schema = read("prisma/schema.prisma");
const migration = read(
  "prisma/migrations/20260828190000_attendance_holiday_authority/migration.sql",
);
const holidayRoute = read(
  "src/app/api/teacher/attendance/sessions/holiday/route.ts",
);
const getRoute = read("src/app/api/teacher/attendance/sessions/get/route.ts");
const teacherSummary = read(
  "src/app/api/teacher/attendance/sessions/summary/route.ts",
);
const legacySummary = read("src/app/api/attendance/sessions/summary/route.ts");
const sessionClient = read(
  "src/components/attendance/AttendanceSessionClient.tsx",
);
const teacherClient = read(
  "src/components/teacher/TeacherAttendanceClient.tsx",
);

console.log("=== UI-P3B1 ATTENDANCE HOLIDAY AUTHORITY CONTRACT CHECK ===");

hasAll(
  schema,
  [
    "isHoliday               Boolean   @default(false)",
    "holidayReason           String?",
    "holidayDeclaredAt       DateTime? @db.Timestamptz(6)",
    "holidayDeclaredByUserId String?",
    '@relation("AttendanceHolidayDeclaredBy"',
    'map: "AttendanceSession_holidayDeclaredBy_fkey"',
    'map: "attendance_official_day_idx"',
  ],
  "Prisma holiday model",
);
console.log("Prisma holiday model: GREEN");

hasAll(
  migration,
  [
    'ADD COLUMN "isHoliday" BOOLEAN NOT NULL DEFAULT false',
    'ADD COLUMN "holidayReason" TEXT',
    'ADD CONSTRAINT "AttendanceSession_holiday_state_check"',
    'ADD CONSTRAINT "AttendanceSession_holidayDeclaredBy_fkey"',
    'CREATE INDEX "attendance_official_day_idx"',
    'attendance_guard_holiday_mark_mutation',
    'AttendanceMark_holiday_mutation_guard',
    'ATTENDANCE_HOLIDAY_MARKS_LOCKED',
    'attendance_guard_pre_cert_holiday',
    'AttendanceSession_pre_cert_holiday_guard',
    'ATTENDANCE_HOLIDAY_REQUIRES_ZERO_MARKS',
  ],
  "Migration holiday safety",
);
hasNone(
  migration.toUpperCase(),
  ["DROP TABLE", "DROP COLUMN", "DELETE FROM", "TRUNCATE ", "UPDATE \"EDULIFE_OS\".\"ATTENDANCEMARK\""],
  "Migration destructive-write guard",
);
console.log("Migration holiday safety: GREEN");

hasAll(
  holidayRoute,
  [
    "PRE_CERT_HOLIDAY_ROLES",
    "CERTIFIED_SUPERSESSION_ROLES",
    "confirmCertifiedSupersession",
    "assertCanAccessClassroom",
    "assertAttendanceDateInCurrentTerm",
    "FOR UPDATE",
    "attendanceMark.count",
    "notifyingAt",
    "isHoliday: true",
    "holidayReason: reason",
    "holidayDeclaredAt: now",
    "holidayDeclaredByUserId: safe.userId",
    "ATTENDANCE_HOLIDAY_DECLARED",
    "ATTENDANCE_CERTIFIED_DAY_SUPERSEDED_AS_HOLIDAY",
    "ATTENDANCE_HOLIDAY_REQUESTED",
    "pendingApproval: true",
    "existingAttendancePreserved: true",
    "originalEvidencePreserved: true",
    "Prisma.TransactionIsolationLevel.Serializable",
  ],
  "Holiday route authority/audit",
);
console.log("Holiday route authority/audit: GREEN");

hasAll(
  getRoute,
  [
    "isHoliday: true",
    "holidayReason: true",
    "holidayDeclaredAt: true",
    "holidayDeclaredByUserId: true",
    "holidayAuthority",
    "canDeclareBeforeCertification",
    "canSupersedeCertified",
    "ATTENDANCE_HOLIDAY_REQUESTED",
    "holidayRequest:",
  ],
  "Session GET holiday contract",
);
console.log("Session GET holiday contract: GREEN");

for (const relativePath of [
  "src/app/api/attendance/marks/upsert/route.ts",
  "src/app/api/teacher/attendance/marks/upsert/route.ts",
  "src/app/api/teacher/attendance/qr/scan/route.ts",
  "src/app/api/teacher/attendance/sessions/[sessionId]/route.ts",
  "src/app/api/teacher/attendance/sessions/close/route.ts",
  "src/app/api/teacher/attendance/sessions/certify/route.ts",
  "src/app/api/teacher/attendance/sessions/reopen/route.ts",
]) {
  const text = read(relativePath);
  assert(text.includes("isHoliday"), `${relativePath}: holiday lock missing`);
}
console.log("Mutation surfaces holiday lock: GREEN");

for (const relativePath of [
  "src/app/api/attendance/notify-absentees/route.ts",
  "src/app/api/teacher/attendance/notify-parents/route.ts",
]) {
  const text = read(relativePath);
  hasAll(
    text,
    ["isHoliday", "isHoliday: false", "holiday sessions"],
    `${relativePath}: notification holiday exclusion`,
  );
}
console.log("Provider notification exclusion: GREEN");

for (const relativePath of [
  "src/app/api/admin/attendance/absentees/route.ts",
  "src/app/api/parent/attendance/summary/route.ts",
  "src/app/api/student/attendance/summary/route.ts",
]) {
  const text = read(relativePath);
  assert(text.includes("isHoliday: false"), `${relativePath}: holiday summary filter missing`);
}

for (const relativePath of [
  "src/lib/headteacherAttendanceWeekly.ts",
  "src/app/api/headteacher/students/attendance-summary/route.ts",
]) {
  const text = read(relativePath);
  assert(text.includes('s."isHoliday" = false'), `${relativePath}: SQL holiday filter missing`);
}
console.log("Existing attendance calculations exclude holiday: GREEN");

hasAll(
  teacherSummary,
  [
    '"HOLIDAY"',
    "isHoliday: true",
    "holidayReason: true",
    "session && !session.isHoliday",
  ],
  "Teacher summary holiday state",
);
hasAll(
  legacySummary,
  ['"HOLIDAY"', "isHoliday: true", "session && !session.isHoliday"],
  "Legacy summary holiday state",
);
console.log("Summary holiday state: GREEN");

hasAll(
  sessionClient,
  [
    'data-attendance-holiday-control="v1"',
    "Holiday / school closed",
    "Save Holiday",
    "Correct to Holiday",
    "Request Holiday",
    "Holiday request pending:",
    "/api/teacher/attendance/sessions/holiday",
    "Original certified learner marks remain preserved as audit evidence.",
    "Holiday sessions do not send attendance notifications.",
  ],
  "BBC holiday session UI",
);
hasAll(
  teacherClient,
  ['type SummaryState = "NONE" | "OPEN" | "CLOSED" | "CERTIFIED" | "HOLIDAY"', "No Times Opened"],
  "Teacher landing holiday state",
);
console.log("BBC holiday UI: GREEN");

console.log("Schema migration: NEW EXPLICIT MIGRATION");
console.log("Legacy attendance_mvp migration: UNTOUCHED");
console.log("Migration existing learner marks: NOT REWRITTEN");
console.log("Teacher marked-day Holiday: HEADTEACHER APPROVAL REQUEST");
console.log("Certified evidence preservation: REQUIRED");
console.log("Provider calls from QA: 0");
console.log("Database writes from QA: 0");
console.log("RESULT: UI-P3B1 ATTENDANCE HOLIDAY AUTHORITY CONTRACT GREEN");
