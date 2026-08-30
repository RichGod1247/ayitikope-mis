"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects repository TypeScript source. */

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
  const result = ts.transpileModule(source, {
    fileName: relativePath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      jsx: jsx ? ts.JsxEmit.ReactJSX : undefined,
    },
  });

  const diagnostics = result.diagnostics || [];
  assert(
    diagnostics.length === 0,
    `TypeScript transpile diagnostics in ${relativePath}`,
    diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
  );
}

const clientPath = "src/components/TeacherAssessmentClient.tsx";
const client = read(clientPath);

assert(
  client.includes('if (key === "EXERCISE") return "Ex.";') &&
    client.includes('if (key === "HOMEWORK") return "H/W";') &&
    client.includes('if (key === "CLASS_TEST") return "C/T";') &&
    client.includes('if (key === "GROUP_WORK") return "G/W";'),
  "Progression labels must use compact classroom-style assessment abbreviations."
);

assert(
  client.includes("function buildLearnerProgressionGroups(") &&
    client.includes("const typeOrdinals = new Map<string, number>();") &&
    client.includes("label: `${workOutputProgressShortLabel(type)} ${ordinal}`"),
  "Assessment ordinals must be assigned by assessment item within each type."
);

assert(
  client.includes("itemLabels.get(point.itemId)") &&
    client.includes("groups.get(type)") &&
    client.includes("existing.points.push(displayPoint)"),
  "Learner progression must group points by type while retaining the real assessment-item ordinal."
);

assert(
  !client.includes('.map((point) => formatPercent(point.percent))') &&
    !client.includes('.join(" → ")'),
  "Different assessment types must not be mixed into one unlabeled percentage chain."
);

assert(
  client.includes("function lessonClassAveragePercent(") &&
    client.includes(".map((item) => item.classAveragePercent)") &&
    client.includes("itemAverages.reduce((sum, value) => sum + value, 0)") &&
    client.includes("itemAverages.length"),
  "Lesson Class Average must be the equal mean of server-provided per-assessment class averages."
);

assert(
  client.includes("Class average") &&
    client.includes("postScoreLessonScoredAssessmentCount") &&
    client.includes("postScoreLessonClassAverage"),
  "Teacher UI must show one compact lesson-level Class Average signal."
);

assert(
  !client.includes(">Repeated practice<") &&
    !client.includes(">First practice avg<") &&
    !client.includes(">Latest practice avg<"),
  "Repeated-practice and first/latest practice stat cards must be removed from the teacher UI."
);

assert(
  client.includes("View learner-by-learner progression") &&
    client.includes("group.typeLabel") &&
    client.includes("point.label") &&
    client.includes("formatPercent(point.percent)"),
  "Learner progression must remain the focal detailed evidence, grouped and labeled."
);

assert(
  client.includes("const assessmentHomeHref = useMemo(() => {") &&
    client.includes('return query ? `/teacher/assessment?${query}` : "/teacher/assessment";') &&
    client.includes("href={assessmentHomeHref}") &&
    client.includes("Assessment Home"),
  "Assessment Home must return to the normal Assessment journey while preserving class/term/year context."
);

assert(
  client.includes("Add another assessment") &&
    client.includes("View Broadsheet") &&
    client.includes("Edit scores"),
  "Existing Work Output next actions must remain available."
);

assert(
  !client.includes("setInterval("),
  "Grouped progression refinement must not introduce polling."
);

transpile(clientPath, true);

console.log("WORK OUTPUT GROUPED PROGRESSION + CLASS AVERAGE + ASSESSMENT HOME: GREEN");
console.log("- learner progression is grouped like-with-like by assessment type");
console.log("- assessment item ordinals remain lesson-level, so missed items are not renumbered per learner");
console.log("- familiar assessment labels appear beside each percentage");
console.log("- Repeated practice / First practice avg / Latest practice avg cards are removed from teacher UI");
console.log("- one compact neutral Class Average replaces those analytics cards");
console.log("- Class Average equally averages the server-provided class average of each scored assessment item");
console.log("- Assessment Home returns to the normal Assessment journey with class/term/year context");
console.log("- View Broadsheet, Add another assessment and Edit scores remain available");
console.log("- no polling, schema change or database write is introduced");
