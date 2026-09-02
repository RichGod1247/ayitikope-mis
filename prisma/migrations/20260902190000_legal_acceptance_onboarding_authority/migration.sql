-- UI-LEGAL-P1-M1R — Legal-document acceptance + Teacher/Headteacher onboarding welcome authority.
-- Additive only. No legal documents are published, no legacy users are backfilled,
-- no welcome rows are seeded, and Essential Alerts are not modified by this migration.
--
-- UAT mmcujlsgicwroysuoqsw already received this final database shape manually
-- through the transaction-safe UI-LEGAL-P1-M1 + M1-R1 gates. Do NOT execute this
-- migration against that already-migrated UAT database.
--
-- Production must receive this migration only after repository parity, application
-- integration, legal-document publication, and UAT end-to-end proof are green.

BEGIN;

DO $legal_p1_m1r_preflight$
BEGIN
  IF to_regnamespace('edulife_os') IS NULL THEN
    RAISE EXCEPTION 'LEGAL_P1_M1R_SCHEMA_MISSING';
  END IF;

  IF to_regclass('edulife_os."User"') IS NULL THEN
    RAISE EXCEPTION 'LEGAL_P1_M1R_USER_AUTHORITY_MISSING';
  END IF;

  IF to_regclass('edulife_os."Membership"') IS NULL THEN
    RAISE EXCEPTION 'LEGAL_P1_M1R_MEMBERSHIP_AUTHORITY_MISSING';
  END IF;

  IF to_regclass('edulife_os."GovernanceOfficerAssignment"') IS NULL THEN
    RAISE EXCEPTION 'LEGAL_P1_M1R_GOVERNANCE_AUTHORITY_MISSING';
  END IF;

  IF to_regclass('edulife_os."AuditLog"') IS NULL THEN
    RAISE EXCEPTION 'LEGAL_P1_M1R_AUDIT_AUTHORITY_MISSING';
  END IF;

  IF to_regclass('edulife_os.essential_alert_enrollment') IS NULL THEN
    RAISE EXCEPTION 'LEGAL_P1_M1R_ESSENTIAL_ALERT_AUTHORITY_MISSING';
  END IF;

  IF to_regclass('edulife_os."LegalDocumentVersion"') IS NOT NULL THEN
    RAISE EXCEPTION 'LEGAL_P1_M1R_LEGAL_DOCUMENT_VERSION_ALREADY_EXISTS';
  END IF;

  IF to_regclass('edulife_os."LegalAcceptance"') IS NOT NULL THEN
    RAISE EXCEPTION 'LEGAL_P1_M1R_LEGAL_ACCEPTANCE_ALREADY_EXISTS';
  END IF;

  IF to_regclass('edulife_os."OnboardingWelcome"') IS NOT NULL THEN
    RAISE EXCEPTION 'LEGAL_P1_M1R_ONBOARDING_WELCOME_ALREADY_EXISTS';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'edulife_os'
      AND p.proname IN (
        'legal_document_version_immutability_guard',
        'legal_acceptance_insert_guard',
        'legal_acceptance_immutability_guard',
        'onboarding_welcome_insert_guard',
        'onboarding_welcome_evidence_guard'
      )
  ) THEN
    RAISE EXCEPTION 'LEGAL_P1_M1R_FUNCTION_COLLISION';
  END IF;
END
$legal_p1_m1r_preflight$;

