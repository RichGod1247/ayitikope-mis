-- A16.3.3C.6
-- Immutable object-promotion truth for governance notice attachments.
--
-- The browser uploads only to the staging key held in "objectKey".
-- A separate server-generated destination is stored in "immutableObjectKey".
-- Malware CLEAN and READY are forbidden until the authoritative objectKey has
-- been switched to that immutable destination.
--
-- Historical SEALED / NOT_SCANNED records remain unchanged and valid.

BEGIN;

SET LOCAL search_path TO edulife_os, pg_catalog;

ALTER TABLE edulife_os."GovernanceOfficialNoticeAttachment"
  ADD COLUMN IF NOT EXISTS "immutableObjectKey"
    VARCHAR(500),

  ADD COLUMN IF NOT EXISTS "immutableAt"
    TIMESTAMPTZ(6);

CREATE UNIQUE INDEX IF NOT EXISTS
  "GovernanceNoticeAttachment_immutableObjectKey_unique"
ON edulife_os."GovernanceOfficialNoticeAttachment" (
  "immutableObjectKey"
)
WHERE "immutableObjectKey" IS NOT NULL;

CREATE INDEX IF NOT EXISTS
  "GovernanceNoticeAttachment_immutableAt_idx"
ON edulife_os."GovernanceOfficialNoticeAttachment" (
  "immutableAt"
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_record
    INNER JOIN pg_class AS table_record
      ON table_record.oid = constraint_record.conrelid
    INNER JOIN pg_namespace AS namespace_record
      ON namespace_record.oid = table_record.relnamespace
    WHERE namespace_record.nspname = 'edulife_os'
      AND table_record.relname =
        'GovernanceOfficialNoticeAttachment'
      AND constraint_record.conname =
        'GovernanceNoticeAttachment_immutable_key_prefix_check'
  ) THEN
    ALTER TABLE
      edulife_os."GovernanceOfficialNoticeAttachment"
    ADD CONSTRAINT
      "GovernanceNoticeAttachment_immutable_key_prefix_check"
    CHECK (
      "immutableObjectKey" IS NULL
      OR (
        NULLIF(BTRIM("immutableObjectKey"), '') IS NOT NULL
        AND "immutableObjectKey" LIKE
          'governance-notices-immutable/%'
      )
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_record
    INNER JOIN pg_class AS table_record
      ON table_record.oid = constraint_record.conrelid
    INNER JOIN pg_namespace AS namespace_record
      ON namespace_record.oid = table_record.relnamespace
    WHERE namespace_record.nspname = 'edulife_os'
      AND table_record.relname =
        'GovernanceOfficialNoticeAttachment'
      AND constraint_record.conname =
        'GovernanceNoticeAttachment_immutable_evidence_check'
  ) THEN
    ALTER TABLE
      edulife_os."GovernanceOfficialNoticeAttachment"
    ADD CONSTRAINT
      "GovernanceNoticeAttachment_immutable_evidence_check"
    CHECK (
      "immutableAt" IS NULL
      OR (
        "immutableObjectKey" IS NOT NULL
        AND "objectKey" = "immutableObjectKey"
      )
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_record
    INNER JOIN pg_class AS table_record
      ON table_record.oid = constraint_record.conrelid
    INNER JOIN pg_namespace AS namespace_record
      ON namespace_record.oid = table_record.relnamespace
    WHERE namespace_record.nspname = 'edulife_os'
      AND table_record.relname =
        'GovernanceOfficialNoticeAttachment'
      AND constraint_record.conname =
        'GovernanceNoticeAttachment_malware_clean_immutable_check'
  ) THEN
    ALTER TABLE
      edulife_os."GovernanceOfficialNoticeAttachment"
    ADD CONSTRAINT
      "GovernanceNoticeAttachment_malware_clean_immutable_check"
    CHECK (
      "malwareScanStatus"::text <> 'CLEAN'
      OR (
        "immutableObjectKey" IS NOT NULL
        AND "objectKey" = "immutableObjectKey"
        AND "immutableAt" IS NOT NULL
        AND NULLIF(BTRIM("etag"), '') IS NOT NULL
        AND NULLIF(BTRIM("sha256Hash"), '') IS NOT NULL
      )
    );
  END IF;
END
$$;

-- Replace the earlier READY constraint with the stronger immutable-storage
-- version. Historical SEALED rows are unaffected because this constraint
-- governs READY only.
ALTER TABLE
  edulife_os."GovernanceOfficialNoticeAttachment"
DROP CONSTRAINT IF EXISTS
  "GovernanceNoticeAttachment_ready_security_truth_check";

ALTER TABLE
  edulife_os."GovernanceOfficialNoticeAttachment"
ADD CONSTRAINT
  "GovernanceNoticeAttachment_ready_security_truth_check"
CHECK (
  "status"::text <> 'READY'
  OR (
    "scanStatus"::text = 'CLEAN'
    AND "malwareScanStatus"::text = 'CLEAN'

    AND NULLIF(BTRIM("sha256Hash"), '') IS NOT NULL
    AND NULLIF(BTRIM("etag"), '') IS NOT NULL

    AND "immutableObjectKey" IS NOT NULL
    AND "objectKey" = "immutableObjectKey"
    AND "immutableAt" IS NOT NULL

    AND "noticeId" IS NULL
    AND "sealedAt" IS NULL
    AND "rejectedAt" IS NULL
    AND "deletedAt" IS NULL
  )
);

COMMENT ON COLUMN
  edulife_os."GovernanceOfficialNoticeAttachment"."immutableObjectKey"
IS
  'Server-generated R2 destination key never authorized for browser PUT.';

COMMENT ON COLUMN
  edulife_os."GovernanceOfficialNoticeAttachment"."immutableAt"
IS
  'Time the authoritative objectKey was switched to the conditionally promoted immutable destination.';

COMMIT;