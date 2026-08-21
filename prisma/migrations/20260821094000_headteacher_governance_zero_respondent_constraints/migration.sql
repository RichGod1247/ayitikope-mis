-- N7-P2C3L-R2C — permit the independent Headteacher Governance carrier.
--
-- The Aug-16 appraisal-cycle migration established the source-controlled six-check
-- baseline and intentionally granted the non-respondent 0/0 lifecycle only to
-- Teacher Governance. N7-P2C3L adds the same already-proven lifecycle shape to
-- HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT for the Director-authored
-- Governance-only carrier.
--
-- Safety:
--   * requires the exact PostgreSQL-deparsed Aug-16 production definitions for the three replaced checks;
--   * unexpected same-name definition drift fails closed;
--   * preserves deadline, extension-count and target-context checks unchanged;
--   * relaxes no unknown workflow;
--   * mutates no appraisal/business rows;
--   * adds no timestamp chronology rule.

DO $headteacher_governance_zero_respondent$
DECLARE
  current_def text;
  current_validated boolean;
  found_count integer;
  all_validated boolean;
  headteacher_exception_count integer;

  expected_current_minimum constant text :=
    $def$CHECK (
CASE COALESCE(metadata ->> 'workflow'::text, ''::text)
    WHEN 'TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT'::text THEN "minimumResponses" = 0
    ELSE "minimumResponses" >= 1
END)$def$;

  expected_current_status constant text :=
    $def$CHECK (((status <> ALL (ARRAY['OPEN'::"AppraisalCycleStatus", 'CLOSED'::"AppraisalCycleStatus", 'UNDER_REVIEW'::"AppraisalCycleStatus", 'RELEASED'::"AppraisalCycleStatus"])) OR "openedAt" IS NOT NULL AND "openedByUserId" IS NOT NULL) AND ((status <> ALL (ARRAY['CLOSED'::"AppraisalCycleStatus", 'UNDER_REVIEW'::"AppraisalCycleStatus", 'RELEASED'::"AppraisalCycleStatus"])) OR "closedAt" IS NOT NULL) AND (status <> 'UNDER_REVIEW'::"AppraisalCycleStatus" OR "reviewStartedAt" IS NOT NULL) AND (status <> 'RELEASED'::"AppraisalCycleStatus" OR "releasedAt" IS NOT NULL) AND (status <> 'CANCELLED'::"AppraisalCycleStatus" OR "cancelledAt" IS NOT NULL AND "cancelledByUserId" IS NOT NULL AND length(btrim(COALESCE("cancellationReason", ''::text))) >= 10) AND
CASE COALESCE(metadata ->> 'workflow'::text, ''::text)
    WHEN 'TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT'::text THEN COALESCE(metadata ->> 'respondentWorkflow'::text, ''::text) = 'false'::text AND COALESCE(metadata ->> 'participantSelection'::text, ''::text) = 'NONE'::text AND "approvedAt" IS NULL AND "approvedByUserId" IS NULL AND "deadlineAt" IS NULL
    WHEN 'HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK'::text THEN (status <> ALL (ARRAY['OPEN'::"AppraisalCycleStatus", 'CLOSED'::"AppraisalCycleStatus", 'UNDER_REVIEW'::"AppraisalCycleStatus", 'RELEASED'::"AppraisalCycleStatus"])) OR "approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL AND "deadlineAt" IS NOT NULL
    WHEN 'DIRECTOR_CONFIDENTIAL_HEADTEACHER_FEEDBACK'::text THEN ((status <> ALL (ARRAY['OPEN'::"AppraisalCycleStatus", 'CLOSED'::"AppraisalCycleStatus", 'UNDER_REVIEW'::"AppraisalCycleStatus", 'RELEASED'::"AppraisalCycleStatus"])) OR "deadlineAt" IS NOT NULL) AND (status <> 'RELEASED'::"AppraisalCycleStatus" OR "releasedByUserId" IS NOT NULL)
    ELSE ((status <> ALL (ARRAY['OPEN'::"AppraisalCycleStatus", 'CLOSED'::"AppraisalCycleStatus", 'UNDER_REVIEW'::"AppraisalCycleStatus", 'RELEASED'::"AppraisalCycleStatus"])) OR "approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL AND "deadlineAt" IS NOT NULL) AND ((status <> ALL (ARRAY['CLOSED'::"AppraisalCycleStatus", 'UNDER_REVIEW'::"AppraisalCycleStatus", 'RELEASED'::"AppraisalCycleStatus"])) OR "closedByUserId" IS NOT NULL) AND (status <> 'RELEASED'::"AppraisalCycleStatus" OR "releasedByUserId" IS NOT NULL)
END)$def$;

  expected_current_window constant text :=
    $def$CHECK (
CASE COALESCE(metadata ->> 'workflow'::text, ''::text)
    WHEN 'TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT'::text THEN "responseWindowDays" = 0
    ELSE "responseWindowDays" >= 1 AND "responseWindowDays" <= 90
END)$def$;
BEGIN
  LOCK TABLE edulife_os.appraisal_cycle IN SHARE ROW EXCLUSIVE MODE;

  -- 1. Minimum responses — extend the established 0-response exception only
  -- to the independent Headteacher Governance workflow.
  current_def := NULL;
  current_validated := NULL;

  SELECT pg_get_constraintdef(c.oid, true), c.convalidated
    INTO current_def, current_validated
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'edulife_os'
    AND t.relname = 'appraisal_cycle'
    AND c.conname = 'AppraisalCycle_minimumResponses_check'
    AND c.contype = 'c';

  IF current_def IS NULL THEN
    RAISE EXCEPTION 'HEADTEACHER_GOVERNANCE_MINIMUM_RESPONSES_BASELINE_MISSING';
  END IF;

  IF current_validated IS DISTINCT FROM TRUE
     OR regexp_replace(btrim(current_def), '[[:space:]]+', ' ', 'g')
        <> regexp_replace(btrim(expected_current_minimum), '[[:space:]]+', ' ', 'g') THEN
    RAISE EXCEPTION 'HEADTEACHER_GOVERNANCE_MINIMUM_RESPONSES_CONSTRAINT_DRIFT';
  END IF;

  ALTER TABLE edulife_os.appraisal_cycle
    DROP CONSTRAINT "AppraisalCycle_minimumResponses_check";

  ALTER TABLE edulife_os.appraisal_cycle
    ADD CONSTRAINT "AppraisalCycle_minimumResponses_check"
    CHECK (
      CASE COALESCE(metadata ->> 'workflow', '')
        WHEN 'TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT'
          THEN "minimumResponses" = 0
        WHEN 'HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT'
          THEN "minimumResponses" = 0
        ELSE "minimumResponses" >= 1
      END
    );

  -- 2. Status shape — both Governance-only workflows are non-respondent
  -- carriers with no approval/deadline dependency.
  current_def := NULL;
  current_validated := NULL;

  SELECT pg_get_constraintdef(c.oid, true), c.convalidated
    INTO current_def, current_validated
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'edulife_os'
    AND t.relname = 'appraisal_cycle'
    AND c.conname = 'AppraisalCycle_status_shape_check'
    AND c.contype = 'c';

  IF current_def IS NULL THEN
    RAISE EXCEPTION 'HEADTEACHER_GOVERNANCE_STATUS_SHAPE_BASELINE_MISSING';
  END IF;

  IF current_validated IS DISTINCT FROM TRUE
     OR regexp_replace(btrim(current_def), '[[:space:]]+', ' ', 'g')
        <> regexp_replace(btrim(expected_current_status), '[[:space:]]+', ' ', 'g') THEN
    RAISE EXCEPTION 'HEADTEACHER_GOVERNANCE_STATUS_SHAPE_CONSTRAINT_DRIFT';
  END IF;

  ALTER TABLE edulife_os.appraisal_cycle
    DROP CONSTRAINT "AppraisalCycle_status_shape_check";

  ALTER TABLE edulife_os.appraisal_cycle
    ADD CONSTRAINT "AppraisalCycle_status_shape_check"
    CHECK (
      (
        status NOT IN (
          'OPEN'::"AppraisalCycleStatus",
          'CLOSED'::"AppraisalCycleStatus",
          'UNDER_REVIEW'::"AppraisalCycleStatus",
          'RELEASED'::"AppraisalCycleStatus"
        )
        OR (
          "openedAt" IS NOT NULL
          AND "openedByUserId" IS NOT NULL
        )
      )
      AND (
        status NOT IN (
          'CLOSED'::"AppraisalCycleStatus",
          'UNDER_REVIEW'::"AppraisalCycleStatus",
          'RELEASED'::"AppraisalCycleStatus"
        )
        OR "closedAt" IS NOT NULL
      )
      AND (
        status <> 'UNDER_REVIEW'::"AppraisalCycleStatus"
        OR "reviewStartedAt" IS NOT NULL
      )
      AND (
        status <> 'RELEASED'::"AppraisalCycleStatus"
        OR "releasedAt" IS NOT NULL
      )
      AND (
        status <> 'CANCELLED'::"AppraisalCycleStatus"
        OR (
          "cancelledAt" IS NOT NULL
          AND "cancelledByUserId" IS NOT NULL
          AND length(btrim(COALESCE("cancellationReason", ''))) >= 10
        )
      )
      AND (
        CASE COALESCE(metadata ->> 'workflow', '')
          WHEN 'TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT' THEN
            (
              COALESCE(metadata ->> 'respondentWorkflow', '') = 'false'
              AND COALESCE(metadata ->> 'participantSelection', '') = 'NONE'
              AND "approvedAt" IS NULL
              AND "approvedByUserId" IS NULL
              AND "deadlineAt" IS NULL
            )

          WHEN 'HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT' THEN
            (
              COALESCE(metadata ->> 'respondentWorkflow', '') = 'false'
              AND COALESCE(metadata ->> 'participantSelection', '') = 'NONE'
              AND "approvedAt" IS NULL
              AND "approvedByUserId" IS NULL
              AND "deadlineAt" IS NULL
            )

          WHEN 'HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK' THEN
            (
              status NOT IN (
                'OPEN'::"AppraisalCycleStatus",
                'CLOSED'::"AppraisalCycleStatus",
                'UNDER_REVIEW'::"AppraisalCycleStatus",
                'RELEASED'::"AppraisalCycleStatus"
              )
              OR (
                "approvedAt" IS NOT NULL
                AND "approvedByUserId" IS NOT NULL
                AND "deadlineAt" IS NOT NULL
              )
            )

          WHEN 'DIRECTOR_CONFIDENTIAL_HEADTEACHER_FEEDBACK' THEN
            (
              (
                status NOT IN (
                  'OPEN'::"AppraisalCycleStatus",
                  'CLOSED'::"AppraisalCycleStatus",
                  'UNDER_REVIEW'::"AppraisalCycleStatus",
                  'RELEASED'::"AppraisalCycleStatus"
                )
                OR "deadlineAt" IS NOT NULL
              )
              AND (
                status <> 'RELEASED'::"AppraisalCycleStatus"
                OR "releasedByUserId" IS NOT NULL
              )
            )

          ELSE
            (
              (
                status NOT IN (
                  'OPEN'::"AppraisalCycleStatus",
                  'CLOSED'::"AppraisalCycleStatus",
                  'UNDER_REVIEW'::"AppraisalCycleStatus",
                  'RELEASED'::"AppraisalCycleStatus"
                )
                OR (
                  "approvedAt" IS NOT NULL
                  AND "approvedByUserId" IS NOT NULL
                  AND "deadlineAt" IS NOT NULL
                )
              )
              AND (
                status NOT IN (
                  'CLOSED'::"AppraisalCycleStatus",
                  'UNDER_REVIEW'::"AppraisalCycleStatus",
                  'RELEASED'::"AppraisalCycleStatus"
                )
                OR "closedByUserId" IS NOT NULL
              )
              AND (
                status <> 'RELEASED'::"AppraisalCycleStatus"
                OR "releasedByUserId" IS NOT NULL
              )
            )
        END
      )
    );

  -- 3. Response window — Headteacher Governance, like Teacher Governance,
  -- is an immediate official assessment rather than a respondent window.
  current_def := NULL;
  current_validated := NULL;

  SELECT pg_get_constraintdef(c.oid, true), c.convalidated
    INTO current_def, current_validated
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'edulife_os'
    AND t.relname = 'appraisal_cycle'
    AND c.conname = 'AppraisalCycle_window_check'
    AND c.contype = 'c';

  IF current_def IS NULL THEN
    RAISE EXCEPTION 'HEADTEACHER_GOVERNANCE_WINDOW_BASELINE_MISSING';
  END IF;

  IF current_validated IS DISTINCT FROM TRUE
     OR regexp_replace(btrim(current_def), '[[:space:]]+', ' ', 'g')
        <> regexp_replace(btrim(expected_current_window), '[[:space:]]+', ' ', 'g') THEN
    RAISE EXCEPTION 'HEADTEACHER_GOVERNANCE_WINDOW_CONSTRAINT_DRIFT';
  END IF;

  ALTER TABLE edulife_os.appraisal_cycle
    DROP CONSTRAINT "AppraisalCycle_window_check";

  ALTER TABLE edulife_os.appraisal_cycle
    ADD CONSTRAINT "AppraisalCycle_window_check"
    CHECK (
      CASE COALESCE(metadata ->> 'workflow', '')
        WHEN 'TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT'
          THEN "responseWindowDays" = 0
        WHEN 'HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT'
          THEN "responseWindowDays" = 0
        ELSE "responseWindowDays" >= 1 AND "responseWindowDays" <= 90
      END
    );

  -- Final proof: the complete six-check contract remains present and validated.
  SELECT count(*), bool_and(c.convalidated)
    INTO found_count, all_validated
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'edulife_os'
    AND t.relname = 'appraisal_cycle'
    AND c.contype = 'c'
    AND c.conname = ANY (
      ARRAY[
        'AppraisalCycle_deadline_check',
        'AppraisalCycle_extensionCount_check',
        'AppraisalCycle_minimumResponses_check',
        'AppraisalCycle_status_shape_check',
        'AppraisalCycle_target_context_check',
        'AppraisalCycle_window_check'
      ]::text[]
    );

  IF found_count <> 6 OR COALESCE(all_validated, FALSE) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'HEADTEACHER_GOVERNANCE_CONSTRAINT_SET_INCOMPLETE';
  END IF;

  -- The new Headteacher workflow must appear in exactly the three constraints
  -- deliberately replaced by this migration.
  SELECT count(*)
    INTO headteacher_exception_count
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'edulife_os'
    AND t.relname = 'appraisal_cycle'
    AND c.contype = 'c'
    AND c.conname = ANY (
      ARRAY[
        'AppraisalCycle_minimumResponses_check',
        'AppraisalCycle_status_shape_check',
        'AppraisalCycle_window_check'
      ]::text[]
    )
    AND position(
      'HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT'
      IN pg_get_constraintdef(c.oid, true)
    ) > 0;

  IF headteacher_exception_count <> 3 THEN
    RAISE EXCEPTION 'HEADTEACHER_GOVERNANCE_ZERO_RESPONDENT_ADOPTION_INCOMPLETE';
  END IF;
END
$headteacher_governance_zero_respondent$;
