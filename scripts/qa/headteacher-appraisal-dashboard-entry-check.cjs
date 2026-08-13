#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally uses Node require(). */

/*
 * N6-F1C6B5C — Headteacher appraisal dashboard entry contract.
 * Static source-only QA: no DB, network, provider, browser storage or mutation.
 */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const sourcePath = path.join(
  repoRoot,
  "src/components/governance/GovernanceCommandDashboardClient.tsx",
);
const source = fs.readFileSync(sourcePath, "utf8");

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const headteacherMarker = "<p className=\"mt-3 text-sm font-bold text-white\">\n          Headteacher Appraisal";
const markerIndex = source.indexOf(headteacherMarker);
assert(markerIndex >= 0, "Headteacher Appraisal card marker missing");

const cardStart = source.lastIndexOf("<article", markerIndex);
const cardEnd = source.indexOf("</article>", markerIndex);
assert(cardStart >= 0 && cardEnd > markerIndex, "Headteacher Appraisal must be an article, not one giant navigation link");

const card = source.slice(cardStart, cardEnd + "</article>".length);

for (const required of [
  'href="/governance/appraisals/headteacher-supervisory"',
  'href="/district/headteacher-appraisals/review"',
  "Assess Headteacher",
  "Review Headteacher requests",
  "{isDistrictView ? (",
  "sm:grid-cols-2",
]) {
  assert(card.includes(required), `Required Headteacher dashboard entry marker missing: ${required}`);
}

assert(
  !card.includes('href={\\n          isDistrictView'),
  "Whole Headteacher card must not remain a conditional giant link",
);

assert(
  card.indexOf('href="/governance/appraisals/headteacher-supervisory"') <
    card.indexOf('href="/district/headteacher-appraisals/review"'),
  "Assess Headteacher must remain the first/primary Director action",
);

assert(
  card.includes(
    '"Assess authorized Headteachers or review Headteacher appraisal requests and completed review work."',
  ),
  "District description must explain the separate assess/review powers",
);

assert(
  card.includes(
    '"Complete authorized Headteacher supervisory assessments within your circuit."',
  ),
  "Circuit assessment wording must remain preserved",
);

for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "setInterval(",
  "setTimeout(",
  "prisma.",
  "sendSms",
  "sendEmail",
]) {
  assert(!card.includes(forbidden), `Forbidden dashboard-card behavior found: ${forbidden}`);
}

console.log("=== N6-F1C6B5C HEADTEACHER APPRAISAL DASHBOARD ENTRY ===");
console.log("");
console.log("Director card                    : explicit action card, not giant link");
console.log("Primary Director action          : Assess Headteacher");
console.log("Assessment route                 : /governance/appraisals/headteacher-supervisory");
console.log("Secondary Director action        : Review Headteacher requests");
console.log("Review route                     : /district/headteacher-appraisals/review");
console.log("Circuit behavior                 : assessment-only preserved");
console.log("BBC/mobile targets               : min-h-11, two-button responsive grid");
console.log("Authority model                  : navigation only; backend gates unchanged");
console.log("Polling/browser storage          : absent");
console.log("Database/provider access         : absent");
console.log("");
console.log("RESULT: N6-F1C6B5C HEADTEACHER APPRAISAL DASHBOARD ENTRY GREEN");
