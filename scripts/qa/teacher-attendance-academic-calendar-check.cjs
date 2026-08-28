/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function assert(condition, message, detail) {
  if (condition) return;
  const suffix = detail === undefined ? "" : ` :: ${JSON.stringify(detail)}`;
  throw new Error(`${message}${suffix}`);
}

function loadPureCalendarModule() {
  const rel = "src/lib/attendanceAcademicCalendar.ts";
  const source = read(rel);
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true,
    },
    fileName: rel,
    reportDiagnostics: true,
  });

  const diagnostics = out.diagnostics ?? [];
  assert(diagnostics.length === 0, "Calendar helper transpile diagnostics", diagnostics);

  const cjsModule = { exports: {} };
  const fn = new Function("module", "exports", "require", out.outputText);
  fn(cjsModule, cjsModule.exports, require);
  return cjsModule.exports;
}

const calendar = read("src/lib/attendanceAcademicCalendar.ts");
const serverCalendar = read("src/lib/server/attendanceAcademicCalendar.ts");
const setupPage = read("src/app/admin/setup/page.tsx");
const setupLoad = read("src/app/api/admin/setup/load/route.ts");
const setupSave = read("src/app/api/admin/setup/save/route.ts");
const teacherPage = read("src/app/teacher/attendance/page.tsx");
const teacherList = read("src/components/teacher/TeacherAttendanceClient.tsx");
const sessionGet = read("src/app/api/teacher/attendance/sessions/get/route.ts");
const sessionClient = read("src/components/attendance/AttendanceSessionClient.tsx");
const modernMarks = read("src/app/api/teacher/attendance/marks/upsert/route.ts");
const legacyMarks = read("src/app/api/attendance/marks/upsert/route.ts");
const qr = read("src/app/api/teacher/attendance/qr/scan/route.ts");
const legacySession = read("src/app/api/teacher/attendance/sessions/[sessionId]/route.ts");
const open = read("src/app/api/teacher/attendance/sessions/open/route.ts");
const close = read("src/app/api/teacher/attendance/sessions/close/route.ts");
const certify = read("src/app/api/teacher/attendance/sessions/certify/route.ts");
const reopen = read("src/app/api/teacher/attendance/sessions/reopen/route.ts");
const notify = read("src/app/api/teacher/attendance/notify-parents/route.ts");
const schema = read("prisma/schema.prisma");

for (const marker of [
  "buildAttendanceAcademicCalendar",
  "resolveAttendanceDate",
  "expectedSchoolDays",
  'code: "DATE_OUTSIDE_CURRENT_TERM"',
  'code: "WEEKEND"',
  "Monday to Friday",
]) {
  assert(calendar.includes(marker), "Pure attendance calendar marker missing", marker);
}

for (const marker of [
  "loadAttendanceAcademicCalendar",
  "resolveAttendanceCalendarDate",
  "assertAttendanceDateInCurrentTerm",
  "tenantSettings.findUnique",
]) {
  assert(serverCalendar.includes(marker), "Server calendar authority marker missing", marker);
}

const pure = loadPureCalendarModule();
const full = pure.buildAttendanceAcademicCalendar({
  currentAcademicYear: "2026/2027",
  currentTerm: "1st Term",
  term1Start: "2026-09-07",
  term1End: "2026-12-18",
});
assert(full.configured === true, "Full calendar must configure");
let resolved = pure.resolveAttendanceDate(full, "2026-09-09");
assert(resolved.allowed === true, "Full-week school day must be allowed", resolved);
assert(resolved.weekNumber === 1, "Opening week must resolve Week 1", resolved);
assert(resolved.expectedSchoolDays === 5, "Full week baseline must be 5", resolved);

const partialStart = pure.buildAttendanceAcademicCalendar({
  currentAcademicYear: "2026/2027",
  currentTerm: "1st Term",
  term1Start: "2026-09-09",
  term1End: "2026-12-18",
});
resolved = pure.resolveAttendanceDate(partialStart, "2026-09-09");
assert(resolved.allowed === true, "Partial opening Wednesday must be allowed", resolved);
assert(resolved.weekNumber === 1, "Partial opening week must still be Week 1", resolved);
assert(resolved.expectedSchoolDays === 3, "Wednesday reopening must have 3 opening-week school days", resolved);
resolved = pure.resolveAttendanceDate(partialStart, "2026-09-14");
assert(resolved.weekNumber === 2, "Next Monday after partial opening must be Week 2", resolved);
assert(resolved.expectedSchoolDays === 5, "Second week must return to 5-day baseline", resolved);

