#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally reads exact repository source. */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const FILES = {
  schema: "prisma/schema.prisma",
  migration:
    "prisma/migrations/20260901210000_password_recovery_authority/migration.sql",
};

const LOCKS = {
  migration:
    "30253341169F7DFC58620E0A759BB251BA2617ED98CEDEE9D9876706BEFEF80E",
};

function fail(message, detail) {
  const suffix =
    detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), "AUTH_P1B_M1R_FILE_MISSING", {
    relativePath,
  });
  return fs.readFileSync(absolutePath, "utf8");
}

function canonical(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function canonicalSha256(relativePath) {
  return crypto
    .createHash("sha256")
    .update(canonical(read(relativePath)), "utf8")
    .digest("hex")
    .toUpperCase();
}

function occurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  for (;;) {
    const next = text.indexOf(needle, offset);
    if (next < 0) return count;
    count += 1;
    offset = next + needle.length;
  }
}

const schema = canonical(read(FILES.schema));
const migration = canonical(read(FILES.migration));

assert(
  canonicalSha256(FILES.migration) === LOCKS.migration,
  "AUTH_P1B_M1R_MIGRATION_HASH_DRIFT",
  {
    expected: LOCKS.migration,
    actual: canonicalSha256(FILES.migration),
  }
);

assert(
  occurrences(schema, "authVersion  Int      @default(0)") === 1,
  "AUTH_P1B_M1R_USER_AUTH_VERSION_MUST_EXIST_EXACTLY_ONCE"
);

assert(
  occurrences(schema, "passwordRecoveryTokens              PasswordRecoveryToken[]") === 1,
  "AUTH_P1B_M1R_USER_RECOVERY_RELATION_MUST_EXIST_EXACTLY_ONCE"
);

assert(
  occurrences(schema, "model PasswordRecoveryToken {") === 1,
  "AUTH_P1B_M1R_RECOVERY_MODEL_MUST_EXIST_EXACTLY_ONCE"
);

const modelStart = schema.indexOf("model PasswordRecoveryToken {");
const modelEnd = schema.indexOf("\n}", modelStart);

assert(
  modelStart >= 0 && modelEnd > modelStart,
  "AUTH_P1B_M1R_RECOVERY_MODEL_WINDOW_NOT_FOUND"
);

const model = schema.slice(modelStart, modelEnd + 2);

const requiredModelLines = [
  'id                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid',
  "userId             String",
  'tokenHash          String   @unique(map: "PasswordRecoveryToken_tokenHash_key") @db.VarChar(64)',
  "authVersionAtIssue Int",
  "expiresAt          DateTime @db.Timestamptz(6)",
  "consumedAt         DateTime? @db.Timestamptz(6)",
  "revokedAt          DateTime? @db.Timestamptz(6)",
  "createdAt          DateTime @default(now()) @db.Timestamptz(6)",
  'user User @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: NoAction, map: "PasswordRecoveryToken_user_fkey")',
  '@@index([userId, createdAt(sort: Desc)], map: "PasswordRecoveryToken_user_created_idx")',
  '@@index([expiresAt], map: "PasswordRecoveryToken_expires_idx")',
];

for (const required of requiredModelLines) {
  assert(
    model.includes(required),
    "AUTH_P1B_M1R_RECOVERY_MODEL_CONTRACT_MISSING",
    { required }
  );
}

assert(
  model.includes("PasswordRecoveryToken_active_user_idx") &&
    model.includes("partial index"),
  "AUTH_P1B_M1R_PARTIAL_INDEX_DB_TRUTH_MUST_BE_DOCUMENTED"
);

const requiredMigrationMarkers = [
  "BEGIN;",
  "AUTH_P1B_RECOVERY_AUTH_VERSION_ALREADY_EXISTS",
  "AUTH_P1B_RECOVERY_TOKEN_TABLE_ALREADY_EXISTS",
  'ADD COLUMN "authVersion" integer NOT NULL DEFAULT 0',
  '"User_authVersion_nonnegative_check"',
  'CREATE TABLE edulife_os."PasswordRecoveryToken"',
  '"tokenHash" varchar(64) NOT NULL',
  '"authVersionAtIssue" integer NOT NULL',
  '"PasswordRecoveryToken_tokenHash_format_check"',
  '"PasswordRecoveryToken_expiry_after_creation_check"',
  '"PasswordRecoveryToken_terminal_state_check"',
  '"PasswordRecoveryToken_tokenHash_key"',
  '"PasswordRecoveryToken_user_created_idx"',
  '"PasswordRecoveryToken_expires_idx"',
  '"PasswordRecoveryToken_active_user_idx"',
  'WHERE "consumedAt" IS NULL',
  'AND "revokedAt" IS NULL',
  "COMMIT;",
];

for (const marker of requiredMigrationMarkers) {
  assert(
    migration.includes(marker),
    "AUTH_P1B_M1R_MIGRATION_CONTRACT_MISSING",
    { marker }
  );
}

assert(
  !migration.includes("UPDATE edulife_os.\"User\"") &&
    !migration.includes("DELETE FROM") &&
    !migration.includes("INSERT INTO"),
  "AUTH_P1B_M1R_MIGRATION_MUST_NOT_MUTATE_PASSWORDS_OR_SEED_TOKENS"
);

assert(
  !schema.includes("PasswordResetToken"),
  "AUTH_P1B_M1R_MUST_NOT_INTRODUCE_COMPETING_RESET_MODEL"
);

console.log("UI-AUTH-P1B-M1R REPOSITORY PARITY CONTRACT: GREEN");
console.log("- User.authVersion is represented in Prisma with default 0");
console.log("- dedicated PasswordRecoveryToken is represented with UUID identity");
console.log("- tokenHash is unique and bounded to 64 hex characters at DB level");
console.log("- authVersionAtIssue, expiry, consumption and revocation are represented");
console.log("- UAT partial active-token index remains explicit DB truth in migration");
console.log("- migration is additive and fail-closed on pre-existing recovery authority");
console.log("- no password rows, recovery tokens, Parent OTP or staff 2FA are changed");
