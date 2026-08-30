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

  if (jsx) compilerOptions.jsx = ts.JsxEmit.ReactJSX;

  const result = ts.transpileModule(source, {
    fileName: relativePath,
    reportDiagnostics: true,
    compilerOptions,
  });

  const diagnostics = result.diagnostics || [];
  assert(
    diagnostics.length === 0,
    `TypeScript transpile diagnostics in ${relativePath}`,
    diagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    )
  );

  return result.outputText;
}

function loadPureModule(relativePath) {
  const output = transpile(relativePath, false);
  const runtimeModule = { exports: {} };
  const execute = new Function("require", "module", "exports", output);
  execute(require, runtimeModule, runtimeModule.exports);
  return runtimeModule.exports;
}

const workOutputPath = "src/lib/assessments/workOutput.ts";
const routePath = "src/app/api/teacher/assessment/work-output/route.ts";
const clientPath = "src/components/TeacherAssessmentClient.tsx";

const workOutputSource = read(workOutputPath);
const routeSource = read(routePath);
const clientSource = read(clientPath);
const workOutput = loadPureModule(workOutputPath);

assert(
  typeof workOutput.normalizeWorkOutputType === "function" &&
    typeof workOutput.buildWorkOutputSnapshot === "function",
  "Shared Work Output authority exports are missing."
);

assert(
  workOutput.normalizeWorkOutputType("QUIZ") === "QUIZ",
  "Quiz must remain its own Work Output type."
);
assert(
  workOutput.normalizeWorkOutputType("PROJECT") === "PROJECT",
  "Project must remain its own Work Output type."
);
assert(
  workOutput.normalizeWorkOutputType("PRACTICAL") === "PRACTICAL",
  "Practical must remain its own Work Output type."
);
assert(
  workOutput.normalizeWorkOutputType("ASSIGNMENT") === "HOMEWORK",
  "Legacy assignment must map to Homework without creating a new stored type."
);
assert(
  workOutput.normalizeWorkOutputType("CLASSWORK") === "EXERCISE",
  "Legacy classwork must map to Exercise."
);

const snapshot = workOutput.buildWorkOutputSnapshot({
  students: [
    { id: "s1", name: "Learner One" },
    { id: "s2", name: "Learner Two" },
  ],
  lessonDeliveryId: "d1",
  deliveries: [
    {
      id: "d1",
      subject: "JHS 1 Creative Arts and Design",
      dateTaught: "2026-08-30T00:00:00.000Z",
      lessonNoteId: "n1",
      lessonTitle: "Design in Nature",
      items: [
        {
          id: "i1",
          title: "Exercise 1",
          type: "EXERCISE",
          maxScore: 10,
          date: "2026-08-30T01:00:00.000Z",
          lessonDeliveryId: "d1",
          scores: [
            { studentId: "s1", score: 4 },
            { studentId: "s2", score: 8 },
          ],
        },
        {
          id: "i2",
          title: "Quiz 1",
          type: "QUIZ",
          maxScore: 20,
          date: "2026-08-30T02:00:00.000Z",
          lessonDeliveryId: "d1",
          scores: [
            { studentId: "s1", score: 16 },
            { studentId: "s2", score: 10 },
          ],
        },
      ],
    },
  ],
  legacyUnlinkedItems: [
    {
      id: "legacy1",
      title: "Old class test",
      type: "CLASS_TEST",
      maxScore: 10,
      date: "2026-08-20T00:00:00.000Z",
      lessonDeliveryId: null,
      scores: [{ studentId: "s1", score: 7 }],
    },
  ],
});

assert(snapshot.term.itemCount === 2, "Canonical term Work Output must count only lesson-linked practice.");
assert(snapshot.lesson && snapshot.lesson.itemCount === 2, "Current lesson Work Output count is wrong.");
assert(snapshot.legacyUnlinked.itemCount === 1, "Legacy unlinked evidence must remain separate.");
assert(
  snapshot.term.typeCounts.find((bucket) => bucket.key === "EXERCISE")?.count === 1 &&
    snapshot.term.typeCounts.find((bucket) => bucket.key === "QUIZ")?.count === 1,
  "Canonical type counts are wrong."
);

const learnerOne = snapshot.lesson.progression.learners.find(
  (learner) => learner.studentId === "s1"
);
const learnerTwo = snapshot.lesson.progression.learners.find(
  (learner) => learner.studentId === "s2"
);

