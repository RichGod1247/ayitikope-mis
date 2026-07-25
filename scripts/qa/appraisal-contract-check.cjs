#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads TypeScript source through a local transpile hook. */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(message, { expected, actual });
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    fail(message, { expected, actual });
  }
}

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(
  request,
  parent,
  isMain,
  options,
) {
  if (typeof request === "string" && request.startsWith("@/")) {
    request = path.join(repoRoot, "src", request.slice(2));
  }

  return originalResolveFilename.call(
    this,
    request,
    parent,
    isMain,
    options,
  );
};

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const transpiled = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      resolveJsonModule: true,
      skipLibCheck: true,
      strict: true,
    },
  });

  const diagnostics = transpiled.diagnostics ?? [];

  if (diagnostics.length) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => repoRoot,
      getNewLine: () => "\n",
    });

    fail(`TypeScript transpilation diagnostics in ${filename}`, formatted);
  }

  module._compile(transpiled.outputText, filename);
};

function itemCount(definition) {
  return definition.sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
}

function rawMaximum(definition) {
  return definition.sections.reduce(
    (sum, section) => sum + section.maxScore,
    0,
  );
}

function sectionMaximums(definition) {
  return definition.sections.map((section) => section.maxScore);
}

function scoreRow({
  itemKey,
  sectionKey,
  sectionOrder,
  score,
  notApplicable = false,
}) {
  return {
    itemKey,
    sectionKey,
    sectionTitle: sectionKey,
    sectionOrder,
    score,
    notApplicable,
    itemMaxScore: 5,
  };
}

