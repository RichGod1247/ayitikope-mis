"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally uses Node require. */
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const dashboardPath = path.join(root, "src/app/teacher/dashboard/page.tsx");
const source = fs.readFileSync(dashboardPath, "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function count(value) {
  return source.split(value).length - 1;
}

assert(
  source.includes('readTeacherHeadteacherAppraisalAssignmentState'),
  "Dashboard must use the D3.4C5 teacher assignment read model.",
);
assert(
  source.includes('type TeacherHeadteacherAppraisalAssignmentReadState'),
  "Dashboard tile mapping must be typed against the read-state contract.",
);
assert(
  /const headteacherAppraisalState = isTeacherOnly\s*\? await readTeacherHeadteacherAppraisalAssignmentState\(/s.test(source),
  "Only a Teacher may execute the Headteacher appraisal assignment lookup.",
);
assert(
  source.includes('actorUserId: safe.userId') &&
    source.includes('actorRoleName: safe.roleName') &&
    source.includes('tenantId: safe.tenantId'),
  "Assignment lookup must bind the authenticated user, role and tenant.",
);

for (const state of [
  "LOCKED",
  "AVAILABLE",
  "CONTINUE",
  "SUBMITTED_READ_ONLY",
  "CLOSED",
]) {
  assert(
    source.includes(`case "${state}"`) ||
      (state === "LOCKED" && source.includes('case "LOCKED"')),
    `Dashboard mapping is missing ${state}.`,
  );
}

for (const label of ["Locked", "Available", "Continue", "Submitted", "Closed"]) {
  assert(source.includes(`pill: "${label}"`), `Missing dashboard pill: ${label}`);
}

assert(
  /case "AVAILABLE":[\s\S]*?enabled: true/.test(source),
  "Available assignments must open the response form.",
);
assert(
  /case "CONTINUE":[\s\S]*?enabled: true/.test(source),
  "In-progress assignments must remain actionable.",
);
assert(
  /case "SUBMITTED_READ_ONLY":[\s\S]*?enabled: true/.test(source),
  "Finalized assignments must open in read-only mode.",
);
assert(
  /case "CLOSED":[\s\S]*?enabled: true/.test(source),
  "Closed assignments must expose their truthful final status.",
);
assert(
  /case "LOCKED":[\s\S]*?enabled: false/.test(source),
  "No-assignment state must remain locked.",
);

const expectedTitles = [
  "Attendance",
  "Scheme of Work",
  "Lesson Notes",
  "Assessment",
  "My Appraisal",
  "Headteacher Appraisal",
  "Health",
  "Communication",
];
const tilesStart = source.indexOf("  const tiles: Array<{");
const tilesEnd = source.indexOf("  const quickAttendanceLabel", tilesStart);
assert(tilesStart >= 0 && tilesEnd > tilesStart, "Dashboard tiles array could not be isolated.");
const tilesSource = source.slice(tilesStart, tilesEnd);
const actualTitles = [...tilesSource.matchAll(/^      title: "([^"]+)",$/gm)].map(
  (match) => match[1],
);
assert(
  JSON.stringify(actualTitles) === JSON.stringify(expectedTitles),
  `Teacher dashboard tile order drifted: ${JSON.stringify(actualTitles)}`,
);
assert(
  source.includes('href: "/teacher/headteacher-appraisal"'),
  "Headteacher Appraisal must link to the D3.4D2 mobile form.",
);
assert(
  source.includes('<OfficialNoticeSummaryCard') &&
    source.includes('variant="icon"'),
  "Official Notices icon navigation must remain intact.",
);
assert(
  !source.includes('title: "Official Notices"'),
  "Official Notices must not return as a workspace tile.",
);

for (const forbidden of [
  'fetch(',
  'useEffect(',
  'setInterval(',
  'localStorage',
  'sessionStorage',
  'participantId',
  'respondentUserId',
  'targetHeadteacherUserId',
]) {
  assert(!source.includes(forbidden), `Forbidden dashboard behavior or identity field: ${forbidden}`);
}

assert(count('readTeacherHeadteacherAppraisalAssignmentState({') === 1,
  "Dashboard must perform exactly one server-side assignment lookup.");
assert(!source.includes('"use client"'), "Teacher dashboard must remain a server component.");

console.log("");
console.log("=== D3.4D3 DASHBOARD ASSIGNMENT WIRING ===");
console.log("");
console.log("Teacher-only lookup             : exact user/role/tenant scope");
console.log("Dashboard network behavior      : server read, no client fetch/polling");
console.log("Locked state                    : disabled");
console.log("Available state                 : actionable");
console.log("Continue state                  : actionable");
console.log("Submitted state                 : read-only route remains accessible");
console.log("Closed state                    : truthful status route accessible");
console.log("Headteacher Appraisal position  : sixth");
console.log("Official Notices workspace tile : absent");
console.log("Official Notices icon           : preserved");
console.log("Identity fields                 : absent");
console.log("Persistent browser storage      : absent");
console.log("Database accessed               : false");
console.log("");
console.log("RESULT: D3.4D3 DASHBOARD ASSIGNMENT WIRING GREEN");
