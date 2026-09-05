-- UI-LESSONNOTE-P1 — Teacher lesson timetable settings authority.
-- Weekly recurring timetable evidence used to populate Lesson Note print day/time.
-- Additive only. Existing Lesson Notes, Scheme of Work, assignments and delivery evidence are untouched.

BEGIN;

DO $lesson_timetable_preflight$
BEGIN
  IF to_regclass('edulife_os."Tenant"') IS NULL THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_TENANT_TABLE_MISSING';
  END IF;

  IF to_regclass('edulife_os."User"') IS NULL THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_USER_TABLE_MISSING';
  END IF;

  IF to_regclass('edulife_os."Membership"') IS NULL THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_MEMBERSHIP_TABLE_MISSING';
  END IF;

  IF to_regclass('edulife_os."Classroom"') IS NULL THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_CLASSROOM_TABLE_MISSING';
  END IF;

  IF to_regclass('edulife_os."AuditLog"') IS NULL THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_AUDIT_TABLE_MISSING';
  END IF;

  IF to_regclass('edulife_os."TeacherLessonTimetableEntry"') IS NOT NULL THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_TABLE_ALREADY_EXISTS';
  END IF;

  IF to_regprocedure('edulife_os.teacher_lesson_timetable_insert_guard()') IS NOT NULL THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_INSERT_GUARD_ALREADY_EXISTS';
  END IF;

  IF to_regprocedure('edulife_os.teacher_lesson_timetable_evidence_guard()') IS NOT NULL THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_EVIDENCE_GUARD_ALREADY_EXISTS';
  END IF;
END
$lesson_timetable_preflight$;

CREATE TABLE edulife_os."TeacherLessonTimetableEntry" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" text NOT NULL,
  "teacherUserId" text NOT NULL,
  "classroomId" text NOT NULL,
  "subject" varchar(120) NOT NULL,
  "subjectNorm" varchar(120) NOT NULL,
  "weekday" smallint NOT NULL,
  "startMinute" smallint NOT NULL,
  "endMinute" smallint NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "retiredAt" timestamptz NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "TeacherLessonTimetableEntry_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "TeacherLessonTimetableEntry_tenant_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES edulife_os."Tenant" ("id")
    ON DELETE RESTRICT,

  CONSTRAINT "TeacherLessonTimetableEntry_teacher_fkey"
    FOREIGN KEY ("teacherUserId")
    REFERENCES edulife_os."User" ("id")
    ON DELETE RESTRICT,

  CONSTRAINT "TeacherLessonTimetableEntry_classroom_fkey"
    FOREIGN KEY ("classroomId")
    REFERENCES edulife_os."Classroom" ("id")
    ON DELETE RESTRICT,

  CONSTRAINT "TeacherLessonTimetableEntry_subject_check"
    CHECK (
      length(btrim("subject")) BETWEEN 1 AND 120
      AND length(btrim("subjectNorm")) BETWEEN 1 AND 120
    ),

  CONSTRAINT "TeacherLessonTimetableEntry_weekday_check"
    CHECK ("weekday" BETWEEN 1 AND 5),

  CONSTRAINT "TeacherLessonTimetableEntry_time_check"
    CHECK (
      "startMinute" BETWEEN 0 AND 1439
      AND "endMinute" BETWEEN 1 AND 1439
      AND "endMinute" > "startMinute"
    ),

  CONSTRAINT "TeacherLessonTimetableEntry_lifecycle_check"
    CHECK (
      ("isActive" = true AND "retiredAt" IS NULL)
      OR
      ("isActive" = false AND "retiredAt" IS NOT NULL)
    ),

  CONSTRAINT "TeacherLessonTimetableEntry_updated_timeline_check"
    CHECK ("updatedAt" >= "createdAt")
);

CREATE UNIQUE INDEX "TeacherLessonTimetableEntry_active_exact_unique"
  ON edulife_os."TeacherLessonTimetableEntry" (
    "tenantId",
    "teacherUserId",
    "classroomId",
    "subjectNorm",
    "weekday",
    "startMinute",
    "endMinute"
  )
  WHERE "isActive" = true;

