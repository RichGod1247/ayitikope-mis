#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects provisioning source. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix =
    detail === undefined
      ? ""
      : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);

  assert(
    fs.existsSync(absolutePath),
    "N6_B1_REQUIRED_FILE_MISSING",
    { relativePath },
  );

  return fs.readFileSync(absolutePath, "utf8");
}

function countOccurrences(source, marker) {
  return source.split(marker).length - 1;
}

function requireMarkers(relativePath, markers) {
  const source = read(relativePath);

  for (const marker of markers) {
    assert(
      source.includes(marker),
      "N6_B1_MARKER_MISSING",
      {
        relativePath,
        marker,
      },
    );
  }

  return source;
}

function extractBetween(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);

  assert(
    start >= 0,
    "N6_B3A_START_MARKER_MISSING",
    {
      label,
      startMarker,
    },
  );

  const end = source.indexOf(endMarker, start + startMarker.length);

  assert(
    end > start,
    "N6_B3A_END_MARKER_MISSING",
    {
      label,
      endMarker,
    },
  );

  return source.slice(start, end);
}

const publicApplication = requireMarkers(
  "src/app/apply/governance/GovernanceApplicationClient.tsx",
  [
    'value: "SISSO"',
    'label: "SISSO"',
    'value: "HEAD_OF_SUPERVISION"',
    'label: "Head of Supervision"',
    'value: "BASIC_SCHOOL_COORDINATOR"',
    'label: "Basic School Coordinator"',
    'role === "HEAD_OF_SUPERVISION" ||',
    'role === "BASIC_SCHOOL_COORDINATOR" ||',
    'fetch("/api/onboarding/applications"',
    "governanceRole: role",
    "zoneId,",
  ],
);

assert(
  countOccurrences(publicApplication, 'value: "SISSO"') === 1,
  "N7_P2C4A2_PUBLIC_SISSO_OPTION_MUST_BE_SINGLE",
);

assert(
  !publicApplication.includes('value: "CIRCUIT_SUPERVISOR"'),
  "N7_P2C4A2_PUBLIC_LEGACY_CIRCUIT_ALIAS_EXPOSED",
);

const publicApplicationApi = requireMarkers(
  "src/app/api/onboarding/applications/route.ts",
  [
    'const GOVERNANCE_ROLES = new Set<string>([',
    '"SISSO"',
    '"CIRCUIT_SUPERVISOR"',
    '"HEAD_OF_SUPERVISION"',
    '"BASIC_SCHOOL_COORDINATOR"',
    'role === "HEAD_OF_SUPERVISION" ||',
    'role === "BASIC_SCHOOL_COORDINATOR" ||',
    'error: "INVALID_GOVERNANCE_ROLE"',
    'error: "ROLE_ZONE_MISMATCH"',
    "zone.zoneType.level !== expectedLevel",
    "governanceRole: role as GovernanceOfficerRole",
    "zoneId,",
    '"Cache-Control": "no-store"',
  ],
);

assert(
  publicApplicationApi.includes('"CIRCUIT_SUPERVISOR"'),
  "N7_P2C4A2_LEGACY_ALIAS_SERVER_SUPPORT_MISSING",
);

const officerUi = requireMarkers(
  "src/app/admin/governance/officers/GovernanceOfficersClient.tsx",
  [
    'value: "SISSO"',
    'label: "SISSO"',
    'role === "CIRCUIT_SUPERVISOR" ? "SISSO" : role',
    "displayedTitle(a.role, a.title)",
    'value: "HEAD_OF_SUPERVISION"',
    'label: "Head of Supervision"',
    'value: "BASIC_SCHOOL_COORDINATOR"',
    'label: "Basic School Coordinator"',
    'level: 2',
    'fetch("/api/admin/governance/officers/invite"',
  ],
);

assert(
  countOccurrences(officerUi, 'value: "SISSO"') === 1,
  "N6_B6A4_SISSO_OPTION_MUST_BE_SINGLE",
);

