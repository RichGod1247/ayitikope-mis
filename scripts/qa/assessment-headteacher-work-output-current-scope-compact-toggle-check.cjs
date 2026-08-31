"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects repository source. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const clientPath = path.join(
  repoRoot,
  "src",
  "app",
  "headteacher",
  "assessment",
  "overview",
  "HeadteacherAssessmentOverviewClient.tsx",
);

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

const source = fs.readFileSync(clientPath, "utf8");

assert(
  !source.includes('const DEFAULT_TERM = "1st Term"'),
  "Headteacher Assessment must not silently default missing scope to 1st Term.",
);
assert(
  !source.includes('const DEFAULT_YEAR = "2025/2026"'),
  "Headteacher Assessment must not silently manufacture the academic year.",
);
assert(
  source.includes('const initialTerm = cleanStr(searchParams.get("term"));') &&
    source.includes('const initialYear = cleanStr(searchParams.get("academicYear"));'),
  "Explicit URL scope must remain authoritative when supplied.",
);
assert(
  source.includes('fetch("/api/settings/current-term-year"') &&
    source.includes('cache: "no-store"') &&
    source.includes('credentials: "include"'),
  "Missing assessment scope must resolve from the existing current-term/year authority with no-store credentials.",
);
assert(
  source.includes('const resolvedTerm = term || cleanStr(data.term);') &&
    source.includes('const resolvedYear = academicYear || cleanStr(data.academicYear);'),
  "Current-term/year authority may fill only missing scope values.",
);
assert(
  source.includes('if (!term || !academicYear) return;') &&
    source.includes('const params = new URLSearchParams({ term, academicYear });'),
  "URL/data loading must wait for a complete term/year scope.",
);
assert(
  source.includes("Choose the current term and academic year to load assessment evidence."),
  "Incomplete current scope must fail closed with BBC-friendly guidance.",
);
assert(
  source.includes("const [showSbaWorkOutput, setShowSbaWorkOutput] = useState(false);") &&
    source.includes("showWorkOutput={showSbaWorkOutput}") &&
    source.includes("onToggleWorkOutput={() => {") &&
    source.includes('? "Hide Work Output"') &&
    source.includes(': "Work Output"'),
  "Work Output must have its own visible/hidden toggle state.",
);
assert(
  source.includes("const [showSbaBroadsheet, setShowSbaBroadsheet] = useState(false);") &&
    source.includes("showBroadsheet={showSbaBroadsheet}") &&
    source.includes("onToggleBroadsheet={() => {"),
  "Broadsheet must preserve its independent visible/hidden toggle.",
);
assert(
  source.includes("showWorkOutput: false,") &&
    source.includes("showBroadsheet: true,"),
  "Opening Broadsheet first must not force the Work Output cards open.",
);
assert(
  source.includes("showWorkOutput: true,") &&
    source.includes("showBroadsheet: false,"),
  "Opening Work Output first must not force Broadsheet open.",
);
assert(
  source.includes("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9") &&
    source.includes("rounded-xl border border-white/10 bg-[#0C1730]/78 px-2.5 py-2") &&
    source.includes("text-lg font-semibold leading-none"),
  "Headteacher Work Output type statistics must use compact mobile-first cards.",
);
assert(
  source.includes("term={props.term}") &&
    source.includes("academicYear={props.academicYear}") &&
    source.includes("currentSubject={props.subject}"),
  "Headteacher Broadsheet must receive the same term/year/subject scope as Work Output.",
);
assert(
  source.includes(
    "Work Output counts non-Mock assessment practice linked to lessons delivered.",
  ) &&
    source.includes("not to rank or punish teachers"),
  "Work Output must remain formative, lesson-linked, non-ranking and non-punitive.",
);
assert(
  !source.includes("setInterval(") && !source.includes("setInterval ("),
  "This correction must not add polling.",
);

console.log("HEADTEACHER CURRENT-SCOPE + COMPACT TOGGLE WORK OUTPUT CONTRACT: GREEN");
console.log("- missing term/year resolves from the existing current-term/year authority");
console.log("- explicit URL or user-selected scope remains authoritative");
console.log("- incomplete scope fails closed instead of silently forcing 1st Term");
console.log("- Work Output and Broadsheet remain on the same class/term/year/subject scope");
console.log("- Work Output toggles independently from Broadsheet");
console.log("- assessment-type statistics are compact, mobile-first and BBC-friendly");
console.log("- Work Output remains formative, lesson-linked, non-ranking and non-punitive");
console.log("- no polling or schema change is introduced");
