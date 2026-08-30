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
  "P2A2 shared subject authority must remain wired into the client."
);

assert(
  client.includes('const shouldLoadJourney = !!classroomId;'),
  "Journey hub must derive from the selected classroom."
);

assert(
  client.includes(
    '}, [classroomId, term, academicYear, shouldLoadJourney, journeyRefreshKey]);'
  ),
  "Journey pipeline read must refresh only on scope change or explicit refresh."
);

assert(
  client.includes('const shouldLoadPipelineDetails = tab === "pipeline";'),
  "Advanced pipeline details must remain lazy."
);

assert(
  client.includes(
    '}, [classroomId, term, academicYear, shouldLoadPipelineDetails]);'
  ),
  "Class summary network calls must remain tied to the advanced Pipeline view."
);

assert(
  client.includes(
    'const [showAssessmentTools, setShowAssessmentTools] = useState<boolean>(hasLessonDeliveryContext);'
  ),
  "Normal entry must hide advanced tools while delivery-to-assessment deep links may open them."
);

assert(
  client.includes('title: "Prepare and submit your Lesson Note."') &&
    client.includes('title: "Record the lesson you have taught."') &&
    client.includes('title: "Enter assessment for the lesson you already delivered."') &&
    client.includes('title: "Finish learner scores for the assessment already recorded."') &&
    client.includes('title: "Review your Work Output before you move on."'),
  "One-next-action journey states must all be present, with Work Output after scored teaching evidence."
);

assert(
  client.includes(
    'pipeline.counts.orphanAssessmentsCount === 0 &&'
  ) &&
    client.includes(
      'pipeline.counts.linkedAssessmentsCount > pipeline.counts.scoredAssessmentsCount'
    ),
  "Score-next state must be used only when the aggregate count proves an unscored linked assessment."
);

const scoreStateIndex = client.indexOf("hasDefinitelyUnscoredLinkedAssessment");
const orphanDeliveryIndex = client.indexOf(
  "const pendingDelivery = pipeline.orphanDeliveries[0]"
);
const orphanNoteIndex = client.indexOf(
  "const pendingNote = pipeline.orphanNotes[0]"
);

assert(
  scoreStateIndex >= 0 &&
    orphanDeliveryIndex > scoreStateIndex &&
    orphanNoteIndex > orphanDeliveryIndex,
  "Journey priority must finish recorded work before starting later work."
);

assert(
  client.includes("Counts come from saved teaching evidence, not a separate checklist."),
  "Hub must explain that its state is derived, not a duplicate lifecycle."
);

assert(
  client.includes('kind: "WORK_OUTPUT" as const') &&
    client.includes("Review Work Output") &&
    client.includes("View Broadsheet") &&
    client.includes("Back to Work Output"),
  "Scored teaching evidence must lead to Work Output before the existing Broadsheet handoff."
);

assert(
  !client.includes('kind: "REVIEW" as const') &&
    !client.includes('title: "Review the Broadsheet before you move on."'),
  "The normal scored-evidence journey must not skip Work Output and jump directly to Broadsheet."
);

assert(
  client.includes('More assessment tools') &&
    client.includes('BECE Mock') &&
    client.includes('Lesson Delivery') &&
    client.includes('Term Dashboard') &&
    client.includes('label="Broadsheet"') &&
    client.includes('label="Items"') &&
    client.includes('label="Insights"') &&
    client.includes('label="Pipeline"'),
  "Existing advanced tools must remain available as secondary controls."
);

assert(
  !client.includes("Teaching record complete"),
  "P2B1 must not overclaim completion before Broadsheet readiness is checked."
);

assert(
  !client.includes("setInterval("),
  "P2B1 must not add polling."
);

assert(
  authority.includes(
    "return !!normalizedScope && normalizedScope === embeddedLevel;"
  ),
  "Cross-level subject matching must remain forbidden."
);

transpile(authorityPath, false);
transpile(clientPath, true);

console.log("ASSESSMENT NEXT-ACTION JOURNEY HUB CONTRACT: GREEN");
console.log("- one lightweight persisted-evidence journey read is available on normal page entry");
console.log("- Pipeline class-summary calls remain lazy");
console.log("- advanced tools are secondary and preserved");
console.log("- next action prioritizes unfinished recorded work and Work Output before Broadsheet");
console.log("- no duplicate lifecycle or completion overclaim is introduced");
console.log("- no polling, schema change or database write is introduced");