function main() {
  const appraisalRoot = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
  );

  const instruments = require(
    path.join(appraisalRoot, "instruments.ts"),
  );
  const authority = require(
    path.join(appraisalRoot, "authority.ts"),
  );
  const workflow = require(
    path.join(appraisalRoot, "workflow.ts"),
  );
  const scoring = require(
    path.join(appraisalRoot, "scoring.ts"),
  );

  const {
    APPRAISAL_INSTRUMENT_CODES,
    APPRAISAL_INSTRUMENT_DEFINITIONS,
    APPRAISAL_INSTRUMENT_SPECIFICATIONS,
    validateInstrumentDefinition,
    instrumentActivationIsBlocked,
    resolveJurisdictionScopedOfficialHeading,
  } = instruments;

  const {
    getAppraisalCapabilities,
    decideAppraisalAuthority,
    hasAppraisalCapability,
  } = authority;

  const {
    APPRAISAL_WORKFLOW_RULES,
    canTransitionAppraisalCycle,
    canTransitionAppraisalResponse,
    canTransitionAppraisalAssessment,
    canDecideAppraisalReview,
    appraisalReleaseReadiness,
  } = workflow;

  const {
    calculateAppraisalScores,
    aggregateFinalizedAppraisalResponses,
  } = scoring;

  const requiredExports = {
    APPRAISAL_INSTRUMENT_CODES,
    APPRAISAL_INSTRUMENT_DEFINITIONS,
    APPRAISAL_INSTRUMENT_SPECIFICATIONS,
    APPRAISAL_WORKFLOW_RULES,
    getAppraisalCapabilities,
    decideAppraisalAuthority,
    hasAppraisalCapability,
    validateInstrumentDefinition,
    instrumentActivationIsBlocked,
    resolveJurisdictionScopedOfficialHeading,
    canTransitionAppraisalCycle,
    canTransitionAppraisalResponse,
    canTransitionAppraisalAssessment,
    canDecideAppraisalReview,
    appraisalReleaseReadiness,
    calculateAppraisalScores,
    aggregateFinalizedAppraisalResponses,
  };

  const missingExports = Object.entries(requiredExports)
    .filter(([, value]) => value == null)
    .map(([name]) => name);

  assertDeepEqual(
    missingExports,
    [],
    "Required appraisal contract exports are missing",
  );

  const codes = Object.values(APPRAISAL_INSTRUMENT_CODES);

  assertEqual(codes.length, 3, "Expected exactly three appraisal instruments");

  const staffCode =
    APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_STAFF_FEEDBACK_V1;
  const supervisoryCode =
    APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_SUPERVISORY_ASSESSMENT_V1;
  const directorCode =
    APPRAISAL_INSTRUMENT_CODES.DIRECTOR_GOVERNANCE_APPRAISAL_V1;

  const staff = APPRAISAL_INSTRUMENT_DEFINITIONS[staffCode];
  const supervisory =
    APPRAISAL_INSTRUMENT_DEFINITIONS[supervisoryCode];
  const director = APPRAISAL_INSTRUMENT_DEFINITIONS[directorCode];

  for (const code of codes) {
    const definition = APPRAISAL_INSTRUMENT_DEFINITIONS[code];
    const validation = validateInstrumentDefinition(definition);

    assert(
      validation.ok,
      `Instrument validation failed for ${code}`,
      validation,
    );

    assertEqual(
      definition.expectedRawMaximum,
      rawMaximum(definition),
      `Raw maximum mismatch for ${code}`,
    );

    assertEqual(
      definition.expectedSectionCount,
      definition.sections.length,
      `Section-count mismatch for ${code}`,
    );

    assertEqual(
      definition.directorateName,
      null,
      `Jurisdiction name must not be hardcoded for ${code}`,
    );

    assertEqual(
      definition.officialHeader.jurisdictionScoped,
      true,
      `Official heading must be jurisdiction scoped for ${code}`,
    );
  }

  assertEqual(staff.sections.length, 4, "Staff-feedback section count");
  assertEqual(itemCount(staff), 34, "Staff-feedback item count");
  assertEqual(rawMaximum(staff), 170, "Staff-feedback raw maximum");
  assertDeepEqual(
    sectionMaximums(staff),
    [55, 45, 40, 30],
    "Staff-feedback section maximums",
  );

  assertEqual(
    supervisory.sections.length,
    4,
    "Supervisory section count",
  );
  assertEqual(itemCount(supervisory), 34, "Supervisory item count");
  assertEqual(rawMaximum(supervisory), 170, "Supervisory raw maximum");

  assert(
    staff.sections === supervisory.sections,
    "The two headteacher workflows must reuse one shared item bank",
  );

  assertEqual(director.sections.length, 7, "Director section count");
  assertEqual(itemCount(director), 35, "Director item count");
  assertEqual(rawMaximum(director), 175, "Director raw maximum");
  assertDeepEqual(
    sectionMaximums(director),
    [40, 25, 30, 20, 20, 10, 30],
    "Director section maximums",
  );

  assertEqual(
    director.calculationMethod,
    "AVERAGE_VALID_SECTION_PERCENTAGES",
    "Director must average all seven valid section percentages",
  );

  assertEqual(
    staff.calculationMethod,
    "AVERAGE_VALID_SECTION_PERCENTAGES",
    "Staff feedback calculation method",
  );

  assertEqual(
    supervisory.calculationMethod,
    "AVERAGE_VALID_SECTION_PERCENTAGES",
    "Supervisory calculation method",
  );

  const headteacherItem45 = staff.sections
    .flatMap((section) => section.items)
    .find((row) => row.key === "4.5");

  assert(headteacherItem45, "Headteacher item 4.5 must exist");
  assertEqual(
    headteacherItem45.label,
    "Presence of broken furniture",
    "Headteacher item 4.5 source wording",
  );
  assertEqual(
    headteacherItem45.scoringDirection,
    "REQUIRES_POLICY_CONFIRMATION",
    "Headteacher item 4.5 must remain policy-blocked",
  );

  assertEqual(
    instrumentActivationIsBlocked(staffCode),
    true,
    "Staff-feedback instrument must remain blocked",
  );
  assertEqual(
    instrumentActivationIsBlocked(supervisoryCode),
    true,
    "Supervisory instrument must remain blocked",
  );
  assertEqual(
    instrumentActivationIsBlocked(directorCode),
    false,
    "Director instrument should be activation-ready",
  );

  assertEqual(
    APPRAISAL_INSTRUMENT_SPECIFICATIONS[staffCode].minimumResponses,
    1,
    "One finalized staff response must be sufficient",
  );
  assertEqual(
    APPRAISAL_INSTRUMENT_SPECIFICATIONS[staffCode].responseWindowDays,
    7,
    "Staff-feedback window must be seven calendar days",
  );

  const heading = resolveJurisdictionScopedOfficialHeading({
    code: staffCode,
    jurisdictionDirectorateName:
      "Hohoe Municipal Education Directorate",
  });

  assertDeepEqual(
    heading,
    {
      directorateName:
        "HOHOE MUNICIPAL EDUCATION DIRECTORATE",
      documentTitle:
        "MONITORING AND INSPECTION SHEET (HEADTEACHERS)",
    },
    "Jurisdiction-scoped heading resolution",
  );

  const instrumentsSource = fs.readFileSync(
    path.join(
      repoRoot,
      "src",
      "lib",
      "appraisals",
      "instruments.ts",
    ),
    "utf8",
  );

  assert(
    !instrumentsSource.toUpperCase().includes(
      "AKATSI SOUTH MUNICIPAL EDUCATION DIRECTORATE",
    ),
    "The instrument source must not hardcode Akatsi South",
  );

  assert(
    hasAppraisalCapability(
      "SUPERADMIN",
      "VIEW_CONFIDENTIAL_RESPONDENTS",
    ),
    "Superadmin confidential-identity capability",
  );

  assert(
    !hasAppraisalCapability(
      "DISTRICT_DIRECTOR",
      "VIEW_CONFIDENTIAL_RESPONDENTS",
    ),
    "Director must not see confidential respondent identities",
  );

  assert(
    !hasAppraisalCapability(
      "HEAD_OF_SUPERVISION",
      "VIEW_CONFIDENTIAL_RESPONDENTS",
    ),
    "Head of Supervision must not see confidential respondent identities",
  );

  assert(
    hasAppraisalCapability(
      "DISTRICT_DIRECTOR",
      "OPEN_DIRECTOR_FEEDBACK_CYCLE",
    ),
    "Director may open the interim feedback cycle",
  );

  assert(
    hasAppraisalCapability(
      "DISTRICT_DIRECTOR",
      "VIEW_DIRECTOR_FEEDBACK_RESULTS",
    ),
    "Director may view released masked feedback results",
  );

  assert(
    !hasAppraisalCapability(
      "DISTRICT_DIRECTOR",
      "EXTEND_DIRECTOR_FEEDBACK_CYCLE",
    ),
    "Director must not extend or reopen his own feedback cycle",
  );

  assert(
    hasAppraisalCapability(
      "SUPERADMIN",
      "EXTEND_DIRECTOR_FEEDBACK_CYCLE",
    ),
    "Superadmin may extend or reopen Director feedback with audit",
  );

  assert(
    hasAppraisalCapability(
      "HEAD_OF_SUPERVISION",
      "EXTEND_HEADTEACHER_FEEDBACK_CYCLE",
    ),
    "Head of Supervision extension capability",
  );

  assert(
    hasAppraisalCapability(
      "BASIC_SCHOOL_COORDINATOR",
      "ASSESS_HEADTEACHER",
    ),
    "BSC headteacher-assessment capability",
  );

  assert(
    hasAppraisalCapability("SISSO", "ASSESS_HEADTEACHER"),
    "SISSO headteacher-assessment capability",
  );

  assert(
    !hasAppraisalCapability(
      "SISSO",
      "RELEASE_HEADTEACHER_FEEDBACK",
    ),
    "SISSO must not release confidential feedback",
  );

  const selfAssessment = decideAppraisalAuthority(
    {
      roleName: "DISTRICT_DIRECTOR",
      actorUserId: "same-user",
      targetUserId: "same-user",
    },
    "ASSESS_GOVERNANCE_OFFICER",
  );

  assertDeepEqual(
    selfAssessment,
    {
      allowed: false,
      capability: "ASSESS_GOVERNANCE_OFFICER",
      effectiveRole: "DISTRICT_DIRECTOR",
      reason: "SELF_APPRAISAL_FORBIDDEN",
    },
    "Self-appraisal must be forbidden",
  );

  assert(
    canTransitionAppraisalCycle("DRAFT", "PENDING_APPROVAL"),
    "Headteacher request transition",
  );
  assert(
    canTransitionAppraisalCycle("PENDING_APPROVAL", "OPEN"),
    "Director approval transition",
  );
  assert(
    canTransitionAppraisalCycle("DRAFT", "OPEN"),
    "Director direct-open transition",
  );
  assert(
    !canTransitionAppraisalCycle("RELEASED", "OPEN"),
    "Released cycles must be terminal",
  );
  assert(
    canTransitionAppraisalResponse("DRAFT", "FINALIZED"),
    "Response finalization transition",
  );
  assert(
    !canTransitionAppraisalResponse("FINALIZED", "DRAFT"),
    "Finalized responses must be immutable",
  );
  assert(
    canTransitionAppraisalAssessment("FINALIZED", "RETURNED"),
    "Assessment return transition",
  );
  assert(
    canDecideAppraisalReview("PENDING", "ACCEPTED"),
    "Review acceptance transition",
  );

  assertEqual(
    APPRAISAL_WORKFLOW_RULES.standardResponseWindowDays,
    7,
    "Standard response window",
  );
  assertEqual(
    APPRAISAL_WORKFLOW_RULES.minimumFinalizedResponses,
    1,
    "Minimum finalized responses",
  );
  assertEqual(
    APPRAISAL_WORKFLOW_RULES.reviewerCannotRewriteAssessorScores,
    true,
    "Reviewer score immutability",
  );

  const releaseReady = appraisalReleaseReadiness({
    status: "UNDER_REVIEW",
    finalizedResponses: 1,
    minimumResponses: 1,
    aggregateSnapshotPresent: true,
    supervisoryAssessmentRequired: true,
    supervisoryAssessmentAccepted: true,
  });

  assertDeepEqual(
    releaseReady,
    { ready: true, reasons: [] },
    "Release-readiness happy path",
  );

  const scoreRows = [
    scoreRow({
      itemKey: "1.1",
      sectionKey: "S1",
      sectionOrder: 1,
      score: 5,
    }),
    scoreRow({
      itemKey: "1.2",
      sectionKey: "S1",
      sectionOrder: 1,
      score: null,
      notApplicable: true,
    }),
    scoreRow({
      itemKey: "2.1",
      sectionKey: "S2",
      sectionOrder: 2,
      score: 3,
    }),
    scoreRow({
      itemKey: "2.2",
      sectionKey: "S2",
      sectionOrder: 2,
      score: 4,
    }),
  ];

  const calculated = calculateAppraisalScores(scoreRows, {
    requireComplete: true,
  });

  assert(calculated.ok, "N/A-aware score calculation failed", calculated);
  assertEqual(
    calculated.value.sectionPercentages.S1,
    100,
    "N/A rows must be excluded from section denominator",
  );
  assertEqual(
    calculated.value.sectionPercentages.S2,
    70,
    "Second section percentage",
  );
  assertEqual(
    calculated.value.overallPercentage,
    85,
    "Overall percentage must average valid section percentages",
  );

  const secondResponseRows = [
    scoreRow({
      itemKey: "1.1",
      sectionKey: "S1",
      sectionOrder: 1,
      score: 3,
    }),
    scoreRow({
      itemKey: "1.2",
      sectionKey: "S1",
      sectionOrder: 1,
      score: null,
      notApplicable: true,
    }),
    scoreRow({
      itemKey: "2.1",
      sectionKey: "S2",
      sectionOrder: 2,
      score: 5,
    }),
    scoreRow({
      itemKey: "2.2",
      sectionKey: "S2",
      sectionOrder: 2,
      score: 5,
    }),
  ];

  const aggregated = aggregateFinalizedAppraisalResponses([
    { responseId: "response-1", scores: scoreRows },
    { responseId: "response-2", scores: secondResponseRows },
  ]);

  assert(aggregated.ok, "Response aggregation failed", aggregated);
  assertEqual(
    aggregated.value.finalizedResponses,
    2,
    "Finalized response count",
  );
  assertEqual(
    aggregated.value.itemAverages["1.1"],
    4,
    "Item average must exclude N/A rows",
  );
  assertEqual(
    aggregated.value.sectionAverages.S1,
    80,
    "Section average across finalized responses",
  );
  assertEqual(
    aggregated.value.sectionAverages.S2,
    85,
    "Second section average across finalized responses",
  );
  assertEqual(
    aggregated.value.overallPercentage,
    82.5,
    "Aggregated overall percentage",
  );

  console.log("");
  console.log("=== D3.1C APPRAISAL CONTRACT PROOF ===");
  console.log("");
  console.log("Instrument definitions       : 3");
  console.log("Headteacher sections/items   : 4 / 34");
  console.log("Headteacher raw maximum      : 170");
  console.log("Director sections/items      : 7 / 35");
  console.log("Director raw maximum         : 175");
  console.log("Shared headteacher item bank : true");
  console.log("Jurisdiction hardcoding      : absent");
  console.log("Confidential identity scope  : Superadmin only");
  console.log("Workflow transitions         : verified");
  console.log("N/A-aware scoring            : verified");
  console.log("Multi-response aggregation   : verified");
  console.log("Headteacher item 4.5         : policy-blocked");
  console.log("Director instrument          : activation-ready");
  console.log("");
  console.log("RESULT: D3.1C APPRAISAL CONTRACT PROOF GREEN");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("RESULT: D3.1C APPRAISAL CONTRACT PROOF FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
