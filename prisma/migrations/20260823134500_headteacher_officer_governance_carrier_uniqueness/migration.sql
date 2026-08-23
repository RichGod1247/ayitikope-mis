BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

-- N7-P2C4C3E
-- Headteacher Governance-only carriers for SISSO / BSC / HOS are independent
-- assessment carriers, not Staff Feedback cycles. The existing broad live-target
-- index must therefore hand those exact carriers to a dedicated per-officer
-- uniqueness rule. Released Governance history leaves that dedicated live set.
--
-- Safety:
--   * no appraisal/business rows are mutated;
--   * malformed/partial metadata does not escape the broad index;
--   * Staff Feedback and Director-only carrier behavior is preserved;
--   * one unreleased officer Governance carrier per assessor + Headteacher;
--   * released officer Governance history permits a later independent visit.

DO $headteacher_officer_governance_index_preflight$
DECLARE
  broad_definition text;
  broad_predicate text;
  broad_unique boolean;
  broad_valid boolean;
  broad_nkeyatts integer;
  broad_key_1 text;
  broad_key_2 text;
  broad_key_3 text;
  broad_key_4 text;
  broad_key_5 text;
  broad_key_6 text;
  officer_index_count integer;
  unexpected_officer_rows integer;
BEGIN
  SELECT
    pg_get_indexdef(i.indexrelid),
    pg_get_expr(i.indpred, i.indrelid),
    i.indisunique,
    i.indisvalid,
    i.indnkeyatts,
    pg_get_indexdef(i.indexrelid, 1, true),
    pg_get_indexdef(i.indexrelid, 2, true),
    pg_get_indexdef(i.indexrelid, 3, true),
    pg_get_indexdef(i.indexrelid, 4, true),
    pg_get_indexdef(i.indexrelid, 5, true),
    pg_get_indexdef(i.indexrelid, 6, true)
  INTO
    broad_definition,
    broad_predicate,
    broad_unique,
    broad_valid,
    broad_nkeyatts,
    broad_key_1,
    broad_key_2,
    broad_key_3,
    broad_key_4,
    broad_key_5,
    broad_key_6
  FROM pg_index i
  JOIN pg_class tbl ON tbl.oid = i.indrelid
  JOIN pg_class idx ON idx.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = tbl.relnamespace
  WHERE n.nspname = 'edulife_os'
    AND tbl.relname = 'appraisal_cycle'
    AND idx.relname = 'AppraisalCycle_one_live_target_idx';

  IF broad_definition IS NULL OR broad_predicate IS NULL THEN
    RAISE EXCEPTION 'HEADTEACHER_OFFICER_GOVERNANCE_INDEX_BASELINE_MISSING';
  END IF;

  IF broad_unique IS DISTINCT FROM TRUE OR broad_valid IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'HEADTEACHER_OFFICER_GOVERNANCE_INDEX_BASELINE_INVALID';
  END IF;

  IF broad_nkeyatts <> 6
     OR broad_key_1 <> '"instrumentVersionId"'
     OR broad_key_2 <> '"scopeZoneId"'
     OR broad_key_3 <> '"targetUserId"'
     OR broad_key_4 <> 'COALESCE("targetTenantId", ''''::text)'
     OR broad_key_5 <> 'COALESCE("targetZoneId", ''''::text)'
     OR broad_key_6 <> 'COALESCE("targetGovernanceAssignmentId", ''''::text)'
     OR position('DRAFT' IN broad_predicate) = 0
     OR position('PENDING_APPROVAL' IN broad_predicate) = 0
     OR position('OPEN' IN broad_predicate) = 0
     OR position('CLOSED' IN broad_predicate) = 0
     OR position('UNDER_REVIEW' IN broad_predicate) = 0
     OR position('HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT' IN broad_predicate) = 0
     OR position('GOVERNANCE_SUPERVISORY_ASSESSMENT' IN broad_predicate) = 0
     OR position('DIRECTOR_GOVERNANCE_ONLY' IN broad_predicate) = 0
     OR position('respondentWorkflow' IN broad_predicate) = 0
     OR position('participantSelection' IN broad_predicate) = 0
     OR position('staffFeedbackRequired' IN broad_predicate) = 0
     OR position('staffFeedbackAccessed' IN broad_predicate) = 0
     OR position('separateFromStaffFeedback' IN broad_predicate) = 0
     OR position('combinedWeightingDefined' IN broad_predicate) = 0
     OR position('headteacherSupervisoryReleases' IN broad_predicate) = 0
     OR position('OFFICER_GOVERNANCE_ONLY' IN broad_predicate) > 0 THEN
    RAISE EXCEPTION 'HEADTEACHER_OFFICER_GOVERNANCE_INDEX_BASELINE_DRIFT';
  END IF;

  SELECT count(*)
  INTO officer_index_count
  FROM pg_class idx
  JOIN pg_namespace n ON n.oid = idx.relnamespace
  WHERE n.nspname = 'edulife_os'
    AND idx.relname = 'AppraisalCycle_one_live_officer_governance_target_idx';

  IF officer_index_count <> 0 THEN
    RAISE EXCEPTION 'HEADTEACHER_OFFICER_GOVERNANCE_INDEX_ALREADY_EXISTS';
  END IF;

  SELECT count(*)
  INTO unexpected_officer_rows
  FROM edulife_os.appraisal_cycle
  WHERE COALESCE(metadata ->> 'carrierKind', '') = 'OFFICER_GOVERNANCE_ONLY';

  IF unexpected_officer_rows <> 0 THEN
    RAISE EXCEPTION
      'HEADTEACHER_OFFICER_GOVERNANCE_PREEXISTING_CARRIER_ROWS: %',
      unexpected_officer_rows;
  END IF;
END
$headteacher_officer_governance_index_preflight$;

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
  AND NOT (
    COALESCE(metadata ->> 'workflow', '') =
      'HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT'
    AND COALESCE(metadata ->> 'evidenceStream', '') =
      'GOVERNANCE_SUPERVISORY_ASSESSMENT'
    AND COALESCE(metadata ->> 'carrierKind', '') =
      'OFFICER_GOVERNANCE_ONLY'
    AND COALESCE(metadata ->> 'respondentWorkflow', '') = 'false'
    AND COALESCE(metadata ->> 'participantSelection', '') = 'NONE'
    AND COALESCE(metadata ->> 'closedWithoutRespondents', '') = 'true'
    AND COALESCE(metadata ->> 'staffFeedbackRequired', '') = 'false'
    AND COALESCE(metadata ->> 'staffFeedbackAccessed', '') = 'false'
    AND COALESCE(metadata ->> 'separateFromStaffFeedback', '') = 'true'
    AND COALESCE(metadata ->> 'combinedWeightingDefined', '') = 'false'
    AND COALESCE(metadata ->> 'providerCalled', '') = 'false'
    AND COALESCE(metadata ->> 'assessorUserId', '') <> ''
    AND COALESCE(metadata ->> 'assessorUserId', '') = "requestedByUserId"
    AND COALESCE(metadata ->> 'assessorAssignmentId', '') <> ''
    AND (
      (
        COALESCE(metadata ->> 'assessorRole', '') = 'SISSO'
        AND COALESCE(metadata ->> 'scopeLevel', '') = 'CIRCUIT'
      )
      OR (
        COALESCE(metadata ->> 'assessorRole', '') = ANY (
          ARRAY['BASIC_SCHOOL_COORDINATOR'::text, 'HEAD_OF_SUPERVISION'::text]
        )
        AND COALESCE(metadata ->> 'scopeLevel', '') = 'DISTRICT'
      )
    )
  )
);

CREATE UNIQUE INDEX "AppraisalCycle_one_live_officer_governance_target_idx"
ON edulife_os.appraisal_cycle USING btree (
  "instrumentVersionId",
  "scopeZoneId",
  "targetUserId",
  COALESCE("targetTenantId", ''::text),
  COALESCE("targetZoneId", ''::text),
  "requestedByUserId"
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
  AND COALESCE(metadata ->> 'workflow', '') =
    'HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT'
  AND COALESCE(metadata ->> 'evidenceStream', '') =
    'GOVERNANCE_SUPERVISORY_ASSESSMENT'
  AND COALESCE(metadata ->> 'carrierKind', '') =
    'OFFICER_GOVERNANCE_ONLY'
  AND COALESCE(metadata ->> 'respondentWorkflow', '') = 'false'
  AND COALESCE(metadata ->> 'participantSelection', '') = 'NONE'
  AND COALESCE(metadata ->> 'closedWithoutRespondents', '') = 'true'
  AND COALESCE(metadata ->> 'staffFeedbackRequired', '') = 'false'
  AND COALESCE(metadata ->> 'staffFeedbackAccessed', '') = 'false'
  AND COALESCE(metadata ->> 'separateFromStaffFeedback', '') = 'true'
  AND COALESCE(metadata ->> 'combinedWeightingDefined', '') = 'false'
  AND COALESCE(metadata ->> 'providerCalled', '') = 'false'
  AND COALESCE(metadata ->> 'assessorUserId', '') <> ''
  AND COALESCE(metadata ->> 'assessorUserId', '') = "requestedByUserId"
  AND COALESCE(metadata ->> 'assessorAssignmentId', '') <> ''
  AND (
    (
      COALESCE(metadata ->> 'assessorRole', '') = 'SISSO'
      AND COALESCE(metadata ->> 'scopeLevel', '') = 'CIRCUIT'
    )
    OR (
      COALESCE(metadata ->> 'assessorRole', '') = ANY (
        ARRAY['BASIC_SCHOOL_COORDINATOR'::text, 'HEAD_OF_SUPERVISION'::text]
      )
      AND COALESCE(metadata ->> 'scopeLevel', '') = 'DISTRICT'
    )
  )
  AND NOT (
    jsonb_typeof(metadata -> 'directorGovernanceReview') = 'object'
    AND COALESCE(metadata -> 'directorGovernanceReview' ->> 'state', '') = 'RELEASED'
    AND COALESCE(metadata -> 'directorGovernanceReview' ->> 'decision', '') = 'RELEASE'
    AND length(COALESCE(metadata -> 'directorGovernanceReview' ->> 'assessmentId', '')) >= 5
    AND length(COALESCE(metadata -> 'directorGovernanceReview' ->> 'releaseProofHash', '')) = 64
    AND (metadata -> 'directorGovernanceReview' -> 'carrierCycleStatusMutationPerformed') = 'false'::jsonb
    AND (metadata -> 'directorGovernanceReview' -> 'carrierCycleTimestampMutationPerformed') = 'false'::jsonb
    AND (metadata -> 'directorGovernanceReview' -> 'staffFeedbackIncluded') = 'false'::jsonb
    AND (metadata -> 'directorGovernanceReview' -> 'respondentIdentitiesIncluded') = 'false'::jsonb
    AND (metadata -> 'directorGovernanceReview' -> 'providerCalled') = 'false'::jsonb
    AND jsonb_typeof(metadata -> 'headteacherSupervisoryReleases') = 'object'
    AND jsonb_typeof(
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
    ) = 'object'
    AND COALESCE(
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
        ->> 'releaseMode',
      ''
    ) = 'DIRECTOR_REVIEWED_GOVERNANCE_RELEASE'
    AND COALESCE(
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
        ->> 'workflow',
      ''
    ) = 'HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT'
    AND COALESCE(
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
        ->> 'evidenceStream',
      ''
    ) = 'GOVERNANCE_SUPERVISORY_ASSESSMENT'
    AND COALESCE(
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
        ->> 'assessmentId',
      ''
    ) = COALESCE(metadata -> 'directorGovernanceReview' ->> 'assessmentId', '')
    AND COALESCE(
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
        ->> 'assessmentStatus',
      ''
    ) = 'FINALIZED'
    AND COALESCE(
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
        ->> 'releaserRole',
      ''
    ) = 'DISTRICT_DIRECTOR'
    AND (
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
        -> 'staffFeedbackRequired'
    ) = 'false'::jsonb
    AND (
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
        -> 'staffFeedbackAccessed'
    ) = 'false'::jsonb
    AND (
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
        -> 'respondentIdentitiesAccessed'
    ) = 'false'::jsonb
    AND (
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
        -> 'individualStaffResponsesAccessed'
    ) = 'false'::jsonb
    AND (
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
        -> 'carrierCycleStatusMutationPerformed'
    ) = 'false'::jsonb
    AND (
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
        -> 'carrierCycleTimestampMutationPerformed'
    ) = 'false'::jsonb
    AND (
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
        -> 'reviewerMayRewriteScores'
    ) = 'false'::jsonb
    AND (
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
        -> 'combinedWeightingDefined'
    ) = 'false'::jsonb
    AND (
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
        -> 'providerCalled'
    ) = 'false'::jsonb
    AND length(
      COALESCE(
        metadata -> 'headteacherSupervisoryReleases'
          -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
          ->> 'releaseProofHash',
        ''
      )
    ) = 64
    AND COALESCE(
      metadata -> 'headteacherSupervisoryReleases'
        -> (metadata -> 'directorGovernanceReview' ->> 'assessmentId')
        ->> 'releaseProofHash',
      ''
    ) = COALESCE(metadata -> 'directorGovernanceReview' ->> 'releaseProofHash', '')
  )
);

DO $headteacher_officer_governance_index_postflight$
DECLARE
  broad_predicate text;
  broad_unique boolean;
  broad_valid boolean;
  officer_definition text;
  officer_predicate text;
  officer_unique boolean;
  officer_valid boolean;
BEGIN
  SELECT
    pg_get_expr(i.indpred, i.indrelid),
    i.indisunique,
    i.indisvalid
  INTO broad_predicate, broad_unique, broad_valid
  FROM pg_index i
  JOIN pg_class tbl ON tbl.oid = i.indrelid
  JOIN pg_class idx ON idx.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = tbl.relnamespace
  WHERE n.nspname = 'edulife_os'
    AND tbl.relname = 'appraisal_cycle'
    AND idx.relname = 'AppraisalCycle_one_live_target_idx';

  SELECT
    pg_get_indexdef(i.indexrelid),
    pg_get_expr(i.indpred, i.indrelid),
    i.indisunique,
    i.indisvalid
  INTO officer_definition, officer_predicate, officer_unique, officer_valid
  FROM pg_index i
  JOIN pg_class tbl ON tbl.oid = i.indrelid
  JOIN pg_class idx ON idx.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = tbl.relnamespace
  WHERE n.nspname = 'edulife_os'
    AND tbl.relname = 'appraisal_cycle'
    AND idx.relname = 'AppraisalCycle_one_live_officer_governance_target_idx';

  IF broad_predicate IS NULL
     OR broad_unique IS DISTINCT FROM TRUE
     OR broad_valid IS DISTINCT FROM TRUE
     OR position('DIRECTOR_GOVERNANCE_ONLY' IN broad_predicate) = 0
     OR position('OFFICER_GOVERNANCE_ONLY' IN broad_predicate) = 0
     OR position('assessorUserId' IN broad_predicate) = 0
     OR position('assessorAssignmentId' IN broad_predicate) = 0
     OR position('closedWithoutRespondents' IN broad_predicate) = 0 THEN
    RAISE EXCEPTION 'HEADTEACHER_OFFICER_GOVERNANCE_BROAD_INDEX_POSTFLIGHT_DRIFT';
  END IF;

  IF officer_definition IS NULL
     OR officer_predicate IS NULL
     OR officer_unique IS DISTINCT FROM TRUE
     OR officer_valid IS DISTINCT FROM TRUE
     OR position('"requestedByUserId"' IN officer_definition) = 0
     OR position('OFFICER_GOVERNANCE_ONLY' IN officer_predicate) = 0
     OR position('headteacherSupervisoryReleases' IN officer_predicate) = 0
     OR position('directorGovernanceReview' IN officer_predicate) = 0
     OR position('DIRECTOR_REVIEWED_GOVERNANCE_RELEASE' IN officer_predicate) = 0
     OR position('releaseProofHash' IN officer_predicate) = 0
     OR position('SISSO' IN officer_predicate) = 0
     OR position('BASIC_SCHOOL_COORDINATOR' IN officer_predicate) = 0
     OR position('HEAD_OF_SUPERVISION' IN officer_predicate) = 0
     OR position('CIRCUIT' IN officer_predicate) = 0
     OR position('DISTRICT' IN officer_predicate) = 0 THEN
    RAISE EXCEPTION 'HEADTEACHER_OFFICER_GOVERNANCE_DEDICATED_INDEX_POSTFLIGHT_DRIFT';
  END IF;
END
$headteacher_officer_governance_index_postflight$;

COMMIT;
