// src/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { buildAppCallbackUrl, effectiveRole, isPathAllowedForRole } from "@/lib/roleRouting";

const PARENT_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-edulife_parent" : "edulife_parent";

function buildSignInRedirect(req: NextRequest) {
  const url = req.nextUrl.clone();
  const attempted = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  url.pathname = "/auth/signin";
  url.searchParams.set("callbackUrl", buildAppCallbackUrl(attempted));
  return NextResponse.redirect(url);
}

function buildParentLoginRedirect(req: NextRequest) {
  const url = req.nextUrl.clone();
  const attempted = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  url.pathname = "/parent/login";
  url.searchParams.set("next", attempted);
  return NextResponse.redirect(url);
}

function jsonUnauthorized() {
  return NextResponse.json(
    { ok: false, error: "UNAUTHORIZED" },
    { status: 401, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

function jsonForbidden(role: string, path: string) {
  return NextResponse.json(
    { ok: false, error: "FORBIDDEN", role, path },
    { status: 403, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

// ---------- Parent cookie verification (EDGE, WebCrypto) ----------
function b64urlToUint8Array(s: string) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

let cachedKey: CryptoKey | null = null;
async function getHmacKey() {
  if (cachedKey) return cachedKey;

  const secret =
    process.env.PARENT_SESSION_SECRET ||
    process.env.OTP_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "dev-edulife-parent-secret";

  const enc = new TextEncoder();
  cachedKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return cachedKey;
}

async function verifyParentCookie(token: string): Promise<boolean> {
  const t = String(token ?? "").trim();
  if (!t) return false;

  const parts = t.split(".");
  if (parts.length !== 2) return false;

  const [base, sig] = parts;
  if (!base || !sig) return false;

  const key = await getHmacKey();
  const enc = new TextEncoder();
  const baseBytes = enc.encode(base);
  const sigBytes = b64urlToUint8Array(sig);

  const ok = await crypto.subtle.verify("HMAC", key, sigBytes, baseBytes);
  if (!ok) return false;

  try {
    const payloadJson = new TextDecoder().decode(b64urlToUint8Array(base));
    const payload = JSON.parse(payloadJson);
    const exp = Number(payload?.exp);
    if (!exp || !Number.isFinite(exp)) return false;

    const now = Math.floor(Date.now() / 1000);
    if (now > exp) return false;

    if (!payload?.tenantId) return false;
    if (!payload?.guardianSuffix9) return false;

    return true;
  } catch {
    return false;
  }
}

// ---------- Public consent allowlist ----------
function isPublicConsentEndpoint(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!path.startsWith("/api/consent/")) return false;

  // Copy-message helper is GET-only
  if (path === "/api/consent/optin/sms-text" && req.method === "GET") return true;

  // Consent link should be public (token is the security boundary).
  // Allow GET (render/capture) + POST (confirm) to avoid future breakage.
  if (path === "/api/consent/optin/student/link" && (req.method === "GET" || req.method === "POST")) return true;

  return false;
}

function isAdminish(role: string) {
  return role === "SUPERADMIN" || role === "ADMIN" || role === "SCHOOLADMIN" || role === "SCHOOL_ADMIN";
}

function isConsentAllowedForRole(path: string, role: string) {
  if (!path.startsWith("/api/consent/")) return false;
  if (isAdminish(role) || role === "HEADTEACHER") return true;
  if (role === "TEACHER") return path.startsWith("/api/consent/optin/") || path.startsWith("/api/consent/optout/");
  return false;
}

// ---------- Route classification ----------
function isParentPublicPath(path: string) {
  return (
    path === "/parent/login" ||
    path.startsWith("/parent/login/") ||
    path.startsWith("/api/parent/otp/") ||
    path === "/api/parent/logout"
  );
}

function isParentProtectedPath(path: string) {
  return (
    path === "/parent-portal" ||
    path.startsWith("/parent-portal/") ||
    path.startsWith("/parents/") ||
    path.startsWith("/parent/") ||
    path.startsWith("/api/parents/")
  );
}

function isStaffProtectedPath(path: string) {
  return (
    path === "/app" ||
    path.startsWith("/app/") ||
    path.startsWith("/admin/") ||
    path.startsWith("/teacher/") ||
    path.startsWith("/headteacher/") ||
    path.startsWith("/api/admin/") ||
    path.startsWith("/api/teacher/") ||
    path.startsWith("/api/teachers/") ||
    path.startsWith("/api/headteacher/") ||
    path.startsWith("/api/rbac/") ||
    path.startsWith("/api/attendance/") ||
    path.startsWith("/api/consent/") ||
    path.startsWith("/api/tenants/") ||
    path === "/api/me" ||
    path.startsWith("/api/settings/")
  );
}

export default async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isApi = path.startsWith("/api/");

  // Allow NextAuth internals
  if (path.startsWith("/api/auth/")) return NextResponse.next();

  // Public consent endpoints (no auth)
  if (isPublicConsentEndpoint(req)) return NextResponse.next();

  // Parent public endpoints/pages
  if (isParentPublicPath(path)) return NextResponse.next();

  // Parent protected
  if (isParentProtectedPath(path)) {
    const cookie = req.cookies.get(PARENT_COOKIE_NAME)?.value ?? "";
    const ok = await verifyParentCookie(cookie);

    if (!ok) {
      if (isApi) return jsonUnauthorized();
      return buildParentLoginRedirect(req);
    }

    return NextResponse.next();
  }

  // Staff protected (NextAuth token + RBAC)
  if (isStaffProtectedPath(path)) {
    const secret = process.env.NEXTAUTH_SECRET;
    const token = await getToken({ req, secret });

    const userId =
      (token?.sub ? String(token.sub) : "") ||
      ((token as any)?.uid ? String((token as any).uid) : "");

    if (!token || !userId) {
      if (isApi) return jsonUnauthorized();
      return buildSignInRedirect(req);
    }

    const role = effectiveRole((token as any)?.roleName ?? (token as any)?.role ?? "");

    // Consent special policy
    if (isConsentAllowedForRole(path, role)) return NextResponse.next();

    if (isPathAllowedForRole(path, role)) return NextResponse.next();

    if (isApi) return jsonForbidden(role, path);

    const url = req.nextUrl.clone();
    url.pathname = "/app";
    url.search = `?next=${encodeURIComponent(`${req.nextUrl.pathname}${req.nextUrl.search}`)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/app/:path*",
    "/headteacher/:path*",
    "/teacher/:path*",
    "/admin/:path*",

    "/parent-portal/:path*",
    "/parents/:path*",
    "/parent/:path*",

    "/api/headteacher/:path*",
    "/api/teacher/:path*",
    "/api/teachers/:path*",
    "/api/admin/:path*",

    "/api/parents/:path*",
    "/api/parent/:path*",

    "/api/rbac/:path*",
    "/api/attendance/:path*",
    "/api/consent/:path*",
    "/api/tenants/:path*",

    "/api/me",
    "/api/settings/:path*",
  ],
};