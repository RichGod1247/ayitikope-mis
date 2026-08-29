#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads repository files and TypeScript for static/pure contract verification. */

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

function loadPureTeachingSubjectScope() {
  const relativePath = "src/lib/teachingSubjectScope.ts";
  const source = read(relativePath);
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: relativePath,
  });

  const runtimeModule = { exports: {} };
  const execute = new Function("require", "module", "exports", compiled.outputText);
  execute(require, runtimeModule, runtimeModule.exports);
  return runtimeModule.exports;
}

const scope = loadPureTeachingSubjectScope();
assert(
  typeof scope.subjectMatchesTeachingScope === "function",
  "subjectMatchesTeachingScope export missing"
);
assert(
  typeof scope.subjectAllowedInTeachingScope === "function",
  "subjectAllowedInTeachingScope export missing"
);

const matches = scope.subjectMatchesTeachingScope;

const cases = [
  ["JHS 1 Creative Arts and Design", "Creative Arts and Design", "JHS 1", true],
  ["JHS 1 Creative Arts and Design", "Creative Arts and Design", "Basic 7", true],
  ["JHS 2 Creative Arts and Design", "Creative Arts and Design", "JHS 1", false],
  ["JHS 1 Computing", "Computing", "JHS 1", true],
  ["JHS 1 ICT", "Computing", "JHS 1", true],
  ["JHS 1 Mathematics", "Maths", "JHS 1", true],
  ["JHS 1 Computing", "JHS 1 ICT", null, true],
  ["JHS 1 Computing", "JHS 2 Computing", null, false],
  ["Computing", "Computing", "JHS 2", true],
];

for (const [a, b, level, expected] of cases) {
  const actual = matches(a, b, level);
  assert(actual === expected, "subject scope equivalence case failed", {
    a,
    b,
    level,
    expected,
    actual,
  });
}

const teacherAccess = read("src/lib/teacherAccess.ts");
assert(
  teacherAccess.includes('from "@/lib/teachingSubjectScope"'),
  "teacherAccess must import shared subject scope authority"
);
assert(
  teacherAccess.includes(
    "subjectMatchesTeachingScope(s, requestedSubject, normalizedClassLevel)"
  ),
  "teacherAccess must use level-aware comparison for requested subject authorization"
);

const approvedNotes = read(
  "src/app/api/teacher/lesson-deliveries/approved-notes/list/route.ts"
);
assert(
  approvedNotes.includes("subjectAllowedInTeachingScope"),
  "approved-note discovery must use shared subject scope authority"
);
assert(
  approvedNotes.includes("scopeLevel: access.normalizedClassLevel"),
  "approved-note discovery must pass classroom level to subject scope authority"
);
assert(
  !approvedNotes.includes("function subjectAliasKeys"),
  "approved-note discovery must not retain duplicate alias authority"
);
assert(
  !approvedNotes.includes("function sameSubjectLoose"),
  "approved-note discovery must not retain duplicate loose matcher"
);

const deliveryCreate = read(
  "src/app/api/teacher/lesson-deliveries/create/route.ts"
);
assert(
  deliveryCreate.includes("subjectMatchesTeachingScope("),
  "lesson-delivery create must use shared subject scope authority"
);
assert(
  deliveryCreate.includes("normalizeSchoolLevel(note.level) !== access.normalizedClassLevel"),
  "lesson-delivery create must fail closed on cross-level legacy note mismatch"
);
assert(
  deliveryCreate.includes('error: "LESSON_NOTE_LEVEL_MISMATCH"'),
  "lesson-delivery level-mismatch error contract missing"
);

const deliveryList = read("src/app/api/teacher/lesson-deliveries/list/route.ts");
assert(
  deliveryList.includes("subjectAllowedInTeachingScope"),
  "lesson-delivery list must use shared subject scope authority"
);
assert(
  deliveryList.includes("access.normalizedClassLevel"),
  "lesson-delivery list must pass normalized classroom level"
);
assert(
  !deliveryList.includes("function subjectAliasKeys"),
  "lesson-delivery list must not retain duplicate alias authority"
);

const pipeline = read("src/app/api/teacher/assessment/pipeline-analytics/route.ts");
assert(
  pipeline.includes("subjectAllowedInTeachingScope"),
  "teaching pipeline must use shared subject scope authority"
);
assert(
  pipeline.includes('type: { not: "MOCK" }'),
  "teaching pipeline must exclude dedicated mock assessment evidence"
);
assert(
  pipeline.includes("scopeLevel: access.normalizedClassLevel"),
  "teaching pipeline approved-note filter must be level-aware"
);
assert(
  !pipeline.includes("function subjectAliasKeys"),
  "teaching pipeline must not retain duplicate alias authority"
);

const itemUpsert = read("src/app/api/teacher/assessment/items/upsert/route.ts");
assert(
  itemUpsert.includes("subjectMatchesTeachingScope("),
  "assessment item linkage must use shared subject scope authority"
);
assert(
  itemUpsert.includes("const effectiveSubject = delivery?.subject || subject;"),
  "linked assessment item must preserve delivery curriculum-qualified subject"
);
assert(
  itemUpsert.includes("subject: effectiveSubject"),
  "assessment item persistence must use effective delivery subject"
);

const broadsheet = read("src/app/api/teacher/assessment/broadsheet/route.ts");
assert(
  broadsheet.includes("subjectMatchesTeachingScope"),
  "broadsheet must use shared subject equivalence"
);
assert(
  broadsheet.includes("const itemsRaw = await prisma.assessmentItem.findMany"),
  "broadsheet must fetch class-term evidence before level-aware subject filtering"
);
assert(
  broadsheet.includes(".map((item) => ({ ...item, subject }))"),
  "broadsheet must group equivalent qualified/generic subjects into one in-memory sheet"
);
assert(
  !broadsheet.includes("function buildSubjectWhere"),
  "broadsheet must not use exact-string subject SQL filter that creates false-zero"
);

console.log("ASSESSMENT TEACHING SUBJECT SCOPE CONTRACT: GREEN");
console.log("- curriculum-qualified subject labels are preserved");
console.log("- generic teacher assignments match only inside the authorized level");
console.log("- cross-level subject equivalence is rejected");
console.log("- approved notes, deliveries, pipeline, assessment linkage, and broadsheet share one subject authority");
console.log("- dedicated MOCK assessment evidence is excluded from the teaching pipeline");
