"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolute), `Missing required file: ${relativePath}`);
  return fs.readFileSync(absolute, "utf8");
}

function has(source, marker, label) {
  assert(source.includes(marker), `Missing ${label}`, { marker });
}

function lacks(source, marker, label) {
  assert(!source.includes(marker), `Forbidden ${label}`, { marker });
}

const serverPath = "deploy/lesson-note-translator/server.py";
const relayPath = "deploy/lesson-note-translator-relay/relay.py";
const dockerfilePath = "deploy/lesson-note-translator/Dockerfile";
const dockerignorePath = "deploy/lesson-note-translator/Dockerfile.dockerignore";
const composePath = "deploy/lesson-note-translator-stack/compose.yaml";

const server = read(serverPath);
const relay = read(relayPath);
const dockerfile = read(dockerfilePath);
const dockerignore = read(dockerignorePath);
const compose = read(composePath);

const translatorMatch = compose.match(
  /\n  translator:\n([\s\S]*?)\n  relay:\n/,
);

const relayMatch = compose.match(
  /\n  relay:\n([\s\S]*?)\nnetworks:\n/,
);

assert(
  translatorMatch,
  "Translator compose block missing",
);

assert(
  relayMatch,
  "Relay compose block missing",
);

const translatorBlock = translatorMatch[1];
const relayBlock = relayMatch[1];

for (const marker of [
  'SERVICE_VERSION = "EDULIFE_TRANSLATOR_SERVICE_V1"',
  'PROVIDER = "HELSINKI_NLP"',
  'MODEL_NAME = "Helsinki-NLP/opus-mt-en-ee"',
  'MODEL_REVISION = "fef1362558b7948e5257f06f192d700761b3b57d"',
  'MODEL_AUTHORITY = "EDULIFE_MODEL_AUTHORITY_V1"',
  'SOURCE_LANGUAGE = "en"',
  'TARGET_LANGUAGE = "ee"',
  'EXPECTED_MANIFEST_SHA256 = "23B1A8406F4DA26AD8C668D4D41FEEA7207B5D4AF7C7204387CC1F938A544185"',
  '"pytorch_model.bin": "8A4884D69C35E84E0E78FC3A56E0D70FBFAA99904AF96219D5F23E1D244B49AE"',
  'local_files_only=True',
  'torch.inference_mode()',
  'set(body.keys()) != {"text"}',
  'unicodedata.normalize("NFC", text) != text',
  'self.path == "/health"',
  'self.path == "/ready"',
  'self.path != "/translate"',
  '"translation": translation',
  "PROTECTED_CURRICULUM_CODE_PATTERN",
  'LEGACY_PROTECTED_PLACEHOLDER_PREFIX = "ZXQEDULIFEPT"',
  'self._error(422, "PROTECTED_TOKEN_PRESENT")',
]) {
  has(server, marker, `server contract marker ${marker}`);
}

const protectedRejectIndex = server.indexOf(
  'self._error(422, "PROTECTED_TOKEN_PRESENT")',
);
const inferenceIndex = server.indexOf(
  "translation = _translate_text(text)",
);

assert(
  protectedRejectIndex >= 0 &&
    inferenceIndex >= 0 &&
    protectedRejectIndex < inferenceIndex,
  "Protected-token rejection must occur before neural inference",
  {
    protectedRejectIndex,
    inferenceIndex,
  },
);

for (const forbidden of [
  "huggingface_hub",
  "requests.",
  "httpx.",
  "DATABASE_URL",
  "prisma",
  "tenantId",
  "teacherUserId",
  "lessonNoteId",
  "receiptId",
  "translationReceipt",
  "signTranslationReceipt",
  "verifyTranslationReceipt",
  "TRANSLATION_RECEIPT",
  "targetLanguage = body",
  'body.get("target',
]) {
  lacks(server, forbidden, `server ownership leak ${forbidden}`);
}

has(
  dockerfile,
  "FROM edulife-translator-benchmark:gl-t1-p2-b1",
  "exact local benchmark-runtime base",
);
has(
  dockerfile,
  "COPY deploy/lesson-note-translator/server.py /service/server.py",
  "translator source copy",
);
has(
  dockerfile,
  "COPY deploy/lesson-note-translator-relay/relay.py /service/relay.py",
  "relay source copy",
);
has(dockerfile, "USER 65532:65532", "non-root runtime identity");
has(dockerfile, "HF_HUB_OFFLINE=1", "offline model runtime");
has(dockerfile, 'CMD ["python3", "/service/server.py"]', "translator default command");

has(dockerignore, "**", "deny-by-default Docker build context");
has(
  dockerignore,
  "!deploy/lesson-note-translator/server.py",
  "translator source allowlist",
);
has(
  dockerignore,
  "!deploy/lesson-note-translator-relay/relay.py",
  "relay source allowlist",
);

lacks(
  translatorBlock,
  "\n    ports:",
  "direct translator host publication",
);

has(
  translatorBlock,
  "translator_private:",
  "translator private network",
);

lacks(
  translatorBlock,
  "translator_ingress",
  "translator ingress-network attachment",
);

for (const marker of [
  'command:',
  '- /service/relay.py',
  'EDULIFE_TRANSLATION_PROVIDER_TOKEN:',
  '127.0.0.1:${EDULIFE_TRANSLATOR_HOST_PORT:-8787}:8787',
  '- translator_private',
  '- translator_ingress',
  'condition: service_healthy',
  'read_only: true',
  'no-new-privileges:true',
  'cap_drop:',
  '- ALL',
]) {
  has(relayBlock, marker, `relay compose marker ${marker}`);
}

for (const forbidden of [
  "0.0.0.0:${EDULIFE_TRANSLATOR_HOST_PORT",
  "network_mode: host",
  "privileged: true",
]) {
  lacks(compose, forbidden, `unsafe compose marker ${forbidden}`);
}

has(
  compose,
  "translator_private:",
  "private translator network",
);
has(
  compose,
  "internal: true",
  "translator private network isolation",
);
has(
  compose,
  "translator_ingress:",
  "relay ingress network",
);

for (const marker of [
  'SERVICE_VERSION = "EDULIFE_TRANSLATOR_RELAY_V1"',
  'BACKEND_HOST != "translator"',
  'BACKEND_PORT != 8787',
  'PORT != 8787',
  'len(PROVIDER_TOKEN.encode("utf-8")) < 32',
  "hmac.compare_digest(",
  'self.path != "/translate"',
  'set(body.keys()) != {"text"}',
  '"UNAUTHORIZED"',
  '"BACKEND_UNAVAILABLE"',
]) {
  has(relay, marker, `relay source marker ${marker}`);
}

console.log("=== LESSON NOTE TRANSLATOR SERVICE SOURCE CONTRACT ===");
console.log("Model service ownership : MODEL INTEGRITY + WARM INFERENCE ONLY");
console.log("Model revision          : PINNED fef1362558b7948e5257f06f192d700761b3b57d");
console.log("Model runtime egress    : INTERNAL-ONLY NETWORK");
console.log("Model direct host port  : NONE");
console.log("Ingress                 : SEPARATE LOOPBACK RELAY");
console.log("Relay auth              : REQUIRED SERVER-SIDE BEARER TOKEN");
console.log("Relay public exposure   : 127.0.0.1 ONLY");
console.log("Request target control  : SERVER FIXED en -> ee");
console.log("Protected raw tokens    : REJECTED BEFORE INFERENCE");
console.log("Tenant/teacher/DB       : ABSENT FROM MODEL + RELAY");
console.log("Source contract         : GREEN");