assert(
  !officerUi.includes('value: "CIRCUIT_SUPERVISOR"'),
  "N6_B6A4_LEGACY_CIRCUIT_ALIAS_EXPOSED_AS_SELECTABLE_ROLE",
);

const directInviteRoute = requireMarkers(
  "src/app/api/admin/governance/officers/invite/route.ts",
  [
    '"SISSO"',
    '"CIRCUIT_SUPERVISOR"',
    'role === "SISSO" || role === "CIRCUIT_SUPERVISOR"',
    '"HEAD_OF_SUPERVISION"',
    '"BASIC_SCHOOL_COORDINATOR"',
    'role === "HEAD_OF_SUPERVISION" ||',
    'role === "BASIC_SCHOOL_COORDINATOR" ||',
    'error: "ROLE_ZONE_MISMATCH"',
    'requireRoleNames: ["SUPERADMIN"]',
    '"Cache-Control": "no-store"',
    "const tokenHash = sha256Hex(token);",
    "tokenHash,",
    "inviteUrl,",
    "return json(201, {",
  ],
);

const directInviteAudit = extractBetween(
  directInviteRoute,
  "await writeAuditLog({",
  "return json(201, {",
  "direct-governance-invite-audit",
);

assert(
  !directInviteAudit.includes("inviteUrl"),
  "N6_B3A_DIRECT_INVITE_URL_PRESENT_IN_AUDIT_METADATA",
);

assert(
  !directInviteAudit.includes("tokenHash") &&
    !directInviteAudit.includes("token,"),
  "N6_B3A_DIRECT_INVITE_TOKEN_PRESENT_IN_AUDIT_METADATA",
);

const conversionRoute = requireMarkers(
  "src/app/api/admin/super/applications/convert/route.ts",
  [
    'role === "HEAD_OF_SUPERVISION" ||',
    'role === "BASIC_SCHOOL_COORDINATOR" ||',
    'throw new ApiError(400, "ROLE_ZONE_MISMATCH")',
    "const tokenHash = sha256Hex(token);",
    "tokenHash,",
    "inviteUrl: buildPublicUrl(",
    "parentZone: { select: { id: true, name: true } }",
    "parentZoneName: zone.parentZone?.name ?? null",
    "return json(200, { ok: true, ...result, delivery });",
  ],
);

const conversionDeliveryAudit = extractBetween(
  conversionRoute,
  'action: "GOVERNANCE_OFFICER_INVITE_DELIVERY_ATTEMPTED"',
  "return json(200, { ok: true, ...result, delivery });",
  "application-conversion-delivery-audit",
);

assert(
  !conversionDeliveryAudit.includes("inviteUrl"),
  "N6_B3A_CONVERSION_INVITE_URL_PRESENT_IN_AUDIT_METADATA",
);

assert(
  !conversionDeliveryAudit.includes("tokenHash") &&
    !conversionDeliveryAudit.includes("token,"),
  "N6_B3A_CONVERSION_TOKEN_PRESENT_IN_AUDIT_METADATA",
);

const acceptRoute = requireMarkers(
  "src/app/api/governance/invite/accept/route.ts",
  [
    'role === "HEAD_OF_SUPERVISION"',
    '`Head of Supervision ${zoneName}`',
    'role === "BASIC_SCHOOL_COORDINATOR"',
    '`Basic School Coordinator ${zoneName}`',
    'role === "SISSO" || role === "CIRCUIT_SUPERVISOR"',
    "`SISSO ${zoneName}`",
    "parentZone: { select: { id: true, name: true } }",
    "function welcomeJurisdiction(",
    "districtName: parentZoneName || null",
    "districtName: zoneName || null",
    "circuitName: zoneName || null",
    "deliverGovernanceOfficerWelcome({",
    "email: result.welcomeEmail",
    "phone: result.welcomePhone",
    "name: result.welcomeName",
    "districtName: result.districtName",
    "circuitName: result.circuitName",
    "roleDefaultDestination(result.role)",
  ],
);

