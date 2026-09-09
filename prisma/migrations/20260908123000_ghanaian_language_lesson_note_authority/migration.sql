-- GL-P1-I1 — Ghanaian Language lesson-note infrastructure authority.
-- Additive only. No guessed backfill. Existing Lesson Notes remain valid with null language evidence.

BEGIN;

DO $gl_language_preflight$
BEGIN
  IF to_regclass('edulife_os."Tenant"') IS NULL THEN
    RAISE EXCEPTION 'GL_LANGUAGE_TENANT_TABLE_MISSING';
  END IF;
  IF to_regclass('edulife_os."User"') IS NULL THEN
    RAISE EXCEPTION 'GL_LANGUAGE_USER_TABLE_MISSING';
  END IF;
  IF to_regclass('edulife_os."Membership"') IS NULL THEN
    RAISE EXCEPTION 'GL_LANGUAGE_MEMBERSHIP_TABLE_MISSING';
  END IF;
  IF to_regclass('edulife_os."Classroom"') IS NULL THEN
    RAISE EXCEPTION 'GL_LANGUAGE_CLASSROOM_TABLE_MISSING';
  END IF;
  IF to_regclass('edulife_os."LessonNote"') IS NULL THEN
    RAISE EXCEPTION 'GL_LANGUAGE_LESSON_NOTE_TABLE_MISSING';
  END IF;
  IF to_regclass('edulife_os."AuditLog"') IS NULL THEN
    RAISE EXCEPTION 'GL_LANGUAGE_AUDIT_TABLE_MISSING';
  END IF;
  IF to_regclass('edulife_os."TeacherLessonLanguageSetting"') IS NOT NULL THEN
    RAISE EXCEPTION 'GL_LANGUAGE_SETTING_TABLE_ALREADY_EXISTS';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'edulife_os'
      AND table_name = 'LessonNote'
      AND column_name IN ('lessonLanguageCode', 'languageRegistryVersion')
  ) THEN
    RAISE EXCEPTION 'GL_LANGUAGE_LESSON_NOTE_COLUMNS_ALREADY_EXIST';
  END IF;
  IF to_regprocedure('edulife_os.teacher_lesson_language_setting_insert_guard()') IS NOT NULL THEN
    RAISE EXCEPTION 'GL_LANGUAGE_SETTING_INSERT_GUARD_ALREADY_EXISTS';
  END IF;
  IF to_regprocedure('edulife_os.teacher_lesson_language_setting_evidence_guard()') IS NOT NULL THEN
    RAISE EXCEPTION 'GL_LANGUAGE_SETTING_EVIDENCE_GUARD_ALREADY_EXISTS';
  END IF;
  IF to_regprocedure('edulife_os.lesson_note_language_evidence_guard()') IS NOT NULL THEN
    RAISE EXCEPTION 'GL_LANGUAGE_LESSON_NOTE_GUARD_ALREADY_EXISTS';
  END IF;
END
$gl_language_preflight$;

CREATE TABLE edulife_os."TeacherLessonLanguageSetting" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" text NOT NULL,
  "teacherUserId" text NOT NULL,
  "classroomId" text NOT NULL,
  "subject" varchar(120) NOT NULL,
  "subjectNorm" varchar(120) NOT NULL,
  "languageCode" varchar(40) NOT NULL,
  "registryVersion" varchar(80) NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "retiredAt" timestamptz NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "TeacherLessonLanguageSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeacherLessonLanguageSetting_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES edulife_os."Tenant"("id") ON DELETE RESTRICT,
  CONSTRAINT "TeacherLessonLanguageSetting_teacher_fkey"
    FOREIGN KEY ("teacherUserId") REFERENCES edulife_os."User"("id") ON DELETE RESTRICT,
  CONSTRAINT "TeacherLessonLanguageSetting_classroom_fkey"
    FOREIGN KEY ("classroomId") REFERENCES edulife_os."Classroom"("id") ON DELETE RESTRICT,
  CONSTRAINT "TeacherLessonLanguageSetting_subject_check"
    CHECK (
      length(btrim("subject")) BETWEEN 1 AND 120
      AND "subjectNorm" = 'GHANAIANLANGUAGE'
    ),
  CONSTRAINT "TeacherLessonLanguageSetting_language_check"
    CHECK (
      "languageCode" IN (
        'AKUAPEM_TWI', 'ASANTE_TWI', 'FANTE', 'NZEMA', 'GA', 'DANGME',
        'EWE', 'GONJA', 'KASEM', 'DAGBANI', 'DAGAARE'
      )
      AND "registryVersion" = 'GH_EDU_LANGUAGE_REGISTRY_V1'
    ),
  CONSTRAINT "TeacherLessonLanguageSetting_lifecycle_check"
    CHECK (
      ("isActive" = true AND "retiredAt" IS NULL)
      OR ("isActive" = false AND "retiredAt" IS NOT NULL)
    ),
  CONSTRAINT "TeacherLessonLanguageSetting_updated_timeline_check"
    CHECK ("updatedAt" >= "createdAt")
);

CREATE UNIQUE INDEX "TeacherLessonLanguageSetting_active_unique"
  ON edulife_os."TeacherLessonLanguageSetting" (
    "tenantId", "teacherUserId", "classroomId", "subjectNorm"
  )
  WHERE "isActive" = true;

