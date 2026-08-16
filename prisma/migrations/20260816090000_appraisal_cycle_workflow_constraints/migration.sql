-- N7-P2C3AD — adopt and refine appraisal_cycle workflow constraints.
--
-- Production currently carries six CHECK constraints whose repository provenance
-- is absent. This migration adopts that contract into source control while
-- refining only the three checks that conflict with the established
-- non-respondent Teacher supervisory lifecycle.
--
-- Safety:
--   * production-upgrade path accepts only the exact observed parent definitions;
--   * fresh/UAT path accepts absence and creates the complete six-check contract;
--   * unexpected same-name constraint drift fails closed;
--   * no business rows are mutated;
--   * no chronology rules are added beyond the pre-existing deadline check.

DO $appraisal_cycle_constraints$
DECLARE
  current_def text;
  current_validated boolean;
  found_count integer;
  all_validated boolean;

  expected_old_deadline constant text :=
    $def$CHECK ("deadlineAt" IS NULL OR "openedAt" IS NULL OR "deadlineAt" > "openedAt")$def$;

  expected_old_extension constant text :=
    $def$CHECK ("extensionCount" >= 0)$def$;

  expected_old_minimum constant text :=
    $def$CHECK ("minimumResponses" >= 1)$def$;

  expected_old_status constant text :=
    $def$CHECK (((status <> ALL (ARRAY['OPEN'::"AppraisalCycleStatus", 'CLOSED'::"AppraisalCycleStatus", 'UNDER_REVIEW'::"AppraisalCycleStatus", 'RELEASED'::"AppraisalCycleStatus"])) OR "approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL AND "openedAt" IS NOT NULL AND "openedByUserId" IS NOT NULL AND "deadlineAt" IS NOT NULL) AND ((status <> ALL (ARRAY['CLOSED'::"AppraisalCycleStatus", 'UNDER_REVIEW'::"AppraisalCycleStatus", 'RELEASED'::"AppraisalCycleStatus"])) OR "closedAt" IS NOT NULL AND "closedByUserId" IS NOT NULL) AND (status <> 'UNDER_REVIEW'::"AppraisalCycleStatus" OR "reviewStartedAt" IS NOT NULL) AND (status <> 'RELEASED'::"AppraisalCycleStatus" OR "releasedAt" IS NOT NULL AND "releasedByUserId" IS NOT NULL) AND (status <> 'CANCELLED'::"AppraisalCycleStatus" OR "cancelledAt" IS NOT NULL AND "cancelledByUserId" IS NOT NULL AND length(btrim(COALESCE("cancellationReason", ''::text))) >= 10))$def$;

  expected_old_target constant text :=
    $def$CHECK ("targetTenantId" IS NOT NULL OR "targetZoneId" IS NOT NULL OR "targetGovernanceAssignmentId" IS NOT NULL)$def$;

  expected_old_window constant text :=
    $def$CHECK ("responseWindowDays" >= 1 AND "responseWindowDays" <= 90)$def$;
BEGIN
  LOCK TABLE edulife_os.appraisal_cycle IN SHARE ROW EXCLUSIVE MODE;

  -- 1. Deadline ordering — preserve exact observed production contract.
  current_def := NULL;
  current_validated := NULL;
  SELECT pg_get_constraintdef(c.oid, true), c.convalidated
    INTO current_def, current_validated
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'edulife_os'
    AND t.relname = 'appraisal_cycle'
    AND c.conname = 'AppraisalCycle_deadline_check'
    AND c.contype = 'c';

  IF current_def IS NULL THEN
    ALTER TABLE edulife_os.appraisal_cycle
      ADD CONSTRAINT "AppraisalCycle_deadline_check"
      CHECK ("deadlineAt" IS NULL OR "openedAt" IS NULL OR "deadlineAt" > "openedAt");
  ELSIF current_validated IS DISTINCT FROM TRUE
     OR regexp_replace(btrim(current_def), '[[:space:]]+', ' ', 'g')
        <> regexp_replace(btrim(expected_old_deadline), '[[:space:]]+', ' ', 'g') THEN
    RAISE EXCEPTION 'APPRAISAL_CYCLE_DEADLINE_CONSTRAINT_DRIFT';
  END IF;

  -- 2. Extension count — preserve exact observed production contract.
  current_def := NULL;
  current_validated := NULL;
  SELECT pg_get_constraintdef(c.oid, true), c.convalidated
    INTO current_def, current_validated
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'edulife_os'
    AND t.relname = 'appraisal_cycle'
    AND c.conname = 'AppraisalCycle_extensionCount_check'
    AND c.contype = 'c';

  IF current_def IS NULL THEN
    ALTER TABLE edulife_os.appraisal_cycle
      ADD CONSTRAINT "AppraisalCycle_extensionCount_check"
      CHECK ("extensionCount" >= 0);
  ELSIF current_validated IS DISTINCT FROM TRUE
     OR regexp_replace(btrim(current_def), '[[:space:]]+', ' ', 'g')
        <> regexp_replace(btrim(expected_old_extension), '[[:space:]]+', ' ', 'g') THEN
    RAISE EXCEPTION 'APPRAISAL_CYCLE_EXTENSION_COUNT_CONSTRAINT_DRIFT';
  END IF;

  -- 3. Minimum responses — Teacher supervisory cycles are intentionally
  -- non-respondent cycles; every other/unknown workflow retains the old floor.
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

  IF current_def IS NOT NULL THEN
    IF current_validated IS DISTINCT FROM TRUE
       OR regexp_replace(btrim(current_def), '[[:space:]]+', ' ', 'g')
          <> regexp_replace(btrim(expected_old_minimum), '[[:space:]]+', ' ', 'g') THEN
      RAISE EXCEPTION 'APPRAISAL_CYCLE_MINIMUM_RESPONSES_CONSTRAINT_DRIFT';
    END IF;

    ALTER TABLE edulife_os.appraisal_cycle
      DROP CONSTRAINT "AppraisalCycle_minimumResponses_check";
  END IF;

  ALTER TABLE edulife_os.appraisal_cycle
    ADD CONSTRAINT "AppraisalCycle_minimumResponses_check"
    CHECK (
      CASE COALESCE(metadata ->> 'workflow', '')
        WHEN 'TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT'
          THEN "minimumResponses" = 0
        ELSE "minimumResponses" >= 1
      END
    );

  -- 4. Status shape — keep the existing lifecycle evidence requirements,
  -- but scope legacy actor/approval assumptions to the workflows that prove
  -- them. No additional timestamp chronology is introduced here.
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

  IF current_def IS NOT NULL THEN
    IF current_validated IS DISTINCT FROM TRUE
       OR regexp_replace(btrim(current_def), '[[:space:]]+', ' ', 'g')
          <> regexp_replace(btrim(expected_old_status), '[[:space:]]+', ' ', 'g') THEN
      RAISE EXCEPTION 'APPRAISAL_CYCLE_STATUS_SHAPE_CONSTRAINT_DRIFT';
    END IF;

    ALTER TABLE edulife_os.appraisal_cycle
      DROP CONSTRAINT "AppraisalCycle_status_shape_check";
  END IF;

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

  -- 5. Target context — preserve exact observed production contract.
  current_def := NULL;
  current_validated := NULL;
  SELECT pg_get_constraintdef(c.oid, true), c.convalidated
    INTO current_def, current_validated
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'edulife_os'
    AND t.relname = 'appraisal_cycle'
    AND c.conname = 'AppraisalCycle_target_context_check'
    AND c.contype = 'c';

  IF current_def IS NULL THEN
    ALTER TABLE edulife_os.appraisal_cycle
      ADD CONSTRAINT "AppraisalCycle_target_context_check"
      CHECK (
        "targetTenantId" IS NOT NULL
        OR "targetZoneId" IS NOT NULL
        OR "targetGovernanceAssignmentId" IS NOT NULL
      );
  ELSIF current_validated IS DISTINCT FROM TRUE
     OR regexp_replace(btrim(current_def), '[[:space:]]+', ' ', 'g')
        <> regexp_replace(btrim(expected_old_target), '[[:space:]]+', ' ', 'g') THEN
    RAISE EXCEPTION 'APPRAISAL_CYCLE_TARGET_CONTEXT_CONSTRAINT_DRIFT';
  END IF;

  -- 6. Response window — Teacher supervisory cycles are intentionally
  -- non-respondent cycles; every other/unknown workflow retains 1..90 days.
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

  IF current_def IS NOT NULL THEN
    IF current_validated IS DISTINCT FROM TRUE
       OR regexp_replace(btrim(current_def), '[[:space:]]+', ' ', 'g')
          <> regexp_replace(btrim(expected_old_window), '[[:space:]]+', ' ', 'g') THEN
      RAISE EXCEPTION 'APPRAISAL_CYCLE_WINDOW_CONSTRAINT_DRIFT';
    END IF;

    ALTER TABLE edulife_os.appraisal_cycle
      DROP CONSTRAINT "AppraisalCycle_window_check";
  END IF;

  ALTER TABLE edulife_os.appraisal_cycle
    ADD CONSTRAINT "AppraisalCycle_window_check"
    CHECK (
      CASE COALESCE(metadata ->> 'workflow', '')
        WHEN 'TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT'
          THEN "responseWindowDays" = 0
        ELSE "responseWindowDays" >= 1 AND "responseWindowDays" <= 90
      END
    );

  -- Final adoption proof: all six named checks exist exactly once and validate.
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
    RAISE EXCEPTION 'APPRAISAL_CYCLE_CONSTRAINT_ADOPTION_INCOMPLETE';
  END IF;
END
$appraisal_cycle_constraints$;
