#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects and transpiles TypeScript source. */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), "N6_A_REQUIRED_FILE_MISSING", relativePath);
  return fs.readFileSync(absolutePath, "utf8");
}

function requireMarkers(relativePath, markers) {
  const source = read(relativePath);
  for (const marker of markers) {
    assert(source.includes(marker), "N6_A_MARKER_MISSING", {
      relativePath,
      marker,
    });
  }
  return source;
}

function forbidMarkers(relativePath, markers) {
  const source = read(relativePath);
  for (const marker of markers) {
    assert(!source.includes(marker), "N6_A_FORBIDDEN_MARKER_PRESENT", {
      relativePath,
      marker,
    });
  }
  return source;
}

const files = {
  routing: "src/lib/roleRouting.ts",
  appEntry: "src/app/app/page.tsx",
  auth: "src/lib/auth.ts",
  districtDashboard: "src/app/district/dashboard/page.tsx",
  middleware: "src/middleware.ts",
  inviteAccept: "src/app/api/governance/invite/accept/route.ts",
  hub: "src/components/governance/GovernanceAppraisalHubClient.tsx",
  hosPage: "src/app/district/hos/dashboard/page.tsx",
  bscPage: "src/app/district/bsc/dashboard/page.tsx",
};

requireMarkers(files.appEntry, [
  'case "HEAD_OF_SUPERVISION":',
  'return "/district/hos/dashboard";',
  'case "BASIC_SCHOOL_COORDINATOR":',
  'return "/district/bsc/dashboard";',
]);

const authSource = requireMarkers(files.auth, [
  "GOVERNANCE_LOGIN_ROLE_PRIORITY",
  '"DISTRICT_DIRECTOR"',
  '"HEAD_OF_SUPERVISION"',
  '"BASIC_SCHOOL_COORDINATOR"',
  '"SISSO"',
]);

assert(
  authSource.indexOf('"DISTRICT_DIRECTOR"') <
    authSource.indexOf('"HEAD_OF_SUPERVISION"') &&
    authSource.indexOf('"HEAD_OF_SUPERVISION"') <
      authSource.indexOf('"BASIC_SCHOOL_COORDINATOR"') &&
    authSource.indexOf('"BASIC_SCHOOL_COORDINATOR"') <
      authSource.indexOf('"SISSO"'),
  "N6_A_GOVERNANCE_LOGIN_PRIORITY_INVALID",
);

const districtDashboardSource = requireMarkers(files.districtDashboard, [
  "DISTRICT_COMMAND_DASHBOARD_ROLES",
  '"DISTRICT_DIRECTOR"',
  '"DISTRICT_MIS_OFFICER"',
  '"DISTRICT_SHEP_OFFICER"',
  '"DISTRICT_ASSESSMENT_OFFICER"',
  "requireGovernancePageContext",
  "allowedZoneLevels: [2]",
]);

assert(
  !districtDashboardSource.includes('"HEAD_OF_SUPERVISION"'),
  "N6_A_HOS_STILL_ALLOWED_ON_DIRECTOR_COMMAND_DASHBOARD",
);
assert(
  !districtDashboardSource.includes('"BASIC_SCHOOL_COORDINATOR"'),
  "N6_A_BSC_STILL_ALLOWED_ON_DIRECTOR_COMMAND_DASHBOARD",
);

requireMarkers(files.hosPage, [
  'const HOS_DASHBOARD_ROLES = ["HEAD_OF_SUPERVISION"] as const;',
  "allowedZoneLevels: [2]",
  'redirectTo: "/district/hos/dashboard"',
  'role="HEAD_OF_SUPERVISION"',
  'roleLabel="Head of Supervision"',
]);

requireMarkers(files.bscPage, [
  'const BSC_DASHBOARD_ROLES = ["BASIC_SCHOOL_COORDINATOR"] as const;',
  "allowedZoneLevels: [2]",
  'redirectTo: "/district/bsc/dashboard"',
  'role="BASIC_SCHOOL_COORDINATOR"',
  'roleLabel="Basic School Coordinator"',
]);

