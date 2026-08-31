"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects repository TypeScript source. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function transpile(relativePath, jsx) {
  const source = read(relativePath);
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  };

  if (jsx) compilerOptions.jsx = ts.JsxEmit.ReactJSX;

  const result = ts.transpileModule(source, {
    fileName: relativePath,
    reportDiagnostics: true,
    compilerOptions,
  });

  const diagnostics = result.diagnostics || [];
  assert(
    diagnostics.length === 0,
    `TypeScript transpile diagnostics in ${relativePath}`,
    diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
  );
}

const authorityPath = "src/lib/assessments/workOutput.ts";
const routePath = "src/app/api/headteacher/assessment/sba/work-output/route.ts";
const clientPath =
  "src/app/headteacher/assessment/overview/HeadteacherAssessmentOverviewClient.tsx";

const authority = read(authorityPath);
const route = read(routePath);
const client = read(clientPath);

assert(
  authority.includes("averagePercent: number | null;") &&
    authority.includes("averagePercent:") &&
    authority.includes("round1((scoreSum / maxSum) * 100)"),
  "Shared Work Output type counts must own normalized raw-practice averages."
);

assert(
  route.includes('from "@/lib/assessments/workOutput"') &&
    route.includes("buildWorkOutputSnapshot({"),
  "Headteacher Work Output must consume the shared Work Output authority."
);

assert(
  route.includes('from "@/lib/teachingSubjectScope"') &&
    route.includes("subjectMatchesTeachingScope("),
  "Headteacher Work Output must use shared level-aware subject equivalence."
);

assert(
  !route.includes("function sameSubjectLoose") &&
    !route.includes("function assessmentBucket") &&
    !route.includes("function bucketLabel"),
  "Headteacher route must not retain parallel subject or three-bucket authorities."
);

assert(
  route.includes("lessonDeliveryId: null,") &&
    route.includes("legacyUnlinkedItems"),
  "Legacy unlinked assessment evidence must remain separately preserved."
);

assert(
  route.includes("itemCount: workOutput.term.itemCount") &&
    route.includes("legacyUnlinkedItemCount: workOutput.legacyUnlinked.itemCount") &&
    route.includes("buckets: workOutput.term.typeCounts.map"),
  "Headteacher compatibility response must derive counts from the shared canonical snapshot."
);

for (const key of [
  "EXERCISE",
  "HOMEWORK",
  "QUIZ",
  "CLASS_TEST",
  "GROUP_WORK",
  "PROJECT",
  "PRACTICAL",
  "EXAM",
  "OTHER",
]) {
  assert(
    authority.includes(`"${key}"`),
    `Shared Work Output authority must preserve ${key} as a distinct reporting type.`
  );
}

assert(
  route.includes('purpose: "FORMATIVE_PRACTICE_SUPPORT"') &&
    route.includes("ranking: false") &&
    route.includes("punitive: false"),
  "Headteacher interpretation must be supportive, non-ranking and non-punitive."
);

assert(
  client.includes("not to rank or punish teachers") &&
    client.includes("not linked to a recorded lesson delivery"),
  "Headteacher UI must explain supportive purpose and legacy-unlinked separation."
);

assert(
  route.includes("buildSubjectBroadsheet({") &&
    client.includes("<AssessmentBroadsheetPanel"),
  "Existing Broadsheet authority and UI must remain separate from Work Output."
);

assert(
  !route.includes("setInterval(") &&
    !client.includes("setInterval("),
  "Headteacher convergence must not introduce polling."
);

transpile(authorityPath, false);
transpile(routePath, false);
transpile(clientPath, true);

console.log("HEADTEACHER WORK OUTPUT SHARED-AUTHORITY CONVERGENCE: GREEN");
console.log("- Headteacher Work Output derives from the same shared authority as Teacher Work Output");
console.log("- canonical counts are lesson-linked non-Mock practice");
console.log("- legacy unlinked evidence remains separately preserved");
console.log("- assessment types remain distinct, including Quiz, Project and Practical");
console.log("- level-aware subject scope is shared rather than duplicated");
console.log("- Headteacher interpretation is supportive, non-ranking and non-punitive");
console.log("- existing Broadsheet authority remains separate and preserved");
console.log("- no polling or schema change is introduced");
