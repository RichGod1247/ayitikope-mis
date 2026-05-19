-- ============================================================
-- EduLife OS
-- Fix JHS curriculum media paths for Cloudflare R2 public base
--
-- Problem:
-- DB stored JHS images as:
--   curriculum/jhs/jhs-3/jhs-3-science/B9.1.1.1.1.png
--
-- Actual R2 public keys are:
--   jhs/jhs-3/jhs-3-science/B9.1.1.1.1.png
--
-- This migration removes only the legacy "curriculum/" prefix
-- for JHS media rows. It does not touch lower-primary, KG,
-- absolute URLs, or non-JHS media.
-- ============================================================

BEGIN;

UPDATE "CurriculumMedia"
SET
  "imagePath" = regexp_replace("imagePath", '^curriculum/jhs/', 'jhs/', 'i'),
  "updatedAt" = NOW()
WHERE "imagePath" ILIKE 'curriculum/jhs/%';

COMMIT;

-- Verification
SELECT
  COUNT(*) FILTER (WHERE "imagePath" ILIKE 'curriculum/jhs/%') AS "remainingLegacyJhsPaths",
  COUNT(*) FILTER (WHERE "imagePath" ILIKE 'jhs/%') AS "canonicalJhsPaths"
FROM "CurriculumMedia";