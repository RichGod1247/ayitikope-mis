#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness performs deterministic migration-source checks only. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const migrationRelativePath =
  "prisma/migrations/20260815193000_headteacher_dual_instrument_assessment_guard/migration.sql";
const migrationPath = path.join(repoRoot, migrationRelativePath);

function fail(message, detail) {
  const suffix =
    detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function contains(source, marker, label) {
  assert(source.includes(marker), `Missing marker: ${label}`, marker);
}

function excludes(source, marker, label) {
  assert(!source.includes(marker), `Forbidden marker: ${label}`, marker);
}

function count(source, marker) {
  return source.split(marker).length - 1;
}

function main() {
  assert(fs.existsSync(migrationPath), "Migration file missing", migrationRelativePath);

  const source = fs.readFileSync(migrationPath, "utf8");

  contains(
    source,
    "cd152c3dad32fc10b8589a9fa399a202d411df6ae3920a6f92389751c2408fe8",
    "adopted live parent-function hash",
  );
  contains(
    source,
    "CREATE OR REPLACE FUNCTION edulife_os.appraisal_validate_assessment_consistency()",
    "exact consistency function owner",
  );
  contains(
    source,
    'IF cycle_version <> NEW."instrumentVersionId" THEN',
    "ordinary same-version fast path preserved",
  );
  contains(source, "HEADTEACHER_STAFF_FEEDBACK_V1", "staff-feedback parent-cycle identity");
  contains(
    source,
    "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1",
    "supervisory assessment identity",
  );
  contains(
    source,
    "cycle_instrument_purpose = 'HEADTEACHER_STAFF_FEEDBACK'",
    "staff-feedback purpose lock",
  );
  contains(
    source,
    "assessment_instrument_purpose = 'HEADTEACHER_SUPERVISORY_ASSESSMENT'",
    "supervisory purpose lock",
  );
  contains(source, "cycle_instrument_subject_type = 'HEADTEACHER'", "cycle subject-type lock");
  contains(
    source,
    "assessment_instrument_subject_type = 'HEADTEACHER'",
    "assessment subject-type lock",
  );
  contains(source, "cycle_instrument_active IS TRUE", "cycle instrument active lock");
  contains(
    source,
    "assessment_instrument_active IS TRUE",
    "assessment instrument active lock",
  );
  contains(source, "cycle_instrument_version = 1", "cycle version lock");
  contains(source, "assessment_instrument_version = 1", "assessment version lock");
  contains(
    source,
    "cycle_instrument_version_status = 'ACTIVE'",
    "cycle publication status lock",
  );
  contains(
    source,
    "assessment_instrument_version_status = 'ACTIVE'",
    "assessment publication status lock",
  );
  contains(
    source,
    "UPPER(COALESCE(cycle_target_role, '')) = 'HEADTEACHER'",
    "target-role lock",
  );
  contains(
    source,
    "IF NOT dual_instrument_headteacher_allowed THEN",
    "fail-closed exception boundary",
  );

  assert(
    count(source, "RAISE EXCEPTION 'APPRAISAL_ASSESSMENT_VERSION_MISMATCH'") === 2,
    "Version mismatch guard must remain present at both missing-cycle and unauthorized-mismatch boundaries",
    {
      actualCount: count(
        source,
        "RAISE EXCEPTION 'APPRAISAL_ASSESSMENT_VERSION_MISMATCH'",
      ),
    },
  );

  contains(
    source,
    'IF NEW."assessorAssignmentId" IS NOT NULL THEN',
    "assessor assignment validation preserved",
  );
  contains(
    source,
    "APPRAISAL_ASSESSMENT_ASSIGNMENT_USER_MISMATCH",
    "assessor assignment/user mismatch guard preserved",
  );
  contains(
    source,
    "APPRAISAL_ASSESSMENT_CONSISTENCY_TRIGGER_DRIFT",
    "existing trigger drift fails closed",
  );
  contains(
    source,
    "existing_trigger_type <> 23",
    "BEFORE INSERT OR UPDATE row-trigger shape lock",
  );
  contains(
    source,
    "CREATE TRIGGER appraisal_assessment_consistency_trg",
    "missing-trigger adoption for fresh installations",
  );

  excludes(source, "DROP TRIGGER", "migration must not drop the live trigger");
  excludes(source, "DROP FUNCTION", "migration must not drop the live function");
  excludes(source, "29006829-a035-4486-ae76-1ad4b97eea5b", "production staff-feedback UUID");
  excludes(source, "4a6dc70c-e8c7-4c8b-ac8d-d5fc887b963e", "production supervisory UUID");
  excludes(source, "a89cff6c-87db-4c4f-b537-f03b0dc7ac86", "production cycle UUID");

  const uuidMatches =
    source.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
    ) ?? [];

  assert(
    uuidMatches.length === 0,
    "Migration must remain deployment-portable and contain no UUID literals",
    uuidMatches,
  );

  console.log("");
  console.log("=== N7-P2C3U HEADTEACHER DUAL-INSTRUMENT DB GUARD ===");
  console.log("");
  console.log("Live untracked parent guard     : adopted by hash");
  console.log("Ordinary same-version rule      : preserved");
  console.log("Cross-version exception         : Headteacher only");
  console.log("Parent cycle instrument         : staff feedback V1 / ACTIVE");
  console.log("Assessment instrument           : supervisory V1 / ACTIVE");
  console.log("Instrument purpose/type locks   : explicit");
  console.log("Production UUID hardcoding      : absent");
  console.log("Assessor assignment/user guard  : preserved");
  console.log("Existing trigger drift          : fail closed");
  console.log("Fresh-install trigger adoption  : included");
  console.log("Drop trigger/function           : absent");
  console.log("Database accessed by QA         : false");
  console.log("");
  console.log(
    "RESULT: N7-P2C3U HEADTEACHER DUAL-INSTRUMENT DB GUARD SOURCE QA GREEN",
  );
}

try {
  main();
} catch (error) {
  console.error("");
  console.error(
    "RESULT: N7-P2C3U HEADTEACHER DUAL-INSTRUMENT DB GUARD SOURCE QA FAILED",
  );
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
