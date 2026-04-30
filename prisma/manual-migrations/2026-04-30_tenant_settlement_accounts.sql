DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'SettlementAccountStatus'
  ) THEN
    CREATE TYPE edulife_os."SettlementAccountStatus" AS ENUM (
      'PENDING',
      'ACTIVE',
      'DISABLED',
      'FAILED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS edulife_os."TenantSettlementAccount" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "provider" edulife_os."PaymentProvider" NOT NULL DEFAULT 'PAYSTACK',
  "providerSubaccountCode" varchar(80),
  "bankCode" varchar(32),
  "bankName" text,
  "accountName" text,
  "accountNumberLast4" varchar(8),
  "accountNumberEncrypted" text,
  "currency" varchar(8) NOT NULL DEFAULT 'GHS',
  "status" edulife_os."SettlementAccountStatus" NOT NULL DEFAULT 'PENDING',
  "isPrimary" boolean NOT NULL DEFAULT false,
  "requestedByUserId" text,
  "approvedByUserId" text,
  "approvedAt" timestamptz,
  "disabledAt" timestamptz,
  "disableReason" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "TenantSettlementAccount_tenant_fk"
    FOREIGN KEY ("tenantId")
    REFERENCES edulife_os."Tenant"("id")
    ON DELETE CASCADE,

  CONSTRAINT "TenantSettlementAccount_requestedBy_fk"
    FOREIGN KEY ("requestedByUserId")
    REFERENCES edulife_os."User"("id")
    ON DELETE SET NULL,

  CONSTRAINT "TenantSettlementAccount_approvedBy_fk"
    FOREIGN KEY ("approvedByUserId")
    REFERENCES edulife_os."User"("id")
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantSettlement_provider_subaccount_unique"
ON edulife_os."TenantSettlementAccount" ("tenantId", "provider", "providerSubaccountCode")
WHERE "providerSubaccountCode" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "TenantSettlementAccount_tenant_status_idx"
ON edulife_os."TenantSettlementAccount" ("tenantId", "status");

CREATE INDEX IF NOT EXISTS "TenantSettlementAccount_tenant_primary_idx"
ON edulife_os."TenantSettlementAccount" ("tenantId", "isPrimary");

CREATE INDEX IF NOT EXISTS "TenantSettlementAccount_provider_subaccount_idx"
ON edulife_os."TenantSettlementAccount" ("provider", "providerSubaccountCode");

ALTER TABLE edulife_os."PaymentIntent"
ADD COLUMN IF NOT EXISTS "settlementAccountId" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PaymentIntent_settlementAccount_fk'
  ) THEN
    ALTER TABLE edulife_os."PaymentIntent"
    ADD CONSTRAINT "PaymentIntent_settlementAccount_fk"
    FOREIGN KEY ("settlementAccountId")
    REFERENCES edulife_os."TenantSettlementAccount"("id")
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PaymentIntent_tenant_settlementAccount_idx"
ON edulife_os."PaymentIntent" ("tenantId", "settlementAccountId");