#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally reads exact repository source. */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

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
  assert(fs.existsSync(absolutePath), "AUTH_P1C_FILE_MISSING", {
    relativePath,
  });
  return fs.readFileSync(absolutePath, "utf8");
}

function canonicalSha256(relativePath) {
  const canonical = read(relativePath)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  return crypto
    .createHash("sha256")
    .update(canonical, "utf8")
    .digest("hex")
    .toUpperCase();
}

const FILES = {
  layout: "src/app/parent/layout.tsx",
  login: "src/app/parent/login/page.tsx",
  sidebar: "src/components/ParentSidebarNav.tsx",
  parentPortalLayout: "src/app/parent-portal/layout.tsx",
  parentSession: "src/lib/parentSession.ts",
  middleware: "src/middleware.ts",
  otpVerify: "src/app/api/parent/otp/verify/route.ts",
};

const LOCKS = {
  layout: "01F23C838ADEB432D9810DC43E8DC6BA6D7995FEEC8FC1499AA52BC4C32629E6",
  login: "F08BAD5177C79135EA439CA0FF43F12B38BB33BE11C24518A2CF553016B9BB8F",
  sidebar: "AE60CCDB380138378D232286462EA398120A7A5B9777AA681A0EC83B17EA6F10",
  parentPortalLayout:
    "745A87BEDCF58955C719C6BD20337BFF76ABDF38130DDFEABC5EA38A82E3B834",
  parentSession:
    "713D81BB2465BF411C4E23D9A7C94E084EAD9C4FB3653CC25E2A63E3D8F95087",
  middleware:
    "0B403EDB65E7A4491521ADDE6E12C2F1BD1A6B6FA0263D4D470138F61FF2DD53",
  otpVerify:
    "3FBC07B6A0FD0ACD594A68432FFC0A718D40E84280A496A5D381DC2B07D70E42",
};

for (const [key, expected] of Object.entries(LOCKS)) {
  const actual = canonicalSha256(FILES[key]);
  assert(actual === expected, "AUTH_P1C_SOURCE_DRIFT", {
    file: FILES[key],
    expected,
    actual,
  });
}

const layout = read(FILES.layout);

assert(
  layout.includes('import { cookies } from "next/headers";'),
  "AUTH_P1C_LAYOUT_MUST_READ_SERVER_COOKIES"
);
assert(
  layout.includes("PARENT_COOKIE_NAME") &&
    layout.includes("verifyParentSessionToken"),
  "AUTH_P1C_LAYOUT_MUST_USE_EXISTING_PARENT_SESSION_AUTHORITY"
);
assert(
  layout.includes("verifyParentSessionToken(token).ok"),
  "AUTH_P1C_LAYOUT_MUST_VERIFY_PARENT_SESSION"
);
assert(
  /catch\s*\{\s*hasValidParentSession\s*=\s*false;\s*\}/s.test(layout),
  "AUTH_P1C_VERIFIER_FAILURE_MUST_FAIL_CLOSED"
);
assert(
  !layout.includes("usePathname"),
  "AUTH_P1C_MUST_NOT_USE_PATHNAME_AS_AUTHORITY"
);

const unauthenticatedBoundary = layout.indexOf("if (!hasValidParentSession)");
const unauthenticatedReturn = layout.indexOf(
  "return <>{children}</>;",
  unauthenticatedBoundary
);
const navRender = layout.indexOf("<ParentSidebarNav />");

assert(
  unauthenticatedBoundary >= 0 &&
    unauthenticatedReturn > unauthenticatedBoundary,
  "AUTH_P1C_UNAUTHENTICATED_BRANCH_MUST_RENDER_WITHOUT_PORTAL_CHROME"
);
assert(
  navRender > unauthenticatedReturn,
  "AUTH_P1C_SIDEBAR_MUST_RENDER_ONLY_AFTER_VALID_PARENT_SESSION"
);

const login = read(FILES.login);

assert(
  login.includes('fetch("/api/parent/otp/request"') &&
    login.includes('fetch("/api/parent/otp/verify"'),
  "AUTH_P1C_EXISTING_PARENT_OTP_FLOW_MUST_REMAIN"
);
assert(
  login.includes('safeInternalPath(sp.get("next"), "/parent-portal")'),
  "AUTH_P1C_SAFE_PARENT_REDIRECT_MUST_REMAIN"
);
assert(
  login.includes("/api/public/schools/search?q=") &&
    login.includes("schoolId: selectedSchool.id") &&
    login.includes("guardianPhone: phone"),
  "AUTH_P1C_SCHOOL_LINKED_OTP_REQUEST_MUST_REMAIN"
);
assert(
  login.includes("setDebugCode") &&
    login.includes("cooldownSecondsRemaining"),
  "AUTH_P1C_LOCAL_OTP_DEBUG_AND_COOLDOWN_BEHAVIOR_MUST_REMAIN"
);

