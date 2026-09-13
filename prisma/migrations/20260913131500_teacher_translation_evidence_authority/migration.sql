-- GL-T1-P3-I1 — Teacher-verified translation evidence authority.
-- Additive only. No backfill. No LessonNote mutation. No translation runtime activation.
-- Pilot safety: shared-corpus eligibility is database-disabled until a later privacy/promotion gate.

BEGIN;

DO $translation_evidence_preflight$
BEGIN
  IF to_regclass('edulife_os."Tenant"') IS NULL THEN
    RAISE EXCEPTION 'TRANSLATION_EVIDENCE_TENANT_TABLE_MISSING';
  END IF;
  IF to_regclass('edulife_os."User"') IS NULL THEN
    RAISE EXCEPTION 'TRANSLATION_EVIDENCE_USER_TABLE_MISSING';
  END IF;
  IF to_regclass('edulife_os."Membership"') IS NULL THEN
    RAISE EXCEPTION 'TRANSLATION_EVIDENCE_MEMBERSHIP_TABLE_MISSING';
  END IF;
  IF to_regclass('edulife_os."LessonNote"') IS NULL THEN
    RAISE EXCEPTION 'TRANSLATION_EVIDENCE_LESSON_NOTE_TABLE_MISSING';
  END IF;
  IF to_regclass('edulife_os."AuditLog"') IS NULL THEN
    RAISE EXCEPTION 'TRANSLATION_EVIDENCE_AUDIT_TABLE_MISSING';
  END IF;
  IF to_regclass('edulife_os."LessonTranslationEvidence"') IS NOT NULL THEN
    RAISE EXCEPTION 'TRANSLATION_EVIDENCE_TABLE_ALREADY_EXISTS';
  END IF;
  IF to_regprocedure('edulife_os.lesson_translation_evidence_insert_guard()') IS NOT NULL THEN
    RAISE EXCEPTION 'TRANSLATION_EVIDENCE_INSERT_GUARD_ALREADY_EXISTS';
  END IF;
  IF to_regprocedure('edulife_os.lesson_translation_evidence_immutable_guard()') IS NOT NULL THEN
    RAISE EXCEPTION 'TRANSLATION_EVIDENCE_IMMUTABLE_GUARD_ALREADY_EXISTS';
  END IF;
END
$translation_evidence_preflight$;

CREATE TABLE edulife_os."LessonTranslationEvidence" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" text NOT NULL,
  "teacherUserId" text NOT NULL,
  "lessonNoteId" text NOT NULL,
  "fieldKey" varchar(48) NOT NULL,
  "sourceLanguage" varchar(16) NOT NULL DEFAULT 'en',
  "languageCode" varchar(40) NOT NULL,
  "registryVersion" varchar(80) NOT NULL,
  "normalizationVersion" varchar(64) NOT NULL DEFAULT 'EDULIFE_EDU_TEXT_NFC_V1',
  "sourceText" text NOT NULL,
  "sourceHash" varchar(64) NOT NULL,
  "suggestionSource" varchar(32) NOT NULL,
  "provider" varchar(80) NULL,
  "modelId" varchar(180) NULL,
  "modelRevision" varchar(180) NULL,
  "suggestedText" text NOT NULL,
  "suggestedHash" varchar(64) NOT NULL,
  "finalText" text NOT NULL,
  "finalHash" varchar(64) NOT NULL,
  "teacherAction" varchar(16) NOT NULL,
  "receiptId" uuid NOT NULL,
  "receiptVersion" varchar(64) NOT NULL DEFAULT 'EDULIFE_TRANSLATION_RECEIPT_V1',
  "corpusOptIn" boolean NOT NULL DEFAULT false,
  "corpusEligible" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "LessonTranslationEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LessonTranslationEvidence_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES edulife_os."Tenant"("id") ON DELETE RESTRICT,
  CONSTRAINT "LessonTranslationEvidence_teacher_fkey"
    FOREIGN KEY ("teacherUserId") REFERENCES edulife_os."User"("id") ON DELETE RESTRICT,
  CONSTRAINT "LessonTranslationEvidence_receipt_unique" UNIQUE ("receiptId"),
  CONSTRAINT "LessonTranslationEvidence_field_check"
    CHECK (
      "fieldKey" IN (
        'lessonTitle',
        'objectives',
        'teachingLearningResources',
        'introduction',
        'lessonDevelopment',
        'conclusion',
        'assessment',
        'homework'
      )
    ),
  CONSTRAINT "LessonTranslationEvidence_source_language_check"
    CHECK ("sourceLanguage" = 'en'),
  CONSTRAINT "LessonTranslationEvidence_language_check"
    CHECK (
      "languageCode" IN (
        'AKUAPEM_TWI', 'ASANTE_TWI', 'FANTE', 'NZEMA', 'GA', 'DANGME',
        'EWE', 'GONJA', 'KASEM', 'DAGBANI', 'DAGAARE'
      )
      AND "registryVersion" = 'GH_EDU_LANGUAGE_REGISTRY_V1'
    ),
  CONSTRAINT "LessonTranslationEvidence_normalization_check"
    CHECK ("normalizationVersion" = 'EDULIFE_EDU_TEXT_NFC_V1'),
  CONSTRAINT "LessonTranslationEvidence_text_bounds_check"
    CHECK (
      char_length(btrim("sourceText")) BETWEEN 1 AND 50000
      AND char_length(btrim("suggestedText")) BETWEEN 1 AND 50000
      AND char_length(btrim("finalText")) BETWEEN 1 AND 50000
    ),
  CONSTRAINT "LessonTranslationEvidence_hash_check"
    CHECK (
      "sourceHash" ~ '^[0-9a-f]{64}$'
      AND "suggestedHash" ~ '^[0-9a-f]{64}$'
      AND "finalHash" ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT "LessonTranslationEvidence_suggestion_provenance_check"
    CHECK (
      (
        "suggestionSource" = 'MODEL'
        AND char_length(btrim(COALESCE("provider", ''))) BETWEEN 1 AND 80
        AND char_length(btrim(COALESCE("modelId", ''))) BETWEEN 1 AND 180
        AND char_length(btrim(COALESCE("modelRevision", ''))) BETWEEN 1 AND 180
      )
      OR
      (
        "suggestionSource" IN ('PERSONAL_MEMORY', 'SCHOOL_MEMORY')
        AND "provider" IS NULL
        AND "modelId" IS NULL
        AND "modelRevision" IS NULL
      )
    ),
  CONSTRAINT "LessonTranslationEvidence_teacher_action_check"
    CHECK (
      (
        "teacherAction" = 'ACCEPTED'
        AND "suggestedText" = "finalText"
        AND "suggestedHash" = "finalHash"
      )
      OR
      (
        "teacherAction" = 'CORRECTED'
        AND "suggestedText" <> "finalText"
        AND "suggestedHash" <> "finalHash"
      )
    ),
  CONSTRAINT "LessonTranslationEvidence_receipt_version_check"
    CHECK ("receiptVersion" = 'EDULIFE_TRANSLATION_RECEIPT_V1'),
  CONSTRAINT "LessonTranslationEvidence_pilot_corpus_check"
    CHECK ("corpusEligible" = false)
);

