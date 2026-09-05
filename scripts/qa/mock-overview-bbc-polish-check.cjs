"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects repository source. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function block(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  assert(start >= 0, "START_MARKER_MISSING", startMarker);
  const end = text.indexOf(endMarker, start);
  assert(end > start, "END_MARKER_MISSING", { startMarker, endMarker });
  return text.slice(start, end);
}

function assertBefore(text, first, second, label) {
  const a = text.indexOf(first);
  const b = text.indexOf(second);
  assert(a >= 0, `${label}_FIRST_MISSING`, first);
  assert(b >= 0, `${label}_SECOND_MISSING`, second);
  assert(a < b, `${label}_ORDER_INVALID`, { first, second, a, b });
}

const headteacher = read(
  "src/components/headteacher/HeadteacherMockOverviewClient.tsx",
);
const teacher = read("src/components/teacher/MockAssessmentClient.tsx");
const learnerProfile = read("src/app/headteacher/student/[studentId]/page.tsx");
const pdf = read("src/app/api/headteacher/assessment/mock/export/pdf/route.ts");
const xlsx = read("src/app/api/headteacher/assessment/mock/export/xlsx/route.ts");
const mockExport = read("src/lib/assessments/mockExport.ts");
const parentPdf = read(
  "src/app/api/parent/assessment/mock/readiness/pdf/route.ts",
);

for (const marker of [
  'dataUi="primary-broadsheet-v1"',
  'data-mock-bbc-guide="v1"',
  'data-mock-summary-metrics="compact-v1"',
  'data-mock-metric="compact-v1"',
  'data-mock-rescue-stats="compact-v1"',
  'data-mock-rescue-list="compact-v1"',
]) {
  assert(headteacher.includes(marker), "MOCK_BBC_MARKER_MISSING", marker);
}

assertBefore(
  headteacher,
  'dataUi="primary-broadsheet-v1"',
  'data-mock-summary-metrics="compact-v1"',
  "BROADSHEET_MUST_PRECEDE_SUMMARY_METRICS",
);
assertBefore(
  headteacher,
  'dataUi="primary-broadsheet-v1"',
  'dataUi="trend-intelligence-v1"',
  "BROADSHEET_PRIMARY_SURFACE",
);
assertBefore(
  headteacher,
  'dataUi="candidate-rescue-v1"',
  'dataUi="trend-intelligence-v1"',
  "CANDIDATE_RESCUE_MUST_PRECEDE_TREND",
);

const disclosureHelper = block(
  headteacher,
  "function DisclosureCard(props:",
  "function isSealedMockStatus",
);
assert(disclosureHelper.includes("<details"), "DISCLOSURE_MUST_USE_NATIVE_DETAILS");
assert(
  !disclosureHelper.includes(" open=") && !disclosureHelper.includes("open={"),
  "DISCLOSURES_MUST_BE_CLOSED_BY_DEFAULT",
);
assert(
  disclosureHelper.includes("group-open:hidden") &&
    disclosureHelper.includes("group-open:inline") &&
    disclosureHelper.includes(">Open<") &&
    disclosureHelper.includes(">Hide<"),
  "DISCLOSURE_OPEN_HIDE_GUIDANCE_MISSING",
);

for (const marker of [
  'dataUi="trend-intelligence-v1"',
  'dataUi="mock-evidence-seal-v1"',
  'dataUi="parent-mock-release-v1"',
  'dataUi="parent-sms-v1"',
  'dataUi="evidence-command-map-v1"',
  'dataUi="candidate-rescue-v1"',
  'dataUi="subject-readiness-v1"',
  'dataUi="leadership-focus-v1"',
]) {
  assert(headteacher.includes(marker), "EXPECTED_COLLAPSED_SECTION_MISSING", marker);
}

assert(
  headteacher.includes(
    'className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"',
  ),
  "HEADLINE_AND_SECONDARY_METRICS_MUST_BE_MOBILE_COMPACT",
);
assert(
  headteacher.includes('className={softPanel + " min-w-0 px-3 py-2.5"}') &&
    headteacher.includes("text-lg font-semibold leading-none"),
  "METRIC_CARD_COMPACT_STYLE_MISSING",
);

const broadsheetBlock = block(
  headteacher,
  'dataUi="primary-broadsheet-v1"',
  'data-mock-bbc-guide="v1"',
);
assert(
  !broadsheetBlock.includes("School agg.") &&
    !broadsheetBlock.includes("student.schoolAggregate.aggregate"),
  "HEADTEACHER_BROADSHEET_MUST_NOT_RENDER_SCHOOL_AGGREGATE",
);
assert(
  broadsheetBlock.includes("Placement agg.") &&
    broadsheetBlock.includes("student.placementAggregate.aggregate"),
  "HEADTEACHER_BROADSHEET_MUST_KEEP_PLACEMENT_AGGREGATE",
);

const rescueBlock = block(
  headteacher,
  'dataUi="candidate-rescue-v1"',
  'dataUi="subject-readiness-v1"',
);
for (const forbidden of [
  "profile.averageScore",
  "profile.schoolAggregate",
  "profile.placementAggregate",
  "profile.reason",
  "profile.nextAction",
  "profile.missingSubjects",
  "profile.weakSubjects",
  "profile.strongSubjects",
  "profile.nearGradeOpportunities",
]) {
  assert(
    !rescueBlock.includes(forbidden),
    "CANDIDATE_RESCUE_DETAIL_MUST_DEFER_TO_LEARNER_PROFILE",
    forbidden,
  );
}
assert(
  rescueBlock.includes("{profile.name}") &&
    rescueBlock.includes("{profile.priorityLabel}") &&
    rescueBlock.includes("Open learner profile"),
  "CANDIDATE_RESCUE_COMPACT_ACTION_ROW_INCOMPLETE",
);

