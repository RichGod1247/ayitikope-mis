/* eslint-disable @typescript-eslint/no-require-imports -- deterministic CommonJS repository QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const paths = {
  migration:
    "prisma/migrations/20260816090000_appraisal_cycle_workflow_constraints/migration.sql",
  teacherDraft:
    "src/lib/appraisals/teacherSupervisoryAssessmentDraft.ts",
  teacherDirectRelease:
    "src/lib/appraisals/teacherSupervisoryDirectorDirectRelease.ts",
  headteacherOpen:
    "src/lib/appraisals/headteacherFeedbackApproval.ts",
  headteacherClosure:
    "src/lib/appraisals/headteacherFeedbackDeadlineClosure.ts",
  directorOpen:
    "src/lib/appraisals/directorFeedback.ts",
  directorClosure:
    "src/lib/appraisals/directorFeedbackClosure.ts",
  directorEarlyClosure:
    "src/lib/appraisals/directorFeedbackEarlyClosure.ts",
  directorReview:
    "src/lib/appraisals/directorFeedbackReview.ts",
  directorRelease:
    "src/lib/appraisals/directorFeedbackRelease.ts",
};

function fail(message, detail) {
  const suffix =
    detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), "Required file missing", { relativePath });
  return fs.readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n");
}

function requireMarkers(text, markers, label) {
  for (const marker of markers) {
    assert(text.includes(marker), `${label} marker missing`, { marker });
  }
}

function forbidMarkers(text, markers, label) {
  for (const marker of markers) {
    assert(!text.includes(marker), `${label} forbidden marker present`, {
      marker,
    });
  }
}

function between(text, startMarker, endMarker, label) {
  const start = text.indexOf(startMarker);
  assert(start >= 0, `${label} start marker missing`, { startMarker });
  const end = text.indexOf(endMarker, start);
  assert(end > start, `${label} end marker missing`, { endMarker });
  return text.slice(start, end);
}

const migration = read(paths.migration);
const teacherDraft = read(paths.teacherDraft);
const teacherDirectRelease = read(paths.teacherDirectRelease);
const headteacherOpen = read(paths.headteacherOpen);
const headteacherClosure = read(paths.headteacherClosure);
const directorOpen = read(paths.directorOpen);
const directorClosure = read(paths.directorClosure);
const directorEarlyClosure = read(paths.directorEarlyClosure);
const directorReview = read(paths.directorReview);
const directorRelease = read(paths.directorRelease);

const constraintNames = [
  "AppraisalCycle_deadline_check",
  "AppraisalCycle_extensionCount_check",
  "AppraisalCycle_minimumResponses_check",
  "AppraisalCycle_status_shape_check",
  "AppraisalCycle_target_context_check",
  "AppraisalCycle_window_check",
];

for (const name of constraintNames) {
  assert(migration.includes(name), "Constraint name missing from migration", {
    name,
  });
}

const constraintDeparseCalls = [
  ...migration.matchAll(
    /pg_get_constraintdef\(\s*c\.oid\s*(?:,\s*(true|false))?\s*\)/gi,
  ),
];

assert(
  constraintDeparseCalls.length === 6,
  "Migration must perform exactly six parent-constraint deparse reads",
  {
    calls: constraintDeparseCalls.map((match) => match[0]),
  },
);

const nonPrettyConstraintDeparseCalls = constraintDeparseCalls.filter(
  (match) => String(match[1] ?? "").toLowerCase() !== "true",
);

assert(
  nonPrettyConstraintDeparseCalls.length === 0,
  "Every parent-constraint drift read must use pg_get_constraintdef(c.oid, true)",
  {
    calls: nonPrettyConstraintDeparseCalls.map((match) => match[0]),
  },
);

const guardedPrettyReads = [
  ...migration.matchAll(
    /SELECT\s+pg_get_constraintdef\(\s*c\.oid\s*,\s*true\s*\)\s*,\s*c\.convalidated/gi,
  ),
];

assert(
  guardedPrettyReads.length === 6,
  "Each of the six parent constraints must be read with the canonical pretty deparse plus validation state",
  {
    count: guardedPrettyReads.length,
  },
);

requireMarkers(
  migration,
  [
    "LOCK TABLE edulife_os.appraisal_cycle IN SHARE ROW EXCLUSIVE MODE",
    "APPRAISAL_CYCLE_DEADLINE_CONSTRAINT_DRIFT",
    "APPRAISAL_CYCLE_EXTENSION_COUNT_CONSTRAINT_DRIFT",
    "APPRAISAL_CYCLE_MINIMUM_RESPONSES_CONSTRAINT_DRIFT",
    "APPRAISAL_CYCLE_STATUS_SHAPE_CONSTRAINT_DRIFT",
    "APPRAISAL_CYCLE_TARGET_CONTEXT_CONSTRAINT_DRIFT",
    "APPRAISAL_CYCLE_WINDOW_CONSTRAINT_DRIFT",
    "APPRAISAL_CYCLE_CONSTRAINT_ADOPTION_INCOMPLETE",
    "TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
    "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
    "DIRECTOR_CONFIDENTIAL_HEADTEACHER_FEEDBACK",
    "metadata ->> 'workflow'",
    "metadata ->> 'respondentWorkflow'",
    "metadata ->> 'participantSelection'",
    '"minimumResponses" = 0',
    '"responseWindowDays" = 0',
    '"approvedAt" IS NULL',
    '"approvedByUserId" IS NULL',
    '"deadlineAt" IS NULL',
    '"closedAt" IS NOT NULL',
    '"reviewStartedAt" IS NOT NULL',
    '"releasedAt" IS NOT NULL',
    '"cancelledAt" IS NOT NULL',
    '"cancelledByUserId" IS NOT NULL',
    'length(btrim(COALESCE("cancellationReason", \'\'))) >= 10',
  ],
  "Migration contract",
);

const exactObservedParentDefinitions = [
  'CHECK ("deadlineAt" IS NULL OR "openedAt" IS NULL OR "deadlineAt" > "openedAt")',
  'CHECK ("extensionCount" >= 0)',
  'CHECK ("minimumResponses" >= 1)',
  'CHECK ("targetTenantId" IS NOT NULL OR "targetZoneId" IS NOT NULL OR "targetGovernanceAssignmentId" IS NOT NULL)',
  'CHECK ("responseWindowDays" >= 1 AND "responseWindowDays" <= 90)',
  'status <> \'RELEASED\'::"AppraisalCycleStatus" OR "releasedAt" IS NOT NULL AND "releasedByUserId" IS NOT NULL',
];

for (const definitionMarker of exactObservedParentDefinitions) {
  assert(
    migration.includes(definitionMarker),
    "Observed parent constraint definition not locked into migration",
    { definitionMarker },
  );
}

const droppedConstraints = [
  ...migration.matchAll(/DROP CONSTRAINT\s+"([^"]+)"/g),
].map((match) => match[1]);

assert(
  droppedConstraints.length === 3,
  "Migration must replace exactly three existing constraints",
  { droppedConstraints },
);
assert(
  JSON.stringify(droppedConstraints.sort()) ===
    JSON.stringify(
      [
        "AppraisalCycle_minimumResponses_check",
        "AppraisalCycle_status_shape_check",
        "AppraisalCycle_window_check",
      ].sort(),
    ),
  "Unexpected constraint drop set",
  { droppedConstraints },
);

for (const preserved of [
  "AppraisalCycle_deadline_check",
  "AppraisalCycle_extensionCount_check",
  "AppraisalCycle_target_context_check",
]) {
  assert(
    !migration.includes(`DROP CONSTRAINT "${preserved}"`),
    "Preserved production constraint must never be dropped",
    { preserved },
  );
}

forbidMarkers(
  migration,
  [
    "DROP TABLE",
    "DROP FUNCTION",
    "DROP TRIGGER",
    "CASCADE",
    "NOT VALID",
    'reviewStartedAt" >= "closedAt',
    'releasedAt" >= "reviewStartedAt',
    'releasedAt" >= "closedAt',
  ],
  "Migration safety",
);

for (const forbiddenWrite of [
  /\bINSERT\s+INTO\b/i,
  /\bUPDATE\s+/i,
  /\bDELETE\s+FROM\b/i,
  /\bTRUNCATE\b/i,
]) {
  assert(!forbiddenWrite.test(migration), "Business-row mutation SQL forbidden", {
    pattern: String(forbiddenWrite),
  });
}

assert(
  !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(
    migration,
  ),
  "Production UUID literal forbidden in migration",
);

requireMarkers(
  teacherDraft,
  [
    'initialCycleStatus: "OPEN"',
    "respondentWorkflow: false",
    "responseWindowDays: 0",
    "minimumResponses: 0",
    'participantSelection: "NONE"',
    'status: "OPEN"',
    "approvedByUserId: null",
    "approvedAt: null",
    "openedAt: input.now",
    "deadlineAt: null",
  ],
  "Teacher draft source",
);

const teacherReleaseWrite = between(
  teacherDirectRelease,
  "const releaseResult = await tx.appraisalCycle.updateMany({",
  "if (releaseResult.count !== 1)",
  "Teacher direct-release write",
);
requireMarkers(
  teacherReleaseWrite,
  ['status: "RELEASED"', "releasedAt: now"],
  "Teacher direct-release write",
);
assert(
  !teacherReleaseWrite.includes("releasedByUserId"),
  "Teacher direct release must remain compatible with null releasedByUserId",
);

requireMarkers(
  headteacherOpen,
  [
    'status: "OPEN"',
    "approvedByUserId: input.actorUserId",
    "approvedAt: input.now",
    "openedByUserId: input.actorUserId",
    "openedAt: input.now",
    "deadlineAt",
  ],
  "Headteacher open source",
);

requireMarkers(
  headteacherClosure,
  [
    "closedByUserId: authority.actorUserId",
    "closedByUserId: null",
    'closureMode: "SYSTEM_DEADLINE"',
  ],
  "Headteacher closure source",
);

requireMarkers(
  directorOpen,
  [
    'workflow: "DIRECTOR_CONFIDENTIAL_HEADTEACHER_FEEDBACK"',
    'status: "OPEN"',
    "openedByUserId: actorUserId",
    "openedAt: now",
    "deadlineAt",
  ],
  "Director open source",
);
assert(
  !directorOpen.includes("approvedByUserId:"),
  "Director feedback OPEN must not gain an invented approval writer",
);
assert(
  !directorOpen.includes("approvedAt:"),
  "Director feedback OPEN must not gain an invented approval timestamp",
);

requireMarkers(
  directorClosure,
  ["closedByUserId: null", 'closeActor: "SYSTEM_DEADLINE_WORKER"'],
  "Director deadline closure source",
);
requireMarkers(
  directorEarlyClosure,
  ["closedByUserId: actorUserId", "allEligibleResponsesMustBeFinalized: true"],
  "Director early closure source",
);

requireMarkers(
  directorReview,
  [
    "AppraisalCycleStatus.UNDER_REVIEW",
    "reviewStartedAt: now",
    "AppraisalCycleStatus.CLOSED",
  ],
  "Director review source",
);
requireMarkers(
  directorRelease,
  [
    "AppraisalCycleStatus.RELEASED",
    "releasedAt: now",
    "releasedByUserId: actorUserId",
  ],
  "Director release source",
);

const ACTIVE = new Set(["OPEN", "CLOSED", "UNDER_REVIEW", "RELEASED"]);
const CLOSED_OR_LATER = new Set(["CLOSED", "UNDER_REVIEW", "RELEASED"]);

function present(value) {
  return value !== null && value !== undefined;
}

function statusShapeValid(cycle) {
  const workflow = String(cycle.metadata?.workflow ?? "");

  if (present(cycle.deadlineAt) && present(cycle.openedAt)) {
    if (!(cycle.deadlineAt > cycle.openedAt)) return false;
  }
  if (cycle.extensionCount < 0) return false;

  if (workflow === "TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT") {
    if (cycle.minimumResponses !== 0 || cycle.responseWindowDays !== 0) {
      return false;
    }
  } else {
    if (cycle.minimumResponses < 1) return false;
    if (cycle.responseWindowDays < 1 || cycle.responseWindowDays > 90) {
      return false;
    }
  }

  if (
    !present(cycle.targetTenantId) &&
    !present(cycle.targetZoneId) &&
    !present(cycle.targetGovernanceAssignmentId)
  ) {
    return false;
  }

  if (
    ACTIVE.has(cycle.status) &&
    (!present(cycle.openedAt) || !present(cycle.openedByUserId))
  ) {
    return false;
  }

  if (CLOSED_OR_LATER.has(cycle.status) && !present(cycle.closedAt)) {
    return false;
  }

  if (cycle.status === "UNDER_REVIEW" && !present(cycle.reviewStartedAt)) {
    return false;
  }

  if (cycle.status === "RELEASED" && !present(cycle.releasedAt)) {
    return false;
  }

  if (cycle.status === "CANCELLED") {
    if (
      !present(cycle.cancelledAt) ||
      !present(cycle.cancelledByUserId) ||
      String(cycle.cancellationReason ?? "").trim().length < 10
    ) {
      return false;
    }
  }

  if (workflow === "TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT") {
    return (
      cycle.metadata?.respondentWorkflow === false &&
      cycle.metadata?.participantSelection === "NONE" &&
      !present(cycle.approvedAt) &&
      !present(cycle.approvedByUserId) &&
      !present(cycle.deadlineAt)
    );
  }

  if (workflow === "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK") {
    return (
      !ACTIVE.has(cycle.status) ||
      (present(cycle.approvedAt) &&
        present(cycle.approvedByUserId) &&
        present(cycle.deadlineAt))
    );
  }

  if (workflow === "DIRECTOR_CONFIDENTIAL_HEADTEACHER_FEEDBACK") {
    if (ACTIVE.has(cycle.status) && !present(cycle.deadlineAt)) return false;
    if (cycle.status === "RELEASED" && !present(cycle.releasedByUserId)) {
      return false;
    }
    return true;
  }

  if (ACTIVE.has(cycle.status)) {
    if (
      !present(cycle.approvedAt) ||
      !present(cycle.approvedByUserId) ||
      !present(cycle.deadlineAt)
    ) {
      return false;
    }
  }
  if (CLOSED_OR_LATER.has(cycle.status) && !present(cycle.closedByUserId)) {
    return false;
  }
  if (cycle.status === "RELEASED" && !present(cycle.releasedByUserId)) {
    return false;
  }

  return true;
}

function baseCycle(overrides = {}) {
  return {
    status: "OPEN",
    responseWindowDays: 7,
    minimumResponses: 1,
    extensionCount: 0,
    targetTenantId: "tenant-1",
    targetZoneId: null,
    targetGovernanceAssignmentId: null,
    openedAt: 100,
    openedByUserId: "user-1",
    approvedAt: 90,
    approvedByUserId: "user-1",
    deadlineAt: 200,
    closedAt: null,
    closedByUserId: null,
    reviewStartedAt: null,
    releasedAt: null,
    releasedByUserId: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    metadata: { workflow: "UNKNOWN_WORKFLOW" },
    ...overrides,
  };
}

const fixtures = [
  {
    name: "Teacher OPEN 0/0 non-respondent accepted",
    expected: true,
    cycle: baseCycle({
      responseWindowDays: 0,
      minimumResponses: 0,
      approvedAt: null,
      approvedByUserId: null,
      deadlineAt: null,
      metadata: {
        workflow: "TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
        respondentWorkflow: false,
        participantSelection: "NONE",
      },
    }),
  },
  {
    name: "Teacher wrong minimum rejected",
    expected: false,
    cycle: baseCycle({
      responseWindowDays: 0,
      minimumResponses: 1,
      approvedAt: null,
      approvedByUserId: null,
      deadlineAt: null,
      metadata: {
        workflow: "TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
        respondentWorkflow: false,
        participantSelection: "NONE",
      },
    }),
  },
  {
    name: "Teacher RELEASED without releasedBy accepted",
    expected: true,
    cycle: baseCycle({
      status: "RELEASED",
      responseWindowDays: 0,
      minimumResponses: 0,
      approvedAt: null,
      approvedByUserId: null,
      deadlineAt: null,
      closedAt: 150,
      closedByUserId: "director-1",
      reviewStartedAt: 160,
      releasedAt: 170,
      releasedByUserId: null,
      metadata: {
        workflow: "TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
        respondentWorkflow: false,
        participantSelection: "NONE",
      },
    }),
  },
  {
    name: "Headteacher OPEN approval/deadline accepted",
    expected: true,
    cycle: baseCycle({
      minimumResponses: 5,
      metadata: { workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK" },
    }),
  },
  {
    name: "Headteacher system CLOSED without closedBy accepted",
    expected: true,
    cycle: baseCycle({
      status: "CLOSED",
      minimumResponses: 5,
      closedAt: 220,
      closedByUserId: null,
      metadata: { workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK" },
    }),
  },
  {
    name: "Director OPEN without approval accepted",
    expected: true,
    cycle: baseCycle({
      targetTenantId: null,
      targetZoneId: "district-1",
      minimumResponses: 5,
      approvedAt: null,
      approvedByUserId: null,
      metadata: { workflow: "DIRECTOR_CONFIDENTIAL_HEADTEACHER_FEEDBACK" },
    }),
  },
  {
    name: "Director system CLOSED without closedBy accepted",
    expected: true,
    cycle: baseCycle({
      status: "CLOSED",
      targetTenantId: null,
      targetZoneId: "district-1",
      minimumResponses: 5,
      approvedAt: null,
      approvedByUserId: null,
      closedAt: 220,
      closedByUserId: null,
      metadata: { workflow: "DIRECTOR_CONFIDENTIAL_HEADTEACHER_FEEDBACK" },
    }),
  },
  {
    name: "Unknown OPEN missing approval rejected",
    expected: false,
    cycle: baseCycle({ approvedAt: null, approvedByUserId: null }),
  },
  {
    name: "Cancellation short reason rejected",
    expected: false,
    cycle: baseCycle({
      status: "CANCELLED",
      openedAt: null,
      openedByUserId: null,
      approvedAt: null,
      approvedByUserId: null,
      deadlineAt: null,
      cancelledAt: 100,
      cancelledByUserId: "user-1",
      cancellationReason: "too short",
    }),
  },
  {
    name: "Deadline not after opening rejected",
    expected: false,
    cycle: baseCycle({ openedAt: 100, deadlineAt: 100 }),
  },
  {
    name: "Negative extension count rejected",
    expected: false,
    cycle: baseCycle({ extensionCount: -1 }),
  },
  {
    name: "Missing target context rejected",
    expected: false,
    cycle: baseCycle({
      targetTenantId: null,
      targetZoneId: null,
      targetGovernanceAssignmentId: null,
    }),
  },
];

for (const fixture of fixtures) {
  const actual = statusShapeValid(fixture.cycle);
  assert(actual === fixture.expected, "Behavioral fixture mismatch", {
    name: fixture.name,
    expected: fixture.expected,
    actual,
  });
}

console.log("=== N7-P2C3AD APPRAISAL CYCLE WORKFLOW CONSTRAINT SOURCE QA ===");
console.log("Constraint ownership          : six production checks source-controlled");
console.log("Production drift policy       : fail closed on unexpected same-name definitions");
console.log("Constraint deparse policy     : pg_get_constraintdef(c.oid, true) for all six");
console.log("Fresh/UAT path                : supported");
console.log("Teacher supervisory lifecycle : OPEN 0/0, no approval/deadline");
console.log("Headteacher respondent flow   : approval/open/deadline preserved");
console.log("Director respondent flow      : direct OPEN + deadline preserved");
console.log("System closure actor          : nullable where current writers prove it");
console.log("Teacher release actor column  : not required by cycle CHECK");
console.log("Director release actor column : preserved");
console.log("Unknown workflow policy       : legacy strict shape");
console.log("Extra chronology rules        : forbidden");
console.log("Business-row mutation         : forbidden");
console.log("Database accessed             : false");
console.log("RESULT: N7-P2C3AD APPRAISAL CYCLE WORKFLOW CONSTRAINT SOURCE QA GREEN");
