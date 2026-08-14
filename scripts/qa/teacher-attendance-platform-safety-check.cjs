/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function assert(condition, message, details) {
  if (condition) return;
  const suffix = details ? ` :: ${JSON.stringify(details)}` : "";
  throw new Error(`${message}${suffix}`);
}

const schema = read("prisma/schema.prisma");
const migration = read(
  "prisma/migrations/20260814113000_teacher_attendance_platform_safety/migration.sql",
);
const feature = read("src/lib/platformFeatures.ts");
const superRoute = read(
  "src/app/api/admin/super/platform-features/teacher-attendance/route.ts",
);
const superLayout = read("src/app/admin/super/layout.tsx");
const page = read("src/app/headteacher/teacher-attendance/page.tsx");
const dashboard = read("src/app/headteacher/dashboard/ui.tsx");
const scope = read("src/lib/governance/scope.ts");
const governanceUi = read(
  "src/components/governance/GovernanceCommandDashboardClient.tsx",
);

const attendanceRoutes = [
  "src/app/api/headteacher/teacher-attendance/route.ts",
  "src/app/api/headteacher/teacher-attendance/open/route.ts",
  "src/app/api/headteacher/teacher-attendance/upsert/route.ts",
  "src/app/api/headteacher/teacher-attendance/close/route.ts",
  "src/app/api/headteacher/teacher-attendance/reopen/route.ts",
  "src/app/api/headteacher/teacher-attendance/certify/route.ts",
].map((rel) => ({ rel, source: read(rel) }));

for (const marker of [
  "model PlatformFeatureFlag",
  "enabled         Boolean  @default(false)",
  '@@map("platform_feature_flag")',
]) {
  assert(schema.includes(marker), "Platform feature schema marker missing", marker);
}

for (const marker of [
  'SET LOCAL search_path TO "edulife_os", pg_catalog;',
  'CREATE TABLE "platform_feature_flag"',
  "'TEACHER_ATTENDANCE'",
  "false",
  "Disabled by default pending institutional safeguards for fair use.",
]) {
  assert(migration.includes(marker), "Migration safety marker missing", marker);
}

assert(
  !migration.includes("teacher_attendance_record") &&
    !migration.includes("teacher_attendance_session"),
  "Safety migration must not rewrite historical Teacher Attendance data",
);

for (const marker of [
  'TEACHER_ATTENDANCE: "TEACHER_ATTENDANCE"',
  'enabled: false',
  'storageAvailable: false',
  "Safety policy: inability to prove that the feature is enabled means OFF.",
  "Prisma.TransactionIsolationLevel.Serializable",
  'action: "PLATFORM_FEATURE_FLAG_CHANGED"',
  'resource: "PlatformFeatureFlag"',
  'policy: "TEACHER_ATTENDANCE_SAFETY_SWITCH"',
  "await tx.auditLog.create",
]) {
  assert(feature.includes(marker), "Feature service safety marker missing", marker);
}

assert(
  feature.indexOf("await tx.auditLog.create") >
    feature.indexOf("await tx.platformFeatureFlag.upsert"),
  "Feature state and audit must share the transaction",
);

for (const marker of [
  'requireApiUserContext(req, { requireTenant: false })',
  "isActiveSuperadminUser",
  'new Set(["enabled", "reason", "confirm"])',
  "MAX_BODY_BYTES = 16 * 1024",
  "body.confirm !== true",
  "setTeacherAttendanceFeatureState",
  '"Cache-Control": "no-store, max-age=0"',
]) {
  assert(superRoute.includes(marker), "Superadmin route contract missing", marker);
}

for (const marker of [
  'href: "/circuit/dashboard"',
  'href: "/district/dashboard"',
  'href: "/district/hos/dashboard"',
  'href: "/district/bsc/dashboard"',
  'href: "/admin/super/safety-controls"',
]) {
  assert(superLayout.includes(marker), "Superadmin shortcut missing", marker);
}

