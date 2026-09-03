#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally verifies repository TypeScript contracts. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = Object.freeze({
  helper: "src/lib/legal/acceptance.ts",
  staffUi: "src/app/auth/signup/page.tsx",
  staffRoute: "src/app/api/auth/teacher-signup/route.ts",
  governanceUi:
    "src/app/governance/invite/[token]/GovernanceInviteAcceptClient.tsx",
  governanceRoute: "src/app/api/governance/invite/accept/route.ts",
  published: "src/lib/legal/publishedDocuments.ts",
  schema: "prisma/schema.prisma",
  migration:
    "prisma/migrations/20260902190000_legal_acceptance_onboarding_authority/migration.sql",
});

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), "LEGAL_P1_P3_REQUIRED_FILE_MISSING", {
    relativePath,
  });
  return fs.readFileSync(absolutePath, "utf8");
}

function syntax(source, relativePath) {
  const isTsx = relativePath.endsWith(".tsx");
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  };

  if (isTsx) compilerOptions.jsx = ts.JsxEmit.ReactJSX;

  const result = ts.transpileModule(source, {
    compilerOptions,
    fileName: relativePath,
    reportDiagnostics: true,
  });

  const diagnostics = result.diagnostics || [];
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );

  assert(errors.length === 0, "LEGAL_P1_P3_TYPESCRIPT_SYNTAX_FAILED", {
    relativePath,
    diagnostics: errors.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    ),
  });
}

function requireMarkers(source, relativePath, markers) {
  for (const marker of markers) {
    assert(source.includes(marker), "LEGAL_P1_P3_MARKER_MISSING", {
      relativePath,
      marker,
    });
  }
}

function forbidMarkers(source, relativePath, markers) {
  for (const marker of markers) {
    assert(!source.includes(marker), "LEGAL_P1_P3_FORBIDDEN_MARKER_PRESENT", {
      relativePath,
      marker,
    });
  }
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const [key, relativePath] of Object.entries(files)) {
  if (relativePath.endsWith(".ts") || relativePath.endsWith(".tsx")) {
    syntax(source[key], relativePath);
  }
}

requireMarkers(source.helper, files.helper, [
  'export const LEGAL_ACCEPTANCE_STATEMENT =',
  '"I agree to the EduLife OS Terms of Service and acknowledge the Privacy Notice."',
  '"EDULIFE_LEGAL_ACCEPTANCE_CHECKBOX_V1"',
  'import {',
  'TERMS_OF_SERVICE_UAT',
  'PRIVACY_NOTICE_UAT',
  'FROM edulife_os."LegalDocumentVersion"',
  'd."isCurrent" = true',
  'd."effectiveAt" <= now()',
  'd."supersededAt" IS NULL',
  'actual.version !== input.expectedVersion',
  'canonicalHash(actual.contentHash) !== canonicalHash(input.expectedHash)',
  'INSERT INTO edulife_os."LegalAcceptance"',
  '"userId"',
  '"termsDocumentId"',
  '"privacyDocumentId"',
  '"authorityType"',
  '"authorityId"',
  '"acceptanceSource"',
  '"evidenceJson"',
  'ON CONFLICT ON CONSTRAINT "LegalAcceptance_idempotency_unique"',
  'DO NOTHING',
  'explicitAgreement: true',
  'termsPath: "/legal/terms"',
  'privacyPath: "/legal/privacy"',
  'LEGAL_ACCEPTANCE_CURRENT_DOCUMENTS_UNAVAILABLE',
  'LEGAL_ACCEPTANCE_CANONICAL_DOCUMENT_DRIFT',
  'LEGAL_ACCEPTANCE_INSERT_FAILED',
  'export async function recordCurrentLegalAcceptance(',
  'LEGAL_ACCEPTANCE_PERSISTENCE_FAILED',
]);

forbidMarkers(source.helper, files.helper, [
  'TERMS_OF_SERVICE_UAT.databaseId',
  'PRIVACY_NOTICE_UAT.databaseId',
  'CURRENT_UAT_LEGAL_DOCUMENTS.terms.databaseId',
  'CURRENT_UAT_LEGAL_DOCUMENTS.privacy.databaseId',
  'prisma.legalAcceptance.create',
  'tx.legalAcceptance.create',
  'membershipId:',
  'governanceAssignmentId:',
  'roleSnapshot:',
  'scopeType:',
  'scopeId:',
  'termsVersionSnapshot:',
  'privacyVersionSnapshot:',
  'termsContentHashSnapshot:',
  'privacyContentHashSnapshot:',
]);

