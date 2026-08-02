#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads TypeScript through a local transpile hook. */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix =
    detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) fail(message, { expected, actual });
}

function clone(value) {
  return structuredClone(value);
}

function clean(value) {
  return String(value ?? "").trim();
}

function effectiveRole(value) {
  const role = clean(value).toUpperCase().replace(/[\s-]+/g, "_");
  return role === "CIRCUIT_SUPERVISOR" ? "SISSO" : role;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateAppraisalScores(rows, options = {}) {
  const grouped = new Map();

  for (const row of rows) {
    const current = grouped.get(row.sectionKey) ?? {
      raw: 0,
      maximum: 0,
      answered: 0,
    };

    if (row.notApplicable) {
      current.answered += 1;
    } else if (Number.isInteger(row.score)) {
      current.raw += row.score;
      current.maximum += row.itemMaxScore;
      current.answered += 1;
    }

    grouped.set(row.sectionKey, current);
  }

  if (
    options.requireComplete &&
    rows.some(
      (row) =>
        row.notApplicable !== true &&
        !Number.isInteger(row.score),
    )
  ) {
    return { ok: false, code: "APPRAISAL_SCORE_INCOMPLETE" };
  }

  const sectionPercentages = {};
  const validPercentages = [];

  for (const [sectionKey, state] of grouped.entries()) {
    const percentage =
      state.maximum > 0 ? round2((state.raw / state.maximum) * 100) : null;
    sectionPercentages[sectionKey] = percentage;
    if (percentage !== null) validPercentages.push(percentage);
  }

  const overallPercentage = validPercentages.length
    ? round2(
        validPercentages.reduce((sum, value) => sum + value, 0) /
          validPercentages.length,
      )
    : null;

  return {
    ok: true,
    value: {
      sectionPercentages,
      overallPercentage,
    },
  };
}

const HEADTEACHER_FEEDBACK_POLICY = {
  workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
  targetRole: "HEADTEACHER",
  instrumentVersion: 1,
  instrumentCode: "HEADTEACHER_STAFF_FEEDBACK_V1",
};

const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

const mocks = new Map([
  [
    "@/lib/prisma",
    {
      prisma: {},
    },
  ],
  [
    "@/lib/appraisals/authority",
    {
      assertAppraisalAuthority(actor, capability) {
        assertEqual(
          effectiveRole(actor?.roleName),
          "DISTRICT_DIRECTOR",
          "Authority role",
        );
        assert(
          clean(capability).length > 0,
          "Required capability must be present",
        );
      },
    },
  ],
  [
    "@/lib/appraisals/headteacherFeedback",
    {
      HEADTEACHER_FEEDBACK_POLICY,
      assertHeadteacherFeedbackInstrumentReady() {
        return true;
      },
      assertHeadteacherFeedbackTargetInGovernanceScope(args) {
        if (
          !args?.governanceScope?.isSuperAdmin &&
          !args?.governanceScope?.tenantIds?.includes(args.targetTenantId)
        ) {
          const error = new Error(
            "HEADTEACHER_FEEDBACK_TARGET_OUTSIDE_GOVERNANCE_SCOPE",
          );
          error.code =
            "HEADTEACHER_FEEDBACK_TARGET_OUTSIDE_GOVERNANCE_SCOPE";
          error.status = 403;
          throw error;
        }
      },
    },
  ],
  [
    "@/lib/appraisals/headteacherDirectorReview",
    {
      HEADTEACHER_DIRECTOR_REVIEW_POLICY: {
        requiredCapability: "REVIEW_HEADTEACHER_APPRAISAL",
      },
    },
  ],
  [
    "@/lib/appraisals/scoring",
    {
      calculateAppraisalScores,
    },
  ],
  [
    "@/lib/roleRouting",
    {
      effectiveRole,
    },
  ],
]);

Module._load = function loadWithMocks(request, parent, isMain) {
  if (mocks.has(request)) return mocks.get(request);
  return originalLoad.call(this, request, parent, isMain);
};

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

  const errors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) =>
      diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (errors.length) {
    fail("ANONYMOUS_RESPONSES_TYPESCRIPT_TRANSPILE_FAILED", {
      filename,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          "\n",
        ),
      ),
    });
  }

  module._compile(transpiled.outputText, filename);
};

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableValue(value)), "utf8")
    .digest("hex");
}