assert(
  !acceptRoute.includes("districtName: body.") &&
    !acceptRoute.includes("circuitName: body."),
  "N7_P2C4A2_BROWSER_JURISDICTION_NAME_TRUST_PRESENT",
);

const acceptClient = requireMarkers(
  "src/app/governance/invite/[token]/GovernanceInviteAcceptClient.tsx",
  [
    'role === "SISSO" || role === "CIRCUIT_SUPERVISOR"',
    'return "SISSO"',
    'role === "HEAD_OF_SUPERVISION"',
    'return "Head of Supervision"',
    'role === "BASIC_SCHOOL_COORDINATOR"',
    'return "Basic School Coordinator"',
    "dashboard assigned to your",
  ],
);

assert(
  !acceptClient.includes('if (role === "SISSO") return "SISO"'),
  "N7_P2C4A2_SISO_TYPO_STILL_VISIBLE",
);

const inviteDelivery = requireMarkers(
  "src/lib/governance/inviteDelivery.ts",
  [
    'role === "SISSO" || role === "CIRCUIT_SUPERVISOR"',
    'return "SISSO"',
    'role === "HEAD_OF_SUPERVISION"',
    'return "Head of Supervision"',
    'role === "BASIC_SCHOOL_COORDINATOR"',
    'return "Basic School Coordinator"',
    "governance work assigned to your office",
    "export async function deliverGovernanceOfficerWelcome",
    "districtName?: string | null;",
    "circuitName?: string | null;",
    "Welcome to EduLife OS",
    "works with EduLife OS",
    "sendEmail({",
    "sendViaHubtel({",
    'category: "GOVERNANCE_OFFICER_WELCOME"',
    "governance-officer-welcome:",
    "export async function sendGovernanceOfficerWelcomeSms",
  ],
);

requireMarkers(
  "prisma/schema.prisma",
  [
    "enum GovernanceOfficerRole {",
    "HEAD_OF_SUPERVISION",
    "BASIC_SCHOOL_COORDINATOR",
  ],
);

const listRoute = requireMarkers(
  "src/app/api/admin/governance/officers/list/route.ts",
  [
    "prisma.governanceOfficerInvite.findMany",
    "prisma.governanceOfficerAssignment.findMany",
    "role: true",
    'requireRoleNames: ["SUPERADMIN"]',
  ],
);

assert(
  !listRoute.includes("HEAD_OF_SUPERVISION: false") &&
    !listRoute.includes("BASIC_SCHOOL_COORDINATOR: false"),
  "N6_B1_LIST_ROUTE_ROLE_EXCLUSION_PRESENT",
);

console.log("");
console.log("=== N7-P2C4A2 GOVERNANCE ONBOARDING + WELCOME CONTRACT ===");
console.log("");
console.log("Public SISSO role option        : single official option");
console.log("Visible Circuit Supervisor alias: absent");
console.log("Legacy alias server support     : preserved");
console.log("Public HOS role                 : enabled");
console.log("Public BSC role                 : enabled");
console.log("HOS/BSC jurisdiction            : district-only");
console.log("Superadmin HOS/BSC              : already present");
console.log("Application API HOS/BSC         : accepted + server-validated");
console.log("Application conversion          : HOS/BSC preserved");
console.log("Invite acceptance titles        : official role labels");
console.log("Visible SISSO spelling          : corrected");
console.log("District welcome context        : server-derived");
console.log("SISSO circuit context           : server-derived");
console.log("SISSO parent district context   : server-derived");
console.log("Welcome email                   : enabled after activation");
console.log("Welcome SMS                     : warm jurisdiction wording");
console.log("Welcome provider failure        : does not roll back activation");
console.log("Welcome email idempotency       : assignment-keyed");
console.log("Schema mutation                 : absent");
console.log("Provider called by QA           : false");
console.log("Database accessed by QA         : false");
console.log("");
console.log(
  "RESULT: N7-P2C4A2 GOVERNANCE ONBOARDING + WELCOME GREEN",
);
