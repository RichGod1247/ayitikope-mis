-- N7-P2C4B1I2 + N7-P2C4C1B
-- Canonical appraisal terminal-evidence guard.
--
-- Owns the database contract for immutable non-DRAFT appraisal assessments
-- while permitting only the explicit lifecycle/provenance transitions used by:
--   1. Headteacher HOS review return: FINALIZED -> RETURNED
--   2. Headteacher correction revision creation: RETURNED -> SUPERSEDED
--   3. Headteacher District Director Governance return: FINALIZED -> RETURNED
--   4. Teacher supervisory HOS/Director return: FINALIZED -> RETURNED
--
--
-- Scores, hashes, visit evidence, assessor identity, instrument identity,
-- finalization evidence, and unrelated metadata remain immutable.

BEGIN;

CREATE OR REPLACE FUNCTION edulife_os.appraisal_guard_assessment_terminal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'edulife_os', 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION
        'FINALIZED_APPRAISAL_ASSESSMENT_IS_IMMUTABLE';
    END IF;

    RETURN OLD;
  END IF;

  IF OLD.status <> 'DRAFT' THEN

    -- Preserve the historical pure lifecycle allowance:
    -- only status and updatedAt may change.
    IF NEW.status IN ('RETURNED', 'SUPERSEDED')
       AND (
         to_jsonb(NEW) - 'status' - 'updatedAt'
       ) = (
         to_jsonb(OLD) - 'status' - 'updatedAt'
       )
    THEN
      RETURN NEW;
    END IF;

    -- ---------------------------------------------------------
    -- HOS RETURN
    -- FINALIZED -> RETURNED
    --
    -- Only status, updatedAt and the dedicated nested
    -- headteacherSupervisoryReturn provenance object may change.
    -- ---------------------------------------------------------
    IF OLD.status = 'FINALIZED'
       AND NEW.status = 'RETURNED'

       AND (
         to_jsonb(NEW)
           - 'status'
           - 'updatedAt'
           - 'metadata'
       ) = (
         to_jsonb(OLD)
           - 'status'
           - 'updatedAt'
           - 'metadata'
       )

       AND (
         COALESCE(NEW.metadata, '{}'::jsonb)
           - 'headteacherSupervisoryReturn'
       ) = (
         COALESCE(OLD.metadata, '{}'::jsonb)
           - 'headteacherSupervisoryReturn'
       )

       AND jsonb_typeof(
         COALESCE(NEW.metadata, '{}'::jsonb)
           -> 'headteacherSupervisoryReturn'
       ) = 'object'

       AND COALESCE(
         NEW.metadata
           -> 'headteacherSupervisoryReturn'
           ->> 'schemaVersion',
         ''
       ) = '1'

       AND COALESCE(
         NEW.metadata
           -> 'headteacherSupervisoryReturn'
           ->> 'returningReviewerRole',
         ''
       ) IN (
         'HEAD_OF_SUPERVISION',
         'DISTRICT_DIRECTOR'
       )

       AND length(
         COALESCE(
           NEW.metadata
             -> 'headteacherSupervisoryReturn'
             ->> 'returnReviewEvidenceHash',
           ''
         )
       ) = 64

       AND length(
         COALESCE(
           NEW.metadata
             -> 'headteacherSupervisoryReturn'
             ->> 'returnDecisionRequestHash',
           ''
         )
       ) = 64

       AND length(
         COALESCE(
           NEW.metadata
             -> 'headteacherSupervisoryReturn'
             ->> 'returnDecisionEvidenceHash',
           ''
         )
       ) = 64

       AND length(
         COALESCE(
           NEW.metadata
             -> 'headteacherSupervisoryReturn'
             ->> 'reasonHash',
           ''
         )
       ) = 64

       AND (
         NEW.metadata
           -> 'headteacherSupervisoryReturn'
           -> 'preserveReturningReviewerForCorrection'
       ) = 'true'::jsonb

       AND (
         NEW.metadata
           -> 'headteacherSupervisoryReturn'
           -> 'reviewerMayRewriteScores'
       ) = 'false'::jsonb

       AND (
         NEW.metadata
           -> 'headteacherSupervisoryReturn'
           -> 'scoreMutationPerformed'
       ) = 'false'::jsonb

       AND (
         NEW.metadata
           -> 'headteacherSupervisoryReturn'
           -> 'staffFeedbackIncluded'
       ) = 'false'::jsonb

       AND (
         NEW.metadata
           -> 'headteacherSupervisoryReturn'
           -> 'respondentIdentitiesIncluded'
       ) = 'false'::jsonb

       AND (
         NEW.metadata
           -> 'headteacherSupervisoryReturn'
           -> 'providerCalled'
       ) = 'false'::jsonb
    THEN
      RETURN NEW;
    END IF;

    -- ---------------------------------------------------------
    -- TEACHER SUPERVISORY RETURN
    -- FINALIZED -> RETURNED
    --
    -- Only status, updatedAt and the dedicated nested
    -- teacherSupervisoryReturn provenance object may change.
    -- This admits the existing Teacher HOS/Director correction
    -- lifecycle without weakening terminal score/evidence locks.
    -- ---------------------------------------------------------
    IF OLD.status = 'FINALIZED'
       AND NEW.status = 'RETURNED'

       AND (
         to_jsonb(NEW)
           - 'status'
           - 'updatedAt'
           - 'metadata'
       ) = (
         to_jsonb(OLD)
           - 'status'
           - 'updatedAt'
           - 'metadata'
       )

       AND (
         COALESCE(NEW.metadata, '{}'::jsonb)
           - 'teacherSupervisoryReturn'
       ) = (
         COALESCE(OLD.metadata, '{}'::jsonb)
           - 'teacherSupervisoryReturn'
       )

       AND NOT (
         COALESCE(OLD.metadata, '{}'::jsonb)
           ? 'teacherSupervisoryReturn'
       )

       AND jsonb_typeof(
         COALESCE(NEW.metadata, '{}'::jsonb)
           -> 'teacherSupervisoryReturn'
       ) = 'object'

       AND (
         (
           NEW.metadata -> 'teacherSupervisoryReturn'
         )
           - 'schemaVersion'
           - 'sourceReviewId'
           - 'sourceReviewStage'
           - 'returningReviewerUserId'
           - 'returningReviewerAssignmentId'
           - 'returningReviewerRole'
           - 'sourceReviewEvidenceHash'
           - 'assessmentHash'
           - 'observationContextHash'
           - 'returnDecisionRequestHash'
           - 'returnDecisionEvidenceHash'
           - 'reasonHash'
           - 'reasonLength'
           - 'returnedAt'
           - 'preserveReturningReviewerForCorrection'
           - 'reviewerMayRewriteScores'
           - 'reviewerMayRewriteComment'
           - 'scoreMutationPerformed'
           - 'commentMutationPerformed'
           - 'legacyTeacherAppraisalIncluded'
           - 'combinedWeightingDefined'
           - 'providerCalled'
       ) = '{}'::jsonb

       AND COALESCE(
         NEW.metadata
           -> 'teacherSupervisoryReturn'
           ->> 'schemaVersion',
         ''
       ) = '1'

       AND jsonb_typeof(
         NEW.metadata
           -> 'teacherSupervisoryReturn'
           -> 'sourceReviewId'
       ) = 'string'

       AND length(
         btrim(
           COALESCE(
             NEW.metadata
               -> 'teacherSupervisoryReturn'
               ->> 'sourceReviewId',
             ''
           )
         )
       ) >= 5

       AND COALESCE(
         NULLIF(
           btrim(
             NEW.metadata
               -> 'teacherSupervisoryReturn'
               ->> 'sourceReviewStage'
           ),
           ''
         )::integer,
         0
       ) >= 1

       AND jsonb_typeof(
         NEW.metadata
           -> 'teacherSupervisoryReturn'
           -> 'returningReviewerUserId'
       ) = 'string'

       AND length(
         btrim(
           COALESCE(
             NEW.metadata
               -> 'teacherSupervisoryReturn'
               ->> 'returningReviewerUserId',
             ''
           )
         )
       ) >= 5

       AND jsonb_typeof(
         NEW.metadata
           -> 'teacherSupervisoryReturn'
           -> 'returningReviewerAssignmentId'
       ) = 'string'

       AND length(
         btrim(
           COALESCE(
             NEW.metadata
               -> 'teacherSupervisoryReturn'
               ->> 'returningReviewerAssignmentId',
             ''
           )
         )
       ) >= 5

       AND COALESCE(
         NEW.metadata
           -> 'teacherSupervisoryReturn'
           ->> 'returningReviewerRole',
         ''
       ) IN (
         'HEAD_OF_SUPERVISION',
         'DISTRICT_DIRECTOR'
       )

       AND length(
         COALESCE(
           NEW.metadata
             -> 'teacherSupervisoryReturn'
             ->> 'sourceReviewEvidenceHash',
           ''
         )
       ) = 64

       AND length(
         COALESCE(
           NEW.metadata
             -> 'teacherSupervisoryReturn'
             ->> 'assessmentHash',
           ''
         )
       ) = 64

       AND length(
         COALESCE(
           NEW.metadata
             -> 'teacherSupervisoryReturn'
             ->> 'observationContextHash',
           ''
         )
       ) = 64

       AND length(
         COALESCE(
           NEW.metadata
             -> 'teacherSupervisoryReturn'
             ->> 'returnDecisionRequestHash',
           ''
         )
       ) = 64

       AND length(
         COALESCE(
           NEW.metadata
             -> 'teacherSupervisoryReturn'
             ->> 'returnDecisionEvidenceHash',
           ''
         )
       ) = 64

       AND length(
         COALESCE(
           NEW.metadata
             -> 'teacherSupervisoryReturn'
             ->> 'reasonHash',
           ''
         )
       ) = 64

       AND COALESCE(
         NULLIF(
           btrim(
             NEW.metadata
               -> 'teacherSupervisoryReturn'
               ->> 'reasonLength'
           ),
           ''
         )::integer,
         0
       ) >= 3

       AND jsonb_typeof(
         NEW.metadata
           -> 'teacherSupervisoryReturn'
           -> 'returnedAt'
       ) = 'string'

       AND length(
         btrim(
           COALESCE(
             NEW.metadata
               -> 'teacherSupervisoryReturn'
               ->> 'returnedAt',
             ''
           )
         )
       ) >= 20

       AND (
         NEW.metadata
           -> 'teacherSupervisoryReturn'
           -> 'preserveReturningReviewerForCorrection'
       ) = 'true'::jsonb

       AND (
         NEW.metadata
           -> 'teacherSupervisoryReturn'
           -> 'reviewerMayRewriteScores'
       ) = 'false'::jsonb

       AND (
         NEW.metadata
           -> 'teacherSupervisoryReturn'
           -> 'reviewerMayRewriteComment'
       ) = 'false'::jsonb

       AND (
         NEW.metadata
           -> 'teacherSupervisoryReturn'
           -> 'scoreMutationPerformed'
       ) = 'false'::jsonb

       AND (
         NEW.metadata
           -> 'teacherSupervisoryReturn'
           -> 'commentMutationPerformed'
       ) = 'false'::jsonb

       AND (
         NEW.metadata
           -> 'teacherSupervisoryReturn'
           -> 'legacyTeacherAppraisalIncluded'
       ) = 'false'::jsonb

       AND (
         NEW.metadata
           -> 'teacherSupervisoryReturn'
           -> 'combinedWeightingDefined'
       ) = 'false'::jsonb

       AND (
         NEW.metadata
           -> 'teacherSupervisoryReturn'
           -> 'providerCalled'
       ) = 'false'::jsonb
    THEN
      RETURN NEW;
    END IF;

    -- ---------------------------------------------------------
    -- DISTRICT DIRECTOR GOVERNANCE RETURN
    -- FINALIZED -> RETURNED
    --
    -- The assessment evidence remains immutable. Only the exact
    -- Director-return provenance keys written by
    -- headteacherDirectorGovernanceReview.ts may be introduced
    -- or updated.
    -- ---------------------------------------------------------
    IF OLD.status = 'FINALIZED'
       AND NEW.status = 'RETURNED'

       -- J4 parity: Director may RETURN only a HOS-authored
       -- Headteacher assessment. The immutable evidence snapshot
       -- is the database-trusted authorship source.
       AND jsonb_typeof(
         to_jsonb(NEW)
           -> 'evidenceSnapshotJson'
           -> 'assessor'
       ) = 'object'

       AND regexp_replace(
         upper(
           COALESCE(
             NULLIF(
               btrim(
                 to_jsonb(NEW)
                   -> 'evidenceSnapshotJson'
                   -> 'assessor'
                   ->> 'role'
               ),
               ''
             ),
             NULLIF(
               btrim(
                 to_jsonb(NEW)
                   -> 'evidenceSnapshotJson'
                   -> 'assessor'
                   ->> 'assignmentRole'
               ),
               ''
             ),
             ''
           )
         ),
         '[-[:space:]]+',
         '_',
         'g'
       ) = 'HEAD_OF_SUPERVISION'

       AND (
         to_jsonb(NEW)
           - 'status'
           - 'updatedAt'
           - 'metadata'
       ) = (
         to_jsonb(OLD)
           - 'status'
           - 'updatedAt'
           - 'metadata'
       )

       AND (
         COALESCE(NEW.metadata, '{}'::jsonb)
           - 'returnedByDirectorReviewId'
           - 'returnedByDirectorReviewStage'
           - 'returnDecisionContractHash'
           - 'returnDecisionRequestHash'
           - 'returnedAt'
           - 'reviewerMayRewriteScores'
           - 'scoreMutationPerformed'
           - 'separateFromStaffFeedback'
           - 'combinedWeightingDefined'
           - 'providerCalled'
       ) = (
         COALESCE(OLD.metadata, '{}'::jsonb)
           - 'returnedByDirectorReviewId'
           - 'returnedByDirectorReviewStage'
           - 'returnDecisionContractHash'
           - 'returnDecisionRequestHash'
           - 'returnedAt'
           - 'reviewerMayRewriteScores'
           - 'scoreMutationPerformed'
           - 'separateFromStaffFeedback'
           - 'combinedWeightingDefined'
           - 'providerCalled'
       )

       AND jsonb_typeof(
         NEW.metadata -> 'returnedByDirectorReviewId'
       ) = 'string'

       AND length(
         btrim(
           COALESCE(
             NEW.metadata ->> 'returnedByDirectorReviewId',
             ''
           )
         )
       ) >= 5

       AND COALESCE(
         NULLIF(
           btrim(
             NEW.metadata ->> 'returnedByDirectorReviewStage'
           ),
           ''
         )::integer,
         0
       ) >= 1

       AND length(
         COALESCE(
           NEW.metadata ->> 'returnDecisionContractHash',
           ''
         )
       ) = 64

       AND length(
         COALESCE(
           NEW.metadata ->> 'returnDecisionRequestHash',
           ''
         )
       ) = 64

       AND jsonb_typeof(
         NEW.metadata -> 'returnedAt'
       ) = 'string'

       AND length(
         btrim(
           COALESCE(
             NEW.metadata ->> 'returnedAt',
             ''
           )
         )
       ) >= 20

       AND (
         NEW.metadata -> 'reviewerMayRewriteScores'
       ) = 'false'::jsonb

       AND (
         NEW.metadata -> 'scoreMutationPerformed'
       ) = 'false'::jsonb

       AND (
         NEW.metadata -> 'separateFromStaffFeedback'
       ) = 'true'::jsonb

       AND (
         NEW.metadata -> 'combinedWeightingDefined'
       ) = 'false'::jsonb

       AND (
         NEW.metadata -> 'providerCalled'
       ) = 'false'::jsonb
    THEN
      RETURN NEW;
    END IF;

    -- ---------------------------------------------------------
    -- CORRECTION REVISION CREATED
    -- RETURNED -> SUPERSEDED
    --
    -- Only exact revision-lineage metadata may change.
    -- ---------------------------------------------------------
    IF OLD.status = 'RETURNED'
       AND NEW.status = 'SUPERSEDED'

       AND (
         to_jsonb(NEW)
           - 'status'
           - 'updatedAt'
           - 'metadata'
       ) = (
         to_jsonb(OLD)
           - 'status'
           - 'updatedAt'
           - 'metadata'
       )

       AND (
         COALESCE(NEW.metadata, '{}'::jsonb)
           - 'supersededByAssessmentId'
           - 'supersededAt'
           - 'returnEvidenceHash'
           - 'returnAdmissionMode'
           - 'returnDecisionContractHash'
           - 'returnDecisionRequestHash'
           - 'reviewerMayRewriteScores'
           - 'providerCalled'
       ) = (
         COALESCE(OLD.metadata, '{}'::jsonb)
           - 'supersededByAssessmentId'
           - 'supersededAt'
           - 'returnEvidenceHash'
           - 'returnAdmissionMode'
           - 'returnDecisionContractHash'
           - 'returnDecisionRequestHash'
           - 'reviewerMayRewriteScores'
           - 'providerCalled'
       )

       AND jsonb_typeof(
         NEW.metadata -> 'supersededByAssessmentId'
       ) = 'string'

       AND length(
         btrim(
           COALESCE(
             NEW.metadata ->> 'supersededByAssessmentId',
             ''
           )
         )
       ) >= 5

       AND jsonb_typeof(
         NEW.metadata -> 'supersededAt'
       ) = 'string'

       AND length(
         btrim(
           COALESCE(
             NEW.metadata ->> 'supersededAt',
             ''
           )
         )
       ) >= 20

       AND length(
         COALESCE(
           NEW.metadata ->> 'returnEvidenceHash',
           ''
         )
       ) = 64

       AND (
         (
           COALESCE(
             NEW.metadata ->> 'returnAdmissionMode',
             ''
           ) = 'LEGACY_UNDER_REVIEW_RETURN'

           AND COALESCE(
             NEW.metadata ->> 'returnDecisionContractHash',
             ''
           ) = ''

           AND COALESCE(
             NEW.metadata ->> 'returnDecisionRequestHash',
             ''
           ) = ''
         )

         OR

         (
           COALESCE(
             NEW.metadata ->> 'returnAdmissionMode',
             ''
           ) = 'DIRECTOR_GOVERNANCE_RETURN'

           AND length(
             COALESCE(
               NEW.metadata ->> 'returnDecisionContractHash',
               ''
             )
           ) = 64

           AND length(
             COALESCE(
               NEW.metadata ->> 'returnDecisionRequestHash',
               ''
             )
           ) = 64
         )
       )

       AND (
         NEW.metadata -> 'reviewerMayRewriteScores'
       ) = 'false'::jsonb

       AND (
         NEW.metadata -> 'providerCalled'
       ) = 'false'::jsonb
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'FINALIZED_APPRAISAL_ASSESSMENT_IS_IMMUTABLE';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS appraisal_assessment_terminal_guard_trg
  ON edulife_os.appraisal_assessment;

CREATE TRIGGER appraisal_assessment_terminal_guard_trg
BEFORE DELETE OR UPDATE
ON edulife_os.appraisal_assessment
FOR EACH ROW
EXECUTE FUNCTION edulife_os.appraisal_guard_assessment_terminal();

COMMIT;