function buildSections() {
  const sectionCounts = [11, 9, 8, 6];
  const titles = [
    "Measurement of Administrative and Managerial Competence",
    "Measurement of Record-Keeping Competence",
    "Measurement of School Governance and Environment",
    "Measurement of Mobilization and Use of Teaching & Learning Resources",
  ];

  return sectionCounts.map((count, sectionIndex) => {
    const sectionOrder = sectionIndex + 1;
    return {
      id: `section-${sectionOrder}`,
      key: `SECTION_${sectionOrder}`,
      title: titles[sectionIndex],
      description:
        sectionOrder === 1 ? "Applicable to the Head teacher" : null,
      order: sectionOrder,
      maxScore: count * 5,
      items: Array.from({ length: count }, (_, itemIndex) => {
        const itemOrder = itemIndex + 1;
        return {
          id: `item-${sectionOrder}-${itemOrder}`,
          key: `${sectionOrder}.${itemOrder}`,
          label: `Official item ${sectionOrder}.${itemOrder}`,
          order: itemOrder,
          maxScore: 5,
          isRequired: true,
        };
      }),
    };
  });
}

function calculationRows(scores) {
  return scores.map((score) => ({
    itemKey: score.itemKey,
    sectionKey: score.sectionKey,
    sectionTitle: score.sectionTitle,
    sectionOrder: score.sectionOrder,
    score: score.score,
    notApplicable: score.notApplicable,
    itemMaxScore: score.itemMaxScore,
  }));
}

function responseHashPayload({
  response,
  sections,
  sectionPercentages,
  overallPercentage,
}) {
  const scoreByItemId = new Map(
    response.scores.map((score) => [
      score.instrumentItemId,
      score,
    ]),
  );

  return {
    schemaVersion: 1,
    workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
    cycleId: response.cycleId,
    participantId: response.participantId,
    instrumentVersionId: response.instrumentVersionId,
    scores: sections.flatMap((section) =>
      section.items.map((item) => {
        const saved = scoreByItemId.get(item.id);
        return {
          instrumentItemId: item.id,
          itemKey: item.key,
          score: saved?.score ?? null,
          notApplicable: saved?.notApplicable ?? false,
        };
      }),
    ),
    sectionPercentages,
    overallPercentage,
  };
}

function makeCycle(
  cycleId = "cycle-anonymous-one",
  status = "UNDER_REVIEW",
) {
  const sections = buildSections();
  const normalizedStatus = clean(status).toUpperCase();

  return {
    id: cycleId,
    status: normalizedStatus,
    scopeZoneId: "district-zone-one",
    targetUserId: "headteacher-user-one",
    targetTenantId: "school-tenant-one",
    targetZoneId: "circuit-zone-one",
    targetNameSnapshot: "UAT Headteacher",
    targetSchoolNameSnapshot: "UAT Basic School",
    targetZoneNameSnapshot: "UAT Circuit",
    targetRoleSnapshot: "HEADTEACHER",
    minimumResponses: 1,
    reviewStartedAt:
      normalizedStatus === "UNDER_REVIEW"
        ? new Date("2026-08-01T10:00:00.000Z")
        : null,
    releasedAt: null,
    cancelledAt: null,
    metadata: {
      workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
    },
    scopeZone: {
      id: "district-zone-one",
      name: "UAT District",
      isActive: true,
      zoneType: {
        level: 2,
        countryCode: "GH",
      },
    },
    instrumentVersion: {
      id: "instrument-version-one",
      version: 1,
      status: "ACTIVE",
      title: "Monitoring and Inspection Sheet (Headteachers)",
      instructions:
        "Score each item from 1 to 5 or select N/A.",
      scaleMin: 1,
      scaleMax: 5,
      allowNotApplicable: true,
      allowComments: false,
      instrument: {
        code: HEADTEACHER_FEEDBACK_POLICY.instrumentCode,
        purpose: "HEADTEACHER_STAFF_FEEDBACK",
        subjectType: "HEADTEACHER",
        isActive: true,
      },
      sections,
    },
  };
}

