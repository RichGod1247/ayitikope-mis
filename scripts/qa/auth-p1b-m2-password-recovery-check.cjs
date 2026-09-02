#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- repository QA harness intentionally uses CommonJS. */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..");

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor !== 22) {
  throw new Error(
    `AUTH_P1B_M2_NODE_MAJOR_MUST_BE_22\n${JSON.stringify(
      { expectedMajor: 22, actual: process.versions.node },
      null,
      2
    )}`
  );
}

function fail(message, detail) {
  const suffix =
    detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function canonicalHash(relativePath) {
  const text = read(relativePath)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  return crypto.createHash("sha256").update(text, "utf8").digest("hex").toUpperCase();
}

function git(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const EXPECTED_CHANGED = [
  "scripts/qa/auth-p1b-m2-password-recovery-check.cjs",
  "src/app/api/auth/password-recovery/request/route.ts",
  "src/app/api/auth/password-recovery/reset/route.ts",
  "src/app/auth/forgot-password/page.tsx",
  "src/app/auth/reset-password/page.tsx",
  "src/app/auth/signin/page.tsx",
  "src/lib/auth.ts",
  "src/lib/authVersion.ts",
  "src/lib/passwordRecovery.ts",
  "src/lib/rate-limit.ts",
  "src/lib/serverAuth.ts",
  "src/types/next-auth.d.ts",
].sort();

const PROTECTED_HASHES = {
  "prisma/schema.prisma":
    "BB3E9F1F9CFA24BAFCDFD8243A3272EC6CDC2AD04F26EC75C5F4B4949BB3EF6D",
  "prisma/migrations/20260901210000_password_recovery_authority/migration.sql":
    "30253341169F7DFC58620E0A759BB251BA2617ED98CEDEE9D9876706BEFEF80E",
  "src/middleware.ts":
    "0B403EDB65E7A4491521ADDE6E12C2F1BD1A6B6FA0263D4D470138F61FF2DD53",
  "src/lib/parentSession.ts":
    "713D81BB2465BF411C4E23D9A7C94E084EAD9C4FB3653CC25E2A63E3D8F95087",
  "src/app/api/parent/otp/verify/route.ts":
    "3FBC07B6A0FD0ACD594A68432FFC0A718D40E84280A496A5D381DC2B07D70E42",
  "src/lib/password.ts":
    "5882EB43DC7592076328D756B80D7A97DD289E9BDC4F28E26571D212318B51ED",
  "src/lib/email/sendEmail.ts":
    "27D01979DF11C7260201FB237929C3218A7E51FABD4BE411D95696FB33E1331E",
  "src/lib/publicUrl.ts":
    "CE92FCBBE957B967361603594E6EF15022B144FA55B441D636973067D139C5D4",
};

for (const [relativePath, expectedHash] of Object.entries(PROTECTED_HASHES)) {
  const actualHash = canonicalHash(relativePath);
  assert(
    actualHash === expectedHash,
    `AUTH_P1B_M2_PROTECTED_SOURCE_DRIFT: ${relativePath}`,
    { expectedHash, actualHash }
  );
}

const EXPECTED_RATE_LIMIT_HASH =
  "F2F986820D1E7E7E9C9EC5016F024C4F77FE0FC9C3CE3CB98494A84D5598122E";

const rateLimitHash = canonicalHash("src/lib/rate-limit.ts");
assert(
  rateLimitHash === EXPECTED_RATE_LIMIT_HASH,
  "AUTH_P1B_M2_RATE_LIMIT_SCHEMA_AUTHORITY_SOURCE_DRIFT",
  { expectedHash: EXPECTED_RATE_LIMIT_HASH, actualHash: rateLimitHash }
);

const rateLimit = read("src/lib/rate-limit.ts");
assert(
  rateLimit.includes(
    'insert into edulife_os."ApiRateLimitBucket" as bucket ('
  ) &&
    !rateLimit.includes('insert into "ApiRateLimitBucket" (') &&
    !rateLimit.includes('"ApiRateLimitBucket".') &&
    rateLimit.includes('when bucket."blockedUntil" is not null') &&
    rateLimit.includes('and bucket."blockedUntil" > now()') &&
    rateLimit.includes('then bucket."count"') &&
    rateLimit.includes('else bucket."count" + 1') &&
    rateLimit.includes('then bucket."blockedUntil"') &&
    rateLimit.includes('when bucket."count" + 1 > ${limit}') &&
    rateLimit.includes('on conflict ("scope", "keyHash", "windowStart")') &&
    rateLimit.includes('returning "count", "blockedUntil"'),
  "AUTH_P1B_M2_RATE_LIMIT_SCHEMA_AUTHORITY_CONTRACT"
);

assert(
  !rateLimit.includes("search_path") &&
    !rateLimit.includes("42P01") &&
    !rateLimit.includes("P2010"),
  "AUTH_P1B_M2_RATE_LIMIT_MUST_NOT_MUTATE_SCHEMA_CONTEXT_OR_SPECIAL_CASE_DB_ERRORS"
);

const statusLines = git(["status", "--porcelain=v1", "-uall"])
  .split(/\r?\n/)
  .filter(Boolean);

const changed = statusLines
  .map((line) => line.slice(3).replace(/\\/g, "/"))
  .sort();

assert(
  JSON.stringify(changed) === JSON.stringify(EXPECTED_CHANGED),
  "AUTH_P1B_M2_WORKTREE_BOUNDARY_MUST_BE_EXACT_12",
  { expected: EXPECTED_CHANGED, actual: changed }
);

const staged = git(["diff", "--cached", "--name-only"])
  .split(/\r?\n/)
  .filter(Boolean);

assert(staged.length === 0, "AUTH_P1B_M2_STAGING_MUST_REMAIN_EMPTY", staged);

const schema = read("prisma/schema.prisma");
assert(
  schema.includes("authVersion  Int      @default(0)") &&
    schema.includes("model PasswordRecoveryToken") &&
    schema.includes("tokenHash          String") &&
    schema.includes("authVersionAtIssue Int"),
  "AUTH_P1B_M2_BANKED_RECOVERY_SCHEMA_MUST_REMAIN"
);

const authVersion = read("src/lib/authVersion.ts");
for (const marker of [
  '"sub"',
  '"email"',
  '"tenantId"',
  '"roleName"',
  '"authVersion"',
  "isCurrentStaffAuthVersion",
  "clearStaffAuthClaims",
  "select: { authVersion: true }",
]) {
  assert(
    authVersion.includes(marker),
    `AUTH_P1B_M2_AUTH_VERSION_MARKER_MISSING: ${marker}`
  );
}

const auth = read("src/lib/auth.ts");
for (const marker of [
  'from "@/lib/authVersion"',
  "select: { passwordHash: true, authVersion: true }",
  "verifyPassword(\n          password,\n          credentialAuthority.passwordHash",
  "isCurrentStaffAuthVersion(\n            user.id,\n            credentialAuthority.authVersion",
  "authVersion: credentialAuthority.authVersion",
  "t.authVersion = u.authVersion",
  "isCurrentStaffAuthVersion(currentUid, t.authVersion)",
  "clearStaffAuthClaims(t)",
  'delete (su as { id?: string }).id',
  'tenant: { select: { status: true } }',
]) {
  assert(auth.includes(marker), `AUTH_P1B_M2_AUTH_MARKER_MISSING: ${marker}`);
}

const serverAuth = read("src/lib/serverAuth.ts");
assert(
  serverAuth.includes('from "@/lib/authVersion"') &&
    serverAuth.includes(
      "isCurrentStaffAuthVersion(uid, tokenRecord.authVersion)"
    ) &&
    serverAuth.indexOf("isCurrentStaffAuthVersion(uid") <
      serverAuth.indexOf("u = {"),
  "AUTH_P1B_M2_RAW_GETTOKEN_MUST_VALIDATE_AUTH_VERSION_FIRST"
);

const types = read("src/types/next-auth.d.ts");
const sessionStart = types.indexOf("interface Session");
const userStart = types.indexOf("interface User");
const jwtStart = types.indexOf('declare module "next-auth/jwt"');
assert(sessionStart >= 0 && userStart > sessionStart && jwtStart > userStart, "AUTH_P1B_M2_NEXTAUTH_TYPES_SHAPE");
assert(
  !types.slice(sessionStart, userStart).includes("authVersion"),
  "AUTH_P1B_M2_AUTH_VERSION_MUST_NOT_BE_EXPOSED_IN_CLIENT_SESSION"
);
assert(
  types.slice(userStart, jwtStart).includes("authVersion?: number") &&
    types.slice(jwtStart).includes("authVersion?: number"),
  "AUTH_P1B_M2_USER_AND_JWT_AUTH_VERSION_TYPES_REQUIRED"
);

const recovery = read("src/lib/passwordRecovery.ts");
for (const marker of [
  "randomBytes(32).toString(\"base64url\")",
  'createHash("sha256")',
  "PASSWORD_RECOVERY_TTL_MINUTES = 15",
  "RECOVERY_PASSWORD_MIN_LENGTH = 12",
  "RECOVERY_PASSWORD_MAX_LENGTH = 128",
  "tokenHash",
  "authVersionAtIssue",
  "consumedAt: now",
  "authVersion: { increment: 1 }",
  "failedLoginCount: 0",
  "lockedUntil: null",
  'action: "PASSWORD_RECOVERY_COMPLETED"',
  'buildPublicUrl("/auth/reset-password")',
  "#token=",
  "staffTotpStateChanged: false",
  "tenantAuthorityChanged: false",
]) {
  assert(
    recovery.includes(marker),
    `AUTH_P1B_M2_RECOVERY_MARKER_MISSING: ${marker}`
  );
}

assert(
  !/data:\s*\{[\s\S]{0,500}\btoken\s*:/.test(recovery),
  "AUTH_P1B_M2_PLAINTEXT_RECOVERY_TOKEN_MUST_NOT_BE_PERSISTED"
);
assert(
  !recovery.includes('buildPublicUrl("/auth/reset-password",') &&
    !recovery.includes("args.request"),
  "AUTH_P1B_M2_RESET_LINK_MUST_NOT_TRUST_REQUEST_HOST"
);
assert(
  !recovery.includes("failedOtpCount:") &&
    !recovery.includes("otpLockedUntil:") &&
    !recovery.includes("twoFactorEnabled:") &&
    !recovery.includes("lastActiveTenant:"),
  "AUTH_P1B_M2_RESET_MUST_NOT_CHANGE_TOTP_OR_TENANT_AUTHORITY"
);

const requestRoute = read(
  "src/app/api/auth/password-recovery/request/route.ts"
);
assert(
  requestRoute.includes("GENERIC_PASSWORD_RECOVERY_MESSAGE") &&
    requestRoute.includes("AUTH_PASSWORD_RECOVERY_REQUEST_IP") &&
    requestRoute.includes("AUTH_PASSWORD_RECOVERY_REQUEST_EMAIL") &&
    requestRoute.includes("GENERIC_RESPONSE_FLOOR_MS = 1_000") &&
    requestRoute.includes("genericOk(genericStartedAt)") &&
    requestRoute.includes('"Cache-Control": "no-store, max-age=0"'),
  "AUTH_P1B_M2_REQUEST_ROUTE_CONTRACT"
);

const resetRoute = read("src/app/api/auth/password-recovery/reset/route.ts");
assert(
  resetRoute.includes("AUTH_PASSWORD_RECOVERY_RESET_IP") &&
    resetRoute.includes("AUTH_PASSWORD_RECOVERY_RESET_TOKEN") &&
    resetRoute.includes("INVALID_OR_EXPIRED_RECOVERY") &&
    resetRoute.includes('"Cache-Control": "no-store, max-age=0"'),
  "AUTH_P1B_M2_RESET_ROUTE_CONTRACT"
);

const EXPECTED_RESET_PAGE_HASH =
  "48DD7E36ABEE2FFBAA35F4EA62B827DB274F873D51036AFD5A0EA39DC87475B9";

const resetPageHash = canonicalHash("src/app/auth/reset-password/page.tsx");
assert(
  resetPageHash === EXPECTED_RESET_PAGE_HASH,
  "AUTH_P1B_M2_RESET_PAGE_SOURCE_DRIFT",
  { expectedHash: EXPECTED_RESET_PAGE_HASH, actualHash: resetPageHash }
);

const resetPage = read("src/app/auth/reset-password/page.tsx");
assert(
  resetPage.includes("window.location.hash") &&
    resetPage.includes("window.history.replaceState") &&
    !resetPage.includes('searchParams.get("token")') &&
    !resetPage.includes("useSearchParams"),
  "AUTH_P1B_M2_RESET_SECRET_MUST_USE_FRAGMENT_NOT_QUERY"
);

assert(
  resetPage.includes("showNewPassword") &&
    resetPage.includes("showConfirmPassword") &&
    resetPage.includes('type={showNewPassword ? "text" : "password"}') &&
    resetPage.includes('type={showConfirmPassword ? "text" : "password"}') &&
    resetPage.includes('"Show new password"') &&
    resetPage.includes('"Hide new password"') &&
    resetPage.includes('"Show confirm password"') &&
    resetPage.includes('"Hide confirm password"') &&
    resetPage.includes("PasswordVisibilityIcon") &&
    resetPage.includes('aria-pressed={showNewPassword}') &&
    resetPage.includes('aria-pressed={showConfirmPassword}'),
  "AUTH_P1B_M2_RESET_PASSWORD_VISIBILITY_ACCESSIBILITY_CONTRACT"
);

assert(
  resetPage.includes("passwordsMatch") &&
    resetPage.includes("passwordsMismatch") &&
    resetPage.includes("Passwords match") &&
    resetPage.includes("Passwords do not match") &&
    resetPage.includes('id="confirm-password-status"') &&
    resetPage.includes('aria-describedby="confirm-password-status"') &&
    resetPage.includes('aria-live="polite"') &&
    resetPage.includes('aria-atomic="true"') &&
    resetPage.includes("aria-invalid={passwordsMismatch}"),
  "AUTH_P1B_M2_RESET_PASSWORD_MATCH_FEEDBACK_CONTRACT"
);

assert(
  (resetPage.match(/autoComplete="new-password"/g) ?? []).length === 2 &&
    !resetPage.includes("localStorage") &&
    !resetPage.includes("sessionStorage") &&
    !resetPage.includes("console."),
  "AUTH_P1B_M2_RESET_VISIBILITY_MUST_REMAIN_LOCAL_NONPERSISTENT_UI_STATE"
);

const forgotPage = read("src/app/auth/forgot-password/page.tsx");
assert(
  forgotPage.includes("/api/auth/password-recovery/request") &&
    forgotPage.includes("does not reveal whether an account exists"),
  "AUTH_P1B_M2_FORGOT_PASSWORD_NON_ENUMERATION_UI"
);

const signIn = read("src/app/auth/signin/page.tsx");
assert(
  signIn.includes('href="/auth/forgot-password"') &&
    signIn.includes("Forgot password?") &&
    signIn.includes("showOtp"),
  "AUTH_P1B_M2_SIGNIN_RECOVERY_LINK_MISSING"
);

console.log("UI-AUTH-P1B-M2 PASSWORD RECOVERY APPLICATION CONTRACT: GREEN");
console.log("- recovery request is email-based, generic and timing-normalized");
console.log("- only SHA-256 recovery-token hashes are persisted");
console.log("- one-time 15-minute recovery authority is authVersion-bound");
console.log("- successful reset atomically consumes the token and increments authVersion");
console.log("- password-login lockout clears; staff TOTP state and tenant authority remain unchanged");
console.log("- login authVersion is bound to the same passwordHash snapshot that was verified");
console.log("- legacy/stale staff JWTs fail closed through authVersion validation");
console.log("- raw getToken API authority validates authVersion before accepting identity");
console.log("- recovery link origin comes only from configured URL authority/fixed fallback, never request Host");
console.log("- recovery secret travels in URL fragment, then is removed from browser address state");
console.log("- Parent HMAC/OTP, middleware, password primitive and email sender remain hash-locked");
console.log("- shared rate limiter is exact-hash locked and uses explicit edulife_os table authority");
console.log("- reset password fields have independent accessible visibility controls");
console.log("- confirm-password feedback is explicit, live and not color-only");
console.log("- password visibility state is local-only and never persisted");
console.log("- repository boundary is EXACT 12 and staging remains empty");
