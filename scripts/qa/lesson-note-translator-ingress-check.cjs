"use strict";

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
  const absolute =
    path.join(repoRoot, relativePath);

  assert(
    fs.existsSync(absolute),
    `Missing required file: ${relativePath}`,
  );

  return fs.readFileSync(
    absolute,
    "utf8",
  );
}

function has(source, marker, label) {
  assert(
    source.includes(marker),
    `Missing ${label}`,
    { marker },
  );
}

function lacks(source, marker, label) {
  assert(
    !source.includes(marker),
    `Forbidden ${label}`,
    { marker },
  );
}

const relay = read(
  "deploy/lesson-note-translator-relay/relay.py",
);

const compose = read(
  "deploy/lesson-note-translator-stack/compose.yaml",
);

for (const marker of [
  'SERVICE_NAME = "edulife-lesson-note-translator-relay"',
  'SERVICE_VERSION = "EDULIFE_TRANSLATOR_RELAY_V1"',
  '"EDULIFE_RELAY_BACKEND_HOST"',
  '"translator"',
  '"EDULIFE_TRANSLATION_PROVIDER_TOKEN"',
  "hmac.compare_digest(",
  'prefix = "Bearer "',
  'MAX_BODY_BYTES = 200_000',
  'BACKEND_TIMEOUT_SECONDS = 70',
  'self.path not in {',
  '"/health"',
  '"/ready"',
  'self.path != "/translate"',
  'set(body.keys()) != {"text"}',
  '"UNAUTHORIZED"',
  '"INVALID_REQUEST_SHAPE"',
  '"BACKEND_UNAVAILABLE"',
]) {
  has(
    relay,
    marker,
    `relay security marker ${marker}`,
  );
}

for (const forbidden of [
  "requests.",
  "httpx.",
  "urllib.request",
  "DATABASE_URL",
  "prisma",
  "tenantId",
  "teacherUserId",
  "lessonNoteId",
  "receiptId",
  "TRANSLATION_RECEIPT",
  "targetLanguage",
  "eval(",
  "exec(",
]) {
  lacks(
    relay,
    forbidden,
    `relay ownership/escape marker ${forbidden}`,
  );
}

const authIndex =
  relay.indexOf(
    "if not _authorized(",
  );

const bodyReadIndex =
  relay.indexOf(
    "raw = self.rfile.read(",
  );

const proxyIndex =
  relay.lastIndexOf(
    'self._proxy(\n            "POST",',
  );

assert(
  authIndex >= 0 &&
    bodyReadIndex >= 0 &&
    proxyIndex >= 0 &&
    authIndex < bodyReadIndex &&
    bodyReadIndex < proxyIndex,
  "Relay must authenticate before body read and proxy",
  {
    authIndex,
    bodyReadIndex,
    proxyIndex,
  },
);

const translatorMatch =
  compose.match(
    /\n  translator:\n([\s\S]*?)\n  relay:\n/,
  );

const relayMatch =
  compose.match(
    /\n  relay:\n([\s\S]*?)\nnetworks:\n/,
  );

assert(
  translatorMatch &&
    relayMatch,
  "Compose service boundaries missing",
);

const translatorBlock =
  translatorMatch[1];

const relayBlock =
  relayMatch[1];

lacks(
  translatorBlock,
  "\n    ports:",
  "translator host port",
);

lacks(
  translatorBlock,
  "translator_ingress",
  "translator ingress attachment",
);

has(
  translatorBlock,
  "translator_private:",
  "translator private network",
);

for (const marker of [
  '127.0.0.1:${EDULIFE_TRANSLATOR_HOST_PORT:-8787}:8787',
  'EDULIFE_TRANSLATION_PROVIDER_TOKEN: ${EDULIFE_TRANSLATION_PROVIDER_TOKEN:?EDULIFE_TRANSLATION_PROVIDER_TOKEN is required}',
  '- translator_private',
  '- translator_ingress',
  'condition: service_healthy',
]) {
  has(
    relayBlock,
    marker,
    `relay compose marker ${marker}`,
  );
}

has(
  compose,
  "translator_private:",
  "private network",
);
has(
  compose,
  "internal: true",
  "private network internal flag",
);
has(
  compose,
  "translator_ingress:",
  "ingress network",
);

console.log("=== TRANSLATOR PERMANENT INGRESS CONTRACT ===");
console.log("Model direct host publication : NONE");
console.log("Model ingress-network join     : NONE");
console.log("Model private network          : INTERNAL");
console.log("Relay host publication         : 127.0.0.1 ONLY");
console.log("Relay backend                  : FIXED translator:8787");
console.log("Translate authentication       : REQUIRED BEARER TOKEN");
console.log("Relay request shape            : STRICT { text } ONLY");
console.log("Relay authority                : NO TENANT/TEACHER/DB/RECEIPT");
console.log("Permanent ingress QA           : GREEN");
