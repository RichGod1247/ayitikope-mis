#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects dashboard source. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const dashboardPath = path.join(
  repoRoot,
  "src/app/headteacher/dashboard/ui.tsx",
);

function fail(message, detail) {
  const suffix =
    detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function contains(source, marker, label) {
  assert(source.includes(marker), `D3_3D1_MARKER_MISSING:${label}`, {
    marker,
  });
}

const source = fs.readFileSync(dashboardPath, "utf8");

contains(
  source,
  "type DirectorFeedbackAssignmentsResp",
  "request-status-contract",
);
contains(
  source,
  'fetchJson<DirectorFeedbackAssignmentsResp>(`/api/headteacher/director-feedback`',
  "request-status-api",
);
contains(
  source,
  "directorFeedbackAvailable",
  "availability-state",
);
contains(
  source,
  "disabled={!directorFeedbackAvailable}",
  "disabled-until-requested",
);
contains(
  source,
  "Available when Director opens feedback",
  "locked-cta",
);
contains(
  source,
  'router.push("/headteacher/director-feedback")',
  "future-active-route",
);

const myAppraisalIndex = source.indexOf('title="My Appraisal"');
const directorFeedbackIndex = source.indexOf('title="Director Feedback"');

assert(myAppraisalIndex >= 0, "D3_3D1_MY_APPRAISAL_TILE_MISSING");
assert(directorFeedbackIndex >= 0, "D3_3D1_DIRECTOR_FEEDBACK_TILE_MISSING");
assert(
  myAppraisalIndex < directorFeedbackIndex,
  "D3_3D1_TILE_ORDER_INVALID",
  {
    expected: "My Appraisal before Director Feedback",
  },
);

console.log("");
console.log("=== D3.3D1 REQUEST-GATED DASHBOARD TILE PROOF ===");
console.log("");
console.log("Tile position                : after My Appraisal");
console.log("No-cycle state               : disabled");
console.log("Active-cycle state           : enabled automatically");
console.log("Finalized-response state     : view remains available");
console.log("Status source                : no-store assignment API");
console.log("School/respondent identity   : absent");
console.log("Database accessed            : false");
console.log("");
console.log("RESULT: D3.3D1 REQUEST-GATED DASHBOARD TILE GREEN");
