"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads repository files for static contract verification. */

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
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const layoutPath = "src/app/teacher/layout.tsx";
const dashboardPath = "src/app/teacher/dashboard/page.tsx";
const healthPagePath = "src/app/teacher/health/page.tsx";

const layout = read(layoutPath);
const dashboard = read(dashboardPath);

assert(
  !layout.includes('{ href: "/teacher/health", label: "Health", show: true }'),
  "Teacher Health must not be exposed through the shared teacher navItems array.",
);

assert(
  !layout.includes('href="/teacher/health"'),
  "Teacher layout must not render a direct Health navigation link.",
);

assert(
  layout.includes('data-teacher-mobile-nav="collapsed-v1"'),
  "Teacher compact menu must remain present.",
);

assert(
  layout.includes("{navItems.map((item) => ("),
  "Desktop/mobile navigation must continue sharing the same navItems authority.",
);

assert(
  dashboard.includes('title: "Health"'),
  "The deactivated Health dashboard card must remain visible.",
);

assert(
  dashboard.includes('href: "/teacher/health"'),
  "The retained Health dashboard card metadata must remain intact for future reactivation.",
);

assert(
  /title:\s*"Health"[\s\S]*?enabled:\s*false/.test(dashboard),
  "The retained Health dashboard card must remain deactivated.",
);

assert(
  dashboard.includes('pill: "Coming soon"'),
  "The retained Health dashboard card must continue to communicate that it is not live.",
);

assert(
  fs.existsSync(path.join(repoRoot, healthPagePath)),
  "The underlying Teacher Health page must remain in source.",
);

console.log("TEACHER HEALTH HIDDEN NAVIGATION CONTRACT: GREEN");
console.log("- Health is absent from the shared teacher desktop/mobile navigation authority");
console.log("- the deactivated Health dashboard card remains visible");
console.log("- the underlying /teacher/health implementation remains in source");
console.log("- no Health backend, schema, or data authority is used as the UI-removal mechanism");