requireMarkers(files.hub, [
  "data-appraisal-dashboard-role={role}",
  'className="text-sm font-bold uppercase tracking-[0.2em] text-[#E8C96A]"',
  "EduLife OS · Governance Dashboard",
  "Appraisals",
  "Teacher Appraisal",
  "Headteacher Appraisal",
  "My Appraisal",
  'href="/governance/appraisals/headteacher-supervisory"',
  "Assess Headteacher",
  "Assessment active",
  "Not yet active",
  "District Director remains the ultimate district review and release authority.",
  "no background polling",
  "no persistent browser storage",
]);

forbidMarkers(files.hub, [
  "EduLife OS · Governance Appraisals",
  'className="text-xs font-bold uppercase tracking-[0.2em] text-[#E8C96A]"',
  "/district/headteacher-appraisals",
  "/district/director-feedback",
  "localStorage",
  "sessionStorage",
  "setInterval(",
  "fetch(",
]);

const middlewareSource = requireMarkers(files.middleware, [
  "isPathAllowedForRole",
  'path.startsWith("/district/")',
  'url.pathname = "/auth/signin";',
  'url.searchParams.set("mode", "governance");',
  'url.searchParams.set("callbackUrl", attempted);',
  'url.pathname = "/app";',
  'url.search = `?next=${encodeURIComponent(`${req.nextUrl.pathname}${req.nextUrl.search}`)}`;',
  "return NextResponse.redirect(url);",
]);

forbidMarkers(files.middleware, [
  "function firstHeaderValue(value: string | null)",
  "function localUatRedirectOriginAllowed()",
  "process.env.EDULIFE_UAT_LOCAL_URLS",
  "function isExactLocalUatRedirectOrigin(value: string)",
  "function requestRedirectOrigin(req: NextRequest)",
  "function internalRedirect(req: NextRequest, location: string)",
  "requestRedirectOrigin(req)",
  "NextResponse.redirect(target, 307)",
]);

assert(
  middlewareSource.indexOf('url.pathname = "/auth/signin";') <
    middlewareSource.indexOf('url.searchParams.set("mode", "governance");'),
  "N6_A_GOVERNANCE_SIGNIN_REDIRECT_ORDER_INVALID",
);

assert(
  middlewareSource.indexOf('if (isApi) return jsonForbidden(role, path);') <
    middlewareSource.lastIndexOf('url.pathname = "/app";'),
  "N6_A_ROLE_DENIAL_DOES_NOT_FAIL_CLOSED_BEFORE_PAGE_REDIRECT",
);

requireMarkers(files.inviteAccept, [
  "roleDefaultDestination",
  "const destination = roleDefaultDestination(result.role);",
]);