function makeResponse({
  cycle,
  ordinal,
  scoreValue,
  notApplicableItemId = null,
}) {
  const participantId = `participant-internal-${ordinal}`;
  const responseId = `response-internal-${ordinal}`;

  const scores = cycle.instrumentVersion.sections.flatMap((section) =>
    section.items.map((item) => {
      const notApplicable = item.id === notApplicableItemId;
      return {
        instrumentItemId: item.id,
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionOrder: section.order,
        sectionMaxScore: section.maxScore,
        itemKey: item.key,
        itemLabel: item.label,
        itemOrder: item.order,
        itemMaxScore: item.maxScore,
        score: notApplicable ? null : scoreValue,
        notApplicable,
      };
    }),
  );

  const calculated = calculateAppraisalScores(
    calculationRows(scores),
    { requireComplete: true },
  );

  assert(
    calculated.ok &&
      calculated.value.overallPercentage !== null,
    "Fixture score calculation failed",
  );

  const response = {
    id: responseId,
    cycleId: cycle.id,
    participantId,
    instrumentVersionId: cycle.instrumentVersion.id,
    status: "FINALIZED",
    overallPercentage: calculated.value.overallPercentage,
    sectionPercentagesJson:
      calculated.value.sectionPercentages,
    generalComment: null,
    responseHash: null,
    finalizedAt: new Date(
      `2026-08-01T11:0${ordinal}:00.000Z`,
    ),
    metadata: {
      internalRespondentUserId: `teacher-user-${ordinal}`,
      internalEmail: `teacher${ordinal}@example.test`,
    },
    participant: {
      id: participantId,
      status: "FINALIZED",
    },
    scores,
  };

  response.responseHash = sha256(
    responseHashPayload({
      response,
      sections: cycle.instrumentVersion.sections,
      sectionPercentages:
        calculated.value.sectionPercentages,
      overallPercentage:
        calculated.value.overallPercentage,
    }),
  );

  return response;
}

function makeDatabase(options = {}) {
  const cycle = options.cycle ?? makeCycle();
  const responses =
    options.responses ??
    [
      makeResponse({
        cycle,
        ordinal: 1,
        scoreValue: 4,
      }),
      makeResponse({
        cycle,
        ordinal: 2,
        scoreValue: 5,
        notApplicableItemId: "item-4-6",
      }),
    ];

  const state = {
    cycleQueries: [],
    snapshotQueries: [],
    responseQueries: [],
    writes: 0,
  };

  return {
    state,
    cycle,
    responses,
    database: {
      appraisalCycle: {
        async findUnique(args) {
          state.cycleQueries.push(clone(args));
          return clone(cycle);
        },
      },
      appraisalAggregateSnapshot: {
        async findMany(args) {
          state.snapshotQueries.push(clone(args));
          return [
            {
              id: "snapshot-one",
              version: 1,
              finalizedResponses:
                options.snapshotFinalizedResponses ??
                responses.length,
              sourceHash: "a".repeat(64),
            },
          ];
        },
      },
      appraisalResponse: {
        async findMany(args) {
          state.responseQueries.push(clone(args));
          return clone(responses);
        },
      },
    },
  };
}

async function expectFailure(run, expectedCode) {
  try {
    await run();
  } catch (error) {
    assertEqual(
      error.code ?? error.message,
      expectedCode,
      "Unexpected failure code",
    );
    return;
  }

  fail(`Expected failure ${expectedCode}`);
}

