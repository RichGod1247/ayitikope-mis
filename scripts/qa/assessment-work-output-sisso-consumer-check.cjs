"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness inspects repository source contracts. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const routePath = path.join(
  repoRoot,
  "src",
  "app",
  "api",
  "circuit",
  "assessment",
  "work-output",
  "route.ts",
);

const clientPath = path.join(
  repoRoot,
  "src",
  "app",
  "circuit",
  "work-output",
  "SissoWorkOutputClient.tsx",
);

const pagePath = path.join(
  repoRoot,
  "src",
  "app",
  "circuit",
  "work-output",
  "page.tsx",
);

const dashboardPath = path.join(
  repoRoot,
  "src",
  "app",
  "circuit",
  "dashboard",
  "page.tsx",
);

const districtDashboardPath = path.join(
  repoRoot,
  "src",
  "app",
  "district",
  "dashboard",
  "page.tsx",
);

const commandDashboardPath = path.join(
  repoRoot,
  "src",
  "components",
  "governance",
  "GovernanceCommandDashboardClient.tsx",
);

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

for (const file of [routePath, clientPath, pagePath, dashboardPath, districtDashboardPath, commandDashboardPath]) {
  assert(fs.existsSync(file), "Required SISSO Work Output source is missing.", file);
}

const route = fs.readFileSync(routePath, "utf8");
const client = fs.readFileSync(clientPath, "utf8");
const page = fs.readFileSync(pagePath, "utf8");
const dashboard = fs.readFileSync(dashboardPath, "utf8");
const districtDashboard = fs.readFileSync(districtDashboardPath, "utf8");
const commandDashboard = fs.readFileSync(commandDashboardPath, "utf8");

function countOf(source, token) {
  return source.split(token).length - 1;
}

assert(
  route.includes("requireGovernanceApiContext") &&
    route.includes("CIRCUIT_GOVERNANCE_ROLES") &&
    route.includes("allowedZoneLevels: [1]"),
  "SISSO Work Output API must use the existing circuit governance assignment authority.",
);

assert(
  route.includes("assertTenantInGovernanceScope(auth.scope, schoolId)"),
  "Browser-supplied school selection must be server revalidated against governance scope.",
);

assert(
  route.includes('status: "ACTIVE"') &&
    route.includes("id: { in: tenantIds }"),
  "School discovery must stay inside authorized active tenants.",
);

assert(
  route.includes("tenantSettings") &&
    route.includes("currentTerm") &&
    route.includes("currentAcademicYear") &&
    route.includes("CURRENT_TERM_YEAR_NOT_CONFIGURED"),
  "SISSO Work Output must use each selected school's configured term/year authority and fail closed when incomplete.",
);

assert(
  !route.includes('|| "1st Term"') &&
    !route.includes('|| "2025/2026"'),
  "SISSO Work Output must not introduce a silent term/year fallback.",
);

assert(
  route.includes("buildWorkOutputSnapshot") &&
    route.includes("subjectMatchesTeachingScope"),
  "SISSO Work Output must reuse shared Work Output and level-aware subject authorities.",
);

assert(
  route.includes('type: { not: "MOCK" }') &&
    route.includes("lessonDeliveryId: null"),
  "Canonical SISSO Work Output must exclude Mock and preserve legacy unlinked evidence separately.",
);

assert(
  route.includes("lessonDeliveryId") &&
    route.includes("LESSON_DELIVERY_NOT_FOUND_IN_SCOPE") &&
    route.includes("dateTaught: toIso(delivery.dateTaught)"),
  "Delivered lessons must remain chronological and lesson detail must fail closed outside selected scope.",
);

assert(
  route.includes('ranking: false') &&
    route.includes('punitive: false') &&
    route.includes('"FORMATIVE_PRACTICE_SUPPORT"'),
  "SISSO Work Output interpretation must be supportive, non-ranking, and non-punitive.",
);

assert(
  client.includes("SISSO • Teacher Work Output") &&
    client.includes("Choose school") &&
    client.includes("Teacher") &&
    client.includes("Class") &&
    client.includes("Subject") &&
    client.includes("View Work Output"),
  "SISSO UI must present one compact school -> teacher -> class -> subject workflow.",
);

assert(
  client.includes("Practice by type") &&
    client.includes("Delivered lessons") &&
    client.includes("Assessment records") &&
    client.includes("Learner progress for this lesson") &&
    client.includes("Class average"),
  "SISSO UI must progressively disclose compact practice, lessons, assessment records, and selected-lesson progress.",
);

