-- ============================================================
-- EduLife OS Sprint 10 Phase A
-- Governance Geography + Officer Assignment Spine
-- Safe manual SQL alignment for existing database
-- ============================================================

-- 1. Create enum types if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'GovernanceOfficerRole'
  ) THEN
    CREATE TYPE "GovernanceOfficerRole" AS ENUM (
      'SISSO',
      'CIRCUIT_SUPERVISOR',
      'DISTRICT_DIRECTOR',
      'DISTRICT_MIS_OFFICER',
      'DISTRICT_SHEP_OFFICER',
      'DISTRICT_ASSESSMENT_OFFICER',
      'REGIONAL_VIEWER'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'GovernanceAssignmentStatus'
  ) THEN
    CREATE TYPE "GovernanceAssignmentStatus" AS ENUM (
      'ACTIVE',
      'SUSPENDED',
      'REVOKED'
    );
  END IF;
END $$;


-- 2. Harden AdminZone table with new fields expected by Prisma
ALTER TABLE "AdminZone"
  ADD COLUMN IF NOT EXISTS "countryCode" TEXT NOT NULL DEFAULT 'GH';

ALTER TABLE "AdminZone"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "AdminZone"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW();

ALTER TABLE "AdminZone"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW();


-- 3. Create GovernanceOfficerAssignment table if missing
CREATE TABLE IF NOT EXISTS "GovernanceOfficerAssignment" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

  "userId" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,

  "role" "GovernanceOfficerRole" NOT NULL,
  "status" "GovernanceAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',

  "title" TEXT,
  "phone" TEXT,

  "startsAt" TIMESTAMPTZ(6),
  "endsAt" TIMESTAMPTZ(6),

  "createdByUserId" TEXT,
  "revokedByUserId" TEXT,

  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "revokedAt" TIMESTAMPTZ(6),

  "revokeReason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb
);


-- 4. Add missing columns defensively if table already existed in a partial state
ALTER TABLE "GovernanceOfficerAssignment"
  ADD COLUMN IF NOT EXISTS "userId" TEXT;

ALTER TABLE "GovernanceOfficerAssignment"
  ADD COLUMN IF NOT EXISTS "zoneId" TEXT;

ALTER TABLE "GovernanceOfficerAssignment"
  ADD COLUMN IF NOT EXISTS "role" "GovernanceOfficerRole";

ALTER TABLE "GovernanceOfficerAssignment"
  ADD COLUMN IF NOT EXISTS "status" "GovernanceAssignmentStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "GovernanceOfficerAssignment"
  ADD COLUMN IF NOT EXISTS "title" TEXT;

ALTER TABLE "GovernanceOfficerAssignment"
  ADD COLUMN IF NOT EXISTS "phone" TEXT;

ALTER TABLE "GovernanceOfficerAssignment"
  ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMPTZ(6);

ALTER TABLE "GovernanceOfficerAssignment"
  ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMPTZ(6);

ALTER TABLE "GovernanceOfficerAssignment"
  ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

ALTER TABLE "GovernanceOfficerAssignment"
  ADD COLUMN IF NOT EXISTS "revokedByUserId" TEXT;

ALTER TABLE "GovernanceOfficerAssignment"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW();

ALTER TABLE "GovernanceOfficerAssignment"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW();

ALTER TABLE "GovernanceOfficerAssignment"
  ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMPTZ(6);

ALTER TABLE "GovernanceOfficerAssignment"
  ADD COLUMN IF NOT EXISTS "revokeReason" TEXT;

ALTER TABLE "GovernanceOfficerAssignment"
  ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb;


-- 5. Add foreign keys safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GovernanceOfficerAssignment_user_fkey'
  ) THEN
    ALTER TABLE "GovernanceOfficerAssignment"
      ADD CONSTRAINT "GovernanceOfficerAssignment_user_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GovernanceOfficerAssignment_zone_fkey'
  ) THEN
    ALTER TABLE "GovernanceOfficerAssignment"
      ADD CONSTRAINT "GovernanceOfficerAssignment_zone_fkey"
      FOREIGN KEY ("zoneId") REFERENCES "AdminZone"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GovernanceOfficerAssignment_createdBy_fkey'
  ) THEN
    ALTER TABLE "GovernanceOfficerAssignment"
      ADD CONSTRAINT "GovernanceOfficerAssignment_createdBy_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GovernanceOfficerAssignment_revokedBy_fkey'
  ) THEN
    ALTER TABLE "GovernanceOfficerAssignment"
      ADD CONSTRAINT "GovernanceOfficerAssignment_revokedBy_fkey"
      FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


-- 6. Bank-grade indexes for AdminZone
CREATE INDEX IF NOT EXISTS "AdminZone_zoneTypeId_idx"
ON "AdminZone" ("zoneTypeId");

CREATE INDEX IF NOT EXISTS "AdminZone_parentZoneId_idx"
ON "AdminZone" ("parentZoneId");

CREATE INDEX IF NOT EXISTS "AdminZone_countryCode_idx"
ON "AdminZone" ("countryCode");

CREATE INDEX IF NOT EXISTS "AdminZone_isActive_idx"
ON "AdminZone" ("isActive");

