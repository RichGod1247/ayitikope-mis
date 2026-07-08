-- ============================================================
-- EduLife OS — A15.4B Teacher Appraisal Spine
-- Manual SQL migration aligned with Prisma schema
-- Safe to run once; mostly idempotent.
-- ============================================================

-- 1) Enum: TeacherAppraisalStatus
DO $$
BEGIN
  CREATE TYPE "TeacherAppraisalStatus" AS ENUM ('DRAFT', 'FINALIZED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- 2) TeacherAppraisal table
CREATE TABLE IF NOT EXISTS "TeacherAppraisal" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

  "tenantId" TEXT NOT NULL,
  "teacherUserId" TEXT NOT NULL,
  "appraiserUserId" TEXT NOT NULL,
  "finalizedByUserId" TEXT,

  "classroomId" TEXT,

  "dateObserved" DATE NOT NULL,
  "classTaught" VARCHAR(80),

  "term" VARCHAR(40),
  "academicYear" VARCHAR(40),

  "subject" VARCHAR(120),
  "subStrand" TEXT,

  "durationMinutes" INTEGER,
  "yearsInService" INTEGER,
  "yearsInPresentSchool" INTEGER,

  "teacherNameSnapshot" VARCHAR(180),
  "schoolNameSnapshot" VARCHAR(180),
  "circuitSnapshot" VARCHAR(180),
  "appraiserNameSnapshot" VARCHAR(180),

  "schemeOfWorkId" TEXT,
  "lessonNoteId" TEXT,
  "lessonDeliveryId" TEXT,

  "evidenceSnapshotJson" JSONB NOT NULL DEFAULT '{}'::jsonb,

  "status" "TeacherAppraisalStatus" NOT NULL DEFAULT 'DRAFT',

  "preparationPercent" DOUBLE PRECISION,
  "lessonDeliveryPercent" DOUBLE PRECISION,
  "classroomCulturePercent" DOUBLE PRECISION,
  "learnerParticipationPercent" DOUBLE PRECISION,
  "understandingStrategiesPercent" DOUBLE PRECISION,
  "evaluationStrategiesPercent" DOUBLE PRECISION,
  "overallPercentage" DOUBLE PRECISION,

  "generalComment" TEXT,

  "finalizedAt" TIMESTAMPTZ,

  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,

  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- 3) TeacherAppraisalScore table
CREATE TABLE IF NOT EXISTS "TeacherAppraisalScore" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

  "tenantId" TEXT NOT NULL,
  "appraisalId" TEXT NOT NULL,

  "sectionKey" VARCHAR(60) NOT NULL,
  "sectionTitle" VARCHAR(180) NOT NULL,
  "sectionOrder" INTEGER NOT NULL,
  "sectionMaxScore" INTEGER NOT NULL,

  "itemKey" VARCHAR(20) NOT NULL,
  "itemLabel" TEXT NOT NULL,
  "itemOrder" INTEGER NOT NULL,

  "score" INTEGER,
  "notApplicable" BOOLEAN NOT NULL DEFAULT false,

  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- 4) Foreign keys for TeacherAppraisal
DO $$
BEGIN
  ALTER TABLE "TeacherAppraisal"
    ADD CONSTRAINT "TeacherAppraisal_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TeacherAppraisal"
    ADD CONSTRAINT "TeacherAppraisal_teacherUserId_fkey"
    FOREIGN KEY ("teacherUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TeacherAppraisal"
    ADD CONSTRAINT "TeacherAppraisal_appraiserUserId_fkey"
    FOREIGN KEY ("appraiserUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TeacherAppraisal"
    ADD CONSTRAINT "TeacherAppraisal_finalizedByUserId_fkey"
    FOREIGN KEY ("finalizedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TeacherAppraisal"
    ADD CONSTRAINT "TeacherAppraisal_classroomId_fkey"
    FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TeacherAppraisal"
    ADD CONSTRAINT "TeacherAppraisal_schemeOfWorkId_fkey"
    FOREIGN KEY ("schemeOfWorkId") REFERENCES "SchemeOfWork"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TeacherAppraisal"
    ADD CONSTRAINT "TeacherAppraisal_lessonNoteId_fkey"
    FOREIGN KEY ("lessonNoteId") REFERENCES "LessonNote"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TeacherAppraisal"
    ADD CONSTRAINT "TeacherAppraisal_lessonDeliveryId_fkey"
    FOREIGN KEY ("lessonDeliveryId") REFERENCES "LessonDelivery"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- 5) Foreign key for TeacherAppraisalScore
DO $$
BEGIN
  ALTER TABLE "TeacherAppraisalScore"
    ADD CONSTRAINT "TeacherAppraisalScore_appraisalId_fkey"
    FOREIGN KEY ("appraisalId") REFERENCES "TeacherAppraisal"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- 6) Uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherAppraisalScore_appraisal_item_unique"
ON "TeacherAppraisalScore" ("appraisalId", "itemKey");


-- 7) Appraisal indexes aligned with Prisma schema
CREATE INDEX IF NOT EXISTS "TeacherAppraisal_tenant_status_idx"
ON "TeacherAppraisal" ("tenantId", "status");

