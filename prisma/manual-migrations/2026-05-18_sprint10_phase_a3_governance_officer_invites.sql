-- ============================================================
-- EduLife OS Sprint 10 Phase A3
-- Governance Officer Invite Spine
-- Manual SQL alignment
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'GovernanceOfficerInviteStatus'
  ) THEN
    CREATE TYPE "GovernanceOfficerInviteStatus" AS ENUM (
      'PENDING',
      'ACCEPTED',
      'REVOKED',
      'EXPIRED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "GovernanceOfficerInvite" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

  "email" VARCHAR(320) NOT NULL,
  "emailNorm" VARCHAR(320) NOT NULL,

  "phone" VARCHAR(32),
  "phoneNorm" VARCHAR(16),

  "tokenHash" VARCHAR(64) NOT NULL UNIQUE,

  "role" "GovernanceOfficerRole" NOT NULL,

  "zoneId" TEXT NOT NULL,

  "status" "GovernanceOfficerInviteStatus" NOT NULL DEFAULT 'PENDING',

  "expiresAt" TIMESTAMPTZ(6) NOT NULL,

  "acceptedAt" TIMESTAMPTZ(6),
  "revokedAt" TIMESTAMPTZ(6),

  "createdByUserId" TEXT,
  "acceptedByUserId" TEXT,
  "revokedByUserId" TEXT,

  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "email" VARCHAR(320);

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "emailNorm" VARCHAR(320);

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "phone" VARCHAR(32);

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "phoneNorm" VARCHAR(16);

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "tokenHash" VARCHAR(64);

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "role" "GovernanceOfficerRole";

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "zoneId" TEXT;

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "status" "GovernanceOfficerInviteStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ(6);

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMPTZ(6);

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMPTZ(6);

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "acceptedByUserId" TEXT;

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "revokedByUserId" TEXT;

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW();

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW();

ALTER TABLE "GovernanceOfficerInvite"
  ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GovernanceOfficerInvite_zone_fkey'
  ) THEN
    ALTER TABLE "GovernanceOfficerInvite"
      ADD CONSTRAINT "GovernanceOfficerInvite_zone_fkey"
      FOREIGN KEY ("zoneId") REFERENCES "AdminZone"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GovernanceOfficerInvite_createdBy_fkey'
  ) THEN
    ALTER TABLE "GovernanceOfficerInvite"
      ADD CONSTRAINT "GovernanceOfficerInvite_createdBy_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GovernanceOfficerInvite_acceptedBy_fkey'
  ) THEN
    ALTER TABLE "GovernanceOfficerInvite"
      ADD CONSTRAINT "GovernanceOfficerInvite_acceptedBy_fkey"
      FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GovernanceOfficerInvite_revokedBy_fkey'
  ) THEN
    ALTER TABLE "GovernanceOfficerInvite"
      ADD CONSTRAINT "GovernanceOfficerInvite_revokedBy_fkey"
      FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GovernanceOfficerInvite_required_fields_chk'
  ) THEN
    ALTER TABLE "GovernanceOfficerInvite"
      ADD CONSTRAINT "GovernanceOfficerInvite_required_fields_chk"
      CHECK (
        BTRIM("email") <> ''
        AND BTRIM("emailNorm") <> ''
        AND BTRIM("tokenHash") <> ''
        AND "expiresAt" IS NOT NULL
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "GovernanceOfficerInvite_emailNorm_idx"
ON "GovernanceOfficerInvite" ("emailNorm");

CREATE INDEX IF NOT EXISTS "GovernanceOfficerInvite_zoneId_idx"
ON "GovernanceOfficerInvite" ("zoneId");

CREATE INDEX IF NOT EXISTS "GovernanceOfficerInvite_role_idx"
ON "GovernanceOfficerInvite" ("role");

CREATE INDEX IF NOT EXISTS "GovernanceOfficerInvite_status_idx"
ON "GovernanceOfficerInvite" ("status");

CREATE INDEX IF NOT EXISTS "GovernanceOfficerInvite_expiresAt_idx"
ON "GovernanceOfficerInvite" ("expiresAt");

CREATE INDEX IF NOT EXISTS "GovernanceOfficerInvite_createdByUserId_idx"
ON "GovernanceOfficerInvite" ("createdByUserId");

CREATE INDEX IF NOT EXISTS "GovernanceOfficerInvite_acceptedByUserId_idx"
ON "GovernanceOfficerInvite" ("acceptedByUserId");

CREATE INDEX IF NOT EXISTS "GovernanceOfficerInvite_revokedByUserId_idx"
ON "GovernanceOfficerInvite" ("revokedByUserId");

CREATE INDEX IF NOT EXISTS "GovernanceOfficerInvite_zone_role_status_idx"
ON "GovernanceOfficerInvite" ("zoneId", "role", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "GovernanceOfficerInvite_pending_email_zone_role_unique"
ON "GovernanceOfficerInvite" ("emailNorm", "zoneId", "role")
WHERE "status" = 'PENDING' AND "revokedAt" IS NULL AND "acceptedAt" IS NULL;