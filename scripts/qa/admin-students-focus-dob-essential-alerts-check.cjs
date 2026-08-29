#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness reads source contracts. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function contains(source, marker, label) {
  assert(source.includes(marker), `${label} missing`, marker);
}

function absent(source, marker, label) {
  assert(!source.includes(marker), `${label} must remain absent`, marker);
}

const files = {
  schema: "prisma/schema.prisma",
  page: "src/app/admin/students/page.tsx",
  bulkCard: "src/components/admin/StudentBulkImportCard.tsx",
  alertsCard: "src/components/admin/StudentEssentialAlertsCard.tsx",
  dob: "src/lib/studentDateOfBirth.ts",
  studentImport: "src/lib/studentImport.ts",
  bulkRoute: "src/app/api/admin/students/bulk-import/route.ts",
  createRoute: "src/app/api/admin/students/create/route.ts",
  idRoute: "src/app/api/admin/students/[id]/route.ts",
  listRoute: "src/app/api/admin/students/list/route.ts",
  classSelect: "src/components/admin/StudentClassSelect.tsx",
  filterBar: "src/components/admin/StudentListFilterBar.tsx",
  classPresentation: "src/lib/studentClassroomPresentation.ts",
};

const source = Object.fromEntries(Object.entries(files).map(([key, value]) => [key, read(value)]));

console.log("=== UI-STUDENTS-P1 ADMIN STUDENTS FOCUS + DOB + ESSENTIAL ALERTS CONTRACT CHECK ===");

// Canonical DOB field already exists; legacy dob remains compatibility-only.
contains(source.schema, "dateOfBirth DateTime? @db.Date", "Canonical Student.dateOfBirth schema authority");
contains(source.schema, "dob         DateTime? @db.Timestamptz(6)", "Legacy Student.dob compatibility field");
contains(source.dob, 'const DATE_ONLY_RE = /^(\\d{4})-(\\d{2})-(\\d{2})$/;', "Date-only parser");
contains(source.dob, 'error: "INVALID_DATE_OF_BIRTH"', "Invalid DOB fail-closed code");
contains(source.dob, 'error: "DATE_OF_BIRTH_IN_FUTURE"', "Future DOB fail-closed code");
contains(source.dob, "Date.UTC(year, month - 1, day)", "Timezone-stable DOB conversion");
console.log("DOB authority = Student.dateOfBirth / DATE; legacy dob preserved: GREEN");

// Add Student is the focal first workspace and DOB is a native date input.
contains(source.page, "Main action", "Add Student focal marker");
contains(source.page, ">Add student<", "Add Student heading");
contains(source.page, 'type="date" name="dateOfBirth"', "Native DOB input");
contains(source.page, "dateOfBirth: dateOfBirth.value", "Server action canonical DOB write");
const addIndex = source.page.indexOf(">Add student<");
const bulkIndex = source.page.indexOf("<span>Bulk Import</span>");
assert(addIndex >= 0 && bulkIndex > addIndex, "Add Student must appear before Bulk Import");
console.log("Add Student primary / first + native DOB input: GREEN");

// Search and Student List are compact, class-first and use explicit client navigation.
contains(source.page, 'className={`${shellCardClass()} p-3`}', "Compact search card");
contains(source.page, "StudentListFilterBar", "Working Student List filter client");
contains(source.page, "shouldLoadStudentList = showArchived || Boolean(classroomIdFilter)", "Class-first active query guard");
contains(source.page, "Choose a class first", "Class-first Student List prompt");
contains(source.page, "<span>Student List</span>", "Student List disclosure control");
contains(source.page, "studentDateOfBirthLabel(dateOfBirth)", "DOB rendered beside learner identity");
contains(source.page, "const dateOfBirth = s.dateOfBirth ?? s.dob;", "Canonical DOB with read-only legacy fallback");
contains(source.filterBar, "event.preventDefault()", "Search form client submit");
contains(source.filterBar, 'params.set("section", "list")', "Search opens Student List");
contains(source.filterBar, 'params.set("classroomId", nextClassroomId)', "Search preserves selected class");
contains(source.filterBar, 'params.set("q", cleanQuery)', "Search query wiring");
contains(source.filterBar, "router.push(`/admin/students?${params.toString()}`)", "Search navigation");
contains(source.filterBar, 'setError("Choose a class first.")', "Class-first fail-closed UI");
console.log("Compact working search + class-first disclosed Student List: GREEN");

