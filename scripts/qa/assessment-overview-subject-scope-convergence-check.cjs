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

function transpile(relativePath) {
  const source = read(relativePath);
  const result = ts.transpileModule(source, {
    fileName: relativePath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  });

  const diagnostics = result.diagnostics || [];
  assert(
    diagnostics.length === 0,
    `TypeScript transpile diagnostics in ${relativePath}`,
    diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
  );
}

const overviewPath = "src/app/api/teacher/assessment/overview/route.ts";
const pipelinePath = "src/app/api/teacher/assessment/pipeline-analytics/route.ts";
const subjectAuthorityPath = "src/lib/teachingSubjectScope.ts";
const clientPath = "src/components/TeacherAssessmentClient.tsx";

const overview = read(overviewPath);
const pipeline = read(pipelinePath);
const subjectAuthority = read(subjectAuthorityPath);
const client = read(clientPath);

assert(
  overview.includes(
    'import { subjectAllowedInTeachingScope } from "@/lib/teachingSubjectScope";'
  ),
  "Teacher Overview must import the shared level-aware subject authority."
);

assert(
  !overview.includes("function buildSubjectWhere") &&
    !overview.includes('subject: { equals: s, mode: "insensitive" as const }') &&
    !overview.includes("...subjectWhere"),
  "Teacher Overview must not retain its old exact-string allowed-subject filter."
);

assert(
  overview.includes("const scopeSubjects = isAdminLikeRole(ctx.roleName)") &&
    overview.includes("? null") &&
    overview.includes(": access.allowedSubjects;"),
  "Admin-like roles may see authorized classroom scope while teacher subject scope remains explicit."
);

assert(
  overview.includes("const assessmentsRaw = await prisma.assessmentItem.findMany({") &&
    overview.includes("tenantId: ctx.tenantId") &&
    overview.includes("classroomId") &&
    overview.includes("term") &&
    overview.includes("academicYear") &&
    overview.includes('type: { not: "MOCK" }'),
  "Overview candidate reads must remain tenant, classroom, term, year and non-Mock scoped."
);

assert(
  overview.includes("const assessments = assessmentsRaw.filter((assessment) =>") &&
    overview.includes("subjectAllowedInTeachingScope(") &&
    overview.includes("assessment.subject") &&
    overview.includes("scopeSubjects") &&
    overview.includes("access.normalizedClassLevel"),
  "Overview response assessments must be filtered by the same level-aware authority as Pipeline."
);

assert(
  pipeline.includes(
    'import { subjectAllowedInTeachingScope } from "@/lib/teachingSubjectScope";'
  ) &&
    pipeline.includes("const assessments = filterRowsBySubjectScope("),
  "Pipeline must remain on the shared subject authority."
);

assert(
  subjectAuthority.includes("export function subjectAllowedInTeachingScope(") &&
    subjectAuthority.includes("subjectMatchesTeachingScope("),
  "Shared subject authority must remain the generic/qualified level-aware source of truth."
);

assert(
  client.includes("setItems(Array.isArray(data.assessments) ? data.assessments : []);") &&
    client.includes("const linkedTeachingItem = useMemo(") &&
    client.includes("disabled={!linkedTeachingItem}"),
  "Teacher client must continue to require a real Overview assessment item rather than bypassing the disabled guard."
);

assert(
  !overview.includes("setInterval("),
  "Overview convergence must not introduce polling."
);

transpile(overviewPath);

console.log("ASSESSMENT OVERVIEW SUBJECT-SCOPE CONVERGENCE: GREEN");
console.log("- Teacher Overview now uses the shared level-aware subject authority");
console.log("- generic teacher assignments can recover same-level qualified curriculum assessment subjects");
console.log("- empty teacher subject scope fails closed instead of widening to all classroom subjects");
console.log("- tenant, classroom, term, year and non-Mock query boundaries remain preserved");
console.log("- Pipeline remains unchanged on the same authority");
console.log("- Review Work Output still requires a real Overview assessment item; no button hack is introduced");
console.log("- no polling, schema change or database write is introduced");
