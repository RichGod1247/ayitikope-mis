BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- N7-P2C3L-R3J — allow repeat Director Headteacher Governance visits after direct release.
--
-- Production defect proved on 2026-08-21:
--   AppraisalCycle_one_live_target_idx treats OPEN/CLOSED/UNDER_REVIEW cycles as
--   live forever. Director-authored Headteacher Governance release intentionally
--   preserves carrier status/timestamps and stores an assessment-keyed release
--   proof under metadata.headteacherSupervisoryReleases. The application already
--   treats a valid released assessment as historical and permits a later visit,
--   but the database index rejected the new cycle with P2002.
--
-- Safety:
--   * fail closed unless the current index is exactly the observed production index;
--   * preserve the original unique key and all original live statuses;
--   * exclude only the established Director Governance-only carrier shape after
--     release metadata exists;
--   * unreleased/malformed direct carriers remain protected by uniqueness;
--   * Staff Feedback and all other workflows keep the original uniqueness rule;
--   * no appraisal/business rows are mutated;
--   * idempotency uniqueness and all other indexes are untouched.

DO $headteacher_governance_repeat_cycle_preflight$
DECLARE
  current_definition text;
  current_predicate text;
  current_unique boolean;
  current_valid boolean;

  expected_definition constant text :=
    $def$CREATE UNIQUE INDEX "AppraisalCycle_one_live_target_idx" ON edulife_os.appraisal_cycle USING btree ("instrumentVersionId", "scopeZoneId", "targetUserId", COALESCE("targetTenantId", ''::text), COALESCE("targetZoneId", ''::text), COALESCE("targetGovernanceAssignmentId", ''::text)) WHERE (status = ANY (ARRAY['DRAFT'::"AppraisalCycleStatus", 'PENDING_APPROVAL'::"AppraisalCycleStatus", 'OPEN'::"AppraisalCycleStatus", 'CLOSED'::"AppraisalCycleStatus", 'UNDER_REVIEW'::"AppraisalCycleStatus"]))$def$;

  expected_predicate constant text :=
    $def$(status = ANY (ARRAY['DRAFT'::"AppraisalCycleStatus", 'PENDING_APPROVAL'::"AppraisalCycleStatus", 'OPEN'::"AppraisalCycleStatus", 'CLOSED'::"AppraisalCycleStatus", 'UNDER_REVIEW'::"AppraisalCycleStatus"]))$def$;
BEGIN
  SELECT
    pg_get_indexdef(i.indexrelid),
    pg_get_expr(i.indpred, i.indrelid),
    i.indisunique,
    i.indisvalid
  INTO
    current_definition,
    current_predicate,
    current_unique,
    current_valid
  FROM pg_index i
  JOIN pg_class tbl ON tbl.oid = i.indrelid
  JOIN pg_class idx ON idx.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = tbl.relnamespace
  WHERE n.nspname = 'edulife_os'
    AND tbl.relname = 'appraisal_cycle'
    AND idx.relname = 'AppraisalCycle_one_live_target_idx';

  IF current_definition IS NULL OR current_predicate IS NULL THEN
    RAISE EXCEPTION 'HEADTEACHER_GOVERNANCE_REPEAT_INDEX_BASELINE_MISSING';
  END IF;

  IF current_unique IS DISTINCT FROM TRUE OR current_valid IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'HEADTEACHER_GOVERNANCE_REPEAT_INDEX_BASELINE_INVALID';
  END IF;

  IF regexp_replace(btrim(current_definition), '[[:space:]]+', ' ', 'g')
       <> regexp_replace(btrim(expected_definition), '[[:space:]]+', ' ', 'g')
     OR regexp_replace(btrim(current_predicate), '[[:space:]]+', ' ', 'g')
       <> regexp_replace(btrim(expected_predicate), '[[:space:]]+', ' ', 'g') THEN
    RAISE EXCEPTION 'HEADTEACHER_GOVERNANCE_REPEAT_INDEX_BASELINE_DRIFT';
  END IF;
END
$headteacher_governance_repeat_cycle_preflight$;