CREATE INDEX IF NOT EXISTS "TeacherAppraisal_tenant_teacher_status_idx"
ON "TeacherAppraisal" ("tenantId", "teacherUserId", "status");

CREATE INDEX IF NOT EXISTS "TeacherAppraisal_tenant_appraiser_status_idx"
ON "TeacherAppraisal" ("tenantId", "appraiserUserId", "status");

CREATE INDEX IF NOT EXISTS "TeacherAppraisal_tenant_date_idx"
ON "TeacherAppraisal" ("tenantId", "dateObserved");

CREATE INDEX IF NOT EXISTS "TeacherAppraisal_tenant_classroom_idx"
ON "TeacherAppraisal" ("tenantId", "classroomId");

CREATE INDEX IF NOT EXISTS "TeacherAppraisal_tenant_term_year_idx"
ON "TeacherAppraisal" ("tenantId", "term", "academicYear");

CREATE INDEX IF NOT EXISTS "TeacherAppraisal_scheme_idx"
ON "TeacherAppraisal" ("schemeOfWorkId");

CREATE INDEX IF NOT EXISTS "TeacherAppraisal_lessonNote_idx"
ON "TeacherAppraisal" ("lessonNoteId");

CREATE INDEX IF NOT EXISTS "TeacherAppraisal_lessonDelivery_idx"
ON "TeacherAppraisal" ("lessonDeliveryId");


-- 8) Score indexes aligned with Prisma schema
CREATE INDEX IF NOT EXISTS "TeacherAppraisalScore_tenant_section_idx"
ON "TeacherAppraisalScore" ("tenantId", "sectionKey");

CREATE INDEX IF NOT EXISTS "TeacherAppraisalScore_appraisal_order_idx"
ON "TeacherAppraisalScore" ("appraisalId", "sectionOrder", "itemOrder");


-- 9) Bank-grade sanity checks
DO $$
BEGIN
  ALTER TABLE "TeacherAppraisalScore"
    ADD CONSTRAINT "TeacherAppraisalScore_score_range_check"
    CHECK (
      "score" IS NULL
      OR ("score" >= 1 AND "score" <= 5)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TeacherAppraisalScore"
    ADD CONSTRAINT "TeacherAppraisalScore_na_score_check"
    CHECK (
      ("notApplicable" = true AND "score" IS NULL)
      OR ("notApplicable" = false)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TeacherAppraisal"
    ADD CONSTRAINT "TeacherAppraisal_duration_positive_check"
    CHECK (
      "durationMinutes" IS NULL
      OR "durationMinutes" > 0
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TeacherAppraisal"
    ADD CONSTRAINT "TeacherAppraisal_years_non_negative_check"
    CHECK (
      ("yearsInService" IS NULL OR "yearsInService" >= 0)
      AND
      ("yearsInPresentSchool" IS NULL OR "yearsInPresentSchool" >= 0)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- 10) updatedAt trigger helper
CREATE OR REPLACE FUNCTION "set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- 11) updatedAt triggers
DROP TRIGGER IF EXISTS "TeacherAppraisal_set_updated_at" ON "TeacherAppraisal";

CREATE TRIGGER "TeacherAppraisal_set_updated_at"
BEFORE UPDATE ON "TeacherAppraisal"
FOR EACH ROW
EXECUTE FUNCTION "set_updated_at"();


DROP TRIGGER IF EXISTS "TeacherAppraisalScore_set_updated_at" ON "TeacherAppraisalScore";

CREATE TRIGGER "TeacherAppraisalScore_set_updated_at"
BEFORE UPDATE ON "TeacherAppraisalScore"
FOR EACH ROW
EXECUTE FUNCTION "set_updated_at"();