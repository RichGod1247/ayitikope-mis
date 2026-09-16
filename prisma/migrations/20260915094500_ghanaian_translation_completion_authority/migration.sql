-- GL-T1-P3-I3-I2-S1-P3-I4-M2E-P2-P1 — Ghanaian-language translation completion authority.
-- Additive only. Adds LessonNote.keywords and current translation-completion proof.
-- Preserves immutable LessonTranslationEvidence and its exact V1 reusable-corpus whitelist.

BEGIN;

DO $translation_completion_preflight$
BEGIN
  IF to_regclass('edulife_os."Tenant"') IS NULL THEN
    RAISE EXCEPTION 'TRANSLATION_COMPLETION_TENANT_TABLE_MISSING';
  END IF;

  IF to_regclass('edulife_os."User"') IS NULL THEN
    RAISE EXCEPTION 'TRANSLATION_COMPLETION_USER_TABLE_MISSING';
  END IF;

  IF to_regclass('edulife_os."Membership"') IS NULL THEN
    RAISE EXCEPTION 'TRANSLATION_COMPLETION_MEMBERSHIP_TABLE_MISSING';
  END IF;

  IF to_regclass('edulife_os."LessonNote"') IS NULL THEN
    RAISE EXCEPTION 'TRANSLATION_COMPLETION_LESSON_NOTE_TABLE_MISSING';
  END IF;

  IF to_regclass('edulife_os."LessonTranslationEvidence"') IS NULL THEN
    RAISE EXCEPTION 'TRANSLATION_COMPLETION_EVIDENCE_AUTHORITY_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'edulife_os'
      AND table_name = 'LessonNote'
      AND column_name = 'keywords'
  ) THEN
    RAISE EXCEPTION 'TRANSLATION_COMPLETION_KEYWORDS_COLUMN_ALREADY_EXISTS';
  END IF;

  IF to_regclass('edulife_os."LessonTranslationCompletion"') IS NOT NULL THEN
    RAISE EXCEPTION 'TRANSLATION_COMPLETION_TABLE_ALREADY_EXISTS';
  END IF;

  IF to_regprocedure('edulife_os.lesson_translation_completion_guard()') IS NOT NULL THEN
    RAISE EXCEPTION 'TRANSLATION_COMPLETION_GUARD_ALREADY_EXISTS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel
      ON rel.oid = con.conrelid
    JOIN pg_namespace ns
      ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'edulife_os'
      AND rel.relname = 'LessonTranslationEvidence'
      AND con.conname = 'LessonTranslationEvidence_field_check'
  ) THEN
    RAISE EXCEPTION 'TRANSLATION_COMPLETION_EVIDENCE_FIELD_GUARD_MISSING';
  END IF;
END
$translation_completion_preflight$;

ALTER TABLE edulife_os."LessonNote"
ADD COLUMN "keywords" text;

CREATE TABLE edulife_os."LessonTranslationCompletion" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" text NOT NULL,
  "teacherUserId" text NOT NULL,
  "lessonNoteId" text NOT NULL,
  "fieldKey" varchar(48) NOT NULL,
  "sourceLanguage" varchar(16) NOT NULL DEFAULT 'en',
  "languageCode" varchar(40) NOT NULL,
  "registryVersion" varchar(80) NOT NULL,
  "normalizationVersion" varchar(64) NOT NULL DEFAULT 'EDULIFE_EDU_TEXT_NFC_V1',
  "sourceHash" varchar(64) NOT NULL,
  "suggestedHash" varchar(64) NOT NULL,
  "finalHash" varchar(64) NOT NULL,
  "teacherAction" varchar(16) NOT NULL,
  "receiptId" uuid NOT NULL,
  "receiptVersion" varchar(64) NOT NULL DEFAULT 'EDULIFE_TRANSLATION_RECEIPT_V1',
  "verifiedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "LessonTranslationCompletion_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "LessonTranslationCompletion_tenant_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES edulife_os."Tenant"("id")
    ON DELETE RESTRICT,

  CONSTRAINT "LessonTranslationCompletion_teacher_fkey"
    FOREIGN KEY ("teacherUserId")
    REFERENCES edulife_os."User"("id")
    ON DELETE RESTRICT,

  CONSTRAINT "LessonTranslationCompletion_note_fkey"
    FOREIGN KEY ("lessonNoteId")
    REFERENCES edulife_os."LessonNote"("id")
    ON DELETE CASCADE,

  CONSTRAINT "LessonTranslationCompletion_note_field_unique"
    UNIQUE ("lessonNoteId", "fieldKey"),

  CONSTRAINT "LessonTranslationCompletion_receipt_unique"
    UNIQUE ("receiptId"),

  CONSTRAINT "LessonTranslationCompletion_field_check"
    CHECK (
      "fieldKey" IN (
        'lessonTitle',
        'objectives',
        'priorKnowledge',
        'coreCompetencies',
        'keywords',
        'teachingLearningResources',
        'introduction',
        'lessonDevelopment',
        'conclusion',
        'assessment',
        'homework',
        'differentiationNotes',
        'reflectionNotes'
      )
    ),

  CONSTRAINT "LessonTranslationCompletion_source_language_check"
    CHECK ("sourceLanguage" = 'en'),

  CONSTRAINT "LessonTranslationCompletion_language_check"
    CHECK (
      "languageCode" IN (
        'AKUAPEM_TWI',
        'ASANTE_TWI',
        'FANTE',
        'NZEMA',
        'GA',
        'DANGME',
        'EWE',
        'GONJA',
        'KASEM',
        'DAGBANI',
        'DAGAARE'
      )
      AND "registryVersion" = 'GH_EDU_LANGUAGE_REGISTRY_V1'
    ),

  CONSTRAINT "LessonTranslationCompletion_normalization_check"
    CHECK ("normalizationVersion" = 'EDULIFE_EDU_TEXT_NFC_V1'),

  CONSTRAINT "LessonTranslationCompletion_hash_check"
    CHECK (
      "sourceHash" ~ '^[0-9a-f]{64}$'
      AND "suggestedHash" ~ '^[0-9a-f]{64}$'
      AND "finalHash" ~ '^[0-9a-f]{64}$'
    ),

  CONSTRAINT "LessonTranslationCompletion_teacher_action_check"
    CHECK ("teacherAction" IN ('ACCEPTED', 'CORRECTED')),

  CONSTRAINT "LessonTranslationCompletion_receipt_version_check"
    CHECK ("receiptVersion" = 'EDULIFE_TRANSLATION_RECEIPT_V1')
);

CREATE INDEX "LessonTranslationCompletion_teacher_note_idx"
ON edulife_os."LessonTranslationCompletion" (
  "tenantId",
  "teacherUserId",
  "lessonNoteId"
);

CREATE INDEX "LessonTranslationCompletion_note_verified_idx"
ON edulife_os."LessonTranslationCompletion" (
  "lessonNoteId",
  "verifiedAt"
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
      OR OLD."sourceLanguage" IS DISTINCT FROM NEW."sourceLanguage"
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

CREATE TRIGGER "LessonTranslationCompletion_guard"
BEFORE INSERT OR UPDATE
ON edulife_os."LessonTranslationCompletion"
FOR EACH ROW
EXECUTE FUNCTION edulife_os.lesson_translation_completion_guard();

COMMIT;