const partialEnd = pure.buildAttendanceAcademicCalendar({
  currentAcademicYear: "2026/2027",
  currentTerm: "3rd Term",
  term3Start: "2027-04-19",
  term3End: "2027-07-21",
});
resolved = pure.resolveAttendanceDate(partialEnd, "2027-07-21");
assert(resolved.allowed === true, "Partial final Wednesday must be allowed", resolved);
assert(resolved.expectedSchoolDays === 3, "Wednesday closing week must have 3 school days", resolved);

resolved = pure.resolveAttendanceDate(full, "2026-09-06");
assert(resolved.allowed === false && resolved.code === "DATE_OUTSIDE_CURRENT_TERM", "Pre-term date must fail closed", resolved);
resolved = pure.resolveAttendanceDate(full, "2026-12-19");
assert(resolved.allowed === false && resolved.code === "DATE_OUTSIDE_CURRENT_TERM", "Post-term date must fail closed", resolved);
resolved = pure.resolveAttendanceDate(full, "2026-09-12");
assert(resolved.allowed === false && resolved.code === "WEEKEND", "Saturday must fail closed", resolved);

for (const marker of [
  'requireRoleNames: [...ALLOWED_ROLES]',
  '"SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"',
]) {
  assert(setupLoad.includes(marker), "Setup load role parity marker missing", marker);
  assert(setupSave.includes(marker), "Setup save role parity marker missing", marker);
}
assert(!setupLoad.includes("tenantSettings.upsert"), "Setup GET must remain read-only");
for (const forbidden of ["attendanceStartTime", "attendanceEndTime", "lateCutoffMinutes", "feverThreshold"]) {
  assert(!setupPage.includes(forbidden), "Legacy setup UI field must be removed", forbidden);
  assert(setupLoad.includes(forbidden), "Setup load must preserve legacy response compatibility", forbidden);
  assert(setupSave.includes(forbidden), "Setup save must tolerate legacy cached-client keys", forbidden);
}
for (const marker of [
  "const LEGACY_IGNORED_KEYS",
  "...LEGACY_IGNORED_KEYS",
  "completedAt: result.setupCompletedAt",
]) {
  assert(setupSave.includes(marker), "Setup backward-compatibility marker missing", marker);
}
const academicDataBlock = setupSave.slice(
  setupSave.indexOf("const data = {"),
  setupSave.indexOf("assertRange(data.term1Start"),
);
for (const forbidden of ["attendanceStartTime", "attendanceEndTime", "lateCutoffMinutes", "feverThreshold"]) {
  assert(
    !academicDataBlock.includes(forbidden),
    "Academic save must not rewrite legacy attendance/health settings",
    forbidden,
  );
}
for (const marker of [
  'data-academic-settings-authority="attendance-current-term-v1"',
  "Its Start date is reopening",
  "its End date closes new attendance",
]) {
  assert(setupPage.includes(marker), "Academic settings UX marker missing", marker);
}
for (const marker of [
  'action: "ACADEMIC_CALENDAR_SETTINGS_UPDATED"',
  'resource: "TenantSettings"',
  'policy: "ATTENDANCE_ACADEMIC_CALENDAR_V1"',
  "Prisma.TransactionIsolationLevel.Serializable",
  "await tx.auditLog.create",
]) {
  assert(setupSave.includes(marker), "Academic calendar audit marker missing", marker);
}
assert(
  setupSave.indexOf("await tx.tenantSettings.upsert") < setupSave.indexOf("await tx.auditLog.create"),
  "Academic settings mutation must precede its audit in the same transaction",
);

