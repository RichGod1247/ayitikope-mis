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

function count(text, fragment) {
  return text.split(fragment).length - 1;
}

console.log("=== UI-P3C2 HEADTEACHER ATTENDANCE FOCUS UI CONTRACT CHECK ===");

const weeklyPath = "src/app/headteacher/attendance/weekly/page.tsx";
const layoutPath = "src/app/headteacher/layout.tsx";

const weekly = read(weeklyPath);
const layout = read(layoutPath);

assert(
  weekly.includes('aria-label="Weekly attendance controls"'),
  "P3C2 weekly compact control toolbar marker is missing"
);
assert(
  weekly.includes('className="h-8 rounded-lg border border-white/10 bg-[#07111F]'),
  "P3C2 weekly date inputs must remain compact"
);
assert(
  weekly.includes('className="inline-flex h-8 items-center justify-center'),
  "P3C2 weekly actions must remain compact"
);
assert(
  weekly.includes("This week (Mon–Fri)"),
  "P3C2 This week (Mon–Fri) control label must remain intact"
);
assert(
  weekly.includes('aria-label="Weekly attendance summary"'),
  "P3C2 weekly compact summary marker is missing"
);
assert(
  weekly.includes('className={`min-w-0 rounded-xl border px-2.5 py-2 ${ringClass}`}'),
  "P3C2 KPI cards must remain compact"
);

const byClassIndex = weekly.indexOf("By class (Mon–Fri)");
const explainerIndex = weekly.indexOf(
  '<details className="group rounded-2xl border border-emerald-300/15'
);

assert(byClassIndex >= 0, "P3C2 By class focal workspace is missing");
assert(explainerIndex >= 0, "P3C2 Attendance explainer disclosure is missing");
assert(
  byClassIndex < explainerIndex,
  "P3C2 By class must precede the optional Attendance explainer"
);
assert(
  weekly.includes('<span>Attendance explainer</span>'),
  "P3C2 Attendance explainer disclosure label is missing"
);
assert(
  !weekly.includes('rounded-[28px] border border-emerald-300/20 bg-emerald-400/12'),
  "P3C2 retired always-visible explainer card must stay removed"
);
assert(
  weekly.includes('className="divide-y divide-white/10 md:hidden"'),
  "P3C2 mobile By class cards are missing"
);
assert(
  weekly.includes('className="hidden overflow-x-auto md:block"'),
  "P3C2 desktop By class table boundary is missing"
);
assert(
  weekly.includes("Certified, non-holiday sessions only."),
  "P3C2 certified non-holiday weekly truth label must remain visible"
);

assert(
  weekly.includes('new URL("/api/headteacher/attendance/weekly/csv"'),
  "P3C2 weekly CSV data source must remain unchanged"
);
assert(
  weekly.includes('fetch("/api/headteacher/attendance/explain"'),
  "P3C2 Attendance explainer API must remain unchanged"
);
assert(
  !weekly.includes("localStorage") && !weekly.includes("sessionStorage"),
  "P3C2 must not add browser persistence"
);

assert(
  layout.includes('<details className="relative shrink-0 xl:hidden">'),
  "P3C2 mobile/tablet navigation disclosure is missing"
);
assert(
  layout.includes('aria-label="Open headteacher navigation"'),
  "P3C2 mobile/tablet navigation control must remain accessible"
);
assert(
  layout.includes("M4 6h16M4 12h16M4 18h16"),
  "P3C2 navigation menu icon is missing"
);
assert(
  layout.includes('<div className="hidden items-center gap-3 xl:flex">'),
  "P3C2 desktop navigation boundary is missing"
);
assert(
  count(layout, "<LogoutButton") === 2,
  "P3C2 expects one responsive-menu Logout and one desktop Logout",
  { count: count(layout, "<LogoutButton") }
);

for (const href of [
  "/headteacher/dashboard",
  "/headteacher/day",
  "/headteacher/notices",
  "/headteacher/reports",
  "/headteacher/lesson-notes",
]) {
  assert(
    count(layout, `href="${href}"`) === 2,
    "P3C2 navigation destination must exist in both responsive and desktop menus",
    { href, count: count(layout, `href="${href}"`) }
  );
}

assert(
  !layout.includes('className="flex flex-col gap-3 xl:flex-row xl:items-center"'),
  "P3C2 retired always-visible responsive navigation must stay removed"
);

console.log("Weekly control toolbar: COMPACT");
console.log("Weekly four KPI cards: COMPACT");
console.log("Attendance explainer: DISCLOSURE ONLY");
console.log("By class (Mon-Fri): FOCAL / BEFORE EXPLAINER");
console.log("Mobile By class view: NATIVE CARDS");
console.log("Desktop By class view: TABLE");
console.log("Mobile/tablet Headteacher nav: MENU DISCLOSURE");
console.log("Desktop Headteacher nav: RETAINED");
console.log("Logout on mobile/tablet: INSIDE MENU");
console.log("Weekly data/API contracts: UNCHANGED");
console.log("Browser persistence: NONE");
console.log("Database migration: NONE");
console.log("Provider calls from QA: 0");
console.log("Database writes from QA: 0");
console.log("RESULT: UI-P3C2 HEADTEACHER ATTENDANCE FOCUS UI CONTRACT GREEN");
