// src/lib/appraisals/headteacherSupervisoryAssessmentQueue.ts
import { prisma } from "@/lib/prisma";
import { HEADTEACHER_FEEDBACK_POLICY } from "@/lib/appraisals/headteacherFeedback";
import {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalHeadteacherSupervisoryAssessorRole,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import {
  HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY,
  HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY,
} from "@/lib/appraisals/headteacherSupervisoryDirectorDirectRelease";
import type { GovernanceScope } from "@/lib/governance/scope";

export const HEADTEACHER_SUPERVISORY_QUEUE_POLICY = {
  schemaVersion: 3,
  workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
  parentInstrumentCode: HEADTEACHER_FEEDBACK_POLICY.instrumentCode,
  parentInstrumentVersion: HEADTEACHER_FEEDBACK_POLICY.instrumentVersion,
  directorGovernanceCarrierKind: "DIRECTOR_GOVERNANCE_ONLY",
  officerGovernanceCarrierKind: "OFFICER_GOVERNANCE_ONLY",
  officerGovernanceRoles: [
    "SISSO",
    "BASIC_SCHOOL_COORDINATOR",
    "HEAD_OF_SUPERVISION",
  ] as const,
  directorGovernanceInstrumentCode:
    HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode,
  directorGovernanceInstrumentVersion:
    HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion,
  directorGovernanceCarrierVisibleToDirectorOnly: true,
  visibleCycleStatuses: ["OPEN", "CLOSED", "UNDER_REVIEW", "RELEASED"] as const,
  actorAssessmentOnly: true,
  tenantScopeRequired: true,
  stableHierarchyIdentifiersRequired: true,
  headteacherResolvedFromApprovedCycle: true,
  respondentIdentitiesReturned: false,
  individualStaffResponsesReturned: false,
  backgroundPollingAllowed: false,
} as const;

type QueueCycleStatus =
  (typeof HEADTEACHER_SUPERVISORY_QUEUE_POLICY.visibleCycleStatuses)[number];

export type HeadteacherSupervisoryQueueState =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "RETURNED"
  | "READ_ONLY";

export type HeadteacherSupervisorySelectionMode =
  | "ASSIGNED_CIRCUIT_SCHOOLS"
  | "DISTRICT_CIRCUIT_SCHOOLS";

export type HeadteacherSupervisoryQueueCircuit = {
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  schoolCount: number;
  appraisalCount: number;
};

export type HeadteacherSupervisoryQueueItem = {
  cycleId: string;
  cycleStatus: QueueCycleStatus;
  targetUserId: string;
  targetName: string | null;
  schoolId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  staffFeedbackLabel: string;
  supervisory: {
    state: HeadteacherSupervisoryQueueState;
    label: string;
    assessmentId: string | null;
    revision: number | null;
    dateObserved: string | null;
    answeredItems: number;
    totalItems: number;
    completionPercentage: number;
    overallPercentage: number | null;
  };
  action: {
    label: string;
    url: string | null;
    enabled: boolean;
  };
  release: {
    canDirectRelease: boolean;
    releasedToHeadteacher: boolean;
  };
};

export type HeadteacherSupervisoryDirectTarget = {
  targetUserId: string;
  targetName: string | null;
  schoolId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
};

export type HeadteacherSupervisoryQueue = {
  actorRole: string;
  officeLabel: string;
  selection: {
    mode: HeadteacherSupervisorySelectionMode;
    requiresCircuitSelection: boolean;
    requiresSchoolSelection: true;
    assignedCircuitId: string | null;
    assignedCircuitName: string | null;
  };
  summary: {
    circuits: number;
    schools: number;
    appraisals: number;
    notStarted: number;
    inProgress: number;
    returned: number;
    submitted: number;
    readOnly: number;
  };
  circuits: HeadteacherSupervisoryQueueCircuit[];
  items: HeadteacherSupervisoryQueueItem[];
  directTargets: HeadteacherSupervisoryDirectTarget[];
  noBackgroundPolling: true;
  respondentIdentitiesIncluded: false;
  individualStaffResponsesIncluded: false;
};

type ReadHeadteacherSupervisoryQueueInput = {
  actorUserId: string;
  actorRoleName: unknown;
  governanceScope: GovernanceScope;
};

type ScopeAssignment = GovernanceScope["assignments"][number];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function isoDateOnly(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function directorDirectReleasePresentation(input: {
  actorRole: string;
  cycleId: string;
  cycleMetadata: unknown;
  directorGovernanceCarrierValid: boolean;
  assessment:
    | {
        id: string;
        status: string;
        revision: number;
      }
    | null;
}) {
  const policy = HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY;
  const assessment = input.assessment;
  const eligible =
    input.actorRole === policy.requiredActorRole &&
    input.directorGovernanceCarrierValid &&
    assessment != null &&
    normalized(assessment.status) === policy.requiredAssessmentStatus &&
    assessment.revision === policy.requiredAssessmentRevision;

  if (!eligible || !assessment) {
    return {
      canDirectRelease: false,
      releasedToHeadteacher: false,
    };
  }

  const releaseMap = objectValue(
    objectValue(input.cycleMetadata)[HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY],
  );
  const release = objectValue(releaseMap[assessment.id]);

  if (Object.keys(release).length === 0) {
    return {
      canDirectRelease: true,
      releasedToHeadteacher: false,
    };
  }

  const releasedAt = clean(release.releasedAt);
  const releasedDate = new Date(releasedAt);
  const releaseProofHash = clean(release.releaseProofHash).toLowerCase();
  const releasedToHeadteacher =
    Number(release.proofSchemaVersion) === policy.proofSchemaVersion &&
    clean(release.releaseMode) === policy.releaseMode &&
    clean(release.workflow) === policy.workflow &&
    clean(release.evidenceStream) === policy.evidenceStream &&
    clean(release.cycleId) === input.cycleId &&
    clean(release.assessmentId) === assessment.id &&
    Number(release.assessmentRevision) === policy.requiredAssessmentRevision &&
    normalized(release.assessmentStatus) === policy.requiredAssessmentStatus &&
    normalized(release.assessorRole) === policy.requiredAssessorRole &&
    normalized(release.releaserRole) === policy.requiredActorRole &&
    release.staffFeedbackRequired === false &&
    release.staffFeedbackAccessed === false &&
    release.respondentIdentitiesAccessed === false &&
    release.individualStaffResponsesAccessed === false &&
    release.separateEvidenceStreams === true &&
    release.combinedWeightingDefined === false &&
    release.providerCalled === false &&
    releasedAt.length > 0 &&
    !Number.isNaN(releasedDate.getTime()) &&
    /^[a-f0-9]{64}$/.test(releaseProofHash);

  return {
    canDirectRelease: false,
    releasedToHeadteacher,
  };
}

function officeLabel(role: string) {
  switch (role) {
    case "SISSO":
      return "SISSO";
    case "HEAD_OF_SUPERVISION":
      return "Head of Supervision";
    case "BASIC_SCHOOL_COORDINATOR":
      return "Basic School Coordinator";
    case "DISTRICT_DIRECTOR":
      return "District Director";
    default:
      return clean(role)
        .toLowerCase()
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function displayName(user: {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  return (
    clean(user.name) ||
    [clean(user.firstName), clean(user.lastName)].filter(Boolean).join(" ") ||
    null
  );
}

function canonicalAssignmentRole(assignment: ScopeAssignment) {
  return canonicalHeadteacherSupervisoryAssessorRole(assignment.role);
}

function circuitAssignments(
  actorRole: string,
  assignments: readonly ScopeAssignment[],
) {
  if (actorRole !== "SISSO") return [];

  const unique = new Map<string, ScopeAssignment>();

  for (const assignment of assignments) {
    if (
      canonicalAssignmentRole(assignment) !== "SISSO" ||
      assignment.zoneLevel !==
        HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel
    ) {
      continue;
    }

    unique.set(assignment.zoneId, assignment);
  }

  return [...unique.values()].sort((left, right) =>
    left.zoneName.localeCompare(right.zoneName),
  );
}

function selectionContract(input: {
  actorRole: string;
  assignments: readonly ScopeAssignment[];
}) {
  const assignedCircuits = circuitAssignments(
    input.actorRole,
    input.assignments,
  );
  const assignedCircuit =
    assignedCircuits.length === 1 ? assignedCircuits[0] : null;
  const circuitScoped = input.actorRole === "SISSO";

  return {
    mode: circuitScoped
      ? ("ASSIGNED_CIRCUIT_SCHOOLS" as const)
      : ("DISTRICT_CIRCUIT_SCHOOLS" as const),
    requiresCircuitSelection:
      !circuitScoped || assignedCircuits.length !== 1,
    requiresSchoolSelection: true as const,
    assignedCircuitId: assignedCircuit?.zoneId ?? null,
    assignedCircuitName: assignedCircuit?.zoneName ?? null,
  };
}

function officerGovernanceActorRole(role: string) {
  return HEADTEACHER_SUPERVISORY_QUEUE_POLICY.officerGovernanceRoles.includes(
    role as (typeof HEADTEACHER_SUPERVISORY_QUEUE_POLICY.officerGovernanceRoles)[number],
  );
}

function actorAssignmentCoversTarget(input: {
  actorRole: string;
  assignments: readonly ScopeAssignment[];
  circuitId: string;
  districtId: string;
}) {
  const expectedLevel =
    input.actorRole === "SISSO"
      ? HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel
      : HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel;
  const expectedZoneId =
    input.actorRole === "SISSO" ? input.circuitId : input.districtId;

  return input.assignments.some(
    (assignment) =>
      canonicalAssignmentRole(assignment) === input.actorRole &&
      assignment.zoneLevel === expectedLevel &&
      clean(assignment.zoneId) === expectedZoneId &&
      clean(assignment.id).length > 0,
  );
}

function officerReleaseRecorded(input: {
  cycleMetadata: unknown;
  assessment:
    | {
        id: string;
        status: string;
      }
    | null;
}) {
  if (!input.assessment) return false;

  const releases = objectValue(
    objectValue(input.cycleMetadata).headteacherSupervisoryReleases,
  );
  const release = objectValue(releases[input.assessment.id]);

  return Boolean(
    normalized(input.assessment.status) === "FINALIZED" &&
      clean(release.releaseMode) === "DIRECTOR_REVIEWED_GOVERNANCE_RELEASE" &&
      clean(release.workflow) ===
        HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow &&
      clean(release.evidenceStream) ===
        "GOVERNANCE_SUPERVISORY_ASSESSMENT" &&
      clean(release.assessmentId) === input.assessment.id &&
      release.staffFeedbackRequired === false &&
      release.staffFeedbackAccessed === false &&
      release.carrierCycleStatusMutationPerformed === false &&
      /^[a-f0-9]{64}$/i.test(clean(release.releaseProofHash)),
  );
}

function staffFeedbackLabel(input: {
  cycleStatus: string;
  aggregateReady: boolean;
}) {
  if (input.aggregateReady) return "Confidential staff feedback ready";

  switch (input.cycleStatus) {
    case "OPEN":
      return "Confidential staff feedback in progress";
    case "CLOSED":
      return "Confidential staff feedback is being prepared";
    case "UNDER_REVIEW":
      return "Evidence is under Director review";
    case "RELEASED":
      return "Released appraisal";
    default:
      return "Confidential staff feedback unavailable";
  }
}

function completionPercentage(answeredItems: number) {
  return Math.round(
    (answeredItems /
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedItemCount) *
      100,
  );
}

function supervisoryView(input: {
  cycleId: string;
  cycleStatus: string;
  assessment:
    | {
        id: string;
        status: string;
        revision: number;
        dateObserved: Date | null;
        overallPercentage: number | null;
        scores: Array<{ score: number | null; notApplicable: boolean }>;
      }
    | null;
}) {
  const assessment = input.assessment;

  if (!assessment) {
    const canStart =
      input.cycleStatus === "OPEN" || input.cycleStatus === "CLOSED";

    return {
      supervisory: {
        state: "NOT_STARTED" as const,
        label: canStart
          ? "Supervisory assessment not started"
          : "No supervisory assessment is available",
        assessmentId: null,
        revision: null,
        dateObserved: null,
        answeredItems: 0,
        totalItems:
          HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedItemCount,
        completionPercentage: 0,
        overallPercentage: null,
      },
      action: {
        label: canStart ? "Start supervisory assessment" : "Unavailable",
        url: canStart
          ? `/governance/appraisals/headteacher-supervisory?cycleId=${encodeURIComponent(
              input.cycleId,
            )}`
          : null,
        enabled: canStart,
      },
    };
  }

  const answeredItems = assessment.scores.filter(
    (row) => row.score != null || row.notApplicable,
  ).length;
  const status = normalized(assessment.status);

  if (status === "DRAFT") {
    return {
      supervisory: {
        state: "IN_PROGRESS" as const,
        label: `In progress - ${answeredItems} of ${HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedItemCount} indicators saved`,
        assessmentId: assessment.id,
        revision: assessment.revision,
        dateObserved: isoDateOnly(assessment.dateObserved),
        answeredItems,
        totalItems:
          HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedItemCount,
        completionPercentage: completionPercentage(answeredItems),
        overallPercentage: null,
      },
      action: {
        label: "Continue assessment",
        url: `/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(
          assessment.id,
        )}`,
        enabled: true,
      },
    };
  }

  if (status === "FINALIZED") {
    return {
      supervisory: {
        state: "SUBMITTED" as const,
        label: "Submitted and locked for review",
        assessmentId: assessment.id,
        revision: assessment.revision,
        dateObserved: isoDateOnly(assessment.dateObserved),
        answeredItems,
        totalItems:
          HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedItemCount,
        completionPercentage: completionPercentage(answeredItems),
        overallPercentage: assessment.overallPercentage,
      },
      action: {
        label: "View submitted assessment",
        url: `/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(
          assessment.id,
        )}`,
        enabled: true,
      },
    };
  }

  if (status === "RETURNED") {
    return {
      supervisory: {
        state: "RETURNED" as const,
        label: "Returned for clarification",
        assessmentId: assessment.id,
        revision: assessment.revision,
        dateObserved: isoDateOnly(assessment.dateObserved),
        answeredItems,
        totalItems:
          HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedItemCount,
        completionPercentage: completionPercentage(answeredItems),
        overallPercentage: assessment.overallPercentage,
      },
      action: {
        label: "Open returned assessment",
        url: `/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(
          assessment.id,
        )}`,
        enabled: true,
      },
    };
  }

  return {
    supervisory: {
      state: "READ_ONLY" as const,
      label: "Historical assessment",
      assessmentId: assessment.id,
      revision: assessment.revision,
      dateObserved: isoDateOnly(assessment.dateObserved),
      answeredItems,
      totalItems:
        HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedItemCount,
      completionPercentage: completionPercentage(answeredItems),
      overallPercentage: assessment.overallPercentage,
    },
    action: {
      label: "View assessment",
      url: `/governance/appraisals/headteacher-supervisory?assessmentId=${encodeURIComponent(
        assessment.id,
      )}`,
      enabled: true,
    },
  };
}

function emptySummary() {
  return {
    circuits: 0,
    schools: 0,
    appraisals: 0,
    notStarted: 0,
    inProgress: 0,
    returned: 0,
    submitted: 0,
    readOnly: 0,
  };
}

function buildSummary(items: readonly HeadteacherSupervisoryQueueItem[]) {
  const summary = emptySummary();
  summary.circuits = new Set(items.map((item) => item.circuitId)).size;
  summary.schools = new Set(items.map((item) => item.schoolId)).size;
  summary.appraisals = items.length;

  for (const item of items) {
    switch (item.supervisory.state) {
      case "NOT_STARTED":
        summary.notStarted += 1;
        break;
      case "IN_PROGRESS":
        summary.inProgress += 1;
        break;
      case "RETURNED":
        summary.returned += 1;
        break;
      case "SUBMITTED":
        summary.submitted += 1;
        break;
      case "READ_ONLY":
        summary.readOnly += 1;
        break;
    }
  }

  return summary;
}

function buildCircuits(
  items: readonly HeadteacherSupervisoryQueueItem[],
): HeadteacherSupervisoryQueueCircuit[] {
  const circuits = new Map<
    string,
    {
      circuitId: string;
      circuitName: string;
      districtId: string;
      districtName: string;
      schoolIds: Set<string>;
      appraisalCount: number;
    }
  >();

  for (const item of items) {
    const current = circuits.get(item.circuitId) ?? {
      circuitId: item.circuitId,
      circuitName: item.circuitName,
      districtId: item.districtId,
      districtName: item.districtName,
      schoolIds: new Set<string>(),
      appraisalCount: 0,
    };

    current.schoolIds.add(item.schoolId);
    current.appraisalCount += 1;
    circuits.set(item.circuitId, current);
  }

  return [...circuits.values()]
    .map((circuit) => ({
      circuitId: circuit.circuitId,
      circuitName: circuit.circuitName,
      districtId: circuit.districtId,
      districtName: circuit.districtName,
      schoolCount: circuit.schoolIds.size,
      appraisalCount: circuit.appraisalCount,
    }))
    .sort((left, right) =>
      left.circuitName.localeCompare(right.circuitName),
    );
}

export async function readHeadteacherSupervisoryAssessmentQueue(
  input: ReadHeadteacherSupervisoryQueueInput,
): Promise<HeadteacherSupervisoryQueue> {
  const actorUserId = clean(input.actorUserId);
  const actorRole = canonicalHeadteacherSupervisoryAssessorRole(
    input.actorRoleName,
  );
  const selection = selectionContract({
    actorRole,
    assignments: input.governanceScope.assignments,
  });
  const tenantIds = [
    ...new Set(input.governanceScope.tenantIds.map(clean)),
  ].filter(Boolean);
  const scopedZoneIds = new Set(
    input.governanceScope.zoneIds.map(clean).filter(Boolean),
  );

  const emptyQueue = (): HeadteacherSupervisoryQueue => ({
    actorRole,
    officeLabel: officeLabel(actorRole),
    selection,
    summary: emptySummary(),
    circuits: [],
    items: [],
    directTargets: [],
    noBackgroundPolling: true,
    respondentIdentitiesIncluded: false,
    individualStaffResponsesIncluded: false,
  });

  if (!actorUserId || !tenantIds.length) {
    return emptyQueue();
  }

  const cycles = await prisma.appraisalCycle.findMany({
    where: {
      targetTenantId: { in: tenantIds },
      targetRoleSnapshot: HEADTEACHER_FEEDBACK_POLICY.targetRole,
      status: {
        in: [...HEADTEACHER_SUPERVISORY_QUEUE_POLICY.visibleCycleStatuses],
      },
      cancelledAt: null,
    },
    select: {
      id: true,
      status: true,
      targetUserId: true,
      targetTenantId: true,
      targetZoneId: true,
      scopeZoneId: true,
      targetNameSnapshot: true,
      targetSchoolNameSnapshot: true,
      targetZoneNameSnapshot: true,
      openedAt: true,
      deadlineAt: true,
      responseWindowDays: true,
      minimumResponses: true,
      requestedByUserId: true,
      closedAt: true,
      reviewStartedAt: true,
      releasedAt: true,
      metadata: true,
      _count: {
        select: {
          participants: true,
        },
      },
      scopeZone: {
        select: {
          id: true,
          name: true,
        },
      },
      targetZone: {
        select: {
          id: true,
          name: true,
        },
      },
      instrumentVersion: {
        select: {
          version: true,
          status: true,
          instrument: {
            select: {
              code: true,
              purpose: true,
              subjectType: true,
              isActive: true,
            },
          },
        },
      },
      aggregates: {
        where: { version: 1 },
        orderBy: { generatedAt: "desc" },
        take: 1,
        select: { id: true },
      },
      assessments: {
        where: { assessorUserId: actorUserId },
        orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          status: true,
          revision: true,
          dateObserved: true,
          overallPercentage: true,
          scores: {
            select: {
              score: true,
              notApplicable: true,
            },
          },
        },
      },
    },
    orderBy: [{ openedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  const tenantIdSet = new Set(tenantIds);

  // The database query already returns newest cycles first.
  // Preserve that server-derived order for submitted work without exposing
  // exact timestamps in the browser payload.
  const cycleRecencyRank = new Map(
    cycles.map((cycle, index) => [cycle.id, index] as const),
  );

  const items: HeadteacherSupervisoryQueueItem[] = cycles.flatMap(
    (cycle) => {
      const metadata = objectValue(cycle.metadata);
      const instrument = cycle.instrumentVersion.instrument;
      const cycleStatus = normalized(cycle.status) as QueueCycleStatus;
      const targetUserId = clean(cycle.targetUserId);
      const schoolId = clean(cycle.targetTenantId);
      const circuitId =
        clean(cycle.targetZoneId) || clean(cycle.targetZone?.id);
      const districtId =
        clean(cycle.scopeZoneId) || clean(cycle.scopeZone.id);
      const schoolName =
        clean(cycle.targetSchoolNameSnapshot) || "Headteacher school";
      const circuitName =
        clean(cycle.targetZoneNameSnapshot) ||
        clean(cycle.targetZone?.name);
      const districtName = clean(cycle.scopeZone.name);

      const staffCarrierValid =
        clean(metadata.workflow) === HEADTEACHER_FEEDBACK_POLICY.workflow &&
        cycle.instrumentVersion.version ===
          HEADTEACHER_FEEDBACK_POLICY.instrumentVersion &&
        normalized(cycle.instrumentVersion.status) === "ACTIVE" &&
        instrument.code === HEADTEACHER_FEEDBACK_POLICY.instrumentCode &&
        instrument.purpose === "HEADTEACHER_STAFF_FEEDBACK" &&
        instrument.subjectType === "HEADTEACHER" &&
        instrument.isActive === true;

      const directorGovernanceCarrierValid =
        actorRole === "DISTRICT_DIRECTOR" &&
        clean(metadata.workflow) ===
          HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow &&
        clean(metadata.evidenceStream) ===
          "GOVERNANCE_SUPERVISORY_ASSESSMENT" &&
        clean(metadata.carrierKind) ===
          HEADTEACHER_SUPERVISORY_QUEUE_POLICY.directorGovernanceCarrierKind &&
        cycle.instrumentVersion.version ===
          HEADTEACHER_SUPERVISORY_QUEUE_POLICY.directorGovernanceInstrumentVersion &&
        normalized(cycle.instrumentVersion.status) === "ACTIVE" &&
        instrument.code ===
          HEADTEACHER_SUPERVISORY_QUEUE_POLICY.directorGovernanceInstrumentCode &&
        instrument.purpose === "HEADTEACHER_SUPERVISORY_ASSESSMENT" &&
        instrument.subjectType === "HEADTEACHER" &&
        instrument.isActive === true &&
        cycle.responseWindowDays === 0 &&
        cycle.minimumResponses === 0 &&
        cycle.deadlineAt === null &&
        cycle._count.participants === 0 &&
        metadata.respondentWorkflow === false &&
        clean(metadata.participantSelection) === "NONE" &&
        metadata.staffFeedbackRequired === false &&
        metadata.staffFeedbackAccessed === false &&
        metadata.separateFromStaffFeedback === true &&
        metadata.combinedWeightingDefined === false &&
        metadata.providerCalled === false;

      const officerGovernanceCarrierValid =
        officerGovernanceActorRole(actorRole) &&
        clean(metadata.workflow) ===
          HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow &&
        clean(metadata.evidenceStream) ===
          "GOVERNANCE_SUPERVISORY_ASSESSMENT" &&
        clean(metadata.carrierKind) ===
          HEADTEACHER_SUPERVISORY_QUEUE_POLICY.officerGovernanceCarrierKind &&
        clean(metadata.assessorUserId) === actorUserId &&
        canonicalHeadteacherSupervisoryAssessorRole(metadata.assessorRole) ===
          actorRole &&
        clean(metadata.assessorAssignmentId).length > 0 &&
        cycle.requestedByUserId === actorUserId &&
        cycle.instrumentVersion.version ===
          HEADTEACHER_SUPERVISORY_QUEUE_POLICY.directorGovernanceInstrumentVersion &&
        normalized(cycle.instrumentVersion.status) === "ACTIVE" &&
        instrument.code ===
          HEADTEACHER_SUPERVISORY_QUEUE_POLICY.directorGovernanceInstrumentCode &&
        instrument.purpose === "HEADTEACHER_SUPERVISORY_ASSESSMENT" &&
        instrument.subjectType === "HEADTEACHER" &&
        instrument.isActive === true &&
        cycle.responseWindowDays === 0 &&
        cycle.minimumResponses === 0 &&
        cycle.deadlineAt === null &&
        Boolean(cycle.openedAt) &&
        Boolean(cycle.closedAt) &&
        cycle._count.participants === 0 &&
        metadata.respondentWorkflow === false &&
        clean(metadata.participantSelection) === "NONE" &&
        metadata.closedWithoutRespondents === true &&
        metadata.staffFeedbackRequired === false &&
        metadata.staffFeedbackAccessed === false &&
        metadata.separateFromStaffFeedback === true &&
        metadata.combinedWeightingDefined === false &&
        metadata.providerCalled === false;

      const contractValid =
        staffCarrierValid ||
        directorGovernanceCarrierValid ||
        officerGovernanceCarrierValid;

      const hierarchyValid =
        Boolean(
          targetUserId &&
            schoolId &&
            circuitId &&
            circuitName &&
            districtId &&
            districtName,
        ) &&
        tenantIdSet.has(schoolId) &&
        (input.governanceScope.isSuperAdmin ||
          scopedZoneIds.has(circuitId) ||
          scopedZoneIds.has(districtId));

      if (!contractValid || !hierarchyValid) return [];

      if (
        actorRole === "SISSO" &&
        selection.assignedCircuitId &&
        circuitId !== selection.assignedCircuitId
      ) {
        return [];
      }

      const assessment =
        cycle.assessments.find(
          (row) => normalized(row.status) !== "SUPERSEDED",
        ) ??
        cycle.assessments[0] ??
        null;

      if (
        (directorGovernanceCarrierValid || officerGovernanceCarrierValid) &&
        !assessment
      ) {
        return [];
      }

      if (
        officerGovernanceActorRole(actorRole) &&
        staffCarrierValid &&
        !assessment
      ) {
        return [];
      }

      if (
        !assessment &&
        cycleStatus !== "OPEN" &&
        cycleStatus !== "CLOSED"
      ) {
        return [];
      }

      const view = supervisoryView({
        cycleId: cycle.id,
        cycleStatus,
        assessment,
      });
      const release = directorDirectReleasePresentation({
        actorRole,
        cycleId: cycle.id,
        cycleMetadata: cycle.metadata,
        directorGovernanceCarrierValid,
        assessment,
      });

      return [
        {
          cycleId: cycle.id,
          cycleStatus,
          targetUserId,
          targetName: clean(cycle.targetNameSnapshot) || null,
          schoolId,
          schoolName,
          circuitId,
          circuitName,
          districtId,
          districtName,
          staffFeedbackLabel:
            directorGovernanceCarrierValid || officerGovernanceCarrierValid
              ? "Independent Governance assessment"
              : staffFeedbackLabel({
                cycleStatus,
                aggregateReady: cycle.aggregates.length === 1,
              }),
          ...view,
          release,
        },
      ];
    },
  );

  const directTargets: HeadteacherSupervisoryDirectTarget[] = [];

  if (officerGovernanceActorRole(actorRole)) {
    const blockedTargetKeys = new Set<string>();

    for (const cycle of cycles) {
      const metadata = objectValue(cycle.metadata);
      const instrument = cycle.instrumentVersion.instrument;
      const assessment =
        cycle.assessments.find(
          (row) => normalized(row.status) !== "SUPERSEDED",
        ) ??
        cycle.assessments[0] ??
        null;

      const officerCarrier =
        clean(metadata.workflow) ===
          HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow &&
        clean(metadata.evidenceStream) ===
          "GOVERNANCE_SUPERVISORY_ASSESSMENT" &&
        clean(metadata.carrierKind) ===
          HEADTEACHER_SUPERVISORY_QUEUE_POLICY.officerGovernanceCarrierKind &&
        clean(metadata.assessorUserId) === actorUserId &&
        canonicalHeadteacherSupervisoryAssessorRole(metadata.assessorRole) ===
          actorRole &&
        clean(metadata.assessorAssignmentId).length > 0 &&
        cycle.requestedByUserId === actorUserId &&
        cycle.instrumentVersion.version ===
          HEADTEACHER_SUPERVISORY_QUEUE_POLICY.directorGovernanceInstrumentVersion &&
        normalized(cycle.instrumentVersion.status) === "ACTIVE" &&
        instrument.code ===
          HEADTEACHER_SUPERVISORY_QUEUE_POLICY.directorGovernanceInstrumentCode &&
        instrument.purpose === "HEADTEACHER_SUPERVISORY_ASSESSMENT" &&
        instrument.subjectType === "HEADTEACHER" &&
        instrument.isActive === true &&
        cycle.responseWindowDays === 0 &&
        cycle.minimumResponses === 0 &&
        cycle.deadlineAt === null &&
        Boolean(cycle.openedAt) &&
        Boolean(cycle.closedAt) &&
        cycle._count.participants === 0 &&
        metadata.respondentWorkflow === false &&
        clean(metadata.participantSelection) === "NONE" &&
        metadata.closedWithoutRespondents === true &&
        metadata.staffFeedbackRequired === false &&
        metadata.staffFeedbackAccessed === false &&
        metadata.separateFromStaffFeedback === true &&
        metadata.combinedWeightingDefined === false &&
        metadata.providerCalled === false;

      const legacyAssessmentCarrier =
        clean(metadata.workflow) === HEADTEACHER_FEEDBACK_POLICY.workflow &&
        assessment != null;
      const assessmentStatus = normalized(assessment?.status);
      const unresolvedAssessment =
        assessment != null &&
        ["DRAFT", "RETURNED", "FINALIZED"].includes(assessmentStatus);
      const releasedGovernanceAssessment = officerReleaseRecorded({
        cycleMetadata: cycle.metadata,
        assessment,
      });

      if (
        (officerCarrier || legacyAssessmentCarrier) &&
        unresolvedAssessment &&
        !releasedGovernanceAssessment
      ) {
        blockedTargetKeys.add(
          `${clean(cycle.targetTenantId)}:${clean(cycle.targetUserId)}`,
        );
      }
    }

    const memberships = await prisma.membership.findMany({
      where: {
        tenantId: { in: tenantIds },
        status: "ACTIVE",
        role: {
          name: {
            equals: "HEADTEACHER",
            mode: "insensitive",
          },
        },
        tenant: { status: "ACTIVE" },
      },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        status: true,
        role: { select: { name: true } },
        user: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            status: true,
            zone: {
              select: {
                id: true,
                name: true,
                isActive: true,
                parentZoneId: true,
                zoneType: { select: { level: true } },
                parentZone: {
                  select: {
                    id: true,
                    name: true,
                    isActive: true,
                    zoneType: { select: { level: true } },
                  },
                },
              },
            },
          },
        },
      },
      take: 200,
    });

    const seen = new Set<string>();

    for (const membership of memberships) {
      const circuit = membership.tenant.zone;
      const district = circuit?.parentZone;
      const targetKey = `${membership.tenantId}:${membership.userId}`;

      if (
        membership.user.id !== membership.userId ||
        membership.tenant.id !== membership.tenantId ||
        normalized(membership.status) !== "ACTIVE" ||
        normalized(membership.role.name) !== "HEADTEACHER" ||
        normalized(membership.tenant.status) !== "ACTIVE" ||
        !circuit ||
        circuit.isActive !== true ||
        circuit.zoneType.level !==
          HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel ||
        !district ||
        district.isActive !== true ||
        district.zoneType.level !==
          HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel ||
        circuit.parentZoneId !== district.id ||
        blockedTargetKeys.has(targetKey) ||
        seen.has(targetKey) ||
        (!input.governanceScope.isSuperAdmin &&
          !scopedZoneIds.has(circuit.id) &&
          !scopedZoneIds.has(district.id)) ||
        !actorAssignmentCoversTarget({
          actorRole,
          assignments: input.governanceScope.assignments,
          circuitId: circuit.id,
          districtId: district.id,
        })
      ) {
        continue;
      }

      seen.add(targetKey);
      directTargets.push({
        targetUserId: membership.userId,
        targetName: displayName(membership.user),
        schoolId: membership.tenantId,
        schoolName: membership.tenant.name,
        circuitId: circuit.id,
        circuitName: circuit.name,
        districtId: district.id,
        districtName: district.name,
      });
    }

    directTargets.sort(
      (left, right) =>
        left.circuitName.localeCompare(right.circuitName) ||
        left.schoolName.localeCompare(right.schoolName) ||
        (left.targetName ?? "").localeCompare(right.targetName ?? ""),
    );
  }

  const priority: Record<HeadteacherSupervisoryQueueState, number> = {
    RETURNED: 0,
    IN_PROGRESS: 1,
    NOT_STARTED: 2,
    SUBMITTED: 3,
    READ_ONLY: 4,
  };

  items.sort((left, right) => {
    const stateDifference =
      priority[left.supervisory.state] -
      priority[right.supervisory.state];

    if (stateDifference !== 0) return stateDifference;

    if (left.supervisory.state === "SUBMITTED") {
      const recencyDifference =
        (cycleRecencyRank.get(left.cycleId) ?? Number.MAX_SAFE_INTEGER) -
        (cycleRecencyRank.get(right.cycleId) ?? Number.MAX_SAFE_INTEGER);

      if (recencyDifference !== 0) return recencyDifference;
    }

    const circuitDifference = left.circuitName.localeCompare(
      right.circuitName,
    );
    if (circuitDifference !== 0) return circuitDifference;

    const schoolDifference = left.schoolName.localeCompare(
      right.schoolName,
    );
    if (schoolDifference !== 0) return schoolDifference;

    return right.cycleId.localeCompare(left.cycleId);
  });

  return {
    actorRole,
    officeLabel: officeLabel(actorRole),
    selection,
    summary: buildSummary(items),
    circuits: buildCircuits(items),
    items,
    directTargets,
    noBackgroundPolling: true,
    respondentIdentitiesIncluded: false,
    individualStaffResponsesIncluded: false,
  };
}