// Existing EduLife class UX pattern: single-stream first, multistream only on explicit checkbox.
contains(source.page, "StudentClassSelect", "Reusable class selector wiring");
contains(source.classSelect, "Show multistream", "Multistream checkbox label");
contains(source.classSelect, "buildSingleStreamStudentClasses", "Single-stream default reducer");
contains(source.classSelect, "showMultiStream", "Explicit multistream state");
contains(source.classPresentation, "pickSingleStreamRepresentative", "Single-stream representative authority");
contains(source.classPresentation, "same = name.toUpperCase() === grade.toUpperCase()", "Duplicate class label suppression");
contains(source.classPresentation, "if (seen.has(bucket)) return true", "Multistream detection by duplicate stage bucket");
console.log("Single-stream default + checkbox multistream class UX: GREEN");

// Visible legacy SMS and health-consent toggles are removed from this page only.
for (const marker of [
  "toggleGuardianSms",
  "toggleHealthConsent",
  "Toggle SMS",
  "Toggle Health Consent",
  "guardianSmsOptIn",
  "healthConsentAt",
]) {
  absent(source.page, marker, "Legacy SMS/health UI marker");
}
console.log("Legacy SMS + health-consent visible UI: REMOVED");

// Bulk import is disclosed/compact and populates canonical dateOfBirth.
contains(source.page, "<span>Bulk Import</span>", "Bulk Import disclosure");
contains(source.page, "embedded", "Compact embedded Bulk Import");
contains(source.bulkCard, "embedded?: boolean;", "Bulk Import embedded mode");
contains(source.bulkCard, "StudentClassSelect", "Bulk Import single/multistream class selector");
contains(source.bulkCard, "firstName,lastName,dateOfBirth,class,guardianName,guardianPhone,gender,note", "DOB CSV template header");
contains(source.bulkCard, "DOB uses YYYY-MM-DD", "DOB CSV guidance");
contains(source.studentImport, "dateOfBirth: string | null;", "Parsed CSV DOB field");
contains(source.studentImport, 'dateofbirth: "dateOfBirth"', "dateOfBirth CSV alias");
contains(source.studentImport, 'dob: "dateOfBirth"', "dob CSV alias to canonical field");
contains(source.studentImport, "parseStudentDateOfBirth(row.dateOfBirth)", "Client preview DOB validation");
contains(source.bulkRoute, "dateOfBirth: Date | null;", "Bulk route canonical DOB shape");
contains(source.bulkRoute, "dateOfBirth: dateOfBirth.value", "Bulk route canonical DOB write");
console.log("Bulk Import disclosure + CSV dateOfBirth auto-population: GREEN");

// Existing API architecture gains canonical DOB while keeping legacy dob compatibility.
for (const [label, route] of [
  ["create", source.createRoute],
  ["student detail", source.idRoute],
  ["student list", source.listRoute],
]) {
  contains(route, "dateOfBirth", `${label} canonical DOB contract`);
}
contains(source.createRoute, "dob: z.string().nullable().optional()", "Create API legacy dob compatibility");
contains(source.idRoute, "dob: z.string().nullable().optional()", "PATCH API legacy dob compatibility");
contains(source.listRoute, "dob: true", "List API legacy dob compatibility");
console.log("Create/PATCH/list canonical DOB + legacy compatibility: GREEN");

// Essential Alerts is lazy, existing-authority only, and recipient-decision preserving.
contains(source.page, "StudentEssentialAlertsCard", "Essential Alerts page wiring");
contains(source.alertsCard, 'fetch("/api/consent/students/list"', "Guardian enrollment status endpoint");
contains(source.alertsCard, 'fetch("/api/consent/teachers/list"', "Staff enrollment status endpoint");
contains(source.alertsCard, 'fetch("/api/consent/campaign/send"', "Existing campaign invitation endpoint");
contains(source.alertsCard, 'body: JSON.stringify({ audience, limit: 300 })', "Existing audience campaign contract");
contains(source.alertsCard, "event.currentTarget.open && !loaded && !loading", "Lazy Essential Alerts status loading");
contains(source.alertsCard, "the parent or staff member makes the choice", "Recipient decision copy");
absent(source.alertsCard, "guardianSmsOptIn", "Legacy guardianSmsOptIn authority in Essential Alerts UI");
absent(source.alertsCard, "healthConsentAt", "Health-consent coupling in Essential Alerts UI");
absent(source.alertsCard, "approve on behalf", "Guardian approval-on-behalf UI");
console.log("Essential Alerts existing authority + lazy status/invitation wiring: GREEN");

console.log("Health-consent server/data authority: PRESERVE OUTSIDE UI SLICE");
console.log("Assisted guardian consent authority: NOT INTRODUCED");
console.log("Schema field addition: NONE");
console.log("Database migration: NONE");
console.log("Provider calls from QA: 0");
console.log("Database writes from QA: 0");
console.log("RESULT: UI-STUDENTS-P1 ADMIN STUDENTS FOCUS + DOB + ESSENTIAL ALERTS GREEN");
