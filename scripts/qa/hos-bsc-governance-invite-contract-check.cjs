#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects provisioning source. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `
${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), "N6_B1_REQUIRED_FILE_MISSING", {
    relativePath,
  });
  return fs.readFileSync(absolutePath, "utf8");
}

function countOccurrences(source, marker) {
  return source.split(marker).length - 1;
}

function requireMarkers(relativePath, markers) {
  const source = read(relativePath);
  for (const marker of markers) {
    assert(source.includes(marker), "N6_B1_MARKER_MISSING", {
      relativePath,
      marker,
    });
  }
  return source;
}

function extractBetween(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  assert(start >= 0, "N6_B3A_START_MARKER_MISSING", {
    label,
    startMarker,
  });

  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(end > start, "N6_B3A_END_MARKER_MISSING", {
    label,
    endMarker,
  });

  return source.slice(start, end);
}

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

assert(
  officerUi.indexOf('value: "HEAD_OF_SUPERVISION"') <
    officerUi.indexOf('value: "BASIC_SCHOOL_COORDINATOR"'),
  "N6_B1_ROLE_ORDER_INVALID",
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

requireMarkers(
  "src/app/api/governance/invite/accept/route.ts",
  [
    'role === "HEAD_OF_SUPERVISION"',
    '`Head of Supervision ${zoneName}`',
    'role === "BASIC_SCHOOL_COORDINATOR"',
    '`Basic School Coordinator ${zoneName}`',
    "roleDefaultDestination(result.role)",
  ],
);

requireMarkers(
  "src/app/governance/invite/[token]/GovernanceInviteAcceptClient.tsx",
  [
    'role === "HEAD_OF_SUPERVISION"',
    'return "Head of Supervision"',
    'role === "BASIC_SCHOOL_COORDINATOR"',
    'return "Basic School Coordinator"',
    "dashboard assigned to your",
  ],
);

const inviteDelivery = requireMarkers(
  "src/lib/governance/inviteDelivery.ts",
  [
    'role === "HEAD_OF_SUPERVISION"',
    'return "Head of Supervision"',
    'role === "BASIC_SCHOOL_COORDINATOR"',
    'return "Basic School Coordinator"',
    "governance work assigned to your office",
    "inviteUrl: string;",
    "const inviteUrl = clean(params.inviteUrl);",
    "${inviteUrl}",
  ],
);

const deliveryMetaMarkers = [
  'category: "GOVERNANCE_OFFICER_INVITE"',
  'category: "GOVERNANCE_OFFICER_WELCOME"',
];

for (const marker of deliveryMetaMarkers) {
  const markerIndex = inviteDelivery.indexOf(marker);
  assert(markerIndex >= 0, "N6_B3A_DELIVERY_META_MARKER_MISSING", {
    marker,
  });

  const metaStart = inviteDelivery.lastIndexOf("meta: {", markerIndex);
  const metaEnd = inviteDelivery.indexOf("\n      },", markerIndex);

  assert(
    metaStart >= 0 && metaEnd > metaStart,
    "N6_B3A_DELIVERY_META_BLOCK_NOT_FOUND",
    { marker },
  );

  const metaBlock = inviteDelivery.slice(metaStart, metaEnd);
  assert(
    !metaBlock.includes("inviteUrl"),
    "N6_B3A_INVITE_URL_PRESENT_IN_DELIVERY_METADATA",
    { marker },
  );
}

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
console.log("=== N6-B1/N6-B3A/N6-B6A4 GOVERNANCE PROVISIONING ===");
console.log("");
console.log("Visible SISSO role option       : single official option");
console.log("Visible Circuit Supervisor alias: absent");
console.log("Legacy alias display            : normalized to SISSO");
console.log("Legacy alias server support     : preserved");
console.log("Superadmin role selection       : HOS and BSC present");
console.log("Jurisdiction level              : district-only");
console.log("Direct invite API               : HOS and BSC accepted");
console.log("Application conversion          : HOS and BSC accepted");
console.log("Assignment titles               : official role labels");
console.log("Invite acceptance UI            : official role labels");
console.log("Invite and welcome delivery     : role-accurate wording");
console.log("Post-accept destination         : roleDefaultDestination");
console.log("Officer list visibility         : no role exclusion");
console.log("Raw invite URL in audit metadata: absent");
console.log("Raw token in audit metadata     : absent");
console.log("Invite URL in API response      : preserved");
console.log("Invite URL in delivery body     : preserved");
console.log("Schema mutation                 : absent");
console.log("Provider called by QA           : false");
console.log("Database accessed               : false");
console.log("");
console.log(
  "RESULT: N6-B1/N6-B3A/N6-B6A4 GOVERNANCE PROVISIONING GREEN",
);
