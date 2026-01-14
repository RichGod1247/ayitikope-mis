-- TenantSettings (one row per tenant)
CREATE TABLE IF NOT EXISTS edulife_os."tenant_settings" (
  "tenantId"            TEXT PRIMARY KEY,
  "currentTerm"         TEXT,
  "currentAcademicYear" TEXT,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_settings_tenant_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES edulife_os."Tenant"("id")
    ON DELETE CASCADE
);

-- Guardrails (optional but recommended)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenant_settings_term_chk'
  ) THEN
    ALTER TABLE edulife_os."tenant_settings"
      ADD CONSTRAINT tenant_settings_term_chk
      CHECK ("currentTerm" IN ('1st Term','2nd Term','3rd Term') OR "currentTerm" IS NULL);
  END IF;
END $$;