CREATE TABLE edulife_os."LegalDocumentVersion" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "documentType" varchar(40) NOT NULL,
  "version" varchar(64) NOT NULL,
  "title" varchar(180) NOT NULL,
  "contentText" text NOT NULL,
  "contentHash" varchar(64) NOT NULL,
  "operatorLegalName" varchar(240) NOT NULL,
  "operatorRegistrationNumber" varchar(120),
  "operatorRegisteredAddress" text,
  "operatorServiceEmail" varchar(320) NOT NULL,
  "productSupportEmail" varchar(320) NOT NULL,
  "effectiveAt" timestamptz NOT NULL,
  "publishedAt" timestamptz NOT NULL DEFAULT now(),
  "isCurrent" boolean NOT NULL DEFAULT true,
  "supersededAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "LegalDocumentVersion_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "LegalDocumentVersion_type_version_unique"
    UNIQUE ("documentType", "version"),

  CONSTRAINT "LegalDocumentVersion_document_type_check"
    CHECK (
      "documentType" IN (
        'TERMS_OF_SERVICE',
        'PRIVACY_NOTICE'
      )
    ),

  CONSTRAINT "LegalDocumentVersion_version_check"
    CHECK (length(btrim("version")) BETWEEN 1 AND 64),

  CONSTRAINT "LegalDocumentVersion_title_check"
    CHECK (length(btrim("title")) BETWEEN 1 AND 180),

  CONSTRAINT "LegalDocumentVersion_content_check"
    CHECK (length(btrim("contentText")) > 0),

  CONSTRAINT "LegalDocumentVersion_hash_check"
    CHECK ("contentHash" ~ '^[0-9a-fA-F]{64}$'),

  CONSTRAINT "LegalDocumentVersion_timeline_check"
    CHECK (
      "supersededAt" IS NULL
      OR "supersededAt" >= "publishedAt"
    ),

  CONSTRAINT "LegalDocumentVersion_current_superseded_check"
    CHECK (
      NOT "isCurrent"
      OR "supersededAt" IS NULL
    ),

  CONSTRAINT "LegalDocumentVersion_terminal_superseded_check"
    CHECK (
      "isCurrent"
      OR "supersededAt" IS NOT NULL
    )
);

CREATE UNIQUE INDEX "LegalDocumentVersion_current_type_unique"
  ON edulife_os."LegalDocumentVersion" ("documentType")
  WHERE "isCurrent" = true;

CREATE INDEX "LegalDocumentVersion_effective_idx"
  ON edulife_os."LegalDocumentVersion" ("documentType", "effectiveAt" DESC);

CREATE FUNCTION edulife_os.legal_document_version_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LEGAL_DOCUMENT_VERSION_DELETE_FORBIDDEN'
      USING ERRCODE = '55000';
  END IF;

  IF
    NEW."documentType" IS DISTINCT FROM OLD."documentType"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."title" IS DISTINCT FROM OLD."title"
    OR NEW."contentText" IS DISTINCT FROM OLD."contentText"
    OR NEW."contentHash" IS DISTINCT FROM OLD."contentHash"
    OR NEW."operatorLegalName" IS DISTINCT FROM OLD."operatorLegalName"
    OR NEW."operatorRegistrationNumber" IS DISTINCT FROM OLD."operatorRegistrationNumber"
    OR NEW."operatorRegisteredAddress" IS DISTINCT FROM OLD."operatorRegisteredAddress"
    OR NEW."operatorServiceEmail" IS DISTINCT FROM OLD."operatorServiceEmail"
    OR NEW."productSupportEmail" IS DISTINCT FROM OLD."productSupportEmail"
    OR NEW."effectiveAt" IS DISTINCT FROM OLD."effectiveAt"
    OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'LEGAL_DOCUMENT_VERSION_CONTENT_IMMUTABLE'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."isCurrent" IS DISTINCT FROM true THEN
    IF NEW."isCurrent" IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'LEGAL_DOCUMENT_VERSION_REACTIVATION_FORBIDDEN'
        USING ERRCODE = '55000';
    END IF;

    IF NEW."supersededAt" IS DISTINCT FROM OLD."supersededAt" THEN
      RAISE EXCEPTION 'LEGAL_DOCUMENT_VERSION_SUPERSESSION_TIME_IMMUTABLE'
        USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW."isCurrent" IS TRUE THEN
    IF NEW."supersededAt" IS NOT NULL THEN
      RAISE EXCEPTION 'LEGAL_DOCUMENT_VERSION_CURRENT_CANNOT_BE_SUPERSEDED'
        USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW."supersededAt" IS NULL THEN
    RAISE EXCEPTION 'LEGAL_DOCUMENT_VERSION_SUPERSESSION_TIME_REQUIRED'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."supersededAt" > now() THEN
    RAISE EXCEPTION 'LEGAL_DOCUMENT_VERSION_FUTURE_SUPERSESSION_FORBIDDEN'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "LegalDocumentVersion_immutability_guard"
BEFORE UPDATE OR DELETE
ON edulife_os."LegalDocumentVersion"
FOR EACH ROW
EXECUTE FUNCTION edulife_os.legal_document_version_immutability_guard();

CREATE TABLE edulife_os."LegalAcceptance" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "userId" text NOT NULL,
  "termsDocumentId" uuid NOT NULL,
  "privacyDocumentId" uuid NOT NULL,
  "termsVersionSnapshot" varchar(64) NOT NULL,
  "privacyVersionSnapshot" varchar(64) NOT NULL,
  "termsContentHashSnapshot" varchar(64) NOT NULL,
  "privacyContentHashSnapshot" varchar(64) NOT NULL,
  "authorityType" varchar(40) NOT NULL,
  "authorityId" text NOT NULL,
  "membershipId" text,
  "governanceAssignmentId" text,
  "roleSnapshot" varchar(80) NOT NULL,
  "scopeType" varchar(40) NOT NULL,
  "scopeId" text NOT NULL,
  "acceptanceSource" varchar(80) NOT NULL,
  "acceptedAt" timestamptz NOT NULL DEFAULT now(),
  "evidenceJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "LegalAcceptance_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "LegalAcceptance_user_fkey"
    FOREIGN KEY ("userId")
    REFERENCES edulife_os."User" ("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION,

  CONSTRAINT "LegalAcceptance_terms_document_fkey"
    FOREIGN KEY ("termsDocumentId")
    REFERENCES edulife_os."LegalDocumentVersion" ("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION,

  CONSTRAINT "LegalAcceptance_privacy_document_fkey"
    FOREIGN KEY ("privacyDocumentId")
    REFERENCES edulife_os."LegalDocumentVersion" ("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION,

  CONSTRAINT "LegalAcceptance_membership_fkey"
    FOREIGN KEY ("membershipId")
    REFERENCES edulife_os."Membership" ("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION,

  CONSTRAINT "LegalAcceptance_governance_assignment_fkey"
    FOREIGN KEY ("governanceAssignmentId")
    REFERENCES edulife_os."GovernanceOfficerAssignment" ("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION,

  CONSTRAINT "LegalAcceptance_idempotency_unique"
    UNIQUE (
      "userId",
      "termsDocumentId",
      "privacyDocumentId",
      "authorityType",
      "authorityId"
    ),

  CONSTRAINT "LegalAcceptance_document_pair_check"
    CHECK ("termsDocumentId" <> "privacyDocumentId"),

  CONSTRAINT "LegalAcceptance_authority_type_check"
    CHECK (
      "authorityType" IN (
        'SCHOOL_MEMBERSHIP',
        'GOVERNANCE_ASSIGNMENT'
      )
    ),

  CONSTRAINT "LegalAcceptance_hash_snapshot_check"
    CHECK (
      "termsContentHashSnapshot" ~ '^[0-9a-fA-F]{64}$'
      AND "privacyContentHashSnapshot" ~ '^[0-9a-fA-F]{64}$'
    ),

  CONSTRAINT "LegalAcceptance_evidence_check"
    CHECK (jsonb_typeof("evidenceJson") = 'object')
);

CREATE INDEX "LegalAcceptance_user_idx"
  ON edulife_os."LegalAcceptance" ("userId", "acceptedAt" DESC);

CREATE INDEX "LegalAcceptance_authority_idx"
  ON edulife_os."LegalAcceptance" ("authorityType", "authorityId", "acceptedAt" DESC);

CREATE INDEX "LegalAcceptance_accepted_idx"
  ON edulife_os."LegalAcceptance" ("acceptedAt" DESC);

CREATE FUNCTION edulife_os.legal_acceptance_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  terms_doc record;
  privacy_doc record;
  membership_user_id text;
  membership_tenant_id text;
  membership_status text;
  membership_role_name text;
  membership_tenant_status text;
  governance_user_id text;
  governance_zone_id text;
  governance_role_name text;
  governance_status text;
  governance_revoked_at timestamptz;
  governance_zone_active boolean;
BEGIN
  SELECT
    d."documentType",
    d."version",
    d."contentHash",
    d."effectiveAt",
    d."publishedAt",
    d."isCurrent",
    d."supersededAt"
  INTO terms_doc
  FROM edulife_os."LegalDocumentVersion" d
  WHERE d."id" = NEW."termsDocumentId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEGAL_ACCEPTANCE_TERMS_DOCUMENT_NOT_FOUND';
  END IF;

  IF terms_doc."documentType" <> 'TERMS_OF_SERVICE' THEN
    RAISE EXCEPTION 'LEGAL_ACCEPTANCE_INVALID_TERMS_DOCUMENT_TYPE';
  END IF;

  IF
    terms_doc."isCurrent" IS DISTINCT FROM true
    OR terms_doc."supersededAt" IS NOT NULL
    OR terms_doc."publishedAt" > now()
    OR terms_doc."effectiveAt" > now()
  THEN
    RAISE EXCEPTION 'LEGAL_ACCEPTANCE_TERMS_DOCUMENT_NOT_CURRENT';
  END IF;

  SELECT
    d."documentType",
    d."version",
    d."contentHash",
    d."effectiveAt",
    d."publishedAt",
    d."isCurrent",
    d."supersededAt"
  INTO privacy_doc
  FROM edulife_os."LegalDocumentVersion" d
  WHERE d."id" = NEW."privacyDocumentId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEGAL_ACCEPTANCE_PRIVACY_DOCUMENT_NOT_FOUND';
  END IF;

  IF privacy_doc."documentType" <> 'PRIVACY_NOTICE' THEN
    RAISE EXCEPTION 'LEGAL_ACCEPTANCE_INVALID_PRIVACY_DOCUMENT_TYPE';
  END IF;

  IF
    privacy_doc."isCurrent" IS DISTINCT FROM true
    OR privacy_doc."supersededAt" IS NOT NULL
    OR privacy_doc."publishedAt" > now()
    OR privacy_doc."effectiveAt" > now()
  THEN
    RAISE EXCEPTION 'LEGAL_ACCEPTANCE_PRIVACY_DOCUMENT_NOT_CURRENT';
  END IF;

  NEW."termsVersionSnapshot" := terms_doc."version";
  NEW."privacyVersionSnapshot" := privacy_doc."version";
  NEW."termsContentHashSnapshot" := terms_doc."contentHash";
  NEW."privacyContentHashSnapshot" := privacy_doc."contentHash";

  IF NEW."authorityType" = 'SCHOOL_MEMBERSHIP' THEN
    SELECT
      m."userId",
      m."tenantId",
      m."status",
      r."name",
      t."status"::text
    INTO
      membership_user_id,
      membership_tenant_id,
      membership_status,
      membership_role_name,
      membership_tenant_status
    FROM edulife_os."Membership" m
    JOIN edulife_os."Role" r ON r."id" = m."roleId"
    JOIN edulife_os."Tenant" t ON t."id" = m."tenantId"
    WHERE m."id" = NEW."authorityId";

    IF NOT FOUND THEN
      RAISE EXCEPTION 'LEGAL_ACCEPTANCE_MEMBERSHIP_NOT_FOUND';
    END IF;

    IF membership_user_id <> NEW."userId" THEN
      RAISE EXCEPTION 'LEGAL_ACCEPTANCE_MEMBERSHIP_USER_MISMATCH';
    END IF;

    IF membership_status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'LEGAL_ACCEPTANCE_MEMBERSHIP_NOT_ACTIVE';
    END IF;

    IF membership_tenant_status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'LEGAL_ACCEPTANCE_TENANT_NOT_ACTIVE';
    END IF;

    IF membership_role_name NOT IN ('TEACHER', 'HEADTEACHER', 'HEADMASTER') THEN
      RAISE EXCEPTION 'LEGAL_ACCEPTANCE_STAFF_ROLE_NOT_ALLOWED';
    END IF;

    NEW."membershipId" := NEW."authorityId";
    NEW."governanceAssignmentId" := NULL;
    NEW."roleSnapshot" := membership_role_name;
    NEW."scopeType" := 'TENANT';
    NEW."scopeId" := membership_tenant_id;

  ELSIF NEW."authorityType" = 'GOVERNANCE_ASSIGNMENT' THEN
    SELECT
      g."userId",
      g."zoneId",
      g."role"::text,
      g."status"::text,
      g."revokedAt",
      z."isActive"
    INTO
      governance_user_id,
      governance_zone_id,
      governance_role_name,
      governance_status,
      governance_revoked_at,
      governance_zone_active
    FROM edulife_os."GovernanceOfficerAssignment" g
    JOIN edulife_os."AdminZone" z ON z."id" = g."zoneId"
    WHERE g."id" = NEW."authorityId";

    IF NOT FOUND THEN
      RAISE EXCEPTION 'LEGAL_ACCEPTANCE_GOVERNANCE_ASSIGNMENT_NOT_FOUND';
    END IF;

    IF governance_user_id <> NEW."userId" THEN
      RAISE EXCEPTION 'LEGAL_ACCEPTANCE_GOVERNANCE_USER_MISMATCH';
    END IF;

    IF governance_status <> 'ACTIVE' OR governance_revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'LEGAL_ACCEPTANCE_GOVERNANCE_ASSIGNMENT_NOT_ACTIVE';
    END IF;

    IF governance_zone_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'LEGAL_ACCEPTANCE_GOVERNANCE_ZONE_NOT_ACTIVE';
    END IF;

    NEW."membershipId" := NULL;
    NEW."governanceAssignmentId" := NEW."authorityId";
    NEW."roleSnapshot" := governance_role_name;
    NEW."scopeType" := 'ADMIN_ZONE';
    NEW."scopeId" := governance_zone_id;

  ELSE
    RAISE EXCEPTION 'LEGAL_ACCEPTANCE_UNKNOWN_AUTHORITY_TYPE';
  END IF;

  IF length(btrim(NEW."acceptanceSource")) = 0 THEN
    RAISE EXCEPTION 'LEGAL_ACCEPTANCE_SOURCE_REQUIRED';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "LegalAcceptance_insert_guard"
BEFORE INSERT
ON edulife_os."LegalAcceptance"
FOR EACH ROW
EXECUTE FUNCTION edulife_os.legal_acceptance_insert_guard();

CREATE FUNCTION edulife_os.legal_acceptance_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'LEGAL_ACCEPTANCE_IMMUTABLE'
    USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER "LegalAcceptance_immutability_guard"
BEFORE UPDATE OR DELETE
ON edulife_os."LegalAcceptance"
FOR EACH ROW
EXECUTE FUNCTION edulife_os.legal_acceptance_immutability_guard();

CREATE TABLE edulife_os."OnboardingWelcome" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "userId" text NOT NULL,
  "tenantId" text NOT NULL,
  "membershipId" text NOT NULL,
  "roleSnapshot" varchar(80) NOT NULL,
  "messageVersion" varchar(80) NOT NULL,
  "messageSnapshotJson" jsonb NOT NULL,
  "emailStatus" varchar(20) NOT NULL DEFAULT 'PENDING',
  "emailAttemptCount" integer NOT NULL DEFAULT 0,
  "emailLastAttemptAt" timestamptz,
  "emailSentAt" timestamptz,
  "emailLastError" text,
  "smsStatus" varchar(20) NOT NULL DEFAULT 'PENDING',
  "smsAttemptCount" integer NOT NULL DEFAULT 0,
  "smsLastAttemptAt" timestamptz,
  "smsSentAt" timestamptz,
  "smsLastError" text,
  "inAppVisibleAt" timestamptz NOT NULL DEFAULT now(),
  "inAppSeenAt" timestamptz,
  "inAppDismissedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "OnboardingWelcome_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "OnboardingWelcome_user_fkey"
    FOREIGN KEY ("userId")
    REFERENCES edulife_os."User" ("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION,

  CONSTRAINT "OnboardingWelcome_tenant_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES edulife_os."Tenant" ("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION,

  CONSTRAINT "OnboardingWelcome_membership_fkey"
    FOREIGN KEY ("membershipId")
    REFERENCES edulife_os."Membership" ("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION,

  CONSTRAINT "OnboardingWelcome_idempotency_unique"
    UNIQUE ("membershipId"),

  CONSTRAINT "OnboardingWelcome_role_check"
    CHECK (
      "roleSnapshot" IN (
        'TEACHER',
        'HEADTEACHER',
        'HEADMASTER'
      )
    ),

  CONSTRAINT "OnboardingWelcome_message_version_check"
    CHECK (length(btrim("messageVersion")) BETWEEN 1 AND 80),

  CONSTRAINT "OnboardingWelcome_message_snapshot_check"
    CHECK (
      jsonb_typeof("messageSnapshotJson") = 'object'
      AND "messageSnapshotJson" <> '{}'::jsonb
    ),

  CONSTRAINT "OnboardingWelcome_email_status_check"
    CHECK ("emailStatus" IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),

  CONSTRAINT "OnboardingWelcome_sms_status_check"
    CHECK ("smsStatus" IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),

  CONSTRAINT "OnboardingWelcome_attempt_count_check"
    CHECK (
      "emailAttemptCount" >= 0
      AND "smsAttemptCount" >= 0
    ),

  CONSTRAINT "OnboardingWelcome_email_delivery_state_check"
    CHECK (
      (
        "emailStatus" = 'SENT'
        AND "emailSentAt" IS NOT NULL
        AND "emailSentAt" >= "createdAt"
      )
      OR
      (
        "emailStatus" <> 'SENT'
        AND "emailSentAt" IS NULL
      )
    ),

  CONSTRAINT "OnboardingWelcome_sms_delivery_state_check"
    CHECK (
      (
        "smsStatus" = 'SENT'
        AND "smsSentAt" IS NOT NULL
        AND "smsSentAt" >= "createdAt"
      )
      OR
      (
        "smsStatus" <> 'SENT'
        AND "smsSentAt" IS NULL
      )
    ),

  CONSTRAINT "OnboardingWelcome_email_attempt_timeline_check"
    CHECK (
      (
        "emailAttemptCount" = 0
        AND "emailLastAttemptAt" IS NULL
      )
      OR
      (
        "emailAttemptCount" > 0
        AND "emailLastAttemptAt" IS NOT NULL
        AND "emailLastAttemptAt" >= "createdAt"
      )
    ),

  CONSTRAINT "OnboardingWelcome_sms_attempt_timeline_check"
    CHECK (
      (
        "smsAttemptCount" = 0
        AND "smsLastAttemptAt" IS NULL
      )
      OR
      (
        "smsAttemptCount" > 0
        AND "smsLastAttemptAt" IS NOT NULL
        AND "smsLastAttemptAt" >= "createdAt"
      )
    ),

  CONSTRAINT "OnboardingWelcome_inapp_timeline_check"
    CHECK (
      (
        "inAppSeenAt" IS NULL
        OR "inAppSeenAt" >= "inAppVisibleAt"
      )
      AND
      (
        "inAppDismissedAt" IS NULL
        OR "inAppDismissedAt" >= "inAppVisibleAt"
      )
    ),

  CONSTRAINT "OnboardingWelcome_updated_timeline_check"
    CHECK ("updatedAt" >= "createdAt")
);

CREATE INDEX "OnboardingWelcome_user_tenant_idx"
  ON edulife_os."OnboardingWelcome" ("userId", "tenantId", "createdAt" DESC);

CREATE INDEX "OnboardingWelcome_inapp_idx"
  ON edulife_os."OnboardingWelcome" ("userId", "inAppVisibleAt" DESC)
  WHERE "inAppDismissedAt" IS NULL;

CREATE INDEX "OnboardingWelcome_delivery_idx"
  ON edulife_os."OnboardingWelcome" ("emailStatus", "smsStatus", "createdAt");

CREATE FUNCTION edulife_os.onboarding_welcome_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  membership_user_id text;
  membership_tenant_id text;
  membership_status text;
  membership_role_name text;
  tenant_status text;
BEGIN
  SELECT
    m."userId",
    m."tenantId",
    m."status",
    r."name",
    t."status"::text
  INTO
    membership_user_id,
    membership_tenant_id,
    membership_status,
    membership_role_name,
    tenant_status
  FROM edulife_os."Membership" m
  JOIN edulife_os."Role" r ON r."id" = m."roleId"
  JOIN edulife_os."Tenant" t ON t."id" = m."tenantId"
  WHERE m."id" = NEW."membershipId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ONBOARDING_WELCOME_MEMBERSHIP_NOT_FOUND';
  END IF;

  IF membership_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'ONBOARDING_WELCOME_MEMBERSHIP_NOT_ACTIVE';
  END IF;

  IF tenant_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'ONBOARDING_WELCOME_TENANT_NOT_ACTIVE';
  END IF;

  IF membership_role_name NOT IN ('TEACHER', 'HEADTEACHER', 'HEADMASTER') THEN
    RAISE EXCEPTION 'ONBOARDING_WELCOME_ROLE_NOT_ALLOWED';
  END IF;

  NEW."userId" := membership_user_id;
  NEW."tenantId" := membership_tenant_id;
  NEW."roleSnapshot" := membership_role_name;

  RETURN NEW;
END
$$;

CREATE TRIGGER "OnboardingWelcome_insert_guard"
BEFORE INSERT
ON edulife_os."OnboardingWelcome"
FOR EACH ROW
EXECUTE FUNCTION edulife_os.onboarding_welcome_insert_guard();

CREATE FUNCTION edulife_os.onboarding_welcome_evidence_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ONBOARDING_WELCOME_DELETE_FORBIDDEN'
      USING ERRCODE = '55000';
  END IF;

  IF
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."membershipId" IS DISTINCT FROM OLD."membershipId"
    OR NEW."roleSnapshot" IS DISTINCT FROM OLD."roleSnapshot"
    OR NEW."messageVersion" IS DISTINCT FROM OLD."messageVersion"
    OR NEW."messageSnapshotJson" IS DISTINCT FROM OLD."messageSnapshotJson"
    OR NEW."inAppVisibleAt" IS DISTINCT FROM OLD."inAppVisibleAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'ONBOARDING_WELCOME_CORE_EVIDENCE_IMMUTABLE'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."emailAttemptCount" < OLD."emailAttemptCount" THEN
    RAISE EXCEPTION 'ONBOARDING_WELCOME_EMAIL_ATTEMPT_COUNT_CANNOT_DECREASE'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."smsAttemptCount" < OLD."smsAttemptCount" THEN
    RAISE EXCEPTION 'ONBOARDING_WELCOME_SMS_ATTEMPT_COUNT_CANNOT_DECREASE'
      USING ERRCODE = '55000';
  END IF;

  IF
    OLD."emailSentAt" IS NOT NULL
    AND NEW."emailSentAt" IS DISTINCT FROM OLD."emailSentAt"
  THEN
    RAISE EXCEPTION 'ONBOARDING_WELCOME_EMAIL_SENT_TIME_IMMUTABLE'
      USING ERRCODE = '55000';
  END IF;

  IF
    OLD."smsSentAt" IS NOT NULL
    AND NEW."smsSentAt" IS DISTINCT FROM OLD."smsSentAt"
  THEN
    RAISE EXCEPTION 'ONBOARDING_WELCOME_SMS_SENT_TIME_IMMUTABLE'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."emailStatus" = 'SENT' AND NEW."emailStatus" <> 'SENT' THEN
    RAISE EXCEPTION 'ONBOARDING_WELCOME_EMAIL_SENT_STATUS_TERMINAL'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."smsStatus" = 'SENT' AND NEW."smsStatus" <> 'SENT' THEN
    RAISE EXCEPTION 'ONBOARDING_WELCOME_SMS_SENT_STATUS_TERMINAL'
      USING ERRCODE = '55000';
  END IF;

  IF
    OLD."inAppSeenAt" IS NOT NULL
    AND NEW."inAppSeenAt" IS DISTINCT FROM OLD."inAppSeenAt"
  THEN
    RAISE EXCEPTION 'ONBOARDING_WELCOME_SEEN_TIME_IMMUTABLE'
      USING ERRCODE = '55000';
  END IF;

  IF
    OLD."inAppDismissedAt" IS NOT NULL
    AND NEW."inAppDismissedAt" IS DISTINCT FROM OLD."inAppDismissedAt"
  THEN
    RAISE EXCEPTION 'ONBOARDING_WELCOME_DISMISSED_TIME_IMMUTABLE'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."updatedAt" < OLD."updatedAt" THEN
    RAISE EXCEPTION 'ONBOARDING_WELCOME_UPDATED_AT_CANNOT_DECREASE'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "OnboardingWelcome_evidence_guard"
BEFORE UPDATE OR DELETE
ON edulife_os."OnboardingWelcome"
FOR EACH ROW
EXECUTE FUNCTION edulife_os.onboarding_welcome_evidence_guard();

COMMENT ON TABLE edulife_os."LegalDocumentVersion"
IS 'Immutable published Terms/Privacy document authority. Content may be superseded but never rewritten.';

COMMENT ON TABLE edulife_os."LegalAcceptance"
IS 'Append-only evidence that a user accepted the current Terms and acknowledged the current Privacy Notice under verified school or governance authority.';

COMMENT ON TABLE edulife_os."OnboardingWelcome"
IS 'Idempotent Teacher/Headteacher onboarding welcome authority. User, tenant, membership, role and exact message evidence are immutable; email/SMS/in-app lifecycle evidence may advance under guarded rules. Essential Alerts remain a separate optional consent authority.';

COMMIT;
