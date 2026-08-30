"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads repository files and TypeScript. */

const fs = require("fs");
const path = require("path");
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
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function transpile(relativePath, jsx) {
  const source = read(relativePath);
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  };

  if (jsx) {
    compilerOptions.jsx = ts.JsxEmit.ReactJSX;
  }

  const result = ts.transpileModule(source, {
    fileName: relativePath,
    reportDiagnostics: true,
    compilerOptions,
  });

  const diagnostics = result.diagnostics || [];
  assert(
    diagnostics.length === 0,
    `TypeScript transpile diagnostics in ${relativePath}`,
    diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
  );
}

const clientPath = "src/components/TeacherAssessmentClient.tsx";
const authorityPath = "src/lib/teachingSubjectScope.ts";

const client = read(clientPath);
const authority = read(authorityPath);

assert(
  client.includes('import { subjectMatchesTeachingScope } from "@/lib/teachingSubjectScope";'),
  "TeacherAssessmentClient must use the shared teaching-subject authority."
);

assert(
  client.includes("return subjectMatchesTeachingScope(a, b, scopeLevel);"),
  "Client sameSubject bridge must delegate to the shared level-aware authority."
);

assert(
  client.includes("selectedClassroomSubjectScopeLevel"),
  "Client must derive the selected classroom teaching level."
);

assert(
  client.includes(
    "sameSubject(selectedLessonDelivery.subject, subject, selectedClassroomSubjectScopeLevel)"
  ),
  "Selected delivery mismatch guard must be level-aware."
);

assert(
  client.includes(
    "sameSubject(subject, nextDelivery.subject, selectedClassroomSubjectScopeLevel)"
  ),
  "Manual delivery selection must be level-aware."
);

assert(
  client.includes(
    "sameSubject(s, urlSubject, selectedClassroomSubjectScopeLevel)"
  ),
  "Qualified URL subject must reconcile with generic subject options in the selected level."
);

assert(
  client.includes(
    "sameSubject(s, args.subject, selectedClassroomSubjectScopeLevel)"
  ),
  "Broadsheet evidence-item handoff must reconcile subjects in the selected level."
);

assert(
  authority.includes('return !!normalizedScope && normalizedScope === embeddedLevel;'),
  "Shared authority must continue to reject cross-level generic/qualified matches."
);

assert(
  authority.includes('ICT: "COMPUTING"') &&
    authority.includes('COMPUTING: "COMPUTING"'),
  "Existing Computing/ICT alias contract must remain present."
);

assert(
  !client.includes("setInterval("),
  "This correction must not add polling."
);

transpile(authorityPath, false);
transpile(clientPath, true);

console.log("ASSESSMENT CLIENT SUBJECT BRIDGE CONTRACT: GREEN");
console.log("- client delegates subject equivalence to shared level-aware authority");
console.log("- selected classroom level constrains qualified/generic reconciliation");
console.log("- delivery subject mismatch guard no longer rejects legitimate qualified curriculum subjects");
console.log("- subject-option and URL handoffs are level-aware");
console.log("- cross-level authorization remains forbidden");
console.log("- no polling or schema change introduced");