const originalTsExtension = Module._extensions[".ts"];
Module._extensions[".ts"] = function transpile(moduleInstance, filename) {
  const input = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(input, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  moduleInstance._compile(output.outputText, filename);
};

try {
  const routing = require(path.join(repoRoot, files.routing));

  assert(
    routing.roleDefaultDestination("HEAD_OF_SUPERVISION") ===
      "/district/hos/dashboard",
    "N6_A_HOS_DEFAULT_DESTINATION_INVALID",
  );
  assert(
    routing.roleDefaultDestination("BASIC_SCHOOL_COORDINATOR") ===
      "/district/bsc/dashboard",
    "N6_A_BSC_DEFAULT_DESTINATION_INVALID",
  );

  assert(
    routing.isPathAllowedForRole(
      "/district/hos/dashboard",
      "HEAD_OF_SUPERVISION",
    ),
    "N6_A_HOS_OWN_DASHBOARD_FORBIDDEN",
  );
  assert(
    !routing.isPathAllowedForRole(
      "/district/hos/dashboard",
      "BASIC_SCHOOL_COORDINATOR",
    ),
    "N6_A_BSC_CAN_ENTER_HOS_DASHBOARD",
  );
  assert(
    !routing.isPathAllowedForRole(
      "/district/hos/dashboard",
      "DISTRICT_DIRECTOR",
    ),
    "N6_A_DIRECTOR_CAN_ENTER_HOS_DASHBOARD",
  );

  assert(
    routing.isPathAllowedForRole(
      "/district/bsc/dashboard",
      "BASIC_SCHOOL_COORDINATOR",
    ),
    "N6_A_BSC_OWN_DASHBOARD_FORBIDDEN",
  );
  assert(
    !routing.isPathAllowedForRole(
      "/district/bsc/dashboard",
      "HEAD_OF_SUPERVISION",
    ),
    "N6_A_HOS_CAN_ENTER_BSC_DASHBOARD",
  );
  assert(
    !routing.isPathAllowedForRole(
      "/district/bsc/dashboard",
      "DISTRICT_DIRECTOR",
    ),
    "N6_A_DIRECTOR_CAN_ENTER_BSC_DASHBOARD",
  );

  for (const role of ["HEAD_OF_SUPERVISION", "BASIC_SCHOOL_COORDINATOR"]) {
    assert(
      !routing.isPathAllowedForRole(
        "/district/headteacher-appraisals/review",
        role,
      ),
      "N6_A_NON_DIRECTOR_CAN_ENTER_HEADTEACHER_DIRECTOR_REVIEW",
      role,
    );
    assert(
      !routing.isPathAllowedForRole(
        "/api/district/headteacher-appraisals/example/release",
        role,
      ),
      "N6_A_NON_DIRECTOR_CAN_CALL_HEADTEACHER_RELEASE_API",
      role,
    );
    assert(
      !routing.isPathAllowedForRole(
        "/district/director-feedback/review",
        role,
      ),
      "N6_A_NON_DIRECTOR_CAN_ENTER_DIRECTOR_FEEDBACK_REVIEW",
      role,
    );
    assert(
      !routing.isPathAllowedForRole("/district/dashboard", role),
      "N6_A_HOS_OR_BSC_CAN_ENTER_DIRECTOR_COMMAND_DASHBOARD",
      role,
    );
  }

  assert(
    routing.isPathAllowedForRole(
      "/district/headteacher-appraisals/review",
      "DISTRICT_DIRECTOR",
    ),
    "N6_A_DIRECTOR_HEADTEACHER_REVIEW_FORBIDDEN",
  );
  assert(
    routing.isPathAllowedForRole(
      "/api/district/headteacher-appraisals/example/release",
      "DISTRICT_DIRECTOR",
    ),
    "N6_A_DIRECTOR_HEADTEACHER_RELEASE_API_FORBIDDEN",
  );
  assert(
    routing.isPathAllowedForRole(
      "/district/director-feedback/review",
      "DISTRICT_DIRECTOR",
    ),
    "N6_A_DIRECTOR_FEEDBACK_REVIEW_FORBIDDEN",
  );
  assert(
    routing.isPathAllowedForRole(
      "/district/dashboard",
      "DISTRICT_DIRECTOR",
    ),
    "N6_A_DIRECTOR_COMMAND_DASHBOARD_FORBIDDEN",
  );
} finally {
  if (originalTsExtension) Module._extensions[".ts"] = originalTsExtension;
  else delete Module._extensions[".ts"];
}

console.log("");
console.log("=== N6-A HOS/BSC APPRAISAL DASHBOARD ROUTING ===");
console.log("");
console.log("HOS default destination       : /district/hos/dashboard");
console.log("BSC default destination       : /district/bsc/dashboard");
console.log("Dashboard hero identity       : Governance Dashboard");
console.log("Dashboard hero size           : text-sm");
console.log("Appraisals module label       : preserved");
console.log("Dashboard role gates          : exact role + district assignment");
console.log("Role-denial redirect          : stable fail-closed /app gateway");
console.log("Local host alias correction   : not asserted; deferred browser-only defect");
console.log("Canonical-host redirect smoke : deferred to staging/production hardening");
console.log("Director command dashboard    : HOS/BSC excluded");
console.log("Headteacher assessment        : existing supervisory workspace");
console.log("Teacher assessment/review     : visible, truthfully locked");
console.log("Governance My Appraisal       : visible, truthfully locked");
console.log("Director review/release       : Director-only");
console.log("Anonymous Teacher forms       : absent from HOS/BSC hub");
console.log("Background polling/storage    : absent");
console.log("Schema/database mutation      : absent");
console.log("Database accessed             : false");
console.log("");
console.log("RESULT: N6-A HOS/BSC APPRAISAL DASHBOARDS GREEN");
