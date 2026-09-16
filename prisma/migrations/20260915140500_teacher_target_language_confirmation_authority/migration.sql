-- P2-P2 — teacher-confirmed existing target-language completion authority.
-- Evolves current completion state without mutating immutable LessonTranslationEvidence.
-- UAT was applied manually first and proven GREEN before this source migration was authored.

BEGIN;

DO $p2_p2_existing_language_preflight$
BEGIN
  IF to_regclass('edulife_os."LessonTranslationCompletion"') IS NULL THEN
    RAISE EXCEPTION 'P2_P2_COMPLETION_TABLE_MISSING';
  END IF;

  IF to_regclass('edulife_os."LessonTranslationEvidence"') IS NULL THEN
    RAISE EXCEPTION 'P2_P2_EVIDENCE_TABLE_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'edulife_os'
      AND table_name = 'LessonTranslationCompletion'
      AND column_name IN ('completionMethod', 'confirmationVersion')
  ) THEN
    RAISE EXCEPTION 'P2_P2_CONFIRMATION_COLUMNS_ALREADY_EXIST';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'edulife_os'
      AND rel.relname = 'LessonTranslationCompletion'
      AND con.conname = 'LessonTranslationCompletion_source_language_check'
  ) THEN
    RAISE EXCEPTION 'P2_P2_SOURCE_LANGUAGE_CONSTRAINT_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'edulife_os'
      AND rel.relname = 'LessonTranslationCompletion'
      AND con.conname = 'LessonTranslationCompletion_hash_check'
  ) THEN
    RAISE EXCEPTION 'P2_P2_HASH_CONSTRAINT_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'edulife_os'
      AND rel.relname = 'LessonTranslationCompletion'
      AND con.conname = 'LessonTranslationCompletion_teacher_action_check'
  ) THEN
    RAISE EXCEPTION 'P2_P2_TEACHER_ACTION_CONSTRAINT_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'edulife_os'
      AND rel.relname = 'LessonTranslationCompletion'
      AND con.conname = 'LessonTranslationCompletion_receipt_version_check'
  ) THEN
    RAISE EXCEPTION 'P2_P2_RECEIPT_CONSTRAINT_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM edulife_os."LessonTranslationCompletion"
    WHERE "sourceLanguage" IS DISTINCT FROM 'en'
       OR "sourceHash" IS NULL
       OR "sourceHash" !~ '^[0-9a-f]{64}$'
       OR "suggestedHash" IS NULL
       OR "suggestedHash" !~ '^[0-9a-f]{64}$'
       OR "finalHash" IS NULL
       OR "finalHash" !~ '^[0-9a-f]{64}$'
       OR "receiptId" IS NULL
       OR "receiptVersion" IS DISTINCT FROM 'EDULIFE_TRANSLATION_RECEIPT_V1'
       OR "teacherAction" NOT IN ('ACCEPTED', 'CORRECTED')
       OR ("teacherAction" = 'ACCEPTED' AND "suggestedHash" IS DISTINCT FROM "finalHash")
       OR ("teacherAction" = 'CORRECTED' AND "suggestedHash" IS NOT DISTINCT FROM "finalHash")
  ) THEN
    RAISE EXCEPTION 'P2_P2_EXISTING_COMPLETION_ROW_CONTRACT_DRIFT';
  END IF;
END
$p2_p2_existing_language_preflight$;

ALTER TABLE edulife_os."LessonTranslationCompletion"
ADD COLUMN "completionMethod" varchar(48);

ALTER TABLE edulife_os."LessonTranslationCompletion"
ADD COLUMN "confirmationVersion" varchar(64);

UPDATE edulife_os."LessonTranslationCompletion"
SET "completionMethod" = 'TRANSLATION_RECEIPT'
WHERE "completionMethod" IS NULL;

ALTER TABLE edulife_os."LessonTranslationCompletion"
ALTER COLUMN "completionMethod" SET NOT NULL;

