#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads TypeScript source through a local transpile hook. */

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
    const formatted = ts.formatDiagnosticsWithColorAndContext(
      diagnostics,
      {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => repoRoot,
        getNewLine: () => "\n",
      },
    );

    fail(`TypeScript transpilation diagnostics in ${filename}`, formatted);
  }

  module._compile(transpiled.outputText, filename);
};

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

async function main() {
  const modulePath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "headteacherFeedback.ts",
  );

  assert(
    fs.existsSync(modulePath),
    "D3_4C1_HEADTEACHER_FEEDBACK_FILE_MISSING",
  );

  const source = fs.readFileSync(modulePath, "utf8");
  const indexPath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "index.ts",
  );
  const indexSource = fs.readFileSync(indexPath, "utf8");
  const contract = require(modulePath);

  const {
    HEADTEACHER_FEEDBACK_POLICY,
    ACTIVE_HEADTEACHER_FEEDBACK_CYCLE_STATUSES,
    assertHeadteacherFeedbackInstrumentReady,
    assertHeadteacherFeedbackRequestAuthority,
    assertHeadteacherFeedbackApprovalAuthority,
    assertHeadteacherFeedbackDirectOpenAuthority,
    assertActiveHeadteacherFeedbackTarget,
    resolveEligibleHeadteacherFeedbackTeachers,
    headteacherFeedbackDeadline,
    isActiveHeadteacherFeedbackCycleStatus,
    assertHeadteacherFeedbackPendingCycleHasNoParticipants,
    headteacherFeedbackParticipantsFreezeOnTransition,
  } = contract;

  const requiredExports = {
    HEADTEACHER_FEEDBACK_POLICY,
    ACTIVE_HEADTEACHER_FEEDBACK_CYCLE_STATUSES,
    assertHeadteacherFeedbackInstrumentReady,
    assertHeadteacherFeedbackRequestAuthority,
    assertHeadteacherFeedbackApprovalAuthority,
    assertHeadteacherFeedbackDirectOpenAuthority,
    assertActiveHeadteacherFeedbackTarget,
    resolveEligibleHeadteacherFeedbackTeachers,
    headteacherFeedbackDeadline,
    isActiveHeadteacherFeedbackCycleStatus,
    assertHeadteacherFeedbackPendingCycleHasNoParticipants,
    headteacherFeedbackParticipantsFreezeOnTransition,
  };

  const missingExports = Object.entries(requiredExports)
    .filter(([, value]) => value == null)
    .map(([name]) => name);

  assertDeepEqual(
    missingExports,
    [],
    "D3_4C1_REQUIRED_EXPORTS_MISSING",
  );

  assertEqual(
    HEADTEACHER_FEEDBACK_POLICY.workflow,
    "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
    "Workflow contract",
  );
  assertEqual(
    HEADTEACHER_FEEDBACK_POLICY.instrumentCode,
    "HEADTEACHER_STAFF_FEEDBACK_V1",
    "Instrument code",
  );
  assertEqual(
    HEADTEACHER_FEEDBACK_POLICY.instrumentVersion,
    1,
    "Instrument version",
  );
  assertEqual(
    HEADTEACHER_FEEDBACK_POLICY.responseWindowDays,
    7,
    "Seven-calendar-day window",
  );
  assertEqual(
    HEADTEACHER_FEEDBACK_POLICY.minimumFinalizedResponses,
    1,
    "One finalized response minimum",
  );
  assertEqual(
    HEADTEACHER_FEEDBACK_POLICY.commentsAllowed,
    false,
    "Comments prohibited",
  );
  assertEqual(
    HEADTEACHER_FEEDBACK_POLICY.participantFreezeStatus,
    "OPEN",
    "Participants freeze only at opening",
  );

  const instrument = assertHeadteacherFeedbackInstrumentReady();
  assertEqual(instrument.expectedSectionCount, 4, "Instrument sections");
  assertEqual(instrument.expectedRawMaximum, 170, "Instrument maximum");
  assertEqual(instrument.allowNotApplicable, true, "N/A support");

  const ownRequest = assertHeadteacherFeedbackRequestAuthority({
    actorUserId: "headteacher-user",
    actorRoleName: "HEADTEACHER",
    targetHeadteacherUserId: "headteacher-user",
  });

  assertDeepEqual(
    ownRequest,
    {
      actorUserId: "headteacher-user",
      actorRole: "HEADTEACHER",
      targetHeadteacherUserId: "headteacher-user",
    },
    "Headteacher own-request contract",
  );

  await expectFailure(
    () =>
      assertHeadteacherFeedbackRequestAuthority({
        actorUserId: "headteacher-user",
        actorRoleName: "HEADTEACHER",
        targetHeadteacherUserId: "another-headteacher",
      }),
    "HEADTEACHER_FEEDBACK_OWN_REQUEST_ONLY",
  );

  await expectFailure(
    () =>
      assertHeadteacherFeedbackRequestAuthority({
        actorUserId: "teacher-user",
        actorRoleName: "TEACHER",
        targetHeadteacherUserId: "teacher-user",
      }),
    "HEADTEACHER_FEEDBACK_REQUEST_HEADTEACHER_ONLY",
  );

  await expectFailure(
    () =>
      assertHeadteacherFeedbackRequestAuthority({
        actorUserId: "headteacher-user",
        actorRoleName: "HEADTEACHER",
        targetHeadteacherUserId: "headteacher-user",
        requestedRespondentUserIds: [],
      }),
    "HEADTEACHER_FEEDBACK_RESPONDENT_SELECTION_FORBIDDEN",
  );

  const districtScope = {
    isSuperAdmin: false,
    tenantIds: ["school-one", "school-two"],
  };

  const approved = assertHeadteacherFeedbackApprovalAuthority({
    actorUserId: "director-user",
    actorRoleName: "DISTRICT_DIRECTOR",
    targetHeadteacherUserId: "headteacher-user",
    targetTenantId: "school-one",
    governanceScope: districtScope,
  });

  assertEqual(approved.mode, "APPROVE", "Director approval mode");
  assertEqual(
    approved.targetTenantId,
    "school-one",
    "Director approval tenant scope",
  );

  const opened = assertHeadteacherFeedbackDirectOpenAuthority({
    actorUserId: "director-user",
    actorRoleName: "DISTRICT_DIRECTOR",
    targetHeadteacherUserId: "headteacher-user",
    targetTenantId: "school-one",
    governanceScope: districtScope,
  });

  assertEqual(opened.mode, "DIRECT_OPEN", "Director direct-open mode");

  const superadminOpen = assertHeadteacherFeedbackDirectOpenAuthority({
    actorUserId: "superadmin-user",
    actorRoleName: "SUPERADMIN",
    targetHeadteacherUserId: "headteacher-user",
    targetTenantId: "school-outside",
    governanceScope: {
      isSuperAdmin: true,
      tenantIds: [],
    },
  });

  assertEqual(
    superadminOpen.actorRole,
    "SUPERADMIN",
    "Superadmin controlled override",
  );

  await expectFailure(
    () =>
      assertHeadteacherFeedbackApprovalAuthority({
        actorUserId: "director-user",
        actorRoleName: "DISTRICT_DIRECTOR",
        targetHeadteacherUserId: "headteacher-user",
        targetTenantId: "school-outside",
        governanceScope: districtScope,
      }),
    "HEADTEACHER_FEEDBACK_TARGET_OUTSIDE_GOVERNANCE_SCOPE",
  );

  await expectFailure(
    () =>
      assertHeadteacherFeedbackDirectOpenAuthority({
        actorUserId: "teacher-user",
        actorRoleName: "TEACHER",
        targetHeadteacherUserId: "headteacher-user",
        targetTenantId: "school-one",
        governanceScope: districtScope,
      }),
    "HEADTEACHER_FEEDBACK_OPENER_ROLE_FORBIDDEN",
  );

  await expectFailure(
    () =>
      assertHeadteacherFeedbackApprovalAuthority({
        actorUserId: "headteacher-user",
        actorRoleName: "DISTRICT_DIRECTOR",
        targetHeadteacherUserId: "headteacher-user",
        targetTenantId: "school-one",
        governanceScope: districtScope,
      }),
    "HEADTEACHER_FEEDBACK_GOVERNANCE_SELF_ACTION_FORBIDDEN",
  );

  const target = {
    membershipId: "headteacher-membership",
    userId: "headteacher-user",
    tenantId: "school-one",
    membershipStatus: "ACTIVE",
    roleName: "HEADTEACHER",
    tenantStatus: "ACTIVE",
  };

  assertDeepEqual(
    assertActiveHeadteacherFeedbackTarget({
      target,
      expectedUserId: "headteacher-user",
      expectedTenantId: "school-one",
    }),
    {
      membershipId: "headteacher-membership",
      userId: "headteacher-user",
      tenantId: "school-one",
      roleName: "HEADTEACHER",
      membershipStatus: "ACTIVE",
      tenantStatus: "ACTIVE",
    },
    "Active target snapshot",
  );

  await expectFailure(
    () =>
      assertActiveHeadteacherFeedbackTarget({
        target: { ...target, membershipStatus: "INACTIVE" },
      }),
    "HEADTEACHER_FEEDBACK_TARGET_MEMBERSHIP_INACTIVE",
  );

  await expectFailure(
    () =>
      assertActiveHeadteacherFeedbackTarget({
        target: { ...target, tenantStatus: "SUSPENDED" },
      }),
    "HEADTEACHER_FEEDBACK_TARGET_TENANT_INACTIVE",
  );

  await expectFailure(
    () =>
      assertActiveHeadteacherFeedbackTarget({
        target: { ...target, roleName: "TEACHER" },
      }),
    "HEADTEACHER_FEEDBACK_TARGET_NOT_HEADTEACHER",
  );

  const candidates = [
    {
      membershipId: "teacher-membership-b",
      userId: "teacher-b",
      tenantId: "school-one",
      membershipStatus: "ACTIVE",
      roleName: "TEACHER",
      tenantStatus: "ACTIVE",
    },
    {
      membershipId: "teacher-membership-a",
      userId: "teacher-a",
      tenantId: "school-one",
      membershipStatus: "ACTIVE",
      roleName: "TEACHER",
      tenantStatus: "ACTIVE",
    },
    {
      membershipId: "teacher-inactive",
      userId: "teacher-inactive",
      tenantId: "school-one",
      membershipStatus: "INACTIVE",
      roleName: "TEACHER",
      tenantStatus: "ACTIVE",
    },
    {
      membershipId: "teacher-cross-tenant",
      userId: "teacher-cross-tenant",
      tenantId: "school-two",
      membershipStatus: "ACTIVE",
      roleName: "TEACHER",
      tenantStatus: "ACTIVE",
    },
    {
      membershipId: "headteacher-membership",
      userId: "headteacher-user",
      tenantId: "school-one",
      membershipStatus: "ACTIVE",
      roleName: "HEADTEACHER",
      tenantStatus: "ACTIVE",
    },
    {
      membershipId: "governance-membership",
      userId: "sisso-user",
      tenantId: "school-one",
      membershipStatus: "ACTIVE",
      roleName: "SISSO",
      tenantStatus: "ACTIVE",
    },
  ];

  const participants = resolveEligibleHeadteacherFeedbackTeachers({
    targetHeadteacherUserId: "headteacher-user",
    targetTenantId: "school-one",
    candidates,
  });

  assertEqual(participants.length, 2, "Eligible teacher count");
  assertDeepEqual(
    participants.map((participant) => participant.respondentUserId),
    ["teacher-a", "teacher-b"],
    "Deterministic participant order",
  );

  for (const participant of participants) {
    assertEqual(
      participant.respondentTenantId,
      "school-one",
      "Exact target-tenant isolation",
    );
    assertEqual(
      participant.respondentRoleSnapshot,
      "TEACHER",
      "Teacher-only respondent role",
    );

    const serialized = JSON.stringify(participant).toLowerCase();
    assert(!serialized.includes("name"), "Participant name must not be stored");
    assert(!serialized.includes("email"), "Participant email must not be stored");
    assert(!serialized.includes("phone"), "Participant phone must not be stored");
  }

  await expectFailure(
    () =>
      resolveEligibleHeadteacherFeedbackTeachers({
        targetHeadteacherUserId: "headteacher-user",
        targetTenantId: "school-one",
        candidates: [
          candidates[0],
          {
            ...candidates[0],
            membershipId: "duplicate-membership",
          },
        ],
      }),
    "HEADTEACHER_FEEDBACK_DUPLICATE_ELIGIBLE_TEACHER",
  );

  await expectFailure(
    () =>
      resolveEligibleHeadteacherFeedbackTeachers({
        targetHeadteacherUserId: "headteacher-user",
        targetTenantId: "school-one",
        candidates: candidates.filter(
          (candidate) => candidate.userId !== "teacher-a" && candidate.userId !== "teacher-b",
        ),
      }),
    "HEADTEACHER_FEEDBACK_NO_ELIGIBLE_TEACHERS",
  );

  const openedAt = new Date("2026-07-27T10:30:00.000Z");
  assertEqual(
    headteacherFeedbackDeadline(openedAt).toISOString(),
    "2026-08-03T10:30:00.000Z",
    "Exact seven-calendar-day deadline",
  );

  assertDeepEqual(
    [...ACTIVE_HEADTEACHER_FEEDBACK_CYCLE_STATUSES],
    ["DRAFT", "PENDING_APPROVAL", "OPEN", "CLOSED", "UNDER_REVIEW"],
    "Active-cycle conflict states",
  );
  assertEqual(
    isActiveHeadteacherFeedbackCycleStatus("OPEN"),
    true,
    "Open cycle is active",
  );
  assertEqual(
    isActiveHeadteacherFeedbackCycleStatus("RELEASED"),
    false,
    "Released cycle is terminal",
  );

  assertEqual(
    assertHeadteacherFeedbackPendingCycleHasNoParticipants({
      status: "PENDING_APPROVAL",
      participantCount: 0,
    }),
    true,
    "Pending cycle remains participant-free",
  );

  await expectFailure(
    () =>
      assertHeadteacherFeedbackPendingCycleHasNoParticipants({
        status: "PENDING_APPROVAL",
        participantCount: 1,
      }),
    "HEADTEACHER_FEEDBACK_PARTICIPANTS_FROZEN_BEFORE_OPEN",
  );

  assertEqual(
    headteacherFeedbackParticipantsFreezeOnTransition({
      from: "PENDING_APPROVAL",
      to: "OPEN",
    }),
    true,
    "Approval freezes participants",
  );
  assertEqual(
    headteacherFeedbackParticipantsFreezeOnTransition({
      from: "DRAFT",
      to: "OPEN",
    }),
    true,
    "Direct-open freezes participants",
  );
  assertEqual(
    headteacherFeedbackParticipantsFreezeOnTransition({
      from: "DRAFT",
      to: "PENDING_APPROVAL",
    }),
    false,
    "Request does not freeze participants",
  );

  assert(
    indexSource.includes('export * from "./headteacherFeedback";'),
    "D3.4C1 barrel export missing",
  );

  assert(
    !source.includes("@/lib/prisma"),
    "D3.4C1 contract must not access Prisma",
  );
  assert(
    !source.includes("appraisalNotification"),
    "D3.4C1 contract must not create notifications",
  );
  assert(
    !source.includes("sendSms") && !source.includes("sendEmail"),
    "D3.4C1 contract must not call providers",
  );

  console.log("");
  console.log("=== D3.4C1 HEADTEACHER FEEDBACK LIFECYCLE CONTRACT ===");
  console.log("");
  console.log("Workflow                       : HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK");
  console.log("Published instrument           : HEADTEACHER_STAFF_FEEDBACK_V1");
  console.log("Response window                : 7 calendar days");
  console.log("Minimum finalized responses    : 1");
  console.log("Headteacher own request        : verified");
  console.log("Other-target request           : forbidden");
  console.log("Teacher request/open           : forbidden");
  console.log("Director approve/direct-open   : verified within district scope");
  console.log("Outside-district target        : forbidden");
  console.log("Participant selection          : system-resolved only");
  console.log("Eligible respondents           : active same-school teachers only");
  console.log("Inactive/cross-tenant users    : excluded");
  console.log("Duplicate eligible teacher     : fails closed");
  console.log("Participant freeze             : OPEN only");
  console.log("Pending-cycle participants     : 0");
  console.log("Database accessed              : false");
  console.log("Notifications/providers        : absent");
  console.log("");
  console.log("RESULT: D3.4C1 HEADTEACHER FEEDBACK CONTRACT GREEN");
}

main().catch((error) => {
  console.error("");
  console.error("RESULT: D3.4C1 HEADTEACHER FEEDBACK CONTRACT FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
