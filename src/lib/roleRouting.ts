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
  | "SISSO"
  | "CIRCUIT_SUPERVISOR"
  | "DISTRICT_DIRECTOR"
  | "HEAD_OF_SUPERVISION"
  | "BASIC_SCHOOL_COORDINATOR"
  | "DISTRICT_MIS_OFFICER"
  | "DISTRICT_SHEP_OFFICER"
  | "DISTRICT_ASSESSMENT_OFFICER"
  | "REGIONAL_VIEWER"
  | string;

export function normRole(v: unknown) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

export function effectiveRole(roleName: unknown) {
  const r = normRole(roleName);
  if (r === "ADMIN") return "SCHOOL_ADMIN";
  if (r === "HEADMASTER") return "HEADTEACHER";
  if (r === "SUPER_ADMIN" || r === "SYSTEM_ADMIN" || r === "OWNER") return "SUPERADMIN";
  return r;
}

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

function isCircuitGovernance(role: string) {
  return role === "SISSO" || role === "CIRCUIT_SUPERVISOR";
}

function isHeadOfSupervision(role: string) {
  return role === "HEAD_OF_SUPERVISION";
}

function isBasicSchoolCoordinator(role: string) {
  return role === "BASIC_SCHOOL_COORDINATOR";
}

function isDistrictDirector(role: string) {
  return role === "DISTRICT_DIRECTOR";
}

function isDistrictCommandGovernance(role: string) {
  return (
    role === "DISTRICT_DIRECTOR" ||
    role === "DISTRICT_MIS_OFFICER" ||
    role === "DISTRICT_SHEP_OFFICER" ||
    role === "DISTRICT_ASSESSMENT_OFFICER"
  );
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

function isHosDashboardPath(path: string) {
  return path === "/district/hos" || path.startsWith("/district/hos/");
}

function isBscDashboardPath(path: string) {
  return path === "/district/bsc" || path.startsWith("/district/bsc/");
}

function isDirectorHeadteacherAppraisalPath(path: string) {
  return (
    path === "/district/headteacher-appraisals" ||
    path.startsWith("/district/headteacher-appraisals/") ||
    path === "/api/district/headteacher-appraisals" ||
    path.startsWith("/api/district/headteacher-appraisals/")
  );
}

function isDirectorFeedbackPath(path: string) {
  return (
    path === "/district/director-feedback" ||
    path.startsWith("/district/director-feedback/") ||
    path === "/api/district/director-feedback" ||
    path.startsWith("/api/district/director-feedback/")
  );
}

export function roleDefaultDestination(roleName: unknown) {
  const role = effectiveRole(roleName);

  if (role === "SUPERADMIN") return "/admin/super";

  if (isCircuitGovernance(role)) return "/circuit/dashboard";
  if (isHeadOfSupervision(role)) return "/district/hos/dashboard";
  if (isBasicSchoolCoordinator(role)) return "/district/bsc/dashboard";
  if (isDistrictCommandGovernance(role)) return "/district/dashboard";
  if (role === "REGIONAL_VIEWER") return "/district/dashboard";

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
  if (p.startsWith("/admin/governance")) return "SUPERADMIN";
  if (p === "/head-portal") return "HEADTEACHER";
  if (p.startsWith("/headteacher")) return "HEADTEACHER";
  if (p.startsWith("/teacher")) return "TEACHER";
  if (p.startsWith("/circuit")) return "SISSO";
  if (isHosDashboardPath(p)) return "HEAD_OF_SUPERVISION";
  if (isBscDashboardPath(p)) return "BASIC_SCHOOL_COORDINATOR";
  if (isDirectorHeadteacherAppraisalPath(p)) return "DISTRICT_DIRECTOR";
  if (isDirectorFeedbackPath(p)) return "DISTRICT_DIRECTOR";
  if (p.startsWith("/district")) return "DISTRICT_DIRECTOR";
  if (p.startsWith("/admin")) return "SCHOOL_ADMIN";
  if (p.startsWith("/parents") || p.startsWith("/parent-portal")) return "PARENT";

  // APIs
  if (p.startsWith("/api/admin/governance")) return "SUPERADMIN";
  if (p.startsWith("/api/circuit")) return "SISSO";
  if (isDirectorHeadteacherAppraisalPath(p)) return "DISTRICT_DIRECTOR";
  if (isDirectorFeedbackPath(p)) return "DISTRICT_DIRECTOR";
  if (p.startsWith("/api/district")) return "DISTRICT_DIRECTOR";
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
  if (p.startsWith("/governance/invite")) return true;

  if (p === "/app" || p.startsWith("/app/")) return true;
  if (p.startsWith("/api/auth/")) return true;
  if (p.startsWith("/api/governance/invite/")) return true;
  if (p === "/api/me") return true;

  if (p === "/head-portal") return isHeadteacherApiAllowed(role);

  if (p === "/api/admin/invite-teacher") {
    return isAdminish(role) || isHeadteacher(role);
  }

  if (
    p.startsWith("/api/tenants/") &&
    (p.endsWith("/onboarding/rotate") || p.endsWith("/invites/create"))
  ) {
    return isAdminish(role);
  }

  // Governance admin is superadmin-only for now.
  if (p.startsWith("/admin/governance")) return isSuper(role);
  if (p.startsWith("/api/admin/governance")) return isSuper(role);

  // Exact governance-officer dashboard routes.
  if (isHosDashboardPath(p)) {
    return isSuper(role) || isHeadOfSupervision(role);
  }

  if (isBscDashboardPath(p)) {
    return isSuper(role) || isBasicSchoolCoordinator(role);
  }

  // Director-only Headteacher review, anonymous-response, decision and release routes.
  if (isDirectorHeadteacherAppraisalPath(p)) {
    return isSuper(role) || isDistrictDirector(role);
  }

  // Director-only own-feedback request and review routes.
  if (isDirectorFeedbackPath(p)) {
    return isSuper(role) || isDistrictDirector(role);
  }

  // Governance officer areas.
  if (p.startsWith("/circuit")) return isSuper(role) || isCircuitGovernance(role);
  if (p.startsWith("/district")) return isSuper(role) || isDistrictCommandGovernance(role);

  if (p.startsWith("/api/circuit")) return isSuper(role) || isCircuitGovernance(role);
  if (p.startsWith("/api/district")) return isSuper(role) || isDistrictCommandGovernance(role);

  // Protected API families
  if (p.startsWith("/api/tenants")) return isSuper(role);
  if (p.startsWith("/api/rbac")) return isAdminish(role);
  if (p.startsWith("/api/admin")) return isAdminish(role);
  if (p.startsWith("/api/headteacher")) return isHeadteacherApiAllowed(role);
  if (p.startsWith("/api/teacher") || p.startsWith("/api/teachers")) return isTeacherLike(role);
  if (p.startsWith("/api/attendance")) return isTeacherLike(role);
  if (p.startsWith("/api/parents")) return isParentApiAllowed(role);
  if (p.startsWith("/api/consent")) return isParentApiAllowed(role);

  if (p.startsWith("/api/")) return false;

  // Protected pages
  if (p.startsWith("/admin")) return isAdminish(role);
  if (p.startsWith("/headteacher")) return isHeadteacherApiAllowed(role);
  if (p.startsWith("/teacher")) return isTeacherLike(role);
  if (p.startsWith("/parents") || p.startsWith("/parent-portal")) return isParentLike(role);

  return true;
}
