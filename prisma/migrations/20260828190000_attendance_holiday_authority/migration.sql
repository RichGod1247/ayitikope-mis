-- UI-P3B1 — Attendance holiday authority + evidence-preserving supersession.
-- Existing sessions remain instructional by default. No attendance marks are rewritten.

ALTER TABLE "edulife_os"."AttendanceSession"
  ADD COLUMN "isHoliday" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "holidayReason" TEXT,
  ADD COLUMN "holidayDeclaredAt" TIMESTAMPTZ(6),
  ADD COLUMN "holidayDeclaredByUserId" TEXT;

ALTER TABLE "edulife_os"."AttendanceSession"
  ADD CONSTRAINT "AttendanceSession_holiday_state_check"
  CHECK (
    (
      "isHoliday" = false
      AND "holidayReason" IS NULL
      AND "holidayDeclaredAt" IS NULL
      AND "holidayDeclaredByUserId" IS NULL
    )
    OR
    (
      "isHoliday" = true
      AND "holidayReason" IS NOT NULL
      AND char_length(btrim("holidayReason")) BETWEEN 4 AND 500
      AND "holidayDeclaredAt" IS NOT NULL
      AND "holidayDeclaredByUserId" IS NOT NULL
    )
  );

ALTER TABLE "edulife_os"."AttendanceSession"
  ADD CONSTRAINT "AttendanceSession_holidayDeclaredBy_fkey"
  FOREIGN KEY ("holidayDeclaredByUserId")
  REFERENCES "edulife_os"."User"("id")
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;

CREATE INDEX "attendance_official_day_idx"
  ON "edulife_os"."AttendanceSession"
  ("tenantId", "classroomId", "date", "isHoliday", "certifiedAt");

-- Serialize attendance-mark mutation against holiday declaration by locking the
-- parent session row first. Existing marks on a certified session are preserved,
-- but no mark may be inserted or changed after that session becomes a holiday.
CREATE OR REPLACE FUNCTION "edulife_os"."attendance_guard_holiday_mark_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_holiday boolean;
BEGIN
  SELECT s."isHoliday"
    INTO v_is_holiday
  FROM "edulife_os"."AttendanceSession" s
  WHERE s."id" = NEW."sessionId"
  FOR UPDATE;

  IF v_is_holiday IS TRUE THEN
    RAISE EXCEPTION 'ATTENDANCE_HOLIDAY_MARKS_LOCKED'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AttendanceMark_holiday_mutation_guard"
BEFORE INSERT OR UPDATE
ON "edulife_os"."AttendanceMark"
FOR EACH ROW
EXECUTE FUNCTION "edulife_os"."attendance_guard_holiday_mark_mutation"();

-- A pre-certification holiday must have zero learner marks. This trigger also
-- protects direct SQL and closes the race between a final mark and declaration.
CREATE OR REPLACE FUNCTION "edulife_os"."attendance_guard_pre_cert_holiday"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."isHoliday" IS TRUE
     AND OLD."isHoliday" IS FALSE
     AND NEW."certifiedAt" IS NULL
     AND EXISTS (
       SELECT 1
       FROM "edulife_os"."AttendanceMark" m
       WHERE m."sessionId" = NEW."id"
     )
  THEN
    RAISE EXCEPTION 'ATTENDANCE_HOLIDAY_REQUIRES_ZERO_MARKS'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AttendanceSession_pre_cert_holiday_guard"
BEFORE UPDATE OF "isHoliday"
ON "edulife_os"."AttendanceSession"
FOR EACH ROW
EXECUTE FUNCTION "edulife_os"."attendance_guard_pre_cert_holiday"();