CREATE INDEX IF NOT EXISTS "AdminZone_code_idx"
ON "AdminZone" ("code");

CREATE INDEX IF NOT EXISTS "AdminZone_countryCode_code_idx"
ON "AdminZone" ("countryCode", "code");


-- 7. Strong uniqueness protection for zones
-- Prevent duplicate root zones of same type/name.
CREATE UNIQUE INDEX IF NOT EXISTS "AdminZone_root_type_name_unique"
ON "AdminZone" ("zoneTypeId", LOWER("name"))
WHERE "parentZoneId" IS NULL;

-- Prevent duplicate child zones under same parent.
CREATE UNIQUE INDEX IF NOT EXISTS "AdminZone_child_type_parent_name_unique"
ON "AdminZone" ("zoneTypeId", "parentZoneId", LOWER("name"))
WHERE "parentZoneId" IS NOT NULL;

-- Prevent duplicate non-empty zone codes inside a country.
CREATE UNIQUE INDEX IF NOT EXISTS "AdminZone_country_code_unique"
ON "AdminZone" (LOWER("countryCode"), LOWER("code"))
WHERE "code" IS NOT NULL AND BTRIM("code") <> '';


-- 8. Bank-grade indexes for GovernanceOfficerAssignment
CREATE INDEX IF NOT EXISTS "GovernanceOfficerAssignment_userId_idx"
ON "GovernanceOfficerAssignment" ("userId");

CREATE INDEX IF NOT EXISTS "GovernanceOfficerAssignment_zoneId_idx"
ON "GovernanceOfficerAssignment" ("zoneId");

CREATE INDEX IF NOT EXISTS "GovernanceOfficerAssignment_role_idx"
ON "GovernanceOfficerAssignment" ("role");

CREATE INDEX IF NOT EXISTS "GovernanceOfficerAssignment_status_idx"
ON "GovernanceOfficerAssignment" ("status");

CREATE INDEX IF NOT EXISTS "GovernanceOfficerAssignment_userId_status_idx"
ON "GovernanceOfficerAssignment" ("userId", "status");

CREATE INDEX IF NOT EXISTS "GovernanceOfficerAssignment_zoneId_status_idx"
ON "GovernanceOfficerAssignment" ("zoneId", "status");

CREATE INDEX IF NOT EXISTS "GovernanceOfficerAssignment_user_zone_role_status_idx"
ON "GovernanceOfficerAssignment" ("userId", "zoneId", "role", "status");


-- 9. Prevent duplicate active officer assignment
CREATE UNIQUE INDEX IF NOT EXISTS "GovernanceOfficerAssignment_active_unique"
ON "GovernanceOfficerAssignment" ("userId", "zoneId", "role")
WHERE "status" = 'ACTIVE' AND "revokedAt" IS NULL;


-- 10. Timeline sanity checks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GovernanceOfficerAssignment_valid_dates_chk'
  ) THEN
    ALTER TABLE "GovernanceOfficerAssignment"
      ADD CONSTRAINT "GovernanceOfficerAssignment_valid_dates_chk"
      CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" >= "startsAt");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GovernanceOfficerAssignment_revoke_reason_chk'
  ) THEN
    ALTER TABLE "GovernanceOfficerAssignment"
      ADD CONSTRAINT "GovernanceOfficerAssignment_revoke_reason_chk"
      CHECK (
        "status" <> 'REVOKED'
        OR (
          "revokedAt" IS NOT NULL
          AND "revokeReason" IS NOT NULL
          AND BTRIM("revokeReason") <> ''
        )
      );
  END IF;
END $$;


-- 11. Tenant zone lookup performance
CREATE INDEX IF NOT EXISTS "Tenant_zone_status_idx"
ON "Tenant" ("zoneId", "status")
WHERE "zoneId" IS NOT NULL;


-- 12. Seed Ghana zone types if missing
INSERT INTO "AdminZoneType" ("id", "countryCode", "level", "name")
SELECT gen_random_uuid()::text, 'GH', 1, 'Circuit'
WHERE NOT EXISTS (
  SELECT 1 FROM "AdminZoneType"
  WHERE "countryCode" = 'GH' AND "level" = 1
);

INSERT INTO "AdminZoneType" ("id", "countryCode", "level", "name")
SELECT gen_random_uuid()::text, 'GH', 2, 'District'
WHERE NOT EXISTS (
  SELECT 1 FROM "AdminZoneType"
  WHERE "countryCode" = 'GH' AND "level" = 2
);

INSERT INTO "AdminZoneType" ("id", "countryCode", "level", "name")
SELECT gen_random_uuid()::text, 'GH', 3, 'Region'
WHERE NOT EXISTS (
  SELECT 1 FROM "AdminZoneType"
  WHERE "countryCode" = 'GH' AND "level" = 3
);

INSERT INTO "AdminZoneType" ("id", "countryCode", "level", "name")
SELECT gen_random_uuid()::text, 'GH', 4, 'National'
WHERE NOT EXISTS (
  SELECT 1 FROM "AdminZoneType"
  WHERE "countryCode" = 'GH' AND "level" = 4
);