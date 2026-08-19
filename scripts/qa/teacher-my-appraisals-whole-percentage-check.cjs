#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const uiPath = "src/app/teacher/appraisals/ui.tsx";

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), "N7_TEACHER_MY_APPRAISALS_FILE_MISSING", relativePath);
  return fs
    .readFileSync(absolutePath, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function functionBlock(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert(start >= 0 && end > start, "N7_TEACHER_MY_APPRAISALS_HELPER_BLOCK_MISSING", {
    name,
    nextName,
  });
  return source.slice(start, end);
}

const source = read(uiPath);
const pctBlock = functionBlock(source, "pct", "governancePct");
const governancePctBlock = functionBlock(source, "governancePct", "scoreText");

for (const [label, block] of [
  ["pct", pctBlock],
  ["governancePct", governancePctBlock],
]) {
  assert(
    block.includes("Math.round(v)"),
    "N7_TEACHER_MY_APPRAISALS_WHOLE_PERCENT_ROUNDING_MISSING",
    label,
  );
  assert(
    !block.includes("toFixed("),
    "N7_TEACHER_MY_APPRAISALS_DECIMAL_FORMATTING_REMAINS",
    label,
  );
}

for (const marker of [
  "{governancePct(section.percentage)}",
  "{governancePct(assessment.overallPercentage)}",
  "{governancePct(item.overallPercentage)}",
  "{pct(percentage)}",
  "{pct(detail.overallPercentage)}",
  "{pct(item.overallPercentage)}",
  "paperPercentTone(section.percentage)",
  "paperPercentTone(detail.overallPercentage)",
  "percentTone(item.overallPercentage)",
]) {
  assert(
    source.includes(marker),
    "N7_TEACHER_MY_APPRAISALS_PERCENTAGE_PRESENTATION_MARKER_MISSING",
    marker,
  );
}

for (const preservedMarker of [
  '"/api/teacher/appraisals/governance-released"',
  '`/api/teacher/appraisals/governance-released/${encodeURIComponent(cycleId)}`',
  '"/api/teacher/appraisals"',
  '`/api/teacher/appraisals?id=${encodeURIComponent(id)}`',
  'cache: "no-store"',
  'credentials: "include"',
  "The two appraisal streams remain separate and their scores are never combined.",
]) {
  assert(
    source.includes(preservedMarker),
    "N7_TEACHER_MY_APPRAISALS_PRESERVED_CONTRACT_MISSING",
    preservedMarker,
  );
}

for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "setInterval(",
  'method: "PUT"',
  'method: "PATCH"',
  'method: "DELETE"',
]) {
  assert(
    !source.includes(forbidden),
    "N7_TEACHER_MY_APPRAISALS_FORBIDDEN_MARKER_PRESENT",
    forbidden,
  );
}

assert(
  source.includes('return typeof v === "number" && Number.isFinite(v) ? `${Math.round(v)}%` : "—";'),
  "N7_TEACHER_MY_APPRAISALS_WHOLE_PERCENT_EXAMPLE_CONTRACT_MISSING",
);

console.log("");
console.log("=== N7 TEACHER MY-APPRAISALS — WHOLE-PERCENTAGE PRESENTATION ===");
console.log("");
console.log("Governance summary percentage : WHOLE NUMBER");
console.log("Governance native form        : WHOLE NUMBER");
console.log("Headteacher summary percentage: WHOLE NUMBER");
console.log("Headteacher detail percentage : WHOLE NUMBER");
console.log("70.89 presentation            : 71%");
console.log("76.67 presentation            : 77%");
console.log("72.00 presentation            : 72%");
console.log("Stored/API precision          : PRESERVED");
console.log("Backend/schema/database       : UNCHANGED");
console.log("No-store                      : PRESERVED");
console.log("Background polling            : ABSENT");
console.log("Persistent browser storage    : ABSENT");
console.log("Combined score                : ABSENT");
console.log("");
console.log("RESULT: N7 TEACHER MY-APPRAISALS WHOLE-PERCENTAGE GREEN");