CREATE INDEX "TeacherLessonLanguageSetting_teacher_active_idx"
  ON edulife_os."TeacherLessonLanguageSetting" (
    "tenantId", "teacherUserId", "isActive", "classroomId", "subjectNorm"
  );

ALTER TABLE edulife_os."LessonNote"
  ADD COLUMN "lessonLanguageCode" varchar(40) NULL,
  ADD COLUMN "languageRegistryVersion" varchar(80) NULL;

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
      AND regexp_replace(upper("subject"), '[^A-Z0-9]', '', 'g') IN ('GHANAIANLANGUAGE', 'GHANAIANLANGUAGES')
    )
  );

CREATE INDEX "LessonNote_language_idx"
  ON edulife_os."LessonNote" ("tenantId", "lessonLanguageCode")
  WHERE "lessonLanguageCode" IS NOT NULL;

CREATE OR REPLACE FUNCTION edulife_os.teacher_lesson_language_setting_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $teacher_lesson_language_setting_insert_guard$
BEGIN
  IF NEW."isActive" IS DISTINCT FROM true OR NEW."retiredAt" IS NOT NULL THEN
    RAISE EXCEPTION 'GL_LANGUAGE_NEW_SETTING_MUST_BE_ACTIVE';
  END IF;

  IF NEW."subjectNorm" IS DISTINCT FROM 'GHANAIANLANGUAGE' THEN
    RAISE EXCEPTION 'GL_LANGUAGE_SUBJECT_NOT_GHANAIAN_LANGUAGE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM edulife_os."Classroom" c
    WHERE c."id" = NEW."classroomId"
      AND c."tenantId" = NEW."tenantId"
      AND c."status"::text = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'GL_LANGUAGE_CLASSROOM_TENANT_SCOPE_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM edulife_os."Membership" m
    WHERE m."tenantId" = NEW."tenantId"
      AND m."userId" = NEW."teacherUserId"
      AND m."status"::text = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'GL_LANGUAGE_TEACHER_MEMBERSHIP_INACTIVE';
  END IF;

  RETURN NEW;
END
$teacher_lesson_language_setting_insert_guard$;

CREATE OR REPLACE FUNCTION edulife_os.teacher_lesson_language_setting_evidence_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $teacher_lesson_language_setting_evidence_guard$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'GL_LANGUAGE_SETTING_DELETE_FORBIDDEN';
  END IF;

  IF OLD."isActive" = false THEN
    RAISE EXCEPTION 'GL_LANGUAGE_RETIRED_SETTING_IMMUTABLE';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."teacherUserId" IS DISTINCT FROM OLD."teacherUserId"
    OR NEW."classroomId" IS DISTINCT FROM OLD."classroomId"
    OR NEW."subject" IS DISTINCT FROM OLD."subject"
    OR NEW."subjectNorm" IS DISTINCT FROM OLD."subjectNorm"
    OR NEW."languageCode" IS DISTINCT FROM OLD."languageCode"
    OR NEW."registryVersion" IS DISTINCT FROM OLD."registryVersion"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'GL_LANGUAGE_SETTING_CONTENT_IMMUTABLE';
  END IF;

  IF NOT (
    OLD."isActive" = true
    AND OLD."retiredAt" IS NULL
    AND NEW."isActive" = false
    AND NEW."retiredAt" IS NOT NULL
    AND NEW."updatedAt" >= OLD."updatedAt"
  ) THEN
    RAISE EXCEPTION 'GL_LANGUAGE_INVALID_RETIREMENT_TRANSITION';
  END IF;

  RETURN NEW;
END
$teacher_lesson_language_setting_evidence_guard$;

CREATE OR REPLACE FUNCTION edulife_os.lesson_note_language_evidence_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $lesson_note_language_evidence_guard$
BEGIN
  IF OLD."lessonLanguageCode" IS NOT NULL THEN
    IF NEW."lessonLanguageCode" IS DISTINCT FROM OLD."lessonLanguageCode"
      OR NEW."languageRegistryVersion" IS DISTINCT FROM OLD."languageRegistryVersion"
    THEN
      RAISE EXCEPTION 'LESSON_NOTE_LANGUAGE_EVIDENCE_IMMUTABLE';
    END IF;
  ELSIF NEW."lessonLanguageCode" IS NOT NULL THEN
    IF upper(COALESCE(OLD."status", '')) NOT IN ('DRAFT', 'REJECTED') THEN
      RAISE EXCEPTION 'LESSON_NOTE_LANGUAGE_LATE_FREEZE_FORBIDDEN';
    END IF;
  END IF;

  RETURN NEW;
END
$lesson_note_language_evidence_guard$;

CREATE TRIGGER "TeacherLessonLanguageSetting_insert_guard"
BEFORE INSERT ON edulife_os."TeacherLessonLanguageSetting"
FOR EACH ROW
EXECUTE FUNCTION edulife_os.teacher_lesson_language_setting_insert_guard();

CREATE TRIGGER "TeacherLessonLanguageSetting_evidence_guard"
BEFORE UPDATE OR DELETE ON edulife_os."TeacherLessonLanguageSetting"
FOR EACH ROW
EXECUTE FUNCTION edulife_os.teacher_lesson_language_setting_evidence_guard();

CREATE TRIGGER "LessonNote_language_evidence_guard"
BEFORE UPDATE ON edulife_os."LessonNote"
FOR EACH ROW
EXECUTE FUNCTION edulife_os.lesson_note_language_evidence_guard();

COMMIT;
