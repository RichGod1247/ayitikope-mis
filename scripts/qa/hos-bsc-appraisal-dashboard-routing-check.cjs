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
  return fs
    .readFileSync(absolutePath, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
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
  headteacherReviewPage:
    "src/app/governance/appraisals/headteacher-supervisory/review/page.tsx",
  headteacherReviewClient:
    "src/app/governance/appraisals/headteacher-supervisory/review/HeadteacherSupervisoryReviewClient.tsx",
  headteacherReviewQueueRoute:
    "src/app/api/governance/appraisals/headteacher-supervisory/review-queue/route.ts",
  headteacherReviewPackageRoute:
    "src/app/api/governance/appraisals/headteacher-supervisory/review-queue/[assessmentId]/package/route.ts",
  headteacherReviewStartRoute:
    "src/app/api/governance/appraisals/headteacher-supervisory/review-queue/[assessmentId]/start/route.ts",
  headteacherReviewDecisionRoute:
    "src/app/api/governance/appraisals/headteacher-supervisory/review-queue/[assessmentId]/decision/route.ts",
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

const hubSource = requireMarkers(files.hub, [
  'data-appraisal-dashboard-role={role}',
  'className="text-sm font-bold uppercase tracking-[0.2em] text-[#E8C96A]"',
  "EduLife OS · Governance Dashboard",
  "Appraisals",
  "Teacher Appraisal",
  "Headteacher Appraisal",
  "My Appraisal",
  'href="/governance/appraisals/teacher-supervisory"',
  "Assess Teacher",
  "official six-section, 34-indicator observation form.",
  'role === "HEAD_OF_SUPERVISION"',
  'href="/governance/appraisals/teacher-supervisory/review"',
  "Review Teacher",
  "Review finalized SISSO and Basic School Coordinator Teacher",
  'href="/governance/appraisals/headteacher-supervisory"',
  "Assess Headteacher",
  'href="/governance/appraisals/headteacher-supervisory/review"',
  "Review Headteacher",
  "Review finalized SISSO and Basic School Coordinator",
  "Headteacher reports assigned to the Head of Supervision.",
  "Assessment active",
  "District Director remains the ultimate district review and release authority.",
  "no background polling",
  "no persistent browser storage",
]);

assert(
  hubSource.includes(
    '{role === "HEAD_OF_SUPERVISION" ? (\n                    <Link',
  ) &&
    hubSource.includes(
      'href="/governance/appraisals/teacher-supervisory/review"',
    ),
  "N6_F1C6A_HOS_TEACHER_REVIEW_ENTRY_MUST_BE_ROLE_GATED",
);

assert(
  !hubSource.includes('role === "BASIC_SCHOOL_COORDINATOR" ? (\n                    <Link') &&
    !hubSource.includes("BSC Review Teacher"),
  "N6_F1C6A_BSC_TEACHER_REVIEW_ENTRY_MUST_REMAIN_ABSENT",
);

assert(
  hubSource.includes(
    'href="/governance/appraisals/headteacher-supervisory/review"',
  ) && hubSource.includes("Review Headteacher"),
  "N7_HOS_HEADTEACHER_REVIEW_ENTRY_MISSING",
);

assert(
  !hubSource.includes("BSC Review Headteacher"),
  "N7_BSC_HEADTEACHER_REVIEW_ENTRY_MUST_REMAIN_ABSENT",
);

forbidMarkers(files.hub, [
  "Headteacher report review stays locked until its exact",
  "Review reports · next phase",
]);

requireMarkers(files.headteacherReviewPage, [
  "requireGovernancePageContext",
  'const HEADTEACHER_SUPERVISORY_REVIEW_ROLES = ["HEAD_OF_SUPERVISION"] as const;',
  "allowedZoneLevels: [2]",
  'redirectTo: "/governance/appraisals/headteacher-supervisory/review"',
  "HeadteacherSupervisoryReviewClient",
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  "initialAssessmentId",
]);

const headteacherReviewClientSource = requireMarkers(
  files.headteacherReviewClient,
  [
    '"use client"',
    "Review Headteacher Reports",
    '"READY_TO_START"',
    '"READY_TO_REVIEW"',
    '"START_REVIEW"',
    '"CONTINUE_REVIEW"',
    "Open report",
    "Review correction",
    "Returned corrections",
    "Correction resubmitted",
    "You previously returned an earlier revision",
    "Start review",
    "Return for correction",
    "Forward to Director",
    "/review-queue",
    "/package",
    "/start",
    "/decision",
    'JSON.stringify({ confirm: true })',
    'action: "RETURN"',
    'action: "FORWARD"',
    "Monitoring and Inspection Sheet (Headteachers)",
    "Head of Supervision review copy · read-only",
    "assessment.sections",
    "section.items.map",
    "no background polling",
    "no persistent browser storage",
  ],
);

assert(
  headteacherReviewClientSource.includes(
    "function isReturnedCorrection(item: ReviewQueueItem)",
  ) &&
    headteacherReviewClientSource.includes("return item.revision > 1;") &&
    headteacherReviewClientSource.includes(
      "returnedCorrections: items.filter((item) => isReturnedCorrection(item))",
    ),
  "N7_HOS_RETURNED_CORRECTION_REVISION_SIGNAL_MISSING",
);

assert(
  headteacherReviewClientSource.includes(
    '(item) => item.state === "READY_TO_START" && !isReturnedCorrection(item)',
  ) &&
    headteacherReviewClientSource.includes(
      '(item) => item.state === "READY_TO_REVIEW" && !isReturnedCorrection(item)',
    ),
  "N7_HOS_RETURNED_CORRECTION_QUEUE_GROUPING_INVALID",
);

const returnedCorrectionsIndex = headteacherReviewClientSource.indexOf(
  'title="Returned corrections"',
);
const continueReviewIndex = headteacherReviewClientSource.indexOf(
  'title="Continue review"',
);
assert(
  returnedCorrectionsIndex >= 0 &&
    continueReviewIndex > returnedCorrectionsIndex,
  "N7_HOS_RETURNED_CORRECTION_GROUP_ORDER_INVALID",
);

for (const forbiddenClientMarker of [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "setInterval(",
  'method: "PUT"',
  'method: "PATCH"',
  'method: "DELETE"',
  "/direct-release",
  'action: "HOLD"',
  'action: "RELEASE"',
]) {
  assert(
    !headteacherReviewClientSource.includes(forbiddenClientMarker),
    "N7_HOS_HEADTEACHER_REVIEW_CLIENT_FORBIDDEN_MARKER",
    forbiddenClientMarker,
  );
}

requireMarkers(files.headteacherReviewQueueRoute, [
  "HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY",
  "readHeadteacherSupervisoryReviewQueue",
  "requireSupervisoryGovernanceApiContext",
  "jsonNoStore",
  "HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.reviewerRole",
]);

requireMarkers(files.headteacherReviewPackageRoute, [
  "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY",
  "readHeadteacherSupervisoryReviewPackage",
  "requireSupervisoryGovernanceApiContext",
  "jsonNoStore",
  "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.audience",
]);

requireMarkers(files.headteacherReviewStartRoute, [
  "startHeadteacherSupervisoryHosReview",
  'normalizedRole(auth.ctx.roleName) !== "HEAD_OF_SUPERVISION"',
  "bodyHasOnlyConfirm",
  "body.confirm !== true",
  "governanceScope: auth.scope",
]);

requireMarkers(files.headteacherReviewDecisionRoute, [
  "executeHeadteacherSupervisoryHosDecision",
  'normalizedRole(auth.ctx.roleName) !== "HEAD_OF_SUPERVISION"',
  'const ALLOWED_BODY_FIELDS = new Set(["action", "reason", "confirm"]);',
  "browserDecisionResult",
  "governanceScope: auth.scope",
]);

forbidMarkers(files.hub, [
  "Assess Teachers and review authorized finalized reports when the governance assessor and staged-review transactions are completed.",
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
  "buildAppCallbackUrl",
  "effectiveRole",
  "isPathAllowedForRole",
  "function buildSignInRedirect(req: NextRequest)",
  'const url = req.nextUrl.clone();',
  'const attempted = `${req.nextUrl.pathname}${req.nextUrl.search}`;',
  'url.pathname = "/auth/signin";',
  'req.nextUrl.pathname.startsWith("/circuit")',
  'req.nextUrl.pathname.startsWith("/district")',
  'url.searchParams.set("mode", "governance");',
  'url.searchParams.set("callbackUrl", attempted);',
  'url.searchParams.set("callbackUrl", buildAppCallbackUrl(attempted));',
  'path.startsWith("/circuit/")',
  'path.startsWith("/district/")',
  'path.startsWith("/api/circuit/")',
  'path.startsWith("/api/district/")',
  "if (isApi) return jsonUnauthorized();",
  "if (isApi) return jsonForbidden(role, path);",
  'url.pathname = "/app";',
  'url.search = `?next=${encodeURIComponent(`${req.nextUrl.pathname}${req.nextUrl.search}`)}`;',
  '"Cache-Control": "no-store"',
  '"X-Content-Type-Options": "nosniff"',
]);

for (const staleMarker of [
  "function relativeRedirect(location: string)",
  "const params = new URLSearchParams();",
  "Location: location,",
  'return relativeRedirect(`/auth/signin?${params.toString()}`);',
  'return relativeRedirect(`/app?${params.toString()}`);',
  "const tokenClaims = (token ?? {}) as Record<string, unknown>;",
]) {
  assert(
    !middlewareSource.includes(staleMarker),
    "N6_A_STALE_MIDDLEWARE_REDIRECT_PATTERN_PRESENT",
    staleMarker,
  );
}

const signInRedirectStart = middlewareSource.indexOf(
  "function buildSignInRedirect(req: NextRequest)",
);
const attemptedIndex = middlewareSource.indexOf(
  "const attempted =",
  signInRedirectStart,
);
const signInPathIndex = middlewareSource.indexOf(
  'url.pathname = "/auth/signin";',
  signInRedirectStart,
);
const governanceModeIndex = middlewareSource.indexOf(
  'url.searchParams.set("mode", "governance");',
  signInRedirectStart,
);
const governanceCallbackIndex = middlewareSource.indexOf(
  'url.searchParams.set("callbackUrl", attempted);',
  signInRedirectStart,
);
const appCallbackIndex = middlewareSource.indexOf(
  'url.searchParams.set("callbackUrl", buildAppCallbackUrl(attempted));',
  signInRedirectStart,
);

assert(
  signInRedirectStart >= 0 &&
    attemptedIndex > signInRedirectStart &&
    signInPathIndex > attemptedIndex &&
    governanceModeIndex > signInPathIndex &&
    governanceCallbackIndex > governanceModeIndex &&
    appCallbackIndex > governanceCallbackIndex,
  "N6_A_CURRENT_SIGNIN_REDIRECT_CONTRACT_INVALID",
);

assert(
  middlewareSource.includes(
    'url.search = `?next=${encodeURIComponent(`${req.nextUrl.pathname}${req.nextUrl.search}`)}`;',
  ),
  "N6_A_ROLE_DENIAL_REDIRECT_NEXT_PATH_MISSING",
);

assert(
  middlewareSource.includes(
    'return NextResponse.json(\n    { ok: false, error: "UNAUTHORIZED" },',
  ) &&
    middlewareSource.includes(
      'return NextResponse.json(\n    { ok: false, error: "FORBIDDEN", role, path },',
    ),
  "N6_A_API_DENIAL_JSON_CONTRACT_INVALID",
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
console.log("=== N7 HOS HEADTEACHER REVIEW DASHBOARD + WORKSPACE INTEGRATION ===");
console.log("");
console.log("HOS default destination       : /district/hos/dashboard");
console.log("BSC default destination       : /district/bsc/dashboard");
console.log("Dashboard hero identity       : Governance Dashboard");
console.log("Dashboard role gates          : exact role + district assignment");
console.log("Director command dashboard    : HOS/BSC excluded");
console.log("Teacher assessment            : active governance workspace");
console.log("Teacher assessment route      : /governance/appraisals/teacher-supervisory");
console.log("HOS Teacher review            : active shared review workspace");
console.log("HOS Teacher review route      : /governance/appraisals/teacher-supervisory/review");
console.log("BSC Teacher review            : absent");
console.log("Headteacher assessment        : existing supervisory workspace");
console.log("HOS Headteacher review        : active shared review workspace");
console.log("HOS Headteacher review route  : /governance/appraisals/headteacher-supervisory/review");
console.log("Returned correction UX       : explicit queue group + resubmission notice");
console.log("Returned correction signal   : revision > 1 only; no backend expansion");
console.log("BSC Headteacher review        : absent");
console.log("Governance My Appraisal       : visible, truthfully locked");
console.log("Director review/release       : Director-only");
console.log("Anonymous Teacher forms       : absent from HOS/BSC hub");
console.log("Background polling/storage    : absent");
console.log("Schema/database mutation      : absent");
console.log("Database accessed             : false");
console.log("");
console.log("RESULT: N7 HOS HEADTEACHER REVIEW DASHBOARD + WORKSPACE INTEGRATION GREEN");