function assertNoIdentityLeak(value) {
  const forbiddenKeys = new Set([
    "respondentUserId",
    "participantId",
    "responseId",
    "responseHash",
    "finalizedAt",
    "submittedAt",
    "email",
    "phone",
    "metadata",
  ]);

  const forbiddenValues = [
    "teacher-user-1",
    "teacher-user-2",
    "teacher1@example.test",
    "teacher2@example.test",
    "participant-internal-1",
    "participant-internal-2",
    "response-internal-1",
    "response-internal-2",
  ];

  function walk(node, pathParts = []) {
    if (Array.isArray(node)) {
      node.forEach((item, index) =>
        walk(item, [...pathParts, String(index)]),
      );
      return;
    }

    if (!node || typeof node !== "object") {
      if (
        typeof node === "string" &&
        forbiddenValues.includes(node)
      ) {
        fail("Anonymous payload leaked identity value", {
          path: pathParts.join("."),
          value: node,
        });
      }
      return;
    }

    for (const [key, nested] of Object.entries(node)) {
      assert(
        !forbiddenKeys.has(key),
        "Anonymous payload leaked forbidden key",
        {
          path: [...pathParts, key].join("."),
        },
      );
      walk(nested, [...pathParts, key]);
    }
  }

  walk(value);
}

