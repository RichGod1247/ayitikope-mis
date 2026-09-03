#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally verifies exact repository legal source. */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const FILES = {
  published: "src/lib/legal/publishedDocuments.ts",
  component: "src/components/legal/LegalDocumentPage.tsx",
  termsPage: "src/app/legal/terms/page.tsx",
  privacyPage: "src/app/legal/privacy/page.tsx",
  middleware: "src/middleware.ts",
  roleRouting: "src/lib/roleRouting.ts",
};

const EXPECTED = {
  terms: {
    id: "ca3e4197-4004-4177-828a-f7800326aa7b",
    version: "0.1-UAT",
    hash: "c658f265d5f4bdac64c8c0cde2821ffd67f4e1f9ec1dd41fa5ceea1da303c4bd",
    bytes: 15282,
    documentType: "TERMS_OF_SERVICE",
  },
  privacy: {
    id: "0627afe2-f921-4e50-ac4f-b5100037e591",
    version: "0.1-UAT",
    hash: "2df3934dcf60429c7337838620cf7f40a184ef588bd69e1e0b4afe5f357cd67c",
    bytes: 13101,
    documentType: "PRIVACY_NOTICE",
  },
  middlewareSha: "30400D9AA55CC2DCCFEA306F057909F50B6146DBCB174A3AE4A86A8C7D89093B",
  roleRoutingSha: "9B5657787878A8DE662E057C4BD6B16EB68E79D3B54DC078BA5FF41A2A3F315B",
};

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), "LEGAL_P1_P2_FILE_MISSING", { relativePath });
  return fs.readFileSync(absolutePath, "utf8");
}

function canonical(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function rawFileSha(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), "LEGAL_P1_P2_FILE_MISSING", { relativePath });
  return crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex").toUpperCase();
}

function requireMarkers(text, markers, code) {
  for (const marker of markers) {
    assert(text.includes(marker), code, { marker });
  }
}

function extractTemplate(source, constantName) {
  const marker = `const ${constantName} = \``;
  const start = source.indexOf(marker);
  assert(start >= 0, "LEGAL_P1_P2_CANONICAL_TEXT_START_MISSING", { constantName });
  const contentStart = start + marker.length;
  const end = source.indexOf("`;", contentStart);
  assert(end > contentStart, "LEGAL_P1_P2_CANONICAL_TEXT_END_MISSING", { constantName });
  return source.slice(contentStart, end);
}

const published = canonical(read(FILES.published));
const component = canonical(read(FILES.component));
const termsPage = canonical(read(FILES.termsPage));
const privacyPage = canonical(read(FILES.privacyPage));
const middleware = canonical(read(FILES.middleware));
const roleRouting = canonical(read(FILES.roleRouting));

assert(
  rawFileSha(FILES.middleware) === EXPECTED.middlewareSha,
  "LEGAL_P1_P2_MIDDLEWARE_HASH_DRIFT",
  { expected: EXPECTED.middlewareSha, actual: rawFileSha(FILES.middleware) }
);

assert(
  rawFileSha(FILES.roleRouting) === EXPECTED.roleRoutingSha,
  "LEGAL_P1_P2_ROLE_ROUTING_HASH_DRIFT",
  { expected: EXPECTED.roleRoutingSha, actual: rawFileSha(FILES.roleRouting) }
);

assert(!middleware.includes('"/legal/:path*"'), "LEGAL_P1_P2_LEGAL_ROUTE_ENTERED_PROTECTED_MATCHER");
assert(!middleware.includes('path.startsWith("/legal/")'), "LEGAL_P1_P2_LEGAL_ROUTE_ENTERED_STAFF_PROTECTED_PATH");
assert(!roleRouting.includes('startsWith("/legal') && !roleRouting.includes('=== "/legal'), "LEGAL_P1_P2_LEGAL_ROUTE_ENTERED_ROLE_ROUTING");

const termsContent = extractTemplate(published, "TERMS_CONTENT");
const privacyContent = extractTemplate(published, "PRIVACY_CONTENT");

for (const [label, content, expected] of [
  ["terms", termsContent, EXPECTED.terms],
  ["privacy", privacyContent, EXPECTED.privacy],
]) {
  assert(content.endsWith("\n"), "LEGAL_P1_P2_CANONICAL_FINAL_LF_REQUIRED", { label });
  assert(Buffer.byteLength(content, "utf8") === expected.bytes, "LEGAL_P1_P2_CANONICAL_BYTE_LENGTH_DRIFT", {
    label,
    expected: expected.bytes,
    actual: Buffer.byteLength(content, "utf8"),
  });
  assert(sha256(content) === expected.hash, "LEGAL_P1_P2_CANONICAL_HASH_DRIFT", {
    label,
    expected: expected.hash,
    actual: sha256(content),
  });
}