requireMarkers(source.staffUi, files.staffUi, [
  'const [acceptedLegalTerms, setAcceptedLegalTerms] = useState(false);',
  'if (!acceptedLegalTerms)',
  'acceptedLegalTerms,',
  'id="acceptedLegalTerms"',
  'checked={acceptedLegalTerms}',
  'onChange={(e) => setAcceptedLegalTerms(e.target.checked)}',
  'required',
  'href="/legal/terms"',
  'href="/legal/privacy"',
  'Terms of Service',
  'Privacy Notice',
]);

requireMarkers(source.staffRoute, files.staffRoute, [
  'import { recordCurrentLegalAcceptance } from "@/lib/legal/acceptance";',
  'const acceptedLegalTerms = (body as any).acceptedLegalTerms === true;',
  'if (!acceptedLegalTerms)',
  'fe.acceptedLegalTerms =',
  'let membershipId: string;',
  'membershipId = existingMembership.id;',
  'select: { id: true },',
  'membershipId = createdMembership.id;',
  'await recordCurrentLegalAcceptance({',
  'authorityType: "SCHOOL_MEMBERSHIP"',
  'authorityId: membershipId',
  'acceptanceSource: "STAFF_SIGNUP"',
  'onboardingMethod: resolved.method',
  'if (msg.startsWith("LEGAL_ACCEPTANCE_"))',
  'return jsonFail("LEGAL_ACCEPTANCE_UNAVAILABLE", 503',
]);

const staffMembershipIndex = source.staffRoute.indexOf(
  'const existingMembership = await tx.membership.findUnique',
);
const staffLegalIndex = source.staffRoute.indexOf(
  'await recordCurrentLegalAcceptance({',
);
const staffAuditIndex = source.staffRoute.indexOf('await tx.auditLog.create({');
const staffTransactionEndIndex = source.staffRoute.indexOf(
  'const portalUrl = `/auth/signin?',
);

assert(staffMembershipIndex >= 0, "LEGAL_P1_P3_STAFF_MEMBERSHIP_ORDER_ANCHOR_MISSING");
assert(staffLegalIndex > staffMembershipIndex, "LEGAL_P1_P3_STAFF_ACCEPTANCE_BEFORE_AUTHORITY");
assert(staffAuditIndex > staffLegalIndex, "LEGAL_P1_P3_STAFF_ACCEPTANCE_NOT_IN_TRANSACTION_ORDER");
assert(
  staffTransactionEndIndex > staffLegalIndex,
  "LEGAL_P1_P3_STAFF_ACCEPTANCE_OUTSIDE_TRANSACTION",
);

requireMarkers(source.governanceUi, files.governanceUi, [
  'import Link from "next/link";',
  'const [acceptedLegalTerms, setAcceptedLegalTerms] = useState(false);',
  'if (!acceptedLegalTerms)',
  'acceptedLegalTerms,',
  'id="acceptedLegalTerms"',
  'checked={acceptedLegalTerms}',
  'onChange={(e) => setAcceptedLegalTerms(e.target.checked)}',
  'href="/legal/terms"',
  'href="/legal/privacy"',
  'LEGAL_ACCEPTANCE_REQUIRED',
  'LEGAL_ACCEPTANCE_UNAVAILABLE',
]);

requireMarkers(source.governanceRoute, files.governanceRoute, [
  'import { recordCurrentLegalAcceptance } from "@/lib/legal/acceptance";',
  'acceptedLegalTerms?: boolean;',
  'const acceptedLegalTerms = body.acceptedLegalTerms === true;',
  'if (!acceptedLegalTerms)',
  'error: "LEGAL_ACCEPTANCE_REQUIRED"',
  'await recordCurrentLegalAcceptance({',
  'authorityType: "GOVERNANCE_ASSIGNMENT"',
  'authorityId: assignment.id',
  'acceptanceSource: "GOVERNANCE_INVITE_ACCEPTANCE"',
  'inviteId: invite.id',
  'if (message.startsWith("LEGAL_ACCEPTANCE_"))',
  'error: "LEGAL_ACCEPTANCE_UNAVAILABLE"',
  '{ maxWait: 10_000, timeout: 30_000 }',
  'const welcomeDelivery = await deliverGovernanceOfficerWelcome({',
]);