async function main() {
  const servicePath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "headteacherDirectorAnonymousResponses.ts",
  );
  const routePath = path.join(
    repoRoot,
    "src",
    "app",
    "api",
    "district",
    "headteacher-appraisals",
    "[cycleId]",
    "anonymous-responses",
    "route.ts",
  );
  const clientPath = path.join(
    repoRoot,
    "src",
    "app",
    "district",
    "headteacher-appraisals",
    "review",
    "HeadteacherDirectorReviewClient.tsx",
  );

  const serviceSource = fs.readFileSync(servicePath, "utf8");
  const routeSource = fs.readFileSync(routePath, "utf8");
  const clientSource = fs.readFileSync(clientPath, "utf8");
  const anonymousModule = require(servicePath);

  const {
    HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSES_POLICY,
    readHeadteacherDirectorAnonymousResponses,
  } = anonymousModule;

  assertEqual(
    HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSES_POLICY.audience,
    "DISTRICT_DIRECTOR",
    "Anonymous-response audience",
  );
  assertEqual(
    JSON.stringify(
      HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSES_POLICY.allowedCycleStatuses,
    ),
    JSON.stringify(["CLOSED", "UNDER_REVIEW"]),
    "Closed and under-review staff evidence lifecycles",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSES_POLICY
      .staffEvidenceReviewAllowedBeforeSupervisoryAssessment,
    true,
    "Staff evidence must be independently reviewable",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSES_POLICY
      .fullDecisionReviewRequiredForDecisions,
    true,
    "Director decisions remain in the full review workflow",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSES_POLICY
      .respondentLabelsAreCycleScoped,
    true,
    "Cycle-scoped respondent labels",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSES_POLICY
      .respondentLabelsAreNotCrossCycleIdentifiers,
    true,
    "No cross-cycle respondent identifiers",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSES_POLICY
      .realRespondentIdentitiesIncluded,
    false,
    "Real identities excluded",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSES_POLICY
      .databaseWritesAllowed,
    false,
    "Anonymous read model is read-only",
  );

  const fixture = makeDatabase();
  const listView =
    await readHeadteacherDirectorAnonymousResponses({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: fixture.cycle.id,
      governanceScope: {
        isSuperAdmin: false,
        tenantIds: ["school-tenant-one"],
      },
      database: fixture.database,
    });

  assertEqual(
    listView.audience,
    "DISTRICT_DIRECTOR",
    "List audience",
  );
  assertEqual(
    listView.respondents.length,
    2,
    "Two finalized anonymous respondents",
  );
  assertEqual(
    listView.respondents[0].respondentKey,
    "respondent-1",
    "First cycle-scoped key",
  );
  assertEqual(
    listView.respondents[0].label,
    "Respondent 1",
    "First cycle-scoped label",
  );
  assertEqual(
    listView.respondents[1].label,
    "Respondent 2",
    "Second cycle-scoped label",
  );
  assertEqual(
    listView.selectedResponse,
    null,
    "List request does not select an individual response",
  );
  assertNoIdentityLeak(listView);

  const closedCycle = makeCycle(
    "cycle-anonymous-closed",
    "CLOSED",
  );
  const closedFixture = makeDatabase({
    cycle: closedCycle,
    responses: [
      makeResponse({
        cycle: closedCycle,
        ordinal: 1,
        scoreValue: 4,
      }),
      makeResponse({
        cycle: closedCycle,
        ordinal: 2,
        scoreValue: 5,
      }),
    ],
  });
  const closedListView =
    await readHeadteacherDirectorAnonymousResponses({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: closedCycle.id,
      governanceScope: {
        isSuperAdmin: false,
        tenantIds: ["school-tenant-one"],
      },
      database: closedFixture.database,
    });

  assertEqual(
    closedListView.cycle.status,
    "CLOSED",
    "Closed staff evidence remains inspectable before full review",
  );
  assertEqual(
    closedListView.respondents.length,
    2,
    "Closed cycle exposes only finalized anonymous respondents",
  );
  assertEqual(
    closedCycle.reviewStartedAt,
    null,
    "Closed staff-only review does not start Director review",
  );
  assertNoIdentityLeak(closedListView);

  const selectedView =
    await readHeadteacherDirectorAnonymousResponses({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: fixture.cycle.id,
      respondentKey: "respondent-1",
      governanceScope: {
        isSuperAdmin: false,
        tenantIds: ["school-tenant-one"],
      },
      database: fixture.database,
    });

  assertEqual(
    selectedView.selectedResponse?.label,
    "Respondent 1",
    "Selected anonymous label",
  );
  assertEqual(
    selectedView.selectedResponse?.responseStatus,
    "FINALIZED",
    "Selected response finalized",
  );
  assertEqual(
    selectedView.selectedResponse?.officialForm.sections.length,
    4,
    "Native staff form section count",
  );
  assertEqual(
    selectedView.selectedResponse?.officialForm.sections.reduce(
      (sum, section) => sum + section.items.length,
      0,
    ),
    34,
    "Native staff form item count",
  );
  assert(
    selectedView.integrity.finalizedResponsesOnly === true &&
      selectedView.integrity.aggregateResponseCountMatched === true &&
      selectedView.integrity.responseHashesVerifiedInternally === true &&
      selectedView.integrity.readOnly === true,
    "Anonymous-response integrity contract",
  );
  assertNoIdentityLeak(selectedView);

  const secondCycle = makeCycle("cycle-anonymous-two");
  const secondFixture = makeDatabase({
    cycle: secondCycle,
    responses: [
      makeResponse({
        cycle: secondCycle,
        ordinal: 1,
        scoreValue: 3,
      }),
    ],
  });
  const secondCycleView =
    await readHeadteacherDirectorAnonymousResponses({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: secondCycle.id,
      governanceScope: {
        isSuperAdmin: false,
        tenantIds: ["school-tenant-one"],
      },
      database: secondFixture.database,
    });

  assertEqual(
    secondCycleView.respondents[0].label,
    "Respondent 1",
    "Anonymous labels restart within each cycle",
  );

  await expectFailure(
    () =>
      readHeadteacherDirectorAnonymousResponses({
        actorUserId: "teacher-user-one",
        actorRoleName: "TEACHER",
        cycleId: fixture.cycle.id,
        governanceScope: {
          isSuperAdmin: false,
          tenantIds: ["school-tenant-one"],
        },
        database: fixture.database,
      }),
    "HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_DIRECTOR_ONLY",
  );

  await expectFailure(
    () =>
      readHeadteacherDirectorAnonymousResponses({
        actorUserId: "director-user-one",
        actorRoleName: "DISTRICT_DIRECTOR",
        cycleId: fixture.cycle.id,
        governanceScope: {
          isSuperAdmin: false,
          tenantIds: ["different-school"],
        },
        database: fixture.database,
      }),
    "HEADTEACHER_FEEDBACK_TARGET_OUTSIDE_GOVERNANCE_SCOPE",
  );

  await expectFailure(
    () =>
      readHeadteacherDirectorAnonymousResponses({
        actorUserId: "director-user-one",
        actorRoleName: "DISTRICT_DIRECTOR",
        cycleId: fixture.cycle.id,
        respondentKey: "teacher-user-one",
        governanceScope: {
          isSuperAdmin: false,
          tenantIds: ["school-tenant-one"],
        },
        database: fixture.database,
      }),
    "HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_KEY_INVALID",
  );

  await expectFailure(
    () =>
      readHeadteacherDirectorAnonymousResponses({
        actorUserId: "director-user-one",
        actorRoleName: "DISTRICT_DIRECTOR",
        cycleId: fixture.cycle.id,
        respondentKey: "respondent-99",
        governanceScope: {
          isSuperAdmin: false,
          tenantIds: ["school-tenant-one"],
        },
        database: fixture.database,
      }),
    "HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_NOT_FOUND",
  );

  const openCycle = makeCycle(
    "cycle-anonymous-open",
    "OPEN",
  );
  const openFixture = makeDatabase({
    cycle: openCycle,
    responses: [
      makeResponse({
        cycle: openCycle,
        ordinal: 1,
        scoreValue: 4,
      }),
    ],
  });
  await expectFailure(
    () =>
      readHeadteacherDirectorAnonymousResponses({
        actorUserId: "director-user-one",
        actorRoleName: "DISTRICT_DIRECTOR",
        cycleId: openCycle.id,
        governanceScope: {
          isSuperAdmin: false,
          tenantIds: ["school-tenant-one"],
        },
        database: openFixture.database,
      }),
    "HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_CYCLE_INVALID",
  );

  const countDrift = makeDatabase({
    snapshotFinalizedResponses: 3,
  });
  await expectFailure(
    () =>
      readHeadteacherDirectorAnonymousResponses({
        actorUserId: "director-user-one",
        actorRoleName: "DISTRICT_DIRECTOR",
        cycleId: countDrift.cycle.id,
        governanceScope: {
          isSuperAdmin: false,
          tenantIds: ["school-tenant-one"],
        },
        database: countDrift.database,
      }),
    "HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_COUNT_DRIFT",
  );

  const tamperedFixture = makeDatabase();
  tamperedFixture.responses[0].responseHash = "f".repeat(64);
  await expectFailure(
    () =>
      readHeadteacherDirectorAnonymousResponses({
        actorUserId: "director-user-one",
        actorRoleName: "DISTRICT_DIRECTOR",
        cycleId: tamperedFixture.cycle.id,
        governanceScope: {
          isSuperAdmin: false,
          tenantIds: ["school-tenant-one"],
        },
        database: tamperedFixture.database,
      }),
    "HEADTEACHER_DIRECTOR_ANONYMOUS_RESPONSE_HASH_DRIFT",
  );

  assertEqual(
    fixture.state.writes,
    0,
    "Anonymous service database writes",
  );
  assert(
    fixture.state.responseQueries[0].where.status === "FINALIZED" &&
      fixture.state.responseQueries[0].where.participant.status ===
        "FINALIZED",
    "Response query must require finalized response and participant",
  );

  const forbiddenDatabaseWritePattern =
    /\b(?:database|tx)\.[A-Za-z0-9_]+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;

  assert(
    !forbiddenDatabaseWritePattern.test(serviceSource),
    "Anonymous service must not invoke a database write delegate",
  );

  for (const forbidden of [
    "$transaction",
    "sendSms",
    "sendEmail",
    "fetch(",
  ]) {
    assert(
      !serviceSource.includes(forbidden),
      "Anonymous service must remain transaction-free and provider-free",
      { forbidden },
    );
  }

  for (const forbidden of [
    "appraisalAssessment",
    "supervisoryAssessment",
    "HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_ASSESSMENT_REQUIRED",
  ]) {
    assert(
      !serviceSource.includes(forbidden),
      "Anonymous staff review must not depend on governance assessment",
      { forbidden },
    );
  }

  assert(
    serviceSource.includes('createHash("sha256")') &&
      serviceSource.includes(
        ".update(JSON.stringify(stableValue(value)), \"utf8\")",
      ),
    "Cryptographic response-hash verification must remain present",
  );

  for (const marker of [
    'allowedCycleStatuses: ["CLOSED", "UNDER_REVIEW"]',
    "staffEvidenceReviewAllowedBeforeSupervisoryAssessment: true",
    "fullDecisionReviewRequiredForDecisions: true",
    'cycleStatus === "CLOSED"',
    'cycleStatus === "UNDER_REVIEW"',
    "responseHash.localeCompare",
    "respondentLabelsAreCycleScoped: true",
    "respondentLabelsAreNotCrossCycleIdentifiers: true",
    "realRespondentIdentitiesIncluded: false",
    "respondentUserIdsIncluded: false",
    "participantIdsIncluded: false",
    "responseIdsIncluded: false",
    "responseHashesIncluded: false",
    "submissionTimestampsIncluded: false",
    "superadminIdentityPathSeparate: true",
  ]) {
    assert(
      serviceSource.includes(marker),
      "Anonymous service contract marker missing",
      { marker },
    );
  }

  for (const marker of [
    "jsonNoStore",
    "requireDirectorReviewApiContext",
    "readHeadteacherDirectorAnonymousResponses",
    "respondentKey",
  ]) {
    assert(
      routeSource.includes(marker),
      "Anonymous route contract marker missing",
      { marker },
    );
  }

  for (const marker of [
    "anonymousContractSafe",
    "StaffNativeForm",
    "Review staff feedback",
    "Start full decision review",
    "The staff feedback is ready, but the separate governance assessment",
    "Staff evidence review only",
    "cycle-scoped anonymous label",
    "not available to the District Director",
    "Native Monitoring and Inspection Sheet",
  ]) {
    assert(
      clientSource.includes(marker),
      "Native anonymous UI contract marker missing",
      { marker },
    );
  }

  console.log("");
  console.log(
    "=== HEADTEACHER DIRECTOR ANONYMOUS RESPONSES + NATIVE FORM ===",
  );
  console.log("");
  console.log(
    "Audience                         : District Director only",
  );
  console.log(
    "Governance scope                 : exact school tenant",
  );
  console.log(
    "Allowed cycle states             : CLOSED / UNDER_REVIEW",
  );
  console.log(
    "Staff-only review                : available before governance finalization",
  );
  console.log(
    "Director decision controls       : full review only",
  );
  console.log(
    "Response eligibility             : finalized response + participant",
  );
  console.log(
    "Individual forms                 : finalized and read-only",
  );
  console.log(
    "Native official form             : 4 sections / 34 indicators",
  );
  console.log(
    "Anonymous labels                 : Respondent 1…N",
  );
  console.log(
    "Label scope                      : restarts within each cycle",
  );
  console.log(
    "Stable ordering                  : verified response hash",
  );
  console.log(
    "Real Teacher identity            : absent",
  );
  console.log(
    "User/participant/response IDs    : absent",
  );
  console.log(
    "Response hash/timestamps          : verified internally, not returned",
  );
  console.log(
    "Free-text comments               : absent",
  );
  console.log(
    "Tampered response proof          : fail closed",
  );
  console.log(
    "Database writes/providers        : absent",
  );
  console.log(
    "No-store API wrapper             : present",
  );
  console.log(
    "Database accessed                : false",
  );
  console.log("");
  console.log(
    "RESULT: HEADTEACHER DIRECTOR ANONYMOUS RESPONSES GREEN",
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "RESULT: HEADTEACHER DIRECTOR ANONYMOUS RESPONSES FAILED",
  );
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