requireMarkers(
  published,
  [
    EXPECTED.terms.id,
    EXPECTED.terms.version,
    EXPECTED.terms.hash,
    EXPECTED.terms.documentType,
    EXPECTED.privacy.id,
    EXPECTED.privacy.hash,
    EXPECTED.privacy.documentType,
    'effectiveAt: "2026-09-02T20:01:13.768258+00:00"',
    'publishedAt: "2026-09-02T20:01:13.768258+00:00"',
    'operatorLegalName: "Hehxagon Technologies"',
    'operatorRegistrationNumber: null',
    'operatorRegisteredAddress: null',
    'operatorServiceEmail: "service@hehxagontechnologies.com"',
    'productSupportEmail: "support@edulifeos.com"',
    "content: TERMS_CONTENT",
    "content: PRIVACY_CONTENT",
  ],
  "LEGAL_P1_P2_PUBLICATION_METADATA_DRIFT"
);

requireMarkers(
  termsContent,
  [
    "EDULIFE OS TERMS OF SERVICE",
    "16. ESSENTIAL ALERTS ARE SEPARATE AND OPTIONAL",
    "Acceptance of these Terms does not activate Essential Alerts",
    "service@hehxagontechnologies.com",
    "support@edulifeos.com",
  ],
  "LEGAL_P1_P2_TERMS_CONTRACT_MISSING"
);

requireMarkers(
  privacyContent,
  [
    "EDULIFE OS PRIVACY NOTICE",
    "Essential Alerts",
    "support@edulifeos.com",
    "service@hehxagontechnologies.com",
  ],
  "LEGAL_P1_P2_PRIVACY_CONTRACT_MISSING"
);

requireMarkers(
  component,
  [
    'href="/"',
    "document.content",
    "canonicalBlocks(document.content)",
    "Controlled UAT document",
    "Version {document.version}",
    "SHA-256: {document.contentHash}",
    "You may review this document before signing in or creating an account.",
  ],
  "LEGAL_P1_P2_PUBLIC_COMPONENT_CONTRACT_MISSING"
);

requireMarkers(
  termsPage,
  [
    'import { TERMS_OF_SERVICE_UAT } from "@/lib/legal/publishedDocuments";',
    'title: "Terms of Service"',
    "document={TERMS_OF_SERVICE_UAT}",
    'alternateHref="/legal/privacy"',
  ],
  "LEGAL_P1_P2_TERMS_PAGE_CONTRACT_MISSING"
);

requireMarkers(
  privacyPage,
  [
    'import { PRIVACY_NOTICE_UAT } from "@/lib/legal/publishedDocuments";',
    'title: "Privacy Notice"',
    "document={PRIVACY_NOTICE_UAT}",
    'alternateHref="/legal/terms"',
  ],
  "LEGAL_P1_P2_PRIVACY_PAGE_CONTRACT_MISSING"
);

for (const [relativePath, source] of [
  [FILES.published, published],
  [FILES.component, component],
  [FILES.termsPage, termsPage],
  [FILES.privacyPage, privacyPage],
]) {
  for (const forbidden of [
    "@prisma/client",
    "prisma.",
    "fetch(",
    "/api/consent/",
    "EssentialAlertEnrollment",
    "LegalAcceptance.create",
    "OnboardingWelcome.create",
  ]) {
    assert(!source.includes(forbidden), "LEGAL_P1_P2_PUBLIC_PAGE_SIDE_EFFECT_FORBIDDEN", {
      relativePath,
      forbidden,
    });
  }
}

console.log("UI-LEGAL-P1-P2 PUBLIC DOCUMENT CONTRACT: GREEN");
console.log("- /legal/terms and /legal/privacy remain outside protected middleware routing");
console.log("- repository Terms text matches immutable UAT hash c658f265...303c4bd");
console.log("- repository Privacy text matches immutable UAT hash 2df3934d...7cd67c");
console.log("- exact UAT document ids, version, publication time and operator metadata are mirrored");
console.log("- public pages render the canonical source without database or network side effects");
console.log("- Terms and Privacy cross-link and remain readable before authentication");
console.log("- Essential Alerts remain a separate optional authority and are not modified here");
