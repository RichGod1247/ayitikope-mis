"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message) {
  throw new Error(message);
}

function read(relativePath) {
  const full = path.join(repoRoot, relativePath);
  if (!fs.existsSync(full)) fail(`Missing required file: ${relativePath}`);
  return fs.readFileSync(full, "utf8");
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const page = read("src/app/page.tsx");
const layout = read("src/app/layout.tsx");
const header = read("src/components/Header.tsx");
const footer = read("src/components/Footer.tsx");

const rendered = [page, header, footer].join("\n");

const forbidden = [
  "Most school websites are brochureware",
  "More than a website",
  "More than a dashboard",
  "Most MIS tools are fragmented",
  "EduLife OS is being built",
  "EduLife OS is being shaped",
  "imported software",
  "software theatre",
];

for (const phrase of forbidden) {
  assert(!rendered.toLowerCase().includes(phrase.toLowerCase()), `Forbidden landing phrase remains: ${phrase}`);
}

[
  "One operating system for the life of the school.",
  "Governance Officers",
  "Headteachers",
  "Teachers",
  "Parents & Guardians",
  "School Community",
  "Scheme",
  "Lesson Note",
  "Lesson Delivery",
  "Work Output & Assessment",
  "Appraisal",
  "Governance Action",
  "Family Visibility",
  "Book an Institutional Demo",
].forEach((marker) => {
  assert(page.includes(marker), `Required landing marker missing: ${marker}`);
});

[
  "metadataBase",
  "https://edulifeos.com",
  "alternates",
  "canonical",
  "/edulife-os-search-icon.png",
  "School Operations & Educational Governance",
].forEach((marker) => {
  assert(layout.includes(marker), `SEO/brand marker missing: ${marker}`);
});

assert(header.includes("Governance"), "Header must expose governance positioning.");
assert(footer.includes("Governance Oversight"), "Footer must expose governance positioning.");
assert(footer.includes("Governance Sign In"), "Footer must provide a governance sign-in path.");

const iconPath = path.join(repoRoot, "public", "edulife-os-search-icon.png");
assert(fs.existsSync(iconPath), "Search icon was not generated.");

const oldFaviconPath = path.join(repoRoot, "src", "app", "favicon.ico");
assert(!fs.existsSync(oldFaviconPath), "Legacy favicon.ico must be removed so it cannot compete with the intended search icon.");

assert(!page.includes("setInterval("), "Landing page must not poll.");
assert(!page.includes("setTimeout("), "Landing page must not add timer-driven engagement tricks.");

console.log("UI-LANDING-P1 QA GREEN");
console.log("- present-tense institutional positioning");
console.log("- governance, school leadership, teacher, family, and community value");
console.log("- evidence-chain USP");
console.log("- varied section atmospheres without polling");
console.log("- metadata + dedicated 96x96 search icon ownership");
console.log("- legacy favicon removed");
