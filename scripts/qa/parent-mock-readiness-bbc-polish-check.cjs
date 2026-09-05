#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects repository source contracts. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const clientPath = "src/components/parent/ParentMockReadinessClient.tsx";
const pdfPath = "src/app/api/parent/assessment/mock/readiness/pdf/route.ts";
const mockExportPath = "src/lib/assessments/mockExport.ts";
const logoPath = "public/edulife-os-search-icon.png";

const client = read(clientPath);
const pdf = read(pdfPath);
const mockExport = read(mockExportPath);

assert(
  fs.existsSync(path.join(repoRoot, logoPath)),
  "Parent Mock PDF favicon/logo asset must exist",
);

assert(
  !client.includes('label="School agg."'),
  "Parent web must not render School Aggregate stat card",
);
assert(
  client.includes('label="Placement agg."'),
  "Parent web must preserve Placement Aggregate",
);
assert(
  client.includes('label="Average score"'),
  "Parent web must preserve Average Score",
);
assert(
  client.includes('label="Class avg. agg."'),
  "Parent web must preserve Class Average Aggregate",
);
assert(
  client.includes('grid grid-cols-2 gap-2 sm:grid-cols-3'),
  "Parent summary metrics must use compact responsive grid",
);

const subjectIndex = client.indexOf('title="Subject scores"');
const progressIndex = client.indexOf("See Mock progress");
assert(subjectIndex >= 0, "Parent Subject scores card must exist");
assert(progressIndex >= 0, "Parent Mock progress disclosure must exist");
assert(
  subjectIndex < progressIndex,
  "Parent Subject scores must appear before Mock progress",
);
assert(
  client.includes("<details className={shellCard}>") ,
  "Parent Mock progress must be collapsed behind semantic disclosure",
);
assert(
  client.includes('grid grid-cols-3 gap-2'),
  "Parent Mock progress metrics must be compact/mobile-first",
);

assert(
  pdf.includes(
    "This is a released Mock readiness report, not End of Term exams report.",
  ),
  "Parent Mock PDF must use simplified release notice",
);
assert(
  !pdf.includes("School agg."),
  "Parent Mock PDF must not render School Aggregate stat card",
);
assert(
  !pdf.includes("schoolAggregate:"),
  "Parent Mock PDF presentation contract must not pass School Aggregate into PDF HTML data",
);
assert(
  pdf.includes("edulife-os-search-icon.png"),
  "Parent Mock PDF must use the repository favicon/logo asset",
);
assert(
  pdf.includes('<img src="${logoDataUrl}" alt="EduLife OS"'),
  "Parent Mock PDF brand mark must render real image logo",
);
assert(
  !pdf.includes(">E</div>"),
  "Parent Mock PDF must not use the legacy letter-E placeholder",
);

const pdfScoresIndex = pdf.indexOf("Released Mock Subject Scores");
const pdfHomeSupportIndex = pdf.indexOf("Home Support");
const pdfStrengthsIndex = pdf.indexOf("Strengths to Protect");
assert(pdfScoresIndex >= 0, "Parent Mock PDF subject-score section must exist");
assert(
  pdfScoresIndex < pdfHomeSupportIndex,
  "Parent Mock PDF subject scores must come before Home Support",
);
assert(
  pdfScoresIndex < pdfStrengthsIndex,
  "Parent Mock PDF subject scores must come before strengths/support detail",
);

assert(
  mockExport.includes("schoolAggregate"),
  "Shared mockExport School Aggregate truth must remain available for later architecture cleanup",
);

console.log("PARENT MOCK READINESS BBC + MOBILE POLISH CONTRACT: GREEN");
console.log("- Parent summary keeps Placement Aggregate, Average Score and Class Average Aggregate in a compact responsive grid");
console.log("- Parent School Aggregate presentation is removed without changing shared Mock truth");
console.log("- Subject scores are promoted before collapsed Mock progress");
console.log("- Mock progress uses compact mobile-first stat cards behind See Mock progress");
console.log("- Parent Mock PDF uses the simplified released-report wording");
console.log("- Parent Mock PDF removes School Aggregate and promotes released subject scores above support detail");
console.log("- Parent Mock PDF uses the existing EduLife OS favicon image instead of the letter-E placeholder");