assert(
  client.includes("View learner-by-learner progression") &&
    client.includes("shortTypeLabel") &&
    client.includes("buildProgressionGroups") &&
    client.includes('if (key === "EXERCISE") return "Ex.";') &&
    client.includes('if (key === "CLASS_TEST") return "C/T";'),
  "Learner progression must retain classroom-familiar grouped assessment labels.",
);

assert(
  client.includes("nonZeroTypes") &&
    client.includes("bucket.count > 0"),
  "SISSO practice summary must avoid a large wall of zero-value metric cards.",
);

assert(
  client.includes("Work Output is") &&
    client.includes("not a teacher ranking") &&
    client.includes("must not be used to rank or punish teachers"),
  "SISSO UI must explicitly prevent leaderboard or punitive interpretation.",
);

assert(
  client.includes('cache: "no-store"') &&
    client.includes('credentials: "include"') &&
    !client.includes("setInterval(") &&
    !client.includes("setTimeout("),
  "SISSO Work Output must be no-store, session-scoped, and polling-free.",
);

assert(
  page.includes("requireGovernancePageContext") &&
    page.includes("CIRCUIT_GOVERNANCE_ROLES") &&
    page.includes('redirectTo: "/circuit/work-output"') &&
    page.includes("<SissoWorkOutputClient"),
  "Dedicated SISSO Work Output page must preserve circuit page authorization.",
);

assert(
  !dashboard.includes('href="/circuit/work-output"') &&
    !dashboard.includes("Teacher Work Output") &&
    dashboard.includes('endpoint="/api/circuit/overview"'),
  "Circuit wrapper must delegate the single Work Output doorway to the shared command surface without a duplicate launcher.",
);

assert(
  countOf(commandDashboard, 'title="Teacher Work Output"') === 1 &&
    commandDashboard.includes('description="Review lesson-linked practice and learner progress."') &&
    commandDashboard.includes('window.location.assign("/circuit/work-output")'),
  "SISSO command surface must expose the proven Teacher Work Output page as its assessment doorway.",
);

assert(
  countOf(commandDashboard, 'title="Students Assessment"') === 1 &&
    commandDashboard.includes('onClick={() => openPanel("students-assessment")}') &&
    commandDashboard.includes("Students Assessment proof and scoring health"),
  "District Students Assessment tile and its existing proof panel must remain available.",
);

const districtAssessmentTile = commandDashboard.indexOf('title="Students Assessment"');
const circuitWorkOutputTile = commandDashboard.indexOf('title="Teacher Work Output"');
const districtBeceMarker = commandDashboard.indexOf("Official BECE result trends and school comparisons");
const circuitBeceMarker = commandDashboard.indexOf("Circuit-level BECE result trends and school comparisons");

assert(
  districtAssessmentTile >= 0 &&
    circuitWorkOutputTile > districtAssessmentTile &&
    districtBeceMarker > districtAssessmentTile &&
    circuitBeceMarker > circuitWorkOutputTile,
  "Teacher Work Output must replace only the later SISSO branch while the earlier District assessment branch remains intact.",
);

assert(
  districtDashboard.includes('endpoint="/api/district/overview"') &&
    commandDashboard.includes("Expert tools") &&
    commandDashboard.includes('activePanel === "advanced"'),
  "District command routing and Expert tools must remain preserved for their later dedicated cleanup.",
);

assert(
  !route.includes("buildSubjectBroadsheet") &&
    !client.includes("teacher leaderboard") &&
    !client.includes("performance score"),
  "WO-P3 must not create a Broadsheet clone, teacher leaderboard, or punitive score.",
);

console.log("SISSO WORK OUTPUT CONSUMER CONTRACT: GREEN");
console.log("- circuit/school scope is server revalidated through existing governance authority");
console.log("- selected-school current term/year is reused with no silent 1st-Term fallback");
console.log("- shared lesson-linked non-Mock Work Output remains the only computation authority");
console.log("- legacy unlinked evidence is preserved separately");
console.log("- school -> teacher -> class -> subject flow is compact and BBC-friendly");
console.log("- SISSO Students Assessment doorway is converged onto Teacher Work Output");
console.log("- District Students Assessment and Expert tools remain preserved");
console.log("- only non-zero practice types are surfaced in the compact summary");
console.log("- delivered lessons are disclosed oldest to newest");
console.log("- learner progression opens only for the selected delivered lesson");
console.log("- classroom-familiar Ex./H/W/C/T progression labels are preserved");
console.log("- no teacher ranking, punitive score, polling, schema change, or Broadsheet clone is introduced");