const governanceAssignmentIndex = source.governanceRoute.indexOf(
  'const assignment =',
);
const governanceLegalIndex = source.governanceRoute.indexOf(
  'await recordCurrentLegalAcceptance({',
);
const governanceInviteUpdateIndex = source.governanceRoute.indexOf(
  'await tx.governanceOfficerInvite.update({',
);
const governanceTransactionCloseIndex = source.governanceRoute.indexOf(
  'const welcomeDelivery = await deliverGovernanceOfficerWelcome({',
);

assert(governanceAssignmentIndex >= 0, "LEGAL_P1_P3_GOV_ASSIGNMENT_ORDER_ANCHOR_MISSING");
assert(
  governanceLegalIndex > governanceAssignmentIndex,
  "LEGAL_P1_P3_GOV_ACCEPTANCE_BEFORE_ASSIGNMENT",
);
assert(
  governanceInviteUpdateIndex > governanceLegalIndex,
  "LEGAL_P1_P3_GOV_ACCEPTANCE_NOT_ATOMIC_WITH_INVITE",
);
assert(
  governanceTransactionCloseIndex > governanceInviteUpdateIndex,
  "LEGAL_P1_P3_GOV_WELCOME_ORDER_INVALID",
);

const transactionStart = source.governanceRoute.indexOf(
  'result = await prisma.$transaction(async (tx) => {',
);
assert(transactionStart >= 0, "LEGAL_P1_P3_GOV_TRANSACTION_START_MISSING");
assert(
  governanceLegalIndex > transactionStart &&
    governanceLegalIndex < governanceTransactionCloseIndex,
  "LEGAL_P1_P3_GOV_ACCEPTANCE_OUTSIDE_TRANSACTION",
);

requireMarkers(source.schema, files.schema, [
  'model LegalAcceptance {',
  '/// DB trigger derives document snapshots, role and scope from current DB authority;',
]);

requireMarkers(source.migration, files.migration, [
  'CREATE FUNCTION edulife_os.legal_acceptance_insert_guard()',
  'NEW."termsVersionSnapshot" := terms_doc."version";',
  'NEW."privacyVersionSnapshot" := privacy_doc."version";',
  'NEW."termsContentHashSnapshot" := terms_doc."contentHash";',
  'NEW."privacyContentHashSnapshot" := privacy_doc."contentHash";',
  'IF NEW."authorityType" = \'SCHOOL_MEMBERSHIP\' THEN',
  'ELSIF NEW."authorityType" = \'GOVERNANCE_ASSIGNMENT\' THEN',
  'NEW."membershipId" := NEW."authorityId";',
  'NEW."governanceAssignmentId" := NEW."authorityId";',
  'CREATE TRIGGER "LegalAcceptance_insert_guard"',
  'BEFORE INSERT',
]);

requireMarkers(source.published, files.published, [
  'export const TERMS_OF_SERVICE_UAT',
  'version: "0.1-UAT"',
  'contentHash: "c658f265d5f4bdac64c8c0cde2821ffd67f4e1f9ec1dd41fa5ceea1da303c4bd"',
  'export const PRIVACY_NOTICE_UAT',
  'contentHash: "2df3934dcf60429c7337838620cf7f40a184ef588bd69e1e0b4afe5f357cd67c"',
]);

for (const [key, relativePath] of [
  ["helper", files.helper],
  ["staffUi", files.staffUi],
  ["staffRoute", files.staffRoute],
  ["governanceUi", files.governanceUi],
  ["governanceRoute", files.governanceRoute],
]) {
  forbidMarkers(source[key], relativePath, [
    "EssentialAlertEnrollment",
    "createEssentialAlert",
    "inviteEssentialAlert",
    "sendEssentialAlert",
  ]);
}

console.log("UI-LEGAL-P1-P3 ONBOARDING ACCEPTANCE CONTRACT: GREEN");
console.log("- Teacher and Headteacher onboarding requires an unchecked explicit legal checkbox");
console.log("- Governance invite acceptance requires the same explicit legal checkbox");
console.log("- Both servers independently require literal boolean true");
console.log("- current effective Terms and Privacy are resolved inside the existing transaction");
console.log("- database document UUIDs are not hard-coded from the UAT publication module");
console.log("- version and content-hash drift fail closed before acceptance insertion");
console.log("- LegalAcceptance uses a parameterized raw INSERT so the DB trigger derives snapshots and scope");
console.log("- school acceptance is atomic with active Membership authority");
console.log("- governance acceptance is atomic with active GovernanceOfficerAssignment authority");
console.log("- existing governance welcome remains post-commit");
console.log("- Essential Alerts remain separate and untouched");
