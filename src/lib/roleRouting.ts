// src/lib/roleRouting.ts
export type Role =
  | "SCHOOL_ADMIN"
  | "HEADTEACHER"
  | "TEACHER"
  | "PARENT"
  | "SUPERADMIN"
  | "ADMIN"
  | "HEADMASTER"
  | "SUPER_ADMIN"
  | "SYSTEM_ADMIN"
  | "OWNER"
  | string;

export function normRole(v: unknown) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

/**
 * Canonicalize legacy roles WITHOUT collapsing SUPERADMIN.
 * - ADMIN -> SCHOOL_ADMIN
 * - HEADMASTER -> HEADTEACHER
 * - SUPER_ADMIN / SYSTEM_ADMIN / OWNER -> SUPERADMIN
 */
export function effectiveRole(roleName: unknown) {
  const r = normRole(roleName);
  if (r === "ADMIN") return "SCHOOL_ADMIN";
  if (r === "HEADMASTER") return "HEADTEACHER";
  if (r === "SUPER_ADMIN" || r === "SYSTEM_ADMIN" || r === "OWNER") return "SUPERADMIN";
  return r;
}

// Block open-redirects, allow only internal paths.
export function safeInternalPath(raw: string | null | undefined, fallback = "/app") {
  const v = String(raw ?? "").trim();
  if (!v) return fallback;

  if (v.startsWith("//") || v.startsWith("\\") || v.startsWith("\\\\")) return fallback;
  if (v.startsWith("/")) return v;

  try {
    const u = new URL(v);
    const path = `${u.pathname}${u.search}${u.hash}`.trim();
    if (!path.startsWith("/") || path.startsWith("//")) return fallback;
    return path || fallback;
  } catch {
    return fallback;
  }
}

export function buildAppCallbackUrl(nextPath: string) {
  const next = safeInternalPath(nextPath, "/app");
  return `/app?next=${encodeURIComponent(next)}`;
}

/**
 * Adminish = can operate on tenant-wide data.
 * MVP decision: SCHOOL_ADMIN + SUPERADMIN + HEADTEACHER
 */
function isSuper(role: string) {
  return role === "SUPERADMIN";
}
function isSchoolAdmin(role: string) {
  return role === "SCHOOL_ADMIN";
}
function isHeadteacher(role: string) {
  return role === "HEADTEACHER";
}
function isTeacher(role: string) {
  return role === "TEACHER";
}
function isParent(role: string) {
  return role === "PARENT";
}

function isAdminish(role: string) {
  return isSuper(role) || isSchoolAdmin(role) || isHeadteacher(role);
}

function isHeadteacherApiAllowed(role: string) {
  return isHeadteacher(role) || isAdminish(role);
}

function isTeacherLike(role: string) {
  return isSuper(role) || isTeacher(role) || isHeadteacher(role);
}

function isParentApiAllowed(role: string) {
  return isParent(role) || isAdminish(role);
}

function isParentLike(role: string) {
  return isSuper(role) || isParent(role);
}

export function roleDefaultDestination(roleName: unknown) {
  const role = effectiveRole(roleName);
  if (role === "SUPERADMIN") return "/admin/super";
  if (role === "SCHOOL_ADMIN") return "/admin/dashboard";
  if (role === "HEADTEACHER") return "/headteacher/dashboard";
  if (role === "TEACHER") return "/teacher/dashboard";
  if (role === "PARENT") return "/parents/my-children";
  return "/app";
}

export function requiredRoleForPath(path: string) {
  const p = safeInternalPath(path, "/app");

  // Pages
  if (p.startsWith("/admin/super")) return "SUPERADMIN";
  if (p === "/head-portal") return "HEADTEACHER";
  if (p.startsWith("/headteacher")) return "HEADTEACHER";
  if (p.startsWith("/teacher")) return "TEACHER";
  if (p.startsWith("/admin")) return "SCHOOL_ADMIN";
  if (p.startsWith("/parents") || p.startsWith("/parent-portal")) return "PARENT";

  // APIs
  if (p.startsWith("/api/headteacher")) return "HEADTEACHER";
  if (p.startsWith("/api/teacher")) return "TEACHER";
  if (p.startsWith("/api/teachers")) return "TEACHER";
  if (p.startsWith("/api/admin")) return "SCHOOL_ADMIN";
  if (p.startsWith("/api/parents")) return "PARENT";

  if (p.startsWith("/api/rbac")) return "SCHOOL_ADMIN";
  if (p.startsWith("/api/tenants")) return "SUPERADMIN";
  if (p.startsWith("/api/attendance")) return "TEACHER";
  if (p.startsWith("/api/consent")) return "PARENT";

  return null;
}

export function isPathAllowedForRole(path: string, roleName: unknown) {
  const role = effectiveRole(roleName);
  const p = safeInternalPath(path, "/app");

  if (p.startsWith("/auth/")) return true;
  if (p === "/app" || p.startsWith("/app/")) return true;
  if (p.startsWith("/api/auth/")) return true;
  if (p === "/api/me") return true;

  if (p === "/head-portal") return isHeadteacherApiAllowed(role);

  // Special-case legacy
  if (p === "/api/admin/invite-teacher") {
    return isAdminish(role) || isHeadteacher(role);
  }

  // ✅ Phase 7 narrow allowlist: ONLY specific /api/tenants/* endpoints that are tenant-scoped
  if (
    p.startsWith("/api/tenants/") &&
    (p.endsWith("/onboarding/rotate") || p.endsWith("/invites/create"))
  ) {
    return isAdminish(role);
  }

  // ---- Protected API families ----
  if (p.startsWith("/api/tenants")) return isSuper(role);
  if (p.startsWith("/api/rbac")) return isAdminish(role);
  if (p.startsWith("/api/admin")) return isAdminish(role);
  if (p.startsWith("/api/headteacher")) return isHeadteacherApiAllowed(role);
  if (p.startsWith("/api/teacher") || p.startsWith("/api/teachers")) return isTeacherLike(role);
  if (p.startsWith("/api/attendance")) return isTeacherLike(role);
  if (p.startsWith("/api/parents")) return isParentApiAllowed(role);
  if (p.startsWith("/api/consent")) return isParentApiAllowed(role);

  if (p.startsWith("/api/")) return false;

  // ---- Page policy ----
  if (p.startsWith("/admin")) return isAdminish(role);
  if (p.startsWith("/headteacher")) return isHeadteacherApiAllowed(role);
  if (p.startsWith("/teacher")) return isTeacherLike(role);
  if (p.startsWith("/parents") || p.startsWith("/parent-portal")) return isParentLike(role);

  return true;
}