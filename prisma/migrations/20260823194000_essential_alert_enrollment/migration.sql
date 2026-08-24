BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path TO "edulife_os", pg_catalog;

-- A16A1 — Essential School Alerts enrollment authority.
--
-- Institutional law:
--   * explicit Essential Alerts enrollment is independent from legacy
--     User.smsOptIn / Student.guardianSmsOptIn;
--   * Essential Alerts enrollment is independent from healthConsentAt;
--   * future paid/sponsored entitlement is NOT represented here;
--   * one tenant-scoped enrollment subject exists per learner guardian context
--     or staff user;
--   * raw phone numbers never appear in signed tokens — only an HMAC fingerprint;
--   * no existing user/student consent values are backfilled or reinterpreted.

DO $essential_alert_preflight$
DECLARE
  existing_table_count integer;
  existing_kind_type_count integer;
  existing_status_type_count integer;
  required_column_count integer;
BEGIN
  SELECT count(*)
  INTO existing_table_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'edulife_os'
    AND c.relname = 'essential_alert_enrollment'
    AND c.relkind = 'r';

  IF existing_table_count <> 0 THEN
    RAISE EXCEPTION 'ESSENTIAL_ALERT_ENROLLMENT_TABLE_ALREADY_EXISTS';
  END IF;

  SELECT count(*)
  INTO existing_kind_type_count
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'edulife_os'
    AND t.typname = 'EssentialAlertRecipientKind';

  SELECT count(*)
  INTO existing_status_type_count
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'edulife_os'
    AND t.typname = 'EssentialAlertEnrollmentStatus';

  IF existing_kind_type_count <> 0 OR existing_status_type_count <> 0 THEN
    RAISE EXCEPTION 'ESSENTIAL_ALERT_ENUM_ALREADY_EXISTS';
  END IF;

  SELECT count(*)
  INTO required_column_count
  FROM information_schema.columns
  WHERE table_schema = 'edulife_os'
    AND (
      (table_name = 'User' AND column_name = 'smsOptIn')
      OR (table_name = 'Student' AND column_name = 'guardianSmsOptIn')
      OR (table_name = 'Student' AND column_name = 'healthConsentAt')
    );

  IF required_column_count <> 3 THEN
    RAISE EXCEPTION 'ESSENTIAL_ALERT_LEGACY_BASELINE_DRIFT';
  END IF;
END
$essential_alert_preflight$;

CREATE TYPE edulife_os."EssentialAlertRecipientKind" AS ENUM (
  'GUARDIAN',
  'STAFF'
);

CREATE TYPE edulife_os."EssentialAlertEnrollmentStatus" AS ENUM (
  'INVITED',
  'ENROLLED',
  'OPTED_OUT'
);

CREATE TABLE edulife_os."essential_alert_enrollment" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "subjectKey" varchar(180) NOT NULL,
  "recipientKind" edulife_os."EssentialAlertRecipientKind" NOT NULL,
  "studentId" text,
  "userId" text,
  "phoneNormSnapshot" varchar(16) NOT NULL,
  "phoneFingerprint" varchar(64) NOT NULL,
  "status" edulife_os."EssentialAlertEnrollmentStatus" NOT NULL DEFAULT 'INVITED',
  "policyVersion" integer NOT NULL DEFAULT 1,
  "consentSource" varchar(80),
  "consentedAt" timestamptz(6),
  "optedOutAt" timestamptz(6),
  "firstInvitedAt" timestamptz(6),
  "lastInvitationAttemptAt" timestamptz(6),
  "lastInvitationSentAt" timestamptz(6),
  "invitationCount" integer NOT NULL DEFAULT 0,
  "consentEvidenceJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz(6) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(6) NOT NULL DEFAULT now(),

  CONSTRAINT "essential_alert_enrollment_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "EssentialAlertEnrollment_tenant_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES edulife_os."Tenant"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION,

  CONSTRAINT "EssentialAlertEnrollment_student_fkey"
    FOREIGN KEY ("studentId")
    REFERENCES edulife_os."Student"("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION,

  CONSTRAINT "EssentialAlertEnrollment_user_fkey"
    FOREIGN KEY ("userId")
    REFERENCES edulife_os."User"("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION,

  CONSTRAINT "EssentialAlertEnrollment_subject_shape_check"
    CHECK (
      (
        "recipientKind" = 'GUARDIAN'::edulife_os."EssentialAlertRecipientKind"
        AND "studentId" IS NOT NULL
        AND "userId" IS NULL
        AND "subjectKey" = ('GUARDIAN:' || "studentId" || ':' || "phoneFingerprint")
      )
      OR
      (
        "recipientKind" = 'STAFF'::edulife_os."EssentialAlertRecipientKind"
        AND "studentId" IS NULL
        AND "userId" IS NOT NULL
        AND "subjectKey" = ('STAFF:' || "userId" || ':' || "phoneFingerprint")
      )
    ),

  CONSTRAINT "EssentialAlertEnrollment_phone_snapshot_check"
    CHECK (
      "phoneNormSnapshot" ~ '^[+]?[0-9]{8,15}$'
      AND "phoneFingerprint" ~ '^[a-f0-9]{64}$'
    ),

  CONSTRAINT "EssentialAlertEnrollment_policy_check"
    CHECK ("policyVersion" >= 1 AND "invitationCount" >= 0),

  CONSTRAINT "EssentialAlertEnrollment_status_time_check"
    CHECK (
      (
        "status" = 'INVITED'::edulife_os."EssentialAlertEnrollmentStatus"
        AND "consentedAt" IS NULL
        AND "optedOutAt" IS NULL
      )
      OR
      (
        "status" = 'ENROLLED'::edulife_os."EssentialAlertEnrollmentStatus"
        AND "consentedAt" IS NOT NULL
        AND "optedOutAt" IS NULL
      )
      OR
      (
        "status" = 'OPTED_OUT'::edulife_os."EssentialAlertEnrollmentStatus"
        AND "optedOutAt" IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX "EssentialAlertEnrollment_tenant_subject_unique"
  ON edulife_os."essential_alert_enrollment" ("tenantId", "subjectKey");

CREATE INDEX "EssentialAlertEnrollment_tenant_kind_status_idx"
  ON edulife_os."essential_alert_enrollment" ("tenantId", "recipientKind", "status");

CREATE INDEX "EssentialAlertEnrollment_student_idx"
  ON edulife_os."essential_alert_enrollment" ("studentId");

CREATE INDEX "EssentialAlertEnrollment_user_idx"
  ON edulife_os."essential_alert_enrollment" ("userId");

CREATE INDEX "EssentialAlertEnrollment_tenant_phone_fp_idx"
  ON edulife_os."essential_alert_enrollment" ("tenantId", "phoneFingerprint");

COMMIT;
