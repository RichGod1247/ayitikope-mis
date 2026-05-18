-- ============================================================
-- EduLife OS Sprint 10 Phase A2
-- Governance seed, canonical tenant correction, duplicate quarantine,
-- officer assignment, and Gefia Circuit correction.
-- ============================================================

BEGIN;

-- 1. Ensure Volta Region exists.
INSERT INTO "AdminZone" (
  "id",
  "name",
  "code",
  "countryCode",
  "zoneTypeId",
  "parentZoneId",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  'zone-gh-volta-region',
  'Volta Region',
  'GH-VR',
  'GH',
  azt."id",
  NULL,
  TRUE,
  NOW(),
  NOW()
FROM "AdminZoneType" azt
WHERE azt."countryCode" = 'GH'
  AND azt."level" = 3
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "code" = EXCLUDED."code",
  "countryCode" = EXCLUDED."countryCode",
  "zoneTypeId" = EXCLUDED."zoneTypeId",
  "parentZoneId" = EXCLUDED."parentZoneId",
  "isActive" = TRUE,
  "updatedAt" = NOW();

-- 2. Ensure Akatsi South District exists.
INSERT INTO "AdminZone" (
  "id",
  "name",
  "code",
  "countryCode",
  "zoneTypeId",
  "parentZoneId",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  'zone-gh-akatsi-south-district',
  'Akatsi South District',
  'GH-VR-AKATSISOUTH',
  'GH',
  azt."id",
  'zone-gh-volta-region',
  TRUE,
  NOW(),
  NOW()
FROM "AdminZoneType" azt
WHERE azt."countryCode" = 'GH'
  AND azt."level" = 2
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "code" = EXCLUDED."code",
  "countryCode" = EXCLUDED."countryCode",
  "zoneTypeId" = EXCLUDED."zoneTypeId",
  "parentZoneId" = EXCLUDED."parentZoneId",
  "isActive" = TRUE,
  "updatedAt" = NOW();

-- 3. Ensure Gefia Circuit exists.
-- Internal ID kept stable because the duplicate tenant had already pointed to this ID.
INSERT INTO "AdminZone" (
  "id",
  "name",
  "code",
  "countryCode",
  "zoneTypeId",
  "parentZoneId",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  'zone-gh-akatsi-south-circuit-1',
  'Gefia Circuit',
  'GH-VR-AKATSISOUTH-GEFIA',
  'GH',
  azt."id",
  'zone-gh-akatsi-south-district',
  TRUE,
  NOW(),
  NOW()
FROM "AdminZoneType" azt
WHERE azt."countryCode" = 'GH'
  AND azt."level" = 1
ON CONFLICT ("id") DO UPDATE SET
  "name" = 'Gefia Circuit',
  "code" = 'GH-VR-AKATSISOUTH-GEFIA',
  "countryCode" = EXCLUDED."countryCode",
  "zoneTypeId" = EXCLUDED."zoneTypeId",
  "parentZoneId" = EXCLUDED."parentZoneId",
  "isActive" = TRUE,
  "updatedAt" = NOW();

-- 4. Assign governance placement to the REAL data-bearing tenant.
UPDATE "Tenant"
SET
  "zoneId" = 'zone-gh-akatsi-south-circuit-1',
  "region" = 'Volta Region',
  "district" = 'Akatsi South District',
  "circuit" = 'Gefia Circuit',
  "status" = 'ACTIVE',
  "updatedAt" = NOW(),
  "settings" = COALESCE("settings", '{}'::jsonb)
    || jsonb_build_object(
      'canonicalGovernanceTenant', true,
      'governancePlacementCorrectedAt', NOW(),
      'governancePlacementCorrectedReason', 'Sprint 10 Phase A2: canonical live tenant assigned to Gefia Circuit'
    )
WHERE "id" = 'cmhhnghn00008vcpgp3fl07fl';

-- 5. Quarantine duplicate tenant without deleting evidence.
UPDATE "Tenant"
SET
  "zoneId" = NULL,
  "status" = 'PENDING',
  "name" = 'DUPLICATE - DO NOT USE - Ayitikope M/A Basic School',
  "region" = NULL,
  "district" = NULL,
  "circuit" = NULL,
  "updatedAt" = NOW(),
  "settings" = COALESCE("settings", '{}'::jsonb)
    || jsonb_build_object(
      'archivedLike', true,
      'quarantinedAt', NOW(),
      'quarantineReason', 'Duplicate tenant created post-crash. Real live tenant is cmhhnghn00008vcpgp3fl07fl.',
      'canonicalTenantId', 'cmhhnghn00008vcpgp3fl07fl',
      'removedFromGovernanceScope', true
    )
WHERE "id" = 'cmoe8t3640000t3d0z64fz5mx';

-- 6. Assign SISSO to Gefia Circuit.
INSERT INTO "GovernanceOfficerAssignment" (
  "id",
  "userId",
  "zoneId",
  "role",
  "status",
  "title",
  "createdAt",
  "updatedAt",
  "metadata"
)
SELECT
  gen_random_uuid()::text,
  'cmohmdnwc0013t3mwuovznx0x',
  'zone-gh-akatsi-south-circuit-1',
  'SISSO',
  'ACTIVE',
  'SISO Gefia Circuit',
  NOW(),
  NOW(),
  '{"source":"Sprint 10 Phase A2 proof seed after tenant correction"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM "GovernanceOfficerAssignment"
  WHERE "userId" = 'cmohmdnwc0013t3mwuovznx0x'
    AND "zoneId" = 'zone-gh-akatsi-south-circuit-1'
    AND "role" = 'SISSO'
    AND "status" = 'ACTIVE'
    AND "revokedAt" IS NULL
);

UPDATE "GovernanceOfficerAssignment"
SET
  "title" = 'SISO Gefia Circuit',
  "updatedAt" = NOW(),
  "metadata" = COALESCE("metadata", '{}'::jsonb)
    || jsonb_build_object(
      'circuitNameCorrectedAt', NOW(),
      'circuitNameCorrectedTo', 'Gefia Circuit'
    )
WHERE "userId" = 'cmohmdnwc0013t3mwuovznx0x'
  AND "zoneId" = 'zone-gh-akatsi-south-circuit-1'
  AND "role" = 'SISSO'
  AND "status" = 'ACTIVE'
  AND "revokedAt" IS NULL;

-- 7. Assign District Director to Akatsi South District.
INSERT INTO "GovernanceOfficerAssignment" (
  "id",
  "userId",
  "zoneId",
  "role",
  "status",
  "title",
  "createdAt",
  "updatedAt",
  "metadata"
)
SELECT
  gen_random_uuid()::text,
  'cmohmdpbk0019t3mwgk0ugn9d',
  'zone-gh-akatsi-south-district',
  'DISTRICT_DIRECTOR',
  'ACTIVE',
  'District Director Akatsi South',
  NOW(),
  NOW(),
  '{"source":"Sprint 10 Phase A2 proof seed after tenant correction"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM "GovernanceOfficerAssignment"
  WHERE "userId" = 'cmohmdpbk0019t3mwgk0ugn9d'
    AND "zoneId" = 'zone-gh-akatsi-south-district'
    AND "role" = 'DISTRICT_DIRECTOR'
    AND "status" = 'ACTIVE'
    AND "revokedAt" IS NULL
);

-- 8. Correct SISSO display name.
UPDATE "User"
SET
  "name" = 'SISO Gefia Circuit',
  "updatedAt" = NOW()
WHERE "id" = 'cmohmdnwc0013t3mwuovznx0x';

-- 9. Audit evidence.
INSERT INTO "AuditLog" (
  "id",
  "tenantId",
  "userId",
  "action",
  "resource",
  "resourceId",
  "metadata",
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  'cmhhnghn00008vcpgp3fl07fl',
  NULL,
  'GOVERNANCE_PHASE_A2_SEED_AND_CORRECTION_RECORDED',
  'Tenant',
  'cmhhnghn00008vcpgp3fl07fl',
  jsonb_build_object(
    'realTenantId', 'cmhhnghn00008vcpgp3fl07fl',
    'duplicateTenantId', 'cmoe8t3640000t3d0z64fz5mx',
    'region', 'Volta Region',
    'district', 'Akatsi South District',
    'circuit', 'Gefia Circuit',
    'sissoUserId', 'cmohmdnwc0013t3mwuovznx0x',
    'districtDirectorUserId', 'cmohmdpbk0019t3mwgk0ugn9d',
    'reason', 'Sprint 10 Phase A governance proof requires canonical data-bearing tenant and correct circuit identity'
  ),
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM "AuditLog"
  WHERE "action" = 'GOVERNANCE_PHASE_A2_SEED_AND_CORRECTION_RECORDED'
    AND "resourceId" = 'cmhhnghn00008vcpgp3fl07fl'
);

COMMIT;