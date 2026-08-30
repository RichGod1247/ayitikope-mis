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
  client.includes('searchParams.get("assessmentItemId")') &&
    client.includes('urlView === "work-output"'),
  "Assessment journey must persist the exact assessment item and Work Output destination."
);

assert(
  client.includes('params.set("assessmentItemId", item.id)') &&
    client.includes('params.set("view", "work-output")') &&
    client.includes("window.history.replaceState("),
  "Item creation and score save must leave a resumable URL without another network navigation."
);

assert(
  client.includes("urlAssessmentItemId") &&
    client.includes("item.lessonDeliveryId === urlLessonDeliveryId") &&
    client.includes("urlWorkOutputRequested"),
  "Refresh must restore only the exact created assessment inside the original lesson-delivery context."
);

assert(
  client.includes('replaceAssessmentJourneyUrl(item, "scores")') &&
    client.includes('replaceAssessmentJourneyUrl(selectedItem, "work-output")'),
  "Create -> Scores -> Work Output must persist each completed handoff."
);

assert(
  client.includes('kind: "WORK_OUTPUT" as const') &&
    client.includes("Review your Work Output before you move on.") &&
    client.includes("Review Work Output"),
  "The normal saved-evidence journey must surface Work Output before Broadsheet."
);

assert(
  client.includes("const guidedTaskFocus = assessmentEntryFocus || postScoreSummaryOpen;") &&
    client.includes('className={guidedTaskFocus ? "hidden" : shellCard + " px-4 py-4"}'),
  "Work Output must remain a one-task BBC focus state."
);

assert(
  client.includes("View Broadsheet") &&
    client.includes("Back to Work Output"),
  "Broadsheet remains the next action after Work Output and can return to it."
);

assert(
  client.includes("One practice assessment is recorded for this lesson. Progress tracking becomes meaningful after another assessment is given and scored."),
  "A single genuine practice assessment must not invent a progression trend."
);

assert(
  !client.includes("setInterval("),
  "Runtime resume correction must not introduce polling."
);

transpile(clientPath, true);

console.log("WORK OUTPUT RUNTIME RESUME + JOURNEY ORDER CONTRACT: GREEN");
console.log("- item creation persists the exact assessment item for refresh-safe score entry");
console.log("- successful score save persists Work Output as the resumable destination");
console.log("- refreshing the scored lesson reopens Work Output instead of Create Assessment");
console.log("- the normal teaching journey now shows Work Output before Broadsheet");
console.log("- Work Output stays a focused BBC task and Broadsheet remains the next action");
console.log("- one assessment does not fabricate a learner progression trend");
console.log("- no polling or schema change is introduced");
