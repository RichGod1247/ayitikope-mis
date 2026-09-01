-- UI-AUTH-P1B-M1 — Staff password-recovery authority + JWT revocation version.
-- Additive only. No password mutation, token issuance, session invalidation, Parent OTP,
-- or staff 2FA behavior is activated by this migration.
--
-- UAT mmcujlsgicwroysuoqsw already received this exact database shape manually
-- through the transaction-safe AUTH-P1B-M1 gate. Do NOT execute this migration
-- against that already-migrated UAT database; reconcile it with prisma migrate resolve.
--
-- Production must receive this migration only after the full P1B implementation
-- and UAT end-to-end proof are green.

BEGIN;

DO $auth_p1b_recovery_preflight$
BEGIN
  IF to_regclass('edulife_os."User"') IS NULL THEN
    RAISE EXCEPTION 'AUTH_P1B_RECOVERY_USER_TABLE_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'edulife_os'
      AND table_name = 'User'
      AND column_name = 'authVersion'
  ) THEN
    RAISE EXCEPTION 'AUTH_P1B_RECOVERY_AUTH_VERSION_ALREADY_EXISTS';
  END IF;

  IF to_regclass('edulife_os."PasswordRecoveryToken"') IS NOT NULL THEN
    RAISE EXCEPTION 'AUTH_P1B_RECOVERY_TOKEN_TABLE_ALREADY_EXISTS';
  END IF;

  IF to_regclass('edulife_os."ApiRateLimitBucket"') IS NULL THEN
    RAISE EXCEPTION 'AUTH_P1B_RECOVERY_RATE_LIMIT_INFRASTRUCTURE_MISSING';
  END IF;

  IF to_regclass('edulife_os."AuditLog"') IS NULL THEN
    RAISE EXCEPTION 'AUTH_P1B_RECOVERY_AUDIT_INFRASTRUCTURE_MISSING';
  END IF;
END
$auth_p1b_recovery_preflight$;

ALTER TABLE edulife_os."User"
  ADD COLUMN "authVersion" integer NOT NULL DEFAULT 0;

ALTER TABLE edulife_os."User"
  ADD CONSTRAINT "User_authVersion_nonnegative_check"
  CHECK ("authVersion" >= 0);

CREATE TABLE edulife_os."PasswordRecoveryToken" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "userId" text NOT NULL,
  "tokenHash" varchar(64) NOT NULL,
  "authVersionAtIssue" integer NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "consumedAt" timestamptz NULL,
  "revokedAt" timestamptz NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "PasswordRecoveryToken_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "PasswordRecoveryToken_user_fkey"
    FOREIGN KEY ("userId")
    REFERENCES edulife_os."User" ("id")
    ON DELETE CASCADE,

  CONSTRAINT "PasswordRecoveryToken_authVersion_nonnegative_check"
    CHECK ("authVersionAtIssue" >= 0),

  CONSTRAINT "PasswordRecoveryToken_tokenHash_format_check"
    CHECK ("tokenHash" ~ '^[0-9A-Fa-f]{64}$'),

  CONSTRAINT "PasswordRecoveryToken_expiry_after_creation_check"
    CHECK ("expiresAt" > "createdAt"),

  CONSTRAINT "PasswordRecoveryToken_terminal_state_check"
    CHECK (
      NOT (
        "consumedAt" IS NOT NULL
        AND "revokedAt" IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX "PasswordRecoveryToken_tokenHash_key"
  ON edulife_os."PasswordRecoveryToken" ("tokenHash");

CREATE INDEX "PasswordRecoveryToken_user_created_idx"
  ON edulife_os."PasswordRecoveryToken" ("userId", "createdAt" DESC);

CREATE INDEX "PasswordRecoveryToken_expires_idx"
  ON edulife_os."PasswordRecoveryToken" ("expiresAt");

CREATE INDEX "PasswordRecoveryToken_active_user_idx"
  ON edulife_os."PasswordRecoveryToken" ("userId", "expiresAt")
  WHERE "consumedAt" IS NULL
    AND "revokedAt" IS NULL;

COMMIT;