for (const marker of [
  "loadAttendanceAcademicCalendar(ctx.tenantId)",
  "academicCalendar={academicCalendar}",
]) {
  assert(teacherPage.includes(marker), "Teacher attendance calendar bootstrap missing", marker);
}
for (const marker of [
  'data-attendance-calendar-authority="tenant-current-term-v1"',
  "resolveAttendanceDate(academicCalendar, dateISO)",
  "Reopening:",
  "Closing:",
  "View historical session",
  "dateResolution.allowed",
]) {
  assert(teacherList.includes(marker), "Teacher attendance calendar UX marker missing", marker);
}

for (const source of [modernMarks, legacyMarks, qr, legacySession, open, close, certify, reopen, notify]) {
  assert(
    source.includes("assertAttendanceDateInCurrentTerm"),
    "Attendance mutation route missing current-term guard",
  );
}
assert(
  open.match(/assertAttendanceDateInCurrentTerm/g)?.length >= 2,
  "Session-open normal path and unique-race recovery must both revalidate the academic calendar",
);

for (const marker of [
  "resolveAttendanceCalendarDate",
  "academicCalendar:",
  "...academicCalendar.calendar",
  "...academicCalendar.date",
]) {
  assert(sessionGet.includes(marker), "Attendance session read compatibility calendar marker missing", marker);
}
for (const marker of [
  "calendarMutationLocked",
  "Read-only register.",
  "Existing attendance history is preserved.",
  "academicCalendar?.allowed === true",
]) {
  assert(sessionClient.includes(marker), "Attendance session fail-closed UX marker missing", marker);
}

for (const marker of [
  "assertCanAccessClassroom",
  "Manual attendance accepts only PRESENT or ABSENT",
  "Existing Late/Excused records may be preserved until corrected.",
]) {
  assert(legacyMarks.includes(marker), "Legacy attendance mark writer parity marker missing", marker);
  assert(legacySession.includes(marker), "Legacy session POST parity marker missing", marker);
}

for (const marker of [
  "createdAt         DateTime  @default(now())",
  "closedAt          DateTime?",
  "certifiedAt       DateTime?",
  "attendanceStartTime String?",
  "attendanceEndTime   String?",
  "lateCutoffMinutes   Int?",
  "feverThreshold      Decimal?",
]) {
  assert(schema.includes(marker), "Schema compatibility marker missing", marker);
}

assert(!schema.includes("AttendanceHoliday"), "UI-P3A must not introduce the holiday schema slice early");

for (const source of [calendar, serverCalendar, setupPage, setupLoad, setupSave, teacherPage, teacherList, sessionGet, sessionClient]) {
  for (const forbidden of ["localStorage", "sessionStorage", "setInterval("]) {
    assert(!source.includes(forbidden), "Academic calendar authority must not use browser persistence/polling", forbidden);
  }
}

console.log("");
console.log("=== UI-P3A ATTENDANCE ACADEMIC CALENDAR AUTHORITY ===");
console.log("");
console.log("Calendar authority              : TenantSettings current academic year + current term");
console.log("Reopening authority             : selected term Start date");
console.log("Closing authority               : selected term End date");
console.log("Week resolution                 : Monday-Friday / partial first-final weeks");
console.log("Normal full-week baseline       : 5 school days");
console.log("Outside current term            : FAIL CLOSED FOR MUTATIONS");
console.log("Weekend attendance mutation     : FAIL CLOSED");
console.log("Historical session reads        : PRESERVED / READ-ONLY WHEN OUTSIDE TERM");
console.log("Admin setup Attendance card     : REMOVED");
console.log("Admin setup Health card         : REMOVED");
console.log("Legacy attendance/health fields : PRESERVED IN SCHEMA / NOT REWRITTEN");
console.log("Session timing truth            : createdAt / closedAt / certifiedAt");
console.log("Headteacher/Admin calendar edit : ALLOWED");
console.log("Calendar correction audit       : SAME SERIALIZABLE TRANSACTION");
console.log("Legacy mark writers             : CLASS AUTH + CURRENT TERM + PRESENT/ABSENT PARITY");
console.log("Holiday supersession            : DEFERRED TO UI-P3B");
console.log("Schema migration                : NONE");
console.log("Database accessed by QA         : false");
console.log("");
console.log("RESULT: UI-P3A ATTENDANCE ACADEMIC CALENDAR AUTHORITY GREEN");