ALTER TABLE edulife_os."LessonTranslationCompletion"
ALTER COLUMN "sourceLanguage" DROP NOT NULL;
ALTER TABLE edulife_os."LessonTranslationCompletion"
ALTER COLUMN "sourceLanguage" DROP DEFAULT;
ALTER TABLE edulife_os."LessonTranslationCompletion"
ALTER COLUMN "sourceHash" DROP NOT NULL;
ALTER TABLE edulife_os."LessonTranslationCompletion"
ALTER COLUMN "suggestedHash" DROP NOT NULL;
ALTER TABLE edulife_os."LessonTranslationCompletion"
ALTER COLUMN "receiptId" DROP NOT NULL;
ALTER TABLE edulife_os."LessonTranslationCompletion"
ALTER COLUMN "receiptVersion" DROP NOT NULL;
ALTER TABLE edulife_os."LessonTranslationCompletion"
ALTER COLUMN "receiptVersion" DROP DEFAULT;

ALTER TABLE edulife_os."LessonTranslationCompletion"
DROP CONSTRAINT "LessonTranslationCompletion_source_language_check";
ALTER TABLE edulife_os."LessonTranslationCompletion"
DROP CONSTRAINT "LessonTranslationCompletion_hash_check";
ALTER TABLE edulife_os."LessonTranslationCompletion"
DROP CONSTRAINT "LessonTranslationCompletion_teacher_action_check";
ALTER TABLE edulife_os."LessonTranslationCompletion"
DROP CONSTRAINT "LessonTranslationCompletion_receipt_version_check";

ALTER TABLE edulife_os."LessonTranslationCompletion"
ADD CONSTRAINT "LessonTranslationCompletion_method_check"
CHECK ("completionMethod" IN ('TRANSLATION_RECEIPT', 'TEACHER_TARGET_LANGUAGE_CONFIRMATION'));

ALTER TABLE edulife_os."LessonTranslationCompletion"
ADD CONSTRAINT "LessonTranslationCompletion_source_language_check"
CHECK (
  ("completionMethod" = 'TRANSLATION_RECEIPT' AND "sourceLanguage" = 'en')
  OR
  ("completionMethod" = 'TEACHER_TARGET_LANGUAGE_CONFIRMATION' AND "sourceLanguage" IS NULL)
);

ALTER TABLE edulife_os."LessonTranslationCompletion"
ADD CONSTRAINT "LessonTranslationCompletion_hash_check"
CHECK (
  "finalHash" IS NOT NULL
  AND "finalHash" ~ '^[0-9a-f]{64}$'
  AND (
    (
      "completionMethod" = 'TRANSLATION_RECEIPT'
      AND "sourceHash" IS NOT NULL
      AND "sourceHash" ~ '^[0-9a-f]{64}$'
      AND "suggestedHash" IS NOT NULL
      AND "suggestedHash" ~ '^[0-9a-f]{64}$'
    )
    OR
    (
      "completionMethod" = 'TEACHER_TARGET_LANGUAGE_CONFIRMATION'
      AND "sourceHash" IS NULL
      AND "suggestedHash" IS NULL
    )
  )
);

ALTER TABLE edulife_os."LessonTranslationCompletion"
ADD CONSTRAINT "LessonTranslationCompletion_teacher_action_check"
CHECK (
  (
    "completionMethod" = 'TRANSLATION_RECEIPT'
    AND (
      ("teacherAction" = 'ACCEPTED' AND "suggestedHash" IS NOT NULL AND "suggestedHash" = "finalHash")
      OR
      ("teacherAction" = 'CORRECTED' AND "suggestedHash" IS NOT NULL AND "suggestedHash" <> "finalHash")
    )
  )
  OR
  ("completionMethod" = 'TEACHER_TARGET_LANGUAGE_CONFIRMATION' AND "teacherAction" = 'CONFIRMED')
);

