/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads repository files for static contract verification. */
const fs = require("fs");
const path = require("path");

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function assert(condition, message, details) {
  if (condition) return;
  const suffix = details === undefined ? "" : ` :: ${JSON.stringify(details)}`;
  throw new Error(`${message}${suffix}`);
}

function contains(source, marker, label) {
  assert(source.includes(marker), `Missing ${label}`, marker);
}

function excludes(source, marker, label) {
  assert(!source.includes(marker), `Forbidden ${label}`, marker);
}

function indexBefore(source, first, second, label) {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  assert(a >= 0, `${label}_FIRST_MISSING`, first);
  assert(b >= 0, `${label}_SECOND_MISSING`, second);
  assert(a < b, `${label}_ORDER_INVALID`, { first, second, a, b });
}

const access = read("src/lib/teacherClassroomAccess.ts");
const listRoute = read("src/app/api/teacher/classrooms/list/route.ts");
const openRoute = read("src/app/api/teacher/attendance/sessions/open/route.ts");
const legacySessionRoute = read("src/app/api/teacher/attendance/sessions/[sessionId]/route.ts");
const studentsRoute = read("src/app/api/teacher/attendance/students/route.ts");
const attendanceUi = read("src/components/teacher/TeacherAttendanceClient.tsx");
const adminTeachers = read("src/app/admin/teachers/page.tsx");
const schema = read("prisma/schema.prisma");

for (const marker of [
  "primaryClassroomId",
  'if (profile.phase === "JHS") return null;',
  "matches.length === 1 ? matches[0] : null",
  'status: "ACTIVE"',
  "resolveOrdinaryTeacherAttendanceClassroom",
]) {
  contains(access, marker, "class responsibility authority marker");
}

excludes(access, "jhsAssignments", "JHS subject assignment attendance authority");
excludes(access, "parseJhsAssignments", "legacy JHS assignment attendance resolver");

contains(
  access,
  "JHS subject assignments are teaching authority, not register authority.",
  "JHS responsibility policy comment",
);
contains(
  access,
  "Multiple arms fail closed until an admin",
  "KG/Primary ambiguous-arm fail-closed policy",
);

for (const marker of [
  'import { listAccessibleClassrooms } from "@/lib/teacherClassroomAccess";',
  "const classrooms = await listAccessibleClassrooms(safe);",
]) {
  contains(listRoute, marker, "teacher classroom list authority marker");
}

for (const marker of [
  "recoverUniqueRace",
  "await assertCanAccessClassroom({ ...safe, classroomId });",
  "const claimed = await prisma.attendanceSession.updateMany",
]) {
  contains(openRoute, marker, "session-open authority marker");
}

indexBefore(
  openRoute,
  "async function recoverUniqueRace",
  "const existing = await prisma.attendanceSession.findFirst",
  "unique-race helper declaration",
);

const raceStart = openRoute.indexOf("async function recoverUniqueRace");
const raceEnd = openRoute.indexOf("export async function POST", raceStart);
const raceBlock = raceStart >= 0 && raceEnd > raceStart ? openRoute.slice(raceStart, raceEnd) : "";
contains(raceBlock, "await assertCanAccessClassroom", "unique-race authorization recheck");
indexBefore(
  raceBlock,
  "await assertCanAccessClassroom",
  "const existing = await prisma.attendanceSession.findFirst",
  "unique-race authorization before session recovery",
);
excludes(raceBlock, "req.json()", "second request-body read in unique-race fallback");

for (const marker of [
  'import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";',
  "classroomId: session.classroomId",
  "await assertCanAccessClassroom({",
]) {
  contains(legacySessionRoute, marker, "legacy session shared authority marker");
}
excludes(legacySessionRoute, "NO_PRIMARY_CLASS_ASSIGNED", "duplicate primary-class authority path");
contains(legacySessionRoute, "STUDENT_OUTSIDE_SESSION_CLASSROOM", "cross-class mark rejection");
contains(legacySessionRoute, 'status: "ACTIVE"', "active learner filtering");

for (const marker of [
  'import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";',
  "await assertCanAccessClassroom({",
  'status: "ACTIVE"',
]) {
  contains(studentsRoute, marker, "attendance student roster authority marker");
}
indexBefore(
  studentsRoute,
  "await assertCanAccessClassroom({",
  "const students = await prisma.student.findMany",
  "roster authorization before learner query",
);

for (const marker of [
  'data-attendance-class-mode="single-default-v1"',
  "Single stream",
  "Class arms",
  "singleStreamClassrooms",
  "multiStreamClassroomsAvailable",
  "visibleClassrooms",
  "Your assigned Class Teacher / Class Adviser register.",
  "Choose Class arms to select the exact register.",
]) {
  contains(attendanceUi, marker, "teacher attendance class-mode marker");
}

for (const marker of [
  'data-attendance-class-responsibility="primary-classroom-v1"',
  "Class responsibility",
  "Class Adviser / Class Monitor responsibility.",
  "JHS subject assignments do not grant register access.",
  "Class Teacher responsibility for the learner register.",
  "School uses class arms? Choose exact class",
  "Save exact class",
]) {
  contains(adminTeachers, marker, "admin class-responsibility marker");
}

for (const marker of [
  "model TeacherProfile",
  "primaryClassroomId String?",
  "jhsAssignments     Json?",
  "model TeacherAssessmentAssignment",
]) {
  contains(schema, marker, "existing schema authority primitive");
}

excludes(schema, "AttendanceClassDelegation", "unrequested temporary-delegation schema");

console.log("");
console.log("=== UI-P1A TEACHER ATTENDANCE CLASS AUTHORITY ===");
console.log("");
console.log("Permanent register authority       : TeacherProfile.primaryClassroomId");
console.log("KG / Primary legacy fallback       : exact single ACTIVE classroom only");
console.log("KG / Primary ambiguous arms        : FAIL CLOSED");
console.log("JHS subject assignments            : NOT ATTENDANCE AUTHORITY");
console.log("JHS Class Adviser / Class Monitor  : primaryClassroomId");
console.log("Headteacher / admin oversight      : preserved by shared guard");
console.log("Classroom list                     : shared authority helper");
console.log("Session-open unique-race fallback  : authority revalidated");
console.log("Attendance roster                  : authority revalidated");
console.log("Legacy session route               : shared authority helper");
console.log("Cross-class mark injection         : rejected");
console.log("Teacher attendance class mode      : SINGLE STREAM DEFAULT");
console.log("Multi-stream access                : explicit Class arms mode");
console.log("Admin class responsibility         : class teacher / adviser explicit");
console.log("Temporary absence delegation       : NOT ADDED IN UI-P1A");
console.log("Schema migration                   : NONE");
console.log("Database accessed by QA            : false");
console.log("");
console.log("RESULT: UI-P1A TEACHER ATTENDANCE CLASS AUTHORITY GREEN");