for (const section of [
  ["Mock evidence seal", "finalizeMockSession"],
  ["Parent Mock release", "releaseMockToParents"],
  ["Parent SMS notification", "queueMockReleaseSms"],
]) {
  const start = headteacher.indexOf(`title="${section[0]}"`);
  const end = headteacher.indexOf("</DisclosureCard>", start);
  assert(start >= 0 && end > start, "OPERATION_DISCLOSURE_MISSING", section[0]);
  const source = headteacher.slice(start, end);
  assert(
    source.includes(section[1]),
    "OPERATION_ACTION_MUST_REMAIN_INSIDE_DISCLOSURE",
    section,
  );
}

assert(
  learnerProfile.includes('data-mock-rescue-profile-stats="compact-v1"') &&
    learnerProfile.includes('className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"') &&
    learnerProfile.includes("col-span-2 min-w-0 px-3 py-2.5 sm:col-span-1"),
  "LEARNER_RESCUE_PROFILE_STATS_MUST_BE_MOBILE_COMPACT",
);

assert(
  !teacher.includes('label="Students"') &&
    !teacher.includes('label="Subjects"') &&
    !teacher.includes('label="Completion"') &&
    !teacher.includes("broadsheet.subjectSummaries.map((summary) =>"),
  "TEACHER_MOCK_SNAPSHOT_DUPLICATE_SUMMARY_CARDS_MUST_BE_REMOVED",
);
assert(
  teacher.includes('data-teacher-mock-learner-snapshot="subject-labelled-v1"') &&
    teacher.includes(">Your subject score(s)<") &&
    teacher.includes("subjectScore.subject") &&
    teacher.includes("subjectScore.score"),
  "TEACHER_MOCK_LEARNER_ROWS_MUST_LABEL_ASSIGNED_SUBJECT_SCORES",
);

assert(
  !teacher.includes("student.schoolAggregate.aggregate") &&
    !teacher.includes(">School agg.<"),
  "TEACHER_MOCK_BROADSHEET_MUST_NOT_RENDER_SCHOOL_AGGREGATE",
);
assert(
  teacher.includes("student.placementAggregate.aggregate") &&
    teacher.includes(">Placement agg.<"),
  "TEACHER_MOCK_BROADSHEET_MUST_KEEP_PLACEMENT_AGGREGATE",
);

assert(
  !pdf.includes('key: "schoolAgg"') &&
    !pdf.includes("args.row.schoolAggregate.aggregate") &&
    !pdf.includes('label: "SCHOOL\\nAGG"'),
  "HEADTEACHER_PDF_MUST_NOT_RENDER_SCHOOL_AGGREGATE",
);
assert(
  pdf.includes('key: "placementAgg"') &&
    pdf.includes("args.row.placementAggregate.aggregate"),
  "HEADTEACHER_PDF_MUST_KEEP_PLACEMENT_AGGREGATE",
);

assert(
  !xlsx.includes('headers.push("SCHOOL\\nAGG")') &&
    !xlsx.includes("student.schoolAggregate.aggregate") &&
    !xlsx.includes("schoolAggCol"),
  "HEADTEACHER_XLSX_MUST_NOT_RENDER_SCHOOL_AGGREGATE",
);
assert(
  xlsx.includes('headers.push("PLACEMENT\\nAGG")') &&
    xlsx.includes("return 2 + subjects.length * 2 + 2;") &&
    xlsx.includes("student.placementAggregate.aggregate"),
  "HEADTEACHER_XLSX_PLACEMENT_AGGREGATE_CONTRACT_DRIFT",
);

assert(
  mockExport.includes("schoolAggregate") &&
    mockExport.includes("buildHeadteacherMockExportData"),
  "SHARED_MOCK_EXPORT_TRUTH_MUST_REMAIN_PRESENT_FOR_LATER_CLEANUP",
);
assert(
  parentPdf.includes('from "@/lib/assessments/mockExport"') &&
    parentPdf.includes("buildHeadteacherMockExportData"),
  "PARENT_MOCK_READINESS_SHARED_EXPORT_DEPENDENCY_MUST_REMAIN_PROTECTED",
);

for (const endpoint of [
  "/api/headteacher/assessment/mock/overview",
  "/api/headteacher/assessment/mock/finalize",
  "/api/headteacher/assessment/mock/release",
  "/api/headteacher/assessment/mock/release/notify",
  "/api/headteacher/assessment/mock/interventions",
  "/api/headteacher/assessment/mock/reminders/send",
]) {
  assert(
    headteacher.includes(endpoint),
    "HEADTEACHER_MOCK_OPERATION_ENDPOINT_DRIFT",
    endpoint,
  );
}

assert(
  !headteacher.includes("setInterval(") && !teacher.includes("setInterval("),
  "MOCK_POLISH_MUST_NOT_ADD_POLLING",
);

console.log("MOCK OVERVIEW BBC + MOBILE POLISH CONTRACT: GREEN");
console.log("- learner readiness broadsheet is the primary always-open surface");
console.log("- headline and secondary metrics are compact/mobile-first");
console.log("- candidate rescue appears before trend intelligence; both remain progressively disclosed");
console.log("- candidate rescue rows defer detail to the learner profile; learner rescue stats are mobile-compact");
console.log("- teacher snapshot removes duplicate summary/subject cards and labels each authorized subject score in learner rows");
console.log("- School Aggregate is removed only from requested headteacher/teacher/export presentation surfaces");
console.log("- Placement Aggregate remains visible");
console.log("- shared mockExport + parent readiness dependency remain protected for the later cleanup slice");
console.log("- existing Mock operation endpoints remain wired and no polling is introduced");
