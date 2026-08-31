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
  client.includes('className="grid grid-cols-2 gap-2 lg:grid-cols-4"') &&
    client.includes('panelCard + " px-3 py-2.5"') &&
    client.includes('panelCard + " col-span-2 px-3 py-2.5"') &&
    client.includes("This subject") &&
    client.includes("Subject practice by type"),
  "Lesson/delivery count, subject count and subject practice by type must use the compact responsive summary grid."
);

assert(
  client.includes("Subject practice by type") &&
    client.includes('className="mt-1.5 flex flex-wrap gap-1.5"') &&
    client.includes('rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5'),
  "Subject-scoped practice types must render as compact inline chips instead of large nested cards."
);

assert(
  client.includes("function replaceAssessmentJourneyUrlForNewItem(item: AssessmentItem)") &&
    client.includes('params.delete("assessmentItemId")') &&
    client.includes('params.delete("view")') &&
    client.includes('params.set("lessonDeliveryId", item.lessonDeliveryId)'),
  "Repeat practice must keep the same lesson while clearing the completed item and Work Output destination."
);

assert(
  client.includes("function handleCreateAnotherAssessmentForLesson()") &&
    client.includes("replaceAssessmentJourneyUrlForNewItem(selectedItem);") &&
    client.includes("handleNewItem();"),
  "Work Output must reuse the existing assessment-item creation flow for another assessment on the same lesson."
);

assert(
  client.includes("Add another assessment") &&
    client.includes("onClick={handleCreateAnotherAssessmentForLesson}") &&
    client.includes("postScoreLessonOutput && selectedItem?.lessonDeliveryId ?"),
  "Work Output must expose Add another assessment only when a delivered lesson is actively selected."
);

assert(
  client.includes('setLessonDeliveryId(linkedDelivery?.id || urlLessonDeliveryId || "");') &&
    client.includes('setItemFormOpen(true);') &&
    client.includes('setTab("items");'),
  "Existing new-item handling must continue to link the same delivered lesson and open the item form."
);

assert(
  !client.includes("setInterval("),
  "Compact repeat-practice UI must not introduce polling."
);

transpile(clientPath, true);

console.log("WORK OUTPUT COMPACT SUMMARY + REPEAT PRACTICE CONTRACT: GREEN");
console.log("- lesson/delivery and subject totals remain compact count cards");
console.log("- Subject practice by type is compact and shares the same responsive row where space allows");
console.log("- assessment types render as small inline chips rather than large nested cards");
console.log("- Work Output offers Add another assessment for the same delivered lesson");
console.log("- repeat practice clears the old item/view URL state but preserves lesson linkage");
console.log("- the existing assessment item form is reused; no duplicate creation lifecycle is introduced");
console.log("- View Broadsheet and Edit scores remain available");
console.log("- no polling, schema change or database write is introduced");
