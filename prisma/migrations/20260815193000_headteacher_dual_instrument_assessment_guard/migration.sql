-- N7-P2C3U
-- Adopt and refine the live appraisal-assessment consistency guard.
--
-- Provenance lock captured 2026-08-15 from production:
--   function: edulife_os.appraisal_validate_assessment_consistency()
--   normalized SHA-256:
--     cd152c3dad32fc10b8589a9fa399a202d411df6ae3920a6f92389751c2408fe8
--   trigger:
--     edulife_os.appraisal_assessment_consistency_trg
--   repository/Git owner before this migration: absent
--   Prisma migration-ledger owner before this migration: absent
--
-- Historical invariant:
--   appraisal_assessment.instrumentVersionId must equal the parent
--   appraisal_cycle.instrumentVersionId.
--
-- Finalized domain invariant:
--   1. Preserve the historical same-version rule for every ordinary
--      assessment/cycle relationship.
--   2. Permit exactly one cross-version relationship:
--        cycle      = HEADTEACHER_STAFF_FEEDBACK_V1 / version 1 / ACTIVE
--        assessment = HEADTEACHER_SUPERVISORY_ASSESSMENT_V1 / version 1 / ACTIVE
--        target role snapshot = HEADTEACHER
--      Both instruments themselves must also be active and retain their
--      expected purpose/subject identities.
--   3. Reject every other version mismatch.
--   4. Preserve assessor-assignment/user consistency.
--
-- No production UUIDs are embedded. Institutional identity is resolved
-- through source-controlled instrument codes and publication metadata.

CREATE OR REPLACE FUNCTION edulife_os.appraisal_validate_assessment_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'edulife_os', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  cycle_version uuid;
  cycle_target_role text;

  cycle_instrument_code text;
  cycle_instrument_purpose text;
  cycle_instrument_subject_type text;
  cycle_instrument_active boolean;
  cycle_instrument_version integer;
  cycle_instrument_version_status text;

  assessment_instrument_code text;
  assessment_instrument_purpose text;
  assessment_instrument_subject_type text;
  assessment_instrument_active boolean;
  assessment_instrument_version integer;
  assessment_instrument_version_status text;

  dual_instrument_headteacher_allowed boolean := false;
  assignment_user text;
BEGIN
  SELECT
    c."instrumentVersionId",
    c."targetRoleSnapshot",
    i.code,
    i.purpose::text,
    i."subjectType"::text,
    i."isActive",
    v.version,
    v.status::text
  INTO
    cycle_version,
    cycle_target_role,
    cycle_instrument_code,
    cycle_instrument_purpose,
    cycle_instrument_subject_type,
    cycle_instrument_active,
    cycle_instrument_version,
    cycle_instrument_version_status
  FROM edulife_os.appraisal_cycle AS c
  JOIN edulife_os.appraisal_instrument_version AS v
    ON v.id = c."instrumentVersionId"
  JOIN edulife_os.appraisal_instrument AS i
    ON i.id = v."instrumentId"
  WHERE c.id = NEW."cycleId";

  IF cycle_version IS NULL THEN
    RAISE EXCEPTION 'APPRAISAL_ASSESSMENT_VERSION_MISMATCH';
  END IF;

  IF cycle_version <> NEW."instrumentVersionId" THEN
    SELECT
      i.code,
      i.purpose::text,
      i."subjectType"::text,
      i."isActive",
      v.version,
      v.status::text
    INTO
      assessment_instrument_code,
      assessment_instrument_purpose,
      assessment_instrument_subject_type,
      assessment_instrument_active,
      assessment_instrument_version,
      assessment_instrument_version_status
    FROM edulife_os.appraisal_instrument_version AS v
    JOIN edulife_os.appraisal_instrument AS i
      ON i.id = v."instrumentId"
    WHERE v.id = NEW."instrumentVersionId";

    dual_instrument_headteacher_allowed :=
      UPPER(COALESCE(cycle_target_role, '')) = 'HEADTEACHER'
      AND cycle_instrument_code = 'HEADTEACHER_STAFF_FEEDBACK_V1'
      AND cycle_instrument_purpose = 'HEADTEACHER_STAFF_FEEDBACK'
      AND cycle_instrument_subject_type = 'HEADTEACHER'
      AND cycle_instrument_active IS TRUE
      AND cycle_instrument_version = 1
      AND cycle_instrument_version_status = 'ACTIVE'
      AND assessment_instrument_code = 'HEADTEACHER_SUPERVISORY_ASSESSMENT_V1'
      AND assessment_instrument_purpose = 'HEADTEACHER_SUPERVISORY_ASSESSMENT'
      AND assessment_instrument_subject_type = 'HEADTEACHER'
      AND assessment_instrument_active IS TRUE
      AND assessment_instrument_version = 1
      AND assessment_instrument_version_status = 'ACTIVE';

    IF NOT dual_instrument_headteacher_allowed THEN
      RAISE EXCEPTION 'APPRAISAL_ASSESSMENT_VERSION_MISMATCH';
    END IF;
  END IF;

  IF NEW."assessorAssignmentId" IS NOT NULL THEN
    SELECT "userId"
      INTO assignment_user
    FROM edulife_os."GovernanceOfficerAssignment"
    WHERE id = NEW."assessorAssignmentId";

    IF assignment_user IS NULL
       OR assignment_user <> NEW."assessorUserId" THEN
      RAISE EXCEPTION 'APPRAISAL_ASSESSMENT_ASSIGNMENT_USER_MISMATCH';
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

DO $adopt_trigger$
DECLARE
  existing_function_name text;
  existing_function_schema text;
  existing_trigger_type smallint;
BEGIN
  SELECT
    p.proname,
    pn.nspname,
    t.tgtype
  INTO
    existing_function_name,
    existing_function_schema,
    existing_trigger_type
  FROM pg_trigger AS t
  JOIN pg_class AS c
    ON c.oid = t.tgrelid
  JOIN pg_namespace AS n
    ON n.oid = c.relnamespace
  JOIN pg_proc AS p
    ON p.oid = t.tgfoid
  JOIN pg_namespace AS pn
    ON pn.oid = p.pronamespace
  WHERE n.nspname = 'edulife_os'
    AND c.relname = 'appraisal_assessment'
    AND t.tgname = 'appraisal_assessment_consistency_trg'
    AND NOT t.tgisinternal;

  IF existing_function_name IS NULL THEN
    CREATE TRIGGER appraisal_assessment_consistency_trg
    BEFORE INSERT OR UPDATE
    ON edulife_os.appraisal_assessment
    FOR EACH ROW
    EXECUTE FUNCTION edulife_os.appraisal_validate_assessment_consistency();

  ELSIF existing_function_name <> 'appraisal_validate_assessment_consistency'
     OR existing_function_schema <> 'edulife_os'
     OR existing_trigger_type <> 23 THEN
    RAISE EXCEPTION 'APPRAISAL_ASSESSMENT_CONSISTENCY_TRIGGER_DRIFT';
  END IF;
END
$adopt_trigger$;
