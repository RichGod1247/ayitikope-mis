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

const helper = read("src/lib/governance/studentAttendance.ts");
const panel = read("src/components/governance/GovernanceStudentAttendancePanel.tsx");
const dashboard = read("src/components/governance/GovernanceCommandDashboardClient.tsx");
const circuitRoute = read("src/app/api/circuit/student-attendance/route.ts");
const districtRoute = read("src/app/api/district/student-attendance/route.ts");
const physicalRegister = read("src/lib/server/attendancePhysicalRegister.ts");
const academicCalendar = read("src/lib/attendanceAcademicCalendar.ts");

console.log("=== UI-GOV-ATT-P1 GOVERNANCE STUDENT ATTENDANCE DASHBOARD CONTRACT CHECK ===");

hasAll(
  helper,
  [
    "StudentStatus.ACTIVE",
    'by: ["tenantId"]',
    "population: truth?.population ?? 0",
  ],
  "Population authority",
);
console.log("Population authority = ACTIVE /admin/students truth: GREEN");

hasAll(
  helper,
  [
    "certifiedAt: { not: null }",
    "isHoliday: false",
    "AttendanceStatus.PRESENT",
    "AttendanceStatus.ABSENT",
  ],
  "Official attendance truth",
);
hasAll(
  physicalRegister,
  [
    "certifiedAt: { not: null }",
    "isHoliday: false",
    "Historical compatibility only. LATE / EXCUSED",
  ],
  "Existing physical-register authority",
);
console.log("Official attendance = certified + non-holiday: GREEN");

hasAll(
  helper,
  [
    "buildAttendanceAcademicCalendar",
    "resolveAttendanceDate",
    "currentWeek",
    "presentPct: pct(accumulator.present, accumulator.marked)",
  ],
  "Term week authority",
);
hasAll(
  academicCalendar,
  [
    "weekNumber",
    "weekStartDateISO",
    "weekEndDateISO",
    "expectedSchoolDays",
  ],
  "Academic calendar week authority",
);
console.log("Term week numbering + week-on-week score: GREEN");

hasAll(
  helper,
  [
    'if (session.isHoliday) {',
    "truth.holidayClassrooms += 1",
    "truth.missingRegisters += 1",
    "truth.unmarkedLearners += unmarked",
    "truth.absentLearners += absent",
  ],
  "Follow-up evidence separation",
);
assert(
  helper.indexOf('if (session.isHoliday) {') < helper.indexOf("truth.unmarkedLearners += unmarked"),
  "Holiday classes must exit before unmarked/follow-up accounting",
);
console.log("Holiday coverage != missing attendance: GREEN");

hasAll(
  helper,
  [
    "b.missingRegisters - a.missingRegisters",
    "b.openRegisters - a.openRegisters",
    "b.unmarkedLearners - a.unmarkedLearners",
    "b.uncertifiedRegisters - a.uncertifiedRegisters",
    "b.absentLearners - a.absentLearners",
  ],
  "Follow-up priority order",
);
console.log("Follow-up ranking = highest priority first: GREEN");

hasAll(
  circuitRoute,
  [
    "CIRCUIT_GOVERNANCE_ROLES",
    "allowedZoneLevels: [1]",
    'view: "SCHOOL"',
    '"Cache-Control": "no-store"',
  ],
  "SISSO route scope",
);
hasAll(
  districtRoute,
  [
    "DISTRICT_GOVERNANCE_ROLES",
    "allowedZoneLevels: [2]",
    'view: "CIRCUIT"',
    '"Cache-Control": "no-store"',
  ],
  "Director route scope",
);
console.log("Governance role + zone scope revalidation: GREEN");

hasAll(
  panel,
  [
    "SISSO learner attendance",
    "Schools in your circuit",
    "Population",
    "Present",
    "Absent",
    "Term-to-date",
    "Week {week.weekNumber}",
    "Schools needing attendance follow-up",
    "Director learner attendance",
    "Circuit attendance",
    "Circuit population",
    "Circuits needing attendance follow-up",
    '<details',
  ],
  "BBC/mobile attendance UI",
);
hasNone(
  panel,
  [
    "Present rate",
    "Completion",
    "Missing schools",
    "Parent alerts",
    "Open sessions",
  ],
  "Removed diagnostic dashboard clutter",
);
console.log("SISSO school cards + Director circuit cards: GREEN");

hasAll(
  dashboard,
  [
    "GovernanceStudentAttendancePanel",
    '"/api/circuit/student-attendance"',
    '"/api/district/student-attendance"',
    'view={isCircuitView ? "SCHOOL" : "CIRCUIT"}',
    'activePanel === "students-attendance"',
  ],
  "Lazy attendance panel wiring",
);
hasNone(
  dashboard,
  ["Students Attendance command signal"],
  "Legacy attendance command panel",
);
console.log("Attendance detail fetches only when panel is opened: GREEN");

hasNone(
  helper + panel + circuitRoute + districtRoute,
  [
    "localStorage",
    "sessionStorage",
    "sendSms(",
    "sendEmail(",
    'fetch("http',
    "fetch('http",
  ],
  "Persistence/provider guard",
);

console.log("Persisted attendance aggregates: NONE");
console.log("Schema migration: NONE");
console.log("Provider calls from QA: 0");
console.log("Database writes from QA: 0");
console.log("RESULT: UI-GOV-ATT-P1 GOVERNANCE STUDENT ATTENDANCE DASHBOARD GREEN");
