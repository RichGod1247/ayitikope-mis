-- GL-P1-P4-R1-I1 — Ghanaian Language LessonNote subject-prefix parity repair.
-- Forward-only repair. The original GL-P1 migration remains immutable.
-- No LessonNote backfill. No language evidence rewrite. No trigger change.

BEGIN;

DO $gl_language_pair_prefix_preflight$
DECLARE
  current_definition text;
BEGIN
  IF to_regclass('edulife_os."LessonNote"') IS NULL THEN
    RAISE EXCEPTION 'GL_LANGUAGE_LESSON_NOTE_TABLE_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'edulife_os'
      AND table_name = 'LessonNote'
      AND column_name = 'lessonLanguageCode'
  ) THEN
    RAISE EXCEPTION 'GL_LANGUAGE_LESSON_LANGUAGE_CODE_COLUMN_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'edulife_os'
      AND table_name = 'LessonNote'
      AND column_name = 'languageRegistryVersion'
  ) THEN
    RAISE EXCEPTION 'GL_LANGUAGE_REGISTRY_VERSION_COLUMN_MISSING';
  END IF;

  SELECT pg_get_constraintdef(c.oid, true)
  INTO current_definition
  FROM pg_constraint c
  JOIN pg_class t
    ON t.oid = c.conrelid
  JOIN pg_namespace n
    ON n.oid = t.relnamespace
  WHERE n.nspname = 'edulife_os'
    AND t.relname = 'LessonNote'
    AND c.conname = 'LessonNote_language_pair_check'
    AND c.contype = 'c';

  IF current_definition IS NULL THEN
    RAISE EXCEPTION 'GL_LANGUAGE_PAIR_CHECK_MISSING';
  END IF;

  IF current_definition NOT LIKE '%GH_EDU_LANGUAGE_REGISTRY_V1%'
    OR current_definition NOT LIKE '%GHANAIANLANGUAGE%'
    OR current_definition NOT LIKE '%GHANAIANLANGUAGES%'
  THEN
    RAISE EXCEPTION 'GL_LANGUAGE_PAIR_CHECK_UNEXPECTED_BASELINE';
  END IF;
END
$gl_language_pair_prefix_preflight$;

ALTER TABLE edulife_os."LessonNote"
  DROP CONSTRAINT "LessonNote_language_pair_check";

ALTER TABLE edulife_os."LessonNote"
  ADD CONSTRAINT "LessonNote_language_pair_check"
  CHECK (
    ("lessonLanguageCode" IS NULL AND "languageRegistryVersion" IS NULL)
    OR
    (
      "lessonLanguageCode" IN (
        'AKUAPEM_TWI', 'ASANTE_TWI', 'FANTE', 'NZEMA', 'GA', 'DANGME',
        'EWE', 'GONJA', 'KASEM', 'DAGBANI', 'DAGAARE'
      )
      AND "languageRegistryVersion" = 'GH_EDU_LANGUAGE_REGISTRY_V1'
      AND regexp_replace(upper("subject"), '[^A-Z0-9]', '', 'g')
        ~ '^(?:(?:JHS[1-3]|JUNIORHIGHSCHOOL[1-3]|BASIC[1-9]|BS[1-9]|B[1-9]|P[1-6]|PRIMARY[1-6]|KG[1-2])?GHANAIANLANGUAGES?)$'
    )
  );

DO $gl_language_pair_prefix_postflight$
DECLARE
  subject_pattern constant text :=
    '^(?:(?:JHS[1-3]|JUNIORHIGHSCHOOL[1-3]|BASIC[1-9]|BS[1-9]|B[1-9]|P[1-6]|PRIMARY[1-6]|KG[1-2])?GHANAIANLANGUAGES?)$';
BEGIN
  IF NOT ('GHANAIANLANGUAGE' ~ subject_pattern) THEN
    RAISE EXCEPTION 'GL_LANGUAGE_PAIR_BASE_SUBJECT_REJECTED';
  END IF;

  IF NOT ('GHANAIANLANGUAGES' ~ subject_pattern) THEN
    RAISE EXCEPTION 'GL_LANGUAGE_PAIR_PLURAL_SUBJECT_REJECTED';
  END IF;

  IF NOT ('JHS2GHANAIANLANGUAGE' ~ subject_pattern) THEN
    RAISE EXCEPTION 'GL_LANGUAGE_PAIR_JHS2_SUBJECT_REJECTED';
  END IF;

  IF NOT ('JUNIORHIGHSCHOOL2GHANAIANLANGUAGE' ~ subject_pattern) THEN
    RAISE EXCEPTION 'GL_LANGUAGE_PAIR_JUNIOR_HIGH_SUBJECT_REJECTED';
  END IF;

  IF NOT ('BASIC8GHANAIANLANGUAGE' ~ subject_pattern) THEN
    RAISE EXCEPTION 'GL_LANGUAGE_PAIR_BASIC8_SUBJECT_REJECTED';
  END IF;

  IF NOT ('B8GHANAIANLANGUAGE' ~ subject_pattern) THEN
    RAISE EXCEPTION 'GL_LANGUAGE_PAIR_B8_SUBJECT_REJECTED';
  END IF;

  IF NOT ('P6GHANAIANLANGUAGE' ~ subject_pattern) THEN
    RAISE EXCEPTION 'GL_LANGUAGE_PAIR_PRIMARY_SHORT_SUBJECT_REJECTED';
  END IF;

  IF NOT ('PRIMARY6GHANAIANLANGUAGE' ~ subject_pattern) THEN
    RAISE EXCEPTION 'GL_LANGUAGE_PAIR_PRIMARY_SUBJECT_REJECTED';
  END IF;

  IF NOT ('KG2GHANAIANLANGUAGE' ~ subject_pattern) THEN
    RAISE EXCEPTION 'GL_LANGUAGE_PAIR_KG_SUBJECT_REJECTED';
  END IF;

  IF 'MATHEMATICSGHANAIANLANGUAGE' ~ subject_pattern THEN
    RAISE EXCEPTION 'GL_LANGUAGE_PAIR_UNRELATED_PREFIX_ACCEPTED';
  END IF;

  IF 'JHS4GHANAIANLANGUAGE' ~ subject_pattern THEN
    RAISE EXCEPTION 'GL_LANGUAGE_PAIR_INVALID_JHS_LEVEL_ACCEPTED';
  END IF;

  IF 'GHANAIANLANGUAGEEXTRA' ~ subject_pattern THEN
    RAISE EXCEPTION 'GL_LANGUAGE_PAIR_SUFFIX_DRIFT_ACCEPTED';
  END IF;
END
$gl_language_pair_prefix_postflight$;

COMMIT;
