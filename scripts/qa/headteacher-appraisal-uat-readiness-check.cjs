/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally reads repository source files. */
const fs = require("fs");
const path = require("path");

function fail(message, details) {
  const suffix = details ? `\n${JSON.stringify(details, null, 2)}` : "";
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, details) {
  if (!condition) fail(message, details);
}

function read(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  assert(fs.existsSync(absolutePath), "Required UAT-readiness file missing", {
    relativePath,
  });
  return fs.readFileSync(absolutePath, "utf8");
}

function requireMarkers(relativePath, markers) {
  const content = read(relativePath);
  for (const marker of markers) {
    assert(content.includes(marker), "UAT-readiness contract marker missing", {
      relativePath,
      marker,
    });
  }
  return content;
}

function forbidMarkers(relativePath, markers) {
  const content = read(relativePath);
  for (const marker of markers) {
    assert(!content.includes(marker), "Forbidden UAT-readiness marker present", {
      relativePath,
      marker,
    });
  }
  return content;
}

const exactCriticalFiles = [
  "scripts/qa/headteacher-appraisal-end-to-end-acceptance-check.cjs",
  "src/app/api/district/headteacher-appraisals/_shared.ts",
  "src/app/api/district/headteacher-appraisals/[cycleId]/release/route.ts",
  "src/app/api/headteacher/headteacher-appraisal/[cycleId]/released-result/route.ts",
  "src/app/district/headteacher-appraisals/review/HeadteacherDirectorReviewClient.tsx",
  "src/app/headteacher/my-appraisal/HeadteacherReleasedResultClient.tsx",
  "src/app/headteacher/dashboard/ui.tsx",
  "docs/uat/headteacher-appraisal-real-role-uat.md",
];

for (const relativePath of exactCriticalFiles) {
  read(relativePath);
}

requireMarkers(
  "scripts/qa/headteacher-appraisal-end-to-end-acceptance-check.cjs",
  [
    "RESULT: D3.4I HEADTEACHER APPRAISAL ACCEPTANCE GREEN",
    'canonicalRole: "SISSO"',
    "combinedOverallPercentage: null",
  ],
);

const releaseRoute = requireMarkers(
  "src/app/api/district/headteacher-appraisals/[cycleId]/release/route.ts",
  [
    "jsonNoStore",
    "ensureHeadteacherDirectorReleaseNotifications",
    "releaseCommitted: true",
    "retrySafe: true",
    "providerCalled: false",
  ],
);

assert(
  releaseRoute.includes(
    '@/app/api/district/headteacher-appraisals/_shared',
  ),
  "Director release route must import the shared no-store helper",
);

requireMarkers(
  "src/app/api/district/headteacher-appraisals/_shared.ts",
  [
    "function jsonNoStore",
    '"Cache-Control": "no-store, max-age=0"',
    'Pragma: "no-cache"',
    '"X-Content-Type-Options": "nosniff"',
    '"Referrer-Policy": "no-referrer"',
  ],
);

requireMarkers(
  "src/app/api/headteacher/headteacher-appraisal/[cycleId]/released-result/route.ts",
  [
    "function jsonNoStore",
    '"Cache-Control": "no-store, max-age=0"',
    'Pragma: "no-cache"',
    '"X-Content-Type-Options": "nosniff"',
    '"Referrer-Policy": "no-referrer"',
    'requireRoleNames: ["HEADTEACHER"]',
    "readHeadteacherReleasedResult",
    "notificationsSeeded: false",
    "providerCallsAllowed: false",
  ],
);

requireMarkers(
  "src/app/district/headteacher-appraisals/review/HeadteacherDirectorReviewClient.tsx",
  [
    "backgroundPollingAllowed: false",
    "persistentBrowserStorageAllowed: false",
    "No combined appraisal score",
  ],
);

requireMarkers(
  "src/app/headteacher/my-appraisal/HeadteacherReleasedResultClient.tsx",
  [
    "backgroundPollingAllowed: false",
    "persistentBrowserStorageAllowed: false",
    "Load my released result",
    "No combined appraisal score is created.",
  ],
);

requireMarkers(
  "src/app/headteacher/dashboard/ui.tsx",
  [
    'title="My Appraisal"',
    'router.push("/headteacher/my-appraisal")',
  ],
);

forbidMarkers(
  "src/app/headteacher/my-appraisal/HeadteacherReleasedResultClient.tsx",
  [
    "localStorage",
    "sessionStorage",
    "setInterval(",
    "setTimeout(",
    "respondentUserId",
    "participantUserId",
    "reviewerUserId",
    "assessorUserId",
  ],
);

const uatDoc = requireMarkers(
  "docs/uat/headteacher-appraisal-real-role-uat.md",
  [
    "# D3.5A Headteacher Appraisal Real-Role UAT Runbook",
    "## 1. Purpose and boundaries",
    "## 2. Environment requirements",
    "## 3. Test identities",
    "## 4. Non-production test dataset",
    "## 5. Role-by-role UAT sequence",
    "## 6. Failure and recovery checks",
    "## 7. Evidence capture",
    "## 8. Exit criteria",
    "## 9. Cleanup and rollback",
    "Do not use production records",
    "SISSO is one circuit office",
    "No provider delivery",
    "No combined appraisal score",
  ],
);

assert(
  !uatDoc.includes("CIRCUIT_SUPERVISOR and SISSO are separate"),
  "Runbook incorrectly models two circuit offices",
);

console.log("=== D3.5A HEADTEACHER APPRAISAL UAT READINESS ===");
console.log("");
console.log("Implementation acceptance       : D3.4I present");
console.log("Readiness source strategy       : stable contract boundaries");
console.log("Director no-store boundary      : shared helper verified");
console.log("Headteacher no-store boundary   : route helper verified");
console.log("Director review/release         : verified");
console.log("Headteacher result access       : verified");
console.log("Low-network behavior            : explicit, no polling/storage");
console.log("Confidentiality boundary        : respondent identities hidden");
console.log("Combined score                  : absent");
console.log("SISSO office model              : one office");
console.log("UAT environment                 : non-production only");
console.log("Provider delivery               : prohibited during UAT");
console.log("Database accessed               : false");
console.log("");
console.log("RESULT: D3.5A HEADTEACHER APPRAISAL UAT READINESS GREEN");