ALTER TABLE edulife_os."LessonTranslationCompletion"
ADD CONSTRAINT "LessonTranslationCompletion_receipt_version_check"
CHECK (
  (
    "completionMethod" = 'TRANSLATION_RECEIPT'
    AND "receiptId" IS NOT NULL
    AND "receiptVersion" = 'EDULIFE_TRANSLATION_RECEIPT_V1'
    AND "confirmationVersion" IS NULL
  )
  OR
  (
    "completionMethod" = 'TEACHER_TARGET_LANGUAGE_CONFIRMATION'
    AND "receiptId" IS NULL
    AND "receiptVersion" IS NULL
    AND "confirmationVersion" = 'EDULIFE_TARGET_LANGUAGE_CONFIRMATION_V1'
  )
);

CREATE OR REPLACE FUNCTION edulife_os.lesson_translation_completion_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $lesson_translation_completion_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM edulife_os."Membership" m
    WHERE m."tenantId" = NEW."tenantId"
      AND m."userId" = NEW."teacherUserId"
      AND m."status"::text = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'TRANSLATION_COMPLETION_TEACHER_MEMBERSHIP_INACTIVE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM edulife_os."LessonNote" n
    WHERE n."id" = NEW."lessonNoteId"
      AND n."tenantId" = NEW."tenantId"
      AND n."teacherUserId" = NEW."teacherUserId"
      AND n."lessonLanguageCode" = NEW."languageCode"
      AND n."languageRegistryVersion" = NEW."registryVersion"
  ) THEN
    RAISE EXCEPTION 'TRANSLATION_COMPLETION_LESSON_NOTE_AUTHORITY_MISMATCH';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."tenantId" IS DISTINCT FROM NEW."tenantId"
      OR OLD."teacherUserId" IS DISTINCT FROM NEW."teacherUserId"
      OR OLD."lessonNoteId" IS DISTINCT FROM NEW."lessonNoteId"
      OR OLD."fieldKey" IS DISTINCT FROM NEW."fieldKey"
      OR OLD."languageCode" IS DISTINCT FROM NEW."languageCode"
      OR OLD."registryVersion" IS DISTINCT FROM NEW."registryVersion"
      OR OLD."normalizationVersion" IS DISTINCT FROM NEW."normalizationVersion"
    THEN
      RAISE EXCEPTION 'TRANSLATION_COMPLETION_IDENTITY_IMMUTABLE';
    END IF;
  END IF;

  NEW."updatedAt" := now();
  RETURN NEW;
END
$lesson_translation_completion_guard$;

DO $p2_p2_existing_language_postflight$
DECLARE
  v_columns integer;
  v_constraints integer;
  v_indexes integer;
  v_triggers integer;
BEGIN
  SELECT count(*) INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'edulife_os'
    AND table_name = 'LessonTranslationCompletion';

  SELECT count(*) INTO v_constraints
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'edulife_os'
    AND rel.relname = 'LessonTranslationCompletion';

  SELECT count(*) INTO v_indexes
  FROM pg_indexes
  WHERE schemaname = 'edulife_os'
    AND tablename = 'LessonTranslationCompletion';

  SELECT count(*) INTO v_triggers
  FROM pg_trigger tg
  JOIN pg_class rel ON rel.oid = tg.tgrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'edulife_os'
    AND rel.relname = 'LessonTranslationCompletion'
    AND NOT tg.tgisinternal;

  IF v_columns <> 19 THEN
    RAISE EXCEPTION 'P2_P2_COLUMN_COUNT_DRIFT: %', v_columns;
  END IF;
  IF v_constraints <> 14 THEN
    RAISE EXCEPTION 'P2_P2_CONSTRAINT_COUNT_DRIFT: %', v_constraints;
  END IF;
  IF v_indexes <> 5 THEN
    RAISE EXCEPTION 'P2_P2_INDEX_COUNT_DRIFT: %', v_indexes;
  END IF;
  IF v_triggers <> 1 THEN
    RAISE EXCEPTION 'P2_P2_TRIGGER_COUNT_DRIFT: %', v_triggers;
  END IF;
END
$p2_p2_existing_language_postflight$;

COMMIT;
