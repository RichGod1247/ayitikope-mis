#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally reads repository source for static contract verification. */

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
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function includesAll(text, markers, label) {
  const missing = markers.filter((marker) => !text.includes(marker));
  assert(missing.length === 0, `${label}: missing contract marker(s)`, missing);
}

const helper = read("src/lib/server/attendancePhysicalRegister.ts");
const sessionGet = read("src/app/api/teacher/attendance/sessions/get/route.ts");
const client = read("src/components/attendance/AttendanceSessionClient.tsx");
const weekly = read("src/lib/headteacherAttendanceWeekly.ts");
const weeklyCsv = read("src/app/api/headteacher/attendance/weekly/csv/route.ts");
const weeklyPage = read("src/app/headteacher/attendance/weekly/page.tsx");
const headStudent = read("src/app/api/headteacher/students/attendance-summary/route.ts");
const parent = read("src/app/api/parent/attendance/summary/route.ts");
const student = read("src/app/api/student/attendance/summary/route.ts");
const adminAbsentees = read("src/app/api/admin/attendance/absentees/route.ts");
const schema = read("prisma/schema.prisma");

includesAll(
  helper,
  [
    'certifiedAt: { not: null }',
    'isHoliday: false',
    'const raw = clean(args.sex ?? args.gender).toUpperCase();',
    'if (raw === "MALE") return "BOYS";',
    'if (raw === "FEMALE") return "GIRLS";',
    'return "UNCLASSIFIED";',
    'status === AttendanceStatus.PRESENT',
    'status === AttendanceStatus.ABSENT',
    'legacyOtherOccurrences += 1',
    'timesOpened: weekAcc.timesOpened',
    'timesOpened: termAcc.timesOpened',
    'Present',
  ],
  "Physical register helper",
);

assert(
  !/raw\s*===\s*["']M["']/.test(helper) && !/raw\s*===\s*["']F["']/.test(helper),
  "Gender classification must not guess shorthand M/F values",
);

includesAll(
  sessionGet,
  [
    'import { getPhysicalRegisterAccounting } from "@/lib/server/attendancePhysicalRegister";',
    'const physicalRegister = await getPhysicalRegisterAccounting({',
    'tenantId: safe.tenantId',
    'classroomId: session.classroomId',
    'physicalRegister,',
  ],
  "Teacher session GET",
);

includesAll(
  client,
  [
    'type PhysicalRegisterPeriodKey = "TODAY" | "WEEK" | "TERM";',
    'data-attendance-summary-ui="physical-register-v1"',
    'data-attendance-register-periods="today-week-term-v1"',
    '["TODAY", "Today"]',
    '["WEEK", "This week"]',
    '["TERM", "Term to date"]',
    '"Today\'s register summary"',
    '"This week\'s register summary"',
    '"Term-to-date register summary"',
    'Times Opened',
    'Male Present',
    'Male Absent',
    'Female Present',
    'Female Absent',
    'Total Present',
    'data-attendance-learner-times-opened="x-out-of-y-v1"',
    'Present {learner.selected.present} out of {learner.selected.timesOpened} times opened',
    '? "Male"',
    '? "Female"',
    'Official figures count certified, non-holiday sessions only.',
    'EduLife OS never guesses a learner&apos;s sex/gender.',
  ],
  "BBC physical-register UI",
);

for (const retiredLabel of [
  "Physical register summary",
  "Boys Present",
  "Boys Absent",
  "Girls Present",
  "Girls Absent",
  '? "Boy"',
  '? "Girl"',
]) {
  assert(
    !client.includes(retiredLabel),
    `Teacher register UI must not expose retired label: ${retiredLabel}`,
  );
}

includesAll(
  weekly,
  [
    'AND s."certifiedAt" IS NOT NULL',
    'AND s."isHoliday" = false',
    'COUNT(DISTINCT rs."sessionId")::int AS "timesOpened"',
    'COALESCE(tm."sex", tm."gender", \'\')',
    '= \'MALE\'',
    '= \'FEMALE\'',
    'AS "boysPresent"',
    'AS "boysAbsent"',
    'AS "girlsPresent"',
    'AS "girlsAbsent"',
    'AS "unclassifiedPresent"',
    'AS "unclassifiedAbsent"',
  ],
  "Headteacher physical-register aggregation",
);

includesAll(
  weeklyCsv,
  [
    '"Times Opened"',
    '"Boys Present"',
    '"Boys Absent"',
    '"Girls Present"',
    '"Girls Absent"',
    'String(r.timesOpened)',
  ],
  "Headteacher weekly CSV",
);

includesAll(
  weeklyPage,
  [
    'label="Times opened"',
    'hint="Certified, non-holiday class-days only."',
    '<Th label="Times Opened" />',
    '<Th label="Boys P" />',
    '<Th label="Boys A" />',
    '<Th label="Girls P" />',
    '<Th label="Girls A" />',
  ],
  "Headteacher weekly UI",
);

for (const [label, text] of [
  ["Headteacher learner summary", headStudent],
  ["Parent learner summary", parent],
  ["Student attendance summary", student],
  ["Admin absentees", adminAbsentees],
]) {
  includesAll(text, ["certifiedAt"], label);
}

includesAll(
  headStudent,
  ['AND s."certifiedAt" IS NOT NULL', 'AND s."isHoliday" = false'],
  "Headteacher learner official filter",
);
includesAll(
  parent,
  ['certifiedAt: { not: null }', 'isHoliday: false'],
  "Parent official filter",
);
includesAll(
  student,
  ['certifiedAt: { not: null }', 'isHoliday: false'],
  "Student official filter",
);
includesAll(
  adminAbsentees,
  ['certifiedAt: { not: null }', 'isHoliday: false'],
  "Admin official absentee filter",
);

assert(
  !schema.includes("timesOpened") && !schema.includes("boysPresent") && !schema.includes("girlsPresent"),
  "P3B2 aggregate counters must not be persisted in Prisma schema",
);

console.log("=== UI-P3B2 PHYSICAL REGISTER ACCOUNTING CONTRACT CHECK ===");
console.log("Official session = certified + non-holiday: GREEN");
console.log("Times Opened derived from official sessions: GREEN");
console.log("sex ?? gender; MALE/FEMALE only; no guessing: GREEN");
console.log("Boys/Girls Present/Absent occurrences: GREEN");
console.log("Today / This week / Term to date UI: GREEN");
console.log("Learner X out of Y times opened: GREEN");
console.log("Late/Excused historical compatibility preserved: GREEN");
console.log("Headteacher weekly physical-register parity: GREEN");
console.log("Parent/student/admin official filters: GREEN");
console.log("Persisted aggregate counters: NONE");
console.log("Schema migration: NONE");
console.log("Provider calls from QA: 0");
console.log("Database writes from QA: 0");
console.log("RESULT: UI-P3B2 PHYSICAL REGISTER ACCOUNTING CONTRACT GREEN");