assert(
  learnerOne &&
    learnerOne.firstPercent === 40 &&
    learnerOne.latestPercent === 80 &&
    learnerOne.changePercent === 40 &&
    learnerOne.trend === "IMPROVED",
  "Learner One progression is wrong.",
  learnerOne
);

assert(
  learnerTwo &&
    learnerTwo.firstPercent === 80 &&
    learnerTwo.latestPercent === 50 &&
    learnerTwo.changePercent === -30 &&
    learnerTwo.trend === "DECLINED",
  "Learner Two progression is wrong.",
  learnerTwo
);

assert(
  snapshot.lesson.progression.averageFirstPercent === 60 &&
    snapshot.lesson.progression.averageLatestPercent === 65 &&
    snapshot.lesson.progression.averageChangePercent === 5,
  "Repeated-practice aggregate progression is wrong.",
  snapshot.lesson.progression
);

assert(
  routeSource.includes("teacherUserId: ctx.userId") &&
    routeSource.includes("lessonDeliveryId: null") &&
    routeSource.includes('type: { not: "MOCK" }'),
  "Teacher Work Output route must scope canonical practice to the signed-in teacher, preserve unlinked legacy separately, and exclude Mock."
);

assert(
  routeSource.includes("subjectMatchesTeachingScope") &&
    routeSource.includes("access.normalizedClassLevel"),
  "Teacher Work Output route must use shared level-aware subject authority."
);

assert(
  routeSource.includes("buildWorkOutputSnapshot") &&
    routeSource.includes('"Cache-Control": "no-store"'),
  "Teacher Work Output route must use shared authority and no-store responses."
);

assert(
  !routeSource.includes("buildSubjectBroadsheet"),
  "Work Output must not create a parallel Broadsheet authority."
);

assert(
  clientSource.includes("/api/teacher/assessment/work-output?") &&
    clientSource.includes("setPostScoreSummaryOpen(!!selectedItem.lessonDeliveryId)") &&
    clientSource.includes("Scores saved. Work Output updated."),
  "Successful linked score save must reveal Work Output."
);

assert(
  clientSource.includes("Work Output tracks practice after lessons") &&
    clientSource.includes("It is not a ranking."),
  "Teacher-facing Work Output must preserve its formative, non-ranking purpose."
);

assert(
  clientSource.includes("View Broadsheet") &&
    clientSource.includes('setTab("broadsheet")') &&
    clientSource.includes("Back to Work Output") &&
    clientSource.includes('setTab("scores")'),
  "Post-score flow must provide a focused Work Output to Broadsheet handoff and return path."
);

assert(
  clientSource.includes("View learner-by-learner progression") &&
    clientSource.includes("buildLearnerProgressionGroups(") &&
    clientSource.includes("group.typeLabel") &&
    clientSource.includes("point.label") &&
    clientSource.includes("formatPercent(point.percent)") &&
    !clientSource.includes('.join(" → ")'),
  "Teacher must be able to inspect chronological learner progression grouped by comparable assessment type with familiar item labels."
);

assert(
  clientSource.includes("older unlinked assessment record") &&
    clientSource.includes("are not counted as lesson-linked Work Output"),
  "Legacy unlinked evidence must remain visible but separate from canonical Work Output."
);

assert(
  !workOutputSource.includes("buildSubjectBroadsheet") &&
    !clientSource.includes("setInterval(") &&
    !routeSource.includes("setInterval("),
  "This slice must not add polling or duplicate Broadsheet computation."
);

transpile(routePath, false);
transpile(clientPath, true);

console.log("TEACHER WORK OUTPUT + POST-SCORE HANDOFF CONTRACT: GREEN");
console.log("- canonical Work Output counts lesson-linked non-Mock practice only");
console.log("- legacy unlinked evidence is preserved separately");
console.log("- assessment types remain distinct, including Quiz, Project and Practical");
console.log("- learner progression remains chronological and normalized, with teacher UI grouped by comparable assessment type");
console.log("- Work Output is explicitly formative and non-ranking");
console.log("- successful linked score save reveals Work Output and the Broadsheet next action");
console.log("- existing Broadsheet authority remains separate and untouched");
console.log("- no polling or schema change is introduced");