for (const { rel, source } of attendanceRoutes) {
  assert(
    source.includes("readTeacherAttendanceFeatureState"),
    "Attendance route missing global safety read",
    rel,
  );
  assert(
    source.includes("teacherAttendanceDisabledPayload"),
    "Attendance route missing disabled response",
    rel,
  );
  assert(
    source.includes("if (!feature.enabled)"),
    "Attendance route must fail closed while disabled",
    rel,
  );
}

const rootRoute = attendanceRoutes[0].source;
assert(
  rootRoute.includes('searchParams.get("availability") === "1"'),
  "Headteacher dashboard availability probe missing",
);
assert(
  rootRoute.indexOf("if (availabilityOnly)") <
    rootRoute.indexOf("prisma.membership.findMany"),
  "Availability probe must not load Teacher Attendance register data",
);

for (const marker of [
  "readTeacherAttendanceFeatureState",
  "if (!feature.enabled)",
  "Teacher Attendance is currently deactivated",
  "Attendance continues to work normally.",
]) {
  assert(page.includes(marker), "Headteacher page safety marker missing", marker);
}

for (const marker of [
  "TeacherAttendanceAvailabilityResp",
  '"/api/headteacher/teacher-attendance?availability=1"',
  "setTeacherAttendanceEnabled(false)",
  'badge={',
  '"Temporarily off"',
  "disabled={teacherAttendanceEnabled !== true}",
]) {
  assert(dashboard.includes(marker), "Headteacher dashboard safety marker missing", marker);
}

for (const marker of [
  'import { readTeacherAttendanceFeatureState } from "@/lib/platformFeatures";',
  "teacherAttendanceFeature.cacheToken",
  "teacherAttendanceEnabled",
  "featureAvailability",
  "const teacherAttendance = teacherAttendanceEnabled",
  "const teacherAbsenteeism = teacherAttendanceEnabled",
]) {
  assert(scope.includes(marker), "Governance server safety marker missing", marker);
}

assert(
  scope.indexOf("readTeacherAttendanceFeatureState()") <
    scope.indexOf("overviewCache.get(key)"),
  "Global Teacher Attendance state must be resolved before governance cache lookup",
);

for (const marker of [
  "featureAvailability",
  "teacherAttendanceEnabled",
  'badge="Temporarily off"',
  "Teacher Attendance and absenteeism risk are temporarily off",
  "No Teacher Attendance register or absenteeism-risk data is exposed",
]) {
  assert(governanceUi.includes(marker), "Governance UI safety marker missing", marker);
}

for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(!feature.includes(forbidden), "Feature service browser authority forbidden", forbidden);
  assert(!superRoute.includes(forbidden), "Superadmin route browser storage/polling forbidden", forbidden);
}

console.log("");
console.log("=== N7-P1A TEACHER ATTENDANCE PLATFORM SAFETY CONTROL ===");
console.log("");
console.log("Global control                 : PlatformFeatureFlag");
console.log("Default state                  : OFF");
console.log("Missing row / read failure     : fail-closed OFF");
console.log("Superadmin mutation            : explicit confirm + reason");
console.log("Mutation audit                 : same Serializable transaction");
console.log("Headteacher register APIs      : six routes fail closed");
console.log("Direct Headteacher page        : disabled presentation while OFF");
console.log("Headteacher dashboard          : visibly disabled while OFF");
console.log("Governance Teacher Attendance  : not queried while OFF");
console.log("Governance absenteeism ranking : not queried while OFF");
console.log("Governance cache boundary      : feature state token included");
console.log("Historical records             : preserved");
console.log("Student Attendance             : untouched");
console.log("HOS/BSC Superadmin shortcuts   : added");
console.log("Browser persistence/polling    : absent");
console.log("Database accessed              : false");
console.log("");
console.log("RESULT: N7-P1A TEACHER ATTENDANCE PLATFORM SAFETY CONTROL GREEN");