LOCK TABLE edulife_os.appraisal_cycle IN SHARE ROW EXCLUSIVE MODE;

DROP INDEX edulife_os."AppraisalCycle_one_live_target_idx";

CREATE UNIQUE INDEX "AppraisalCycle_one_live_target_idx"
ON edulife_os.appraisal_cycle USING btree (
  "instrumentVersionId",
  "scopeZoneId",
  "targetUserId",
  COALESCE("targetTenantId", ''::text),
  COALESCE("targetZoneId", ''::text),
  COALESCE("targetGovernanceAssignmentId", ''::text)
)
WHERE (
  status = ANY (
      ARRAY[
        'DRAFT'::"AppraisalCycleStatus",
        'PENDING_APPROVAL'::"AppraisalCycleStatus",
        'OPEN'::"AppraisalCycleStatus",
        'CLOSED'::"AppraisalCycleStatus",
        'UNDER_REVIEW'::"AppraisalCycleStatus"
      ]
    )
    AND NOT (
      COALESCE(metadata ->> 'workflow', '') =
        'HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT'
      AND COALESCE(metadata ->> 'evidenceStream', '') =
        'GOVERNANCE_SUPERVISORY_ASSESSMENT'
      AND COALESCE(metadata ->> 'carrierKind', '') =
        'DIRECTOR_GOVERNANCE_ONLY'
      AND COALESCE(metadata ->> 'respondentWorkflow', '') = 'false'
      AND COALESCE(metadata ->> 'participantSelection', '') = 'NONE'
      AND COALESCE(metadata ->> 'staffFeedbackRequired', '') = 'false'
      AND COALESCE(metadata ->> 'staffFeedbackAccessed', '') = 'false'
      AND COALESCE(metadata ->> 'separateFromStaffFeedback', '') = 'true'
      AND COALESCE(metadata ->> 'combinedWeightingDefined', '') = 'false'
      AND COALESCE(
        jsonb_typeof(metadata -> 'headteacherSupervisoryReleases') = 'object',
        false
      )
      AND COALESCE(
        (metadata -> 'headteacherSupervisoryReleases') <> '{}'::jsonb,
        false
      )
    )
);

DO $headteacher_governance_repeat_cycle_postflight$
DECLARE
  current_definition text;
  current_predicate text;
  current_unique boolean;
  current_valid boolean;
BEGIN
  SELECT
    pg_get_indexdef(i.indexrelid),
    pg_get_expr(i.indpred, i.indrelid),
    i.indisunique,
    i.indisvalid
  INTO
    current_definition,
    current_predicate,
    current_unique,
    current_valid
  FROM pg_index i
  JOIN pg_class tbl ON tbl.oid = i.indrelid
  JOIN pg_class idx ON idx.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = tbl.relnamespace
  WHERE n.nspname = 'edulife_os'
    AND tbl.relname = 'appraisal_cycle'
    AND idx.relname = 'AppraisalCycle_one_live_target_idx';

  IF current_definition IS NULL OR current_predicate IS NULL
     OR current_unique IS DISTINCT FROM TRUE
     OR current_valid IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'HEADTEACHER_GOVERNANCE_REPEAT_INDEX_POSTFLIGHT_INVALID';
  END IF;

  IF position('HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT' IN current_predicate) = 0
     OR position('DIRECTOR_GOVERNANCE_ONLY' IN current_predicate) = 0
     OR position('headteacherSupervisoryReleases' IN current_predicate) = 0
     OR position('DRAFT' IN current_predicate) = 0
     OR position('PENDING_APPROVAL' IN current_predicate) = 0
     OR position('OPEN' IN current_predicate) = 0
     OR position('CLOSED' IN current_predicate) = 0
     OR position('UNDER_REVIEW' IN current_predicate) = 0 THEN
    RAISE EXCEPTION 'HEADTEACHER_GOVERNANCE_REPEAT_INDEX_POSTFLIGHT_DRIFT';
  END IF;
END
$headteacher_governance_repeat_cycle_postflight$;

COMMIT;
