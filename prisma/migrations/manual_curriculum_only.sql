-- prisma/migrations/manual_curriculum_only.sql
-- Minimal schema for curriculum tables used by KG seeding

-- Make sure we are using the same schema Prisma expects
CREATE SCHEMA IF NOT EXISTS "edulife_os";
SET search_path = "edulife_os";

-- =====================================
-- Core curriculum tables
-- =====================================

CREATE TABLE IF NOT EXISTS "CurriculumSubject" (
    "id" TEXT NOT NULL,
    "phase" TEXT,
    "level" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CurriculumSubject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CurriculumStrand" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CurriculumStrand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CurriculumSubStrand" (
    "id" TEXT NOT NULL,
    "strandId" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CurriculumSubStrand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CurriculumContentStandard" (
    "id" TEXT NOT NULL,
    "subStrandId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CurriculumContentStandard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CurriculumIndicator" (
    "id" TEXT NOT NULL,
    "contentStandardId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CurriculumIndicator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CurriculumExemplar" (
    "id" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT NOT NULL,
    "assessmentNotes" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CurriculumExemplar_pkey" PRIMARY KEY ("id")
);

-- =====================================
-- Indexes
-- =====================================

CREATE UNIQUE INDEX IF NOT EXISTS "CurriculumSubject_slug_key"
ON "CurriculumSubject"("slug");

CREATE INDEX IF NOT EXISTS "CurriculumStrand_subjectId_idx"
ON "CurriculumStrand"("subjectId");

CREATE INDEX IF NOT EXISTS "CurriculumSubStrand_strandId_idx"
ON "CurriculumSubStrand"("strandId");

CREATE INDEX IF NOT EXISTS "CurriculumContentStandard_subStrandId_idx"
ON "CurriculumContentStandard"("subStrandId");

CREATE INDEX IF NOT EXISTS "CurriculumContentStandard_code_idx"
ON "CurriculumContentStandard"("code");

CREATE INDEX IF NOT EXISTS "CurriculumIndicator_contentStandardId_idx"
ON "CurriculumIndicator"("contentStandardId");

CREATE INDEX IF NOT EXISTS "CurriculumIndicator_code_idx"
ON "CurriculumIndicator"("code");

CREATE INDEX IF NOT EXISTS "CurriculumExemplar_indicatorId_idx"
ON "CurriculumExemplar"("indicatorId");

-- =====================================
-- Foreign keys (links between curriculum tables)
-- =====================================

ALTER TABLE "CurriculumStrand"
    ADD CONSTRAINT "CurriculumStrand_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "CurriculumSubject"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CurriculumSubStrand"
    ADD CONSTRAINT "CurriculumSubStrand_strandId_fkey"
    FOREIGN KEY ("strandId") REFERENCES "CurriculumStrand"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CurriculumContentStandard"
    ADD CONSTRAINT "CurriculumContentStandard_subStrandId_fkey"
    FOREIGN KEY ("subStrandId") REFERENCES "CurriculumSubStrand"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CurriculumIndicator"
    ADD CONSTRAINT "CurriculumIndicator_contentStandardId_fkey"
    FOREIGN KEY ("contentStandardId") REFERENCES "CurriculumContentStandard"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CurriculumExemplar"
    ADD CONSTRAINT "CurriculumExemplar_indicatorId_fkey"
    FOREIGN KEY ("indicatorId") REFERENCES "CurriculumIndicator"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