assert(
  login.includes("max-w-5xl") &&
    !login.includes("max-w-6xl") &&
    login.includes("rounded-[26px]") &&
    login.includes("lg:grid-cols-[0.82fr_1.18fr]"),
  "AUTH_P1C_LOGIN_MUST_USE_COMPACT_DESKTOP_SHELL"
);
assert(
  login.includes("px-3 py-4 sm:px-4 sm:py-6") &&
    login.includes("p-3.5 sm:p-4"),
  "AUTH_P1C_LOGIN_MUST_USE_COMPACT_MOBILE_SPACING"
);
assert(
  login.includes("const schoolSearchStarted = clean(schoolQuery).length >= 2;") &&
    login.includes("{schoolSearchStarted ? ("),
  "AUTH_P1C_SCHOOL_RESULTS_MUST_USE_PROGRESSIVE_DISCLOSURE"
);

const progressiveMarker = login.indexOf(
  "Progressive disclosure: verification appears only after a code is sent."
);
const requestedGate = login.indexOf("{requested ? (", progressiveMarker);
const verifyHeading = login.indexOf(
  'title="Verify security code"',
  requestedGate
);

assert(
  progressiveMarker >= 0 && requestedGate > progressiveMarker,
  "AUTH_P1C_VERIFY_STEP_MUST_BE_GATED_BY_SUCCESSFUL_OTP_REQUEST"
);
assert(
  verifyHeading > requestedGate,
  "AUTH_P1C_VERIFY_UI_MUST_RENDER_INSIDE_REQUESTED_GATE"
);
assert(
  login.includes("maxLength={6}") &&
    login.includes('autoComplete="one-time-code"') &&
    login.includes('inputMode="numeric"'),
  "AUTH_P1C_VERIFY_FIELD_MUST_REMAIN_COMPACT_6_DIGIT_OTP_ENTRY"
);
assert(
  !login.includes(": any"),
  "AUTH_P1C_NEW_LOGIN_SOURCE_MUST_NOT_ADD_EXPLICIT_ANY"
);

const parentPortalLayout = read(FILES.parentPortalLayout);
assert(
  parentPortalLayout.includes("<ParentSidebarNav />"),
  "AUTH_P1C_AUTHENTICATED_PARENT_PORTAL_NAV_MUST_REMAIN"
);

const middleware = read(FILES.middleware);
assert(
  middleware.includes('path === "/parent/login"') &&
    middleware.includes('path.startsWith("/api/parent/otp/")'),
  "AUTH_P1C_PARENT_PUBLIC_LOGIN_AND_OTP_ALLOWLIST_MUST_REMAIN"
);
assert(
  middleware.includes('path === "/parent-portal"') &&
    middleware.includes('path.startsWith("/parent/")') &&
    middleware.includes("verifyParentCookie(cookie)"),
  "AUTH_P1C_PROTECTED_PARENT_MIDDLEWARE_MUST_REMAIN"
);

const parentSession = read(FILES.parentSession);
assert(
  parentSession.includes('crypto.createHmac("sha256"') &&
    parentSession.includes("timingSafeEqual") &&
    parentSession.includes('error: "EXPIRED"'),
  "AUTH_P1C_PARENT_HMAC_SESSION_VERIFIER_MUST_REMAIN"
);

const otpVerify = read(FILES.otpVerify);
assert(
  otpVerify.includes("createParentSessionToken") &&
    otpVerify.includes("PARENT_COOKIE_NAME") &&
    otpVerify.includes('redirectTo: "/parent-portal"'),
  "AUTH_P1C_OTP_VERIFICATION_SESSION_ISSUANCE_MUST_REMAIN"
);

console.log("UI-AUTH-P1C COMPACT LOGIN CONTRACT: GREEN");
console.log("- pre-auth Parent sidebar remains hidden without a valid signed session");
console.log("- Parent OTP request/verify endpoints and safe redirect are preserved");
console.log("- desktop shell is narrower, denser, and bank-grade");
console.log("- mobile shell uses compact readable spacing and full-width controls");
console.log("- school results appear only after a real search begins");
console.log("- OTP verification appears only after a code was successfully requested");
console.log("- authenticated Parent Portal navigation remains unchanged");
console.log("- Parent HMAC session and protected middleware remain unchanged");