CREATE INDEX "TeacherLessonTimetableEntry_active_lookup_idx"
  ON edulife_os."TeacherLessonTimetableEntry" (
    "tenantId",
    "teacherUserId",
    "classroomId",
    "subjectNorm",
    "isActive",
    "weekday",
    "startMinute"
  );

CREATE INDEX "TeacherLessonTimetableEntry_class_time_idx"
  ON edulife_os."TeacherLessonTimetableEntry" (
    "tenantId",
    "classroomId",
    "isActive",
    "weekday",
    "startMinute",
    "endMinute"
  );

CREATE OR REPLACE FUNCTION edulife_os.teacher_lesson_timetable_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $teacher_lesson_timetable_insert_guard$
BEGIN
  IF NEW."isActive" IS DISTINCT FROM true OR NEW."retiredAt" IS NOT NULL THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_NEW_ENTRY_MUST_BE_ACTIVE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM edulife_os."Classroom" c
    WHERE c."id" = NEW."classroomId"
      AND c."tenantId" = NEW."tenantId"
      AND c."status"::text = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_CLASSROOM_TENANT_SCOPE_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM edulife_os."Membership" m
    WHERE m."tenantId" = NEW."tenantId"
      AND m."userId" = NEW."teacherUserId"
      AND m."status"::text = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_TEACHER_MEMBERSHIP_INACTIVE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM edulife_os."TeacherLessonTimetableEntry" e
    WHERE e."tenantId" = NEW."tenantId"
      AND e."teacherUserId" = NEW."teacherUserId"
      AND e."isActive" = true
      AND e."weekday" = NEW."weekday"
      AND NEW."startMinute" < e."endMinute"
      AND NEW."endMinute" > e."startMinute"
  ) THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_TEACHER_OVERLAP';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM edulife_os."TeacherLessonTimetableEntry" e
    WHERE e."tenantId" = NEW."tenantId"
      AND e."classroomId" = NEW."classroomId"
      AND e."isActive" = true
      AND e."weekday" = NEW."weekday"
      AND NEW."startMinute" < e."endMinute"
      AND NEW."endMinute" > e."startMinute"
  ) THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_CLASSROOM_OVERLAP';
  END IF;

  RETURN NEW;
END
$teacher_lesson_timetable_insert_guard$;

CREATE OR REPLACE FUNCTION edulife_os.teacher_lesson_timetable_evidence_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $teacher_lesson_timetable_evidence_guard$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_EVIDENCE_DELETE_FORBIDDEN';
  END IF;

  IF OLD."isActive" = false THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_RETIRED_EVIDENCE_IMMUTABLE';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."teacherUserId" IS DISTINCT FROM OLD."teacherUserId"
    OR NEW."classroomId" IS DISTINCT FROM OLD."classroomId"
    OR NEW."subject" IS DISTINCT FROM OLD."subject"
    OR NEW."subjectNorm" IS DISTINCT FROM OLD."subjectNorm"
    OR NEW."weekday" IS DISTINCT FROM OLD."weekday"
    OR NEW."startMinute" IS DISTINCT FROM OLD."startMinute"
    OR NEW."endMinute" IS DISTINCT FROM OLD."endMinute"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_EVIDENCE_CONTENT_IMMUTABLE';
  END IF;

  IF NOT (
    OLD."isActive" = true
    AND OLD."retiredAt" IS NULL
    AND NEW."isActive" = false
    AND NEW."retiredAt" IS NOT NULL
    AND NEW."updatedAt" >= OLD."updatedAt"
  ) THEN
    RAISE EXCEPTION 'LESSON_TIMETABLE_INVALID_RETIREMENT_TRANSITION';
  END IF;

  RETURN NEW;
END
$teacher_lesson_timetable_evidence_guard$;

CREATE TRIGGER "TeacherLessonTimetableEntry_insert_guard"
BEFORE INSERT ON edulife_os."TeacherLessonTimetableEntry"
FOR EACH ROW
EXECUTE FUNCTION edulife_os.teacher_lesson_timetable_insert_guard();

CREATE TRIGGER "TeacherLessonTimetableEntry_evidence_guard"
BEFORE UPDATE OR DELETE ON edulife_os."TeacherLessonTimetableEntry"
FOR EACH ROW
EXECUTE FUNCTION edulife_os.teacher_lesson_timetable_evidence_guard();

COMMIT;
