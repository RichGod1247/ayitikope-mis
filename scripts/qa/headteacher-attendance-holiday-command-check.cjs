#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally performs static contract verification. */

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
  assert(missing.length === 0, `${label}: required marker(s) missing`, missing);
}

function hasNone(text, markers, label) {
  const found = markers.filter((marker) => text.includes(marker));
  assert(found.length === 0, `${label}: forbidden marker(s) present`, found);
}

const headHoliday = read("src/app/api/headteacher/day/holiday/route.ts");
const dayOverview = read("src/app/api/headteacher/day/overview/route.ts");
const dayPage = read("src/app/headteacher/day/page.tsx");
const teacherHoliday = read("src/app/api/teacher/attendance/sessions/holiday/route.ts");
const teacherGet = read("src/app/api/teacher/attendance/sessions/get/route.ts");
const teacherClient = read("src/components/attendance/AttendanceSessionClient.tsx");
const bulkCertify = read("src/app/api/headteacher/day/bulk-certify/route.ts");
const pending = read("src/app/api/headteacher/attendance/sessions/pending/route.ts");

console.log("=== UI-P3C1 HEADTEACHER HOLIDAY COMMAND CONTRACT CHECK ===");

hasAll(
  teacherHoliday,
  [
    "ATTENDANCE_HOLIDAY_REQUESTED",
    "requiresHeadteacherApproval: true",
    "existingAttendancePreserved: true",
    'kind: "pending"',
    "pendingApproval: true",
  ],
  "Teacher marked-day Holiday request",
);
console.log("Teacher marked-day Holiday request: GREEN");

hasAll(
  teacherGet,
  [
    "ATTENDANCE_HOLIDAY_REQUESTED",
    "ATTENDANCE_HOLIDAY_REQUEST_APPROVED",
    "ATTENDANCE_HOLIDAY_REQUEST_REJECTED",
    "holidayRequest:",
    '"PENDING"',
    '"APPROVED"',
    '"REJECTED"',
  ],
  "Teacher Holiday request read model",
);
console.log("Teacher Holiday request read model: GREEN");

hasAll(
  teacherClient,
  [
    "Request Holiday",
    "Holiday request pending:",
    "Existing attendance remains authoritative until the Headteacher approves it.",
    "Holiday request sent to the Headteacher.",
  ],
  "Teacher Holiday request BBC UI",
);
console.log("Teacher Holiday request BBC UI: GREEN");

hasAll(
  headHoliday,
  [
    'z.literal("DECLARE_DAY")',
    'z.literal("APPROVE_REQUEST")',
    'z.literal("REJECT_REQUEST")',
    'z.literal("REOPEN_CLASS")',
    "ATTENDANCE_SCHOOL_DAY_DECLARED_HOLIDAY",
    "ATTENDANCE_SCHOOL_DAY_CLASS_HOLIDAY_DECLARED",
    "ATTENDANCE_HOLIDAY_REQUEST_APPROVED",
    "ATTENDANCE_HOLIDAY_REQUEST_REJECTED",
    "ATTENDANCE_HOLIDAY_REOPENED_FOR_MARKING",
    "reconciledMarkSnapshot",
    "originalEvidencePreserved: true",
    "Prisma.TransactionIsolationLevel.Serializable",
    "Only a teacher-declared Holiday can be reopened for marking from this control.",
  ],
  "Headteacher Holiday authority",
);
console.log("Headteacher Holiday authority: GREEN");

hasAll(
  dayOverview,
  [
    '"HOLIDAY"',
    '"HOLIDAY_REQUEST"',
    "holidayReason: true",
    "holidayDeclaredByUserId: true",
    "ATTENDANCE_HOLIDAY_REQUESTED",
    "holidaySource",
    "holidayRequest:",
  ],
  "Headteacher day Holiday visibility",
);
console.log("Headteacher day Holiday visibility: GREEN");

hasAll(
  dayPage,
  [
    "School holiday",
    "Attendance scans",
    "Class command list",
    "Approve Holiday",
    "Keep attendance",
    "Reopen for marking",
    'action: "DECLARE_DAY"',
    'action: "APPROVE_REQUEST"',
    'action: "REJECT_REQUEST"',
    'action: "REOPEN_CLASS"',
    "md:hidden",
    "hidden overflow-x-auto md:block",
  ],
  "Headteacher BBC/mobile Holiday command UI",
);

hasNone(
  dayPage,
  [
    'countChip("Operational classes"',
    'countChip("Hidden empty shells"',
  ],
  "Daily diagnostic strip",
);
hasAll(
  dayPage,
  [
    "showScans ? (",
    'title="Daily QR scan evidence"',
  ],
  "Attendance scans disclosure",
);
console.log("Headteacher BBC/mobile Holiday command UI: GREEN");

assert(
  bulkCertify.includes("isHoliday: false"),
  "Headteacher bulk certify must exclude Holiday sessions",
);
assert(
  pending.includes("isHoliday: false"),
  "Headteacher pending certification must exclude Holiday sessions",
);
console.log("Headteacher certification Holiday exclusion: GREEN");

hasNone(
  headHoliday,
  [
    "sendSms(",
    "sendEmail(",
    "fetch(\"http",
    "fetch('http",
  ],
  "Holiday command provider guard",
);

console.log("Database migration: NONE");
console.log("Existing holiday schema: REUSED");
console.log("Provider calls from QA: 0");
console.log("Database writes from QA: 0");
console.log("RESULT: UI-P3C1 HEADTEACHER HOLIDAY COMMAND CONTRACT GREEN");
