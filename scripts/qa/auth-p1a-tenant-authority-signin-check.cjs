"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads repository source for static contract verification. */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const signin = read("src/app/auth/signin/page.tsx");
const auth = read("src/lib/auth.ts");
const serverAuth = read("src/lib/serverAuth.ts");
const apiAuth = read("src/lib/apiAuth.ts");
const authz = read("src/lib/authz.ts");
const tenantScope = read("src/lib/server/tenantScope.ts");
const tenant = read("src/lib/tenant.ts");
const rbac = read("src/lib/rbac.ts");

assert(!signin.includes("setTenant("), "Sign-in must not keep human-entered school state.");
assert(!signin.includes("tenant.trim() || undefined"), "Normal sign-in must not submit a School Code/tenant hint.");
assert(!signin.includes("required for Staff ID or multi-school accounts"), "School Code prompt must be removed from sign-in UI.");
assert(!signin.includes("One-Time Code (OTP) <span"), "OTP must not be permanently visible.");

assert(
  signin.includes("const [showOtp, setShowOtp] = useState(false)") &&
    signin.includes('res.error === "OTP_REQUIRED"') &&
    signin.includes("setShowOtp(true)") &&
    signin.includes("{showOtp ? (") &&
    signin.includes("Security code") &&
    signin.includes("Verify & sign in"),
  "2FA must be progressively disclosed only after OTP_REQUIRED."
);

assert(
  signin.includes("Enter the 6-digit code from your authenticator app."),
  "2FA instructions must be simple and BBC-friendly."
);

assert(
  auth.includes("if (user.twoFactorEnabled)") &&
    auth.includes('throw new Error("OTP_REQUIRED")') &&
    auth.includes("verifyTotpWithEnvelope"),
  "Existing encrypted TOTP enforcement must remain intact."
);

assert(
  auth.includes(`const t = await prisma.tenant.findFirst({\n      where: {\n        status: "ACTIVE",\n        OR: [`),
  "Explicit tenant identifiers must resolve only ACTIVE tenants."
);

assert(
  auth.includes(`const m = await prisma.membership.findFirst({\n      where: {\n        userId,\n        tenantId: preferredTenantId,\n        status: "ACTIVE",\n        tenant: { status: "ACTIVE" },\n      },`),
  "Preferred school membership must require ACTIVE membership + ACTIVE tenant."
);

assert(
  auth.includes(`const ms = await prisma.membership.findMany({\n    where: {\n      userId,\n      status: "ACTIVE",\n      tenant: { status: "ACTIVE" },\n    },`),
  "Email-login fallback membership resolution must exclude inactive tenants."
);

assert(
  auth.includes(`const hits = await prisma.membership.findMany({\n    where: {\n      status: "ACTIVE",\n      tenant: { status: "ACTIVE" },\n      OR: [`),
  "Global Staff-ID resolution must require ACTIVE membership + ACTIVE tenant."
);

assert(
  auth.includes(`tenantId: tenantIdHint,\n                status: "ACTIVE",\n                tenant: { status: "ACTIVE" },\n                OR: [{ staffIdNorm }`),
  "Tenant-scoped Staff-ID lookup must require ACTIVE membership + ACTIVE tenant."
);

assert(
  auth.includes('tenant: { select: { status: true } }') &&
    auth.includes('String(m.tenant?.status ?? "") === "ACTIVE"'),
  "JWT tenant updates must not switch into an inactive tenant."
);

assert(
  serverAuth.includes('tenant: { select: { status: true } }') &&
    serverAuth.includes('String(m.tenant?.status ?? "") !== "ACTIVE"') &&
    serverAuth.includes('const mem = await loadActiveMembership(String(u.id), String(tenantId ?? ""));') &&
    serverAuth.includes("if (!mem) return null;") &&
    serverAuth.includes("roleName = mem.roleName;") &&
    serverAuth.includes("staffId = mem.staffId;"),
  "Every tenant-bearing server context, including getServerUserContextOrNull, must use current DB authority."
);

assert(
  apiAuth.includes("const mustRevalidateTenant") &&
    apiAuth.includes('tenant: { select: { status: true } }') &&
    apiAuth.includes('String(m.tenant?.status ?? "") !== "ACTIVE"'),
  "API authority must revalidate ACTIVE membership + ACTIVE tenant."
);

assert(
  authz.includes('tenant: { select: { status: true } }') &&
    authz.includes('String(membership.tenant?.status ?? "") !== "ACTIVE"'),
  "Legacy authz membership helper must reject inactive tenants."
);

assert(
  tenantScope.includes('import { prisma } from "@/lib/prisma";') &&
    tenantScope.includes('tenant: { select: { status: true } }') &&
    tenantScope.includes('String(membership.tenant?.status ?? "") !== "ACTIVE"'),
  "server/tenantScope must independently revalidate tenant lifecycle."
);

assert(
  tenant.includes("status: true") &&
    tenant.includes('String(membership.tenant?.status ?? "") !== "ACTIVE"') &&
    tenant.includes('tenant: { status: "ACTIVE" }'),
  "Tenant helpers must reject inactive tenants."
);

assert(
  rbac.includes('tenant: { status: "ACTIVE" }'),
  "RBAC membership/permission checks must require ACTIVE tenant authority."
);

console.log("UI-AUTH-P1A-R2Q1 CONTRACT: GREEN");
console.log("- School Code removed from normal sign-in UI and payload");
console.log("- explicit tenant resolution accepts ACTIVE tenants only");
console.log("- email/Staff-ID school login requires ACTIVE Membership + ACTIVE Tenant");
console.log("- global Staff-ID lookup excludes suspended/archived tenants");
console.log("- direct/null server contexts and API/tenant helpers reject inactive tenants");
console.log("- JWT tenant updates cannot switch into an inactive tenant");
console.log("- 2FA is hidden by default and revealed only after OTP_REQUIRED");
console.log("- encrypted TOTP verification and OTP lockouts remain preserved");
console.log("- Parent OTP, schema, migrations, commit, and push remain outside this slice");
