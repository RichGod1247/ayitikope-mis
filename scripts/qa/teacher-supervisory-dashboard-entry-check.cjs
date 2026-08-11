#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const dashboardPath =
  "src/components/governance/GovernanceCommandDashboardClient.tsx";

function fail(message, detail) {
  const suffix =
    detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

const source = fs
  .readFileSync(path.join(repoRoot, dashboardPath), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");

for (const marker of [
  'activePanel === "appraisals" && (isDistrictView || isCircuitView)',
  "Teacher Appraisal",
  'href="/governance/appraisals/teacher-supervisory"',
  'onClick={() => openPanel("teacher-appraisal")}',
  "Open reports",
  '"teacher-appraisal-headteacher"',
  "Teacher Appraisal Reports",
  "Choose the report source",
  "Headteacher → Teacher reports",
  "Governance Teacher reports",
  "Reports from SISSO, BSC, HOS and District Director governance assessments.",
  'href="/governance/appraisals/teacher-supervisory/review"',
  'activePanel === "teacher-appraisal-headteacher" && isDistrictView',
  "← Report sources",
  "GovernanceAppraisalDrilldownPanel",
]) {
  assert(
    source.includes(marker),
    "Governance Teacher appraisal dual-report doorway marker missing",
    marker,
  );
}

const teacherCardStart = source.indexOf("Teacher Appraisal");
const headteacherCardStart = source.indexOf(
  "Headteacher Appraisal",
  teacherCardStart,
);
assert(
  teacherCardStart >= 0 && headteacherCardStart > teacherCardStart,
  "Teacher appraisal card boundary missing",
);
const teacherCard = source.slice(teacherCardStart, headteacherCardStart);

assert(
  teacherCard.includes('onClick={() => openPanel("teacher-appraisal")}'),
  "Teacher Open reports must open the report-source chooser before entering either report stream",
);
assert(
  !teacherCard.includes('href="/governance/appraisals/teacher-supervisory/review"'),
  "District Teacher card must not bypass the report-source chooser",
);
assert(
  !teacherCard.includes('href="/district/headteacher-appraisals/review"'),
  "Teacher report doorway must not be confused with Headteacher-governance appraisal review",
);

const chooserStart = source.indexOf(
  'activePanel === "teacher-appraisal" ?',
);
const headteacherReportPanelStart = source.indexOf(
  'activePanel === "teacher-appraisal-headteacher" && isDistrictView',
  chooserStart,
);
assert(
  chooserStart >= 0 && headteacherReportPanelStart > chooserStart,
  "District Teacher report-source chooser boundary missing",
);
const chooser = source.slice(chooserStart, headteacherReportPanelStart);

for (const chooserMarker of [
  "Choose the report source",
  "Headteacher → Teacher reports",
  'onClick={() => openPanel("teacher-appraisal-headteacher")}',
  "Governance Teacher reports",
  'href="/governance/appraisals/teacher-supervisory/review"',
]) {
  assert(
    chooser.includes(chooserMarker),
    "District Teacher report-source chooser branch missing",
    chooserMarker,
  );
}

const headteacherReportPanel = source.slice(headteacherReportPanelStart);
assert(
  headteacherReportPanel.includes("GovernanceAppraisalDrilldownPanel") &&
    headteacherReportPanel.includes('onClick={() => openPanel("teacher-appraisal")}'),
  "Headteacher-to-Teacher district report branch must preserve the existing drilldown and provide a route back to report sources",
);

assert(
  source.includes(
    'isDistrictView ? (\n    <section className="rounded-[28px] border border-emerald-300/20',
  ) &&
    source.includes(
      '<GovernanceAppraisalDrilldownPanel\n      isDistrictView={isDistrictView}\n      isCircuitView={isCircuitView}',
    ),
  "Circuit Teacher Open reports must preserve the existing drilldown instead of receiving the district-only source chooser",
);

for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(
    !source.includes(forbidden),
    "Dashboard report-source chooser contains forbidden persistence/polling marker",
    forbidden,
  );
}

console.log("");
console.log("=== N6-F1C5L DUAL TEACHER REPORT DOORWAY ===");
console.log("");
console.log("District Teacher Open reports    : source chooser first");
console.log("Headteacher -> Teacher reports   : existing district drilldown preserved");
console.log("Governance Teacher reports       : governance review/release workspace");
console.log("Governance origins               : SISSO / BSC / HOS / District Director");
console.log("Circuit Teacher Open reports     : existing circuit drilldown preserved");
console.log("Headteacher governance review    : separate existing doorway");
console.log("Database writes                  : absent");
console.log("Background polling/storage       : absent");
console.log("");
console.log("RESULT: N6-F1C5L DUAL TEACHER REPORT DOORWAY GREEN");