CREATE INDEX "LessonTranslationEvidence_personal_lookup_idx"
  ON edulife_os."LessonTranslationEvidence" (
    "tenantId", "teacherUserId", "languageCode", "registryVersion",
    "fieldKey", "sourceHash", "createdAt"
  );

CREATE INDEX "LessonTranslationEvidence_consensus_lookup_idx"
  ON edulife_os."LessonTranslationEvidence" (
    "tenantId", "languageCode", "registryVersion", "fieldKey",
    "sourceHash", "finalHash", "teacherUserId"
  );

CREATE INDEX "LessonTranslationEvidence_note_provenance_idx"
  ON edulife_os."LessonTranslationEvidence" ("lessonNoteId", "createdAt");

CREATE OR REPLACE FUNCTION edulife_os.lesson_translation_evidence_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $lesson_translation_evidence_insert_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM edulife_os."Membership" m
    WHERE m."tenantId" = NEW."tenantId"
      AND m."userId" = NEW."teacherUserId"
      AND m."status"::text = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'TRANSLATION_EVIDENCE_TEACHER_MEMBERSHIP_INACTIVE';
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
    RAISE EXCEPTION 'TRANSLATION_EVIDENCE_LESSON_NOTE_AUTHORITY_MISMATCH';
  END IF;

  RETURN NEW;
END
$lesson_translation_evidence_insert_guard$;

CREATE OR REPLACE FUNCTION edulife_os.lesson_translation_evidence_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $lesson_translation_evidence_immutable_guard$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TRANSLATION_EVIDENCE_DELETE_FORBIDDEN';
  END IF;

  RAISE EXCEPTION 'TRANSLATION_EVIDENCE_UPDATE_FORBIDDEN';
END
$lesson_translation_evidence_immutable_guard$;

CREATE TRIGGER "LessonTranslationEvidence_insert_guard"
BEFORE INSERT ON edulife_os."LessonTranslationEvidence"
FOR EACH ROW
EXECUTE FUNCTION edulife_os.lesson_translation_evidence_insert_guard();

CREATE TRIGGER "LessonTranslationEvidence_immutable_guard"
BEFORE UPDATE OR DELETE ON edulife_os."LessonTranslationEvidence"
FOR EACH ROW
EXECUTE FUNCTION edulife_os.lesson_translation_evidence_immutable_guard();

COMMIT;
