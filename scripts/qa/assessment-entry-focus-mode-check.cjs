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
    diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
  );
}

const clientPath = "src/components/TeacherAssessmentClient.tsx";
const client = read(clientPath);

assert(
  client.includes("const assessmentEntryFocus = hasLessonDeliveryContext;"),
  "Focused assessment entry must derive from the existing lessonDeliveryId deep-link context."
);

assert(
  client.includes(
    "const guidedTaskFocus = assessmentEntryFocus || postScoreSummaryOpen;"
  ) &&
    client.includes(
      '<div className={guidedTaskFocus ? "hidden" : shellCard + " px-4 py-4"}>'
    ),
  "General class/term assessment shell must hide during delivered-lesson assessment entry and post-score Work Output focus."
);

assert(
  client.includes(
    '<div className={guidedTaskFocus ? "hidden" : "rounded-[28px]'
  ),
  "Journey hub must hide while the teacher is completing either assessment entry or post-score Work Output."
);

assert(
  client.includes("{!guidedTaskFocus && broadsheetNotice ? ("),
  "Broadsheet notices must not compete with focused assessment entry or Work Output."
);

assert(
  client.includes("Assessment entry for delivered lesson."),
  "Focused handoff must state the current task plainly."
);

assert(
  client.includes("!selectedLessonDelivery && urlLessonNoteId"),
  "Lesson-note-linked context must not be duplicated after delivery data resolves."
);

assert(
  client.includes(
    '<div className={guidedTaskFocus ? "hidden" : "md:hidden"}>'
  ) &&
    client.includes(
      '<div className={guidedTaskFocus ? "hidden" : "hidden md:grid md:grid-cols-5 md:gap-2"}>'
    ),
  "Mobile and desktop assessment tabs must hide in focused entry and Work Output."
);

assert(
  client.includes('title={assessmentEntryFocus ? "Assessment item" : "Assessment items"}'),
  "Focused entry must reduce the card to the single assessment-item task."
);

assert(
  client.includes("assessmentEntryFocus ? null : (") &&
    client.includes("!assessmentEntryFocus ? ("),
  "New/Delete/list/toggle controls must not compete with the focused create form."
);

assert(
  client.includes("setItemFormOpen(true);") &&
    client.includes('setTab("items");'),
  "Delivered-lesson deep links must still open the item form automatically."
);

assert(
  client.includes('setTab("scores");'),
  "Saving the assessment item must continue to advance to Scores."
);

assert(
  client.includes("{!guidedTaskFocus ? (") &&
    client.includes("More assessment tools"),
  "Normal assessment entry must preserve advanced tools outside guided focus while hiding them during Work Output."
);

assert(
  !client.includes("setInterval("),
  "Focused entry must not add polling."
);

transpile(clientPath, true);

console.log("ASSESSMENT ENTRY FOCUS MODE CONTRACT: GREEN");
console.log("- delivery deep links open the Assessment item task as the only primary workspace");
console.log("- general shell, journey hub, advanced launchers and tabs are hidden during entry and Work Output focus");
console.log("- duplicate lesson-note-linked copy is removed after delivery context resolves");
console.log("- item save still advances directly to Scores");
console.log("- normal assessment entry keeps all existing advanced tools");
console.log("- no polling, schema change or database write is introduced");
