import { prisma } from "@/lib/prisma";
import {
  TEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalTeacherSupervisoryAssessorRole,
} from "@/lib/appraisals/teacherSupervisoryAssessment";
import type { GovernanceScope } from "@/lib/governance/scope";

export const TEACHER_SUPERVISORY_RECORDS_POLICY = {
  schemaVersion: 1,
  workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
  evidenceStream: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.evidenceStream,
  instrumentCode: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode,
  instrumentVersion: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion,
  targetRole: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.targetRole,
  visibleStatuses: ["DRAFT", "FINALIZED"] as const,
  actorAssessmentOnly: true,
  currentGovernanceScopeRequired: true,
  progressOnly: true,
  individualScoresReturned: false,
  generalCommentsReturned: false,
  contactDetailsReturned: false,
  legacyTeacherAppraisalIncluded: false,
  reviewEvidenceIncluded: false,
  backgroundPollingAllowed: false,
  databaseWritesAllowed: false,
  providerCallsAllowed: false,
  maximumRecords: 100,
} as const;

type TeacherSupervisoryRecordStatus =
  (typeof TEACHER_SUPERVISORY_RECORDS_POLICY.visibleStatuses)[number];

export type TeacherSupervisoryAssessmentRecordState =
  | "IN_PROGRESS"
  | "SUBMITTED";

export type TeacherSupervisoryAssessmentRecord = {
  assessmentId: string;
  cycleId: string;
  revision: number;
  status: TeacherSupervisoryRecordStatus;
  state: TeacherSupervisoryAssessmentRecordState;
  label: string;
  targetUserId: string;
  targetName: string | null;
  schoolId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  dateObserved: string;
  answeredItems: number;
  totalItems: number;
  completionPercentage: number;
  overallPercentage: number | null;
  finalizedAt: string | null;
  workspaceUrl: string;
};

export type TeacherSupervisoryAssessmentRecords = {
  actorRole: string;
  officeLabel: string;
  summary: {
    total: number;
    inProgress: number;
    submitted: number;
  };
  items: TeacherSupervisoryAssessmentRecord[];
  actorAssessmentOnly: true;
  progressOnly: true;
  individualScoresIncluded: false;
  generalCommentsIncluded: false;
  contactDetailsIncluded: false;
  legacyTeacherAppraisalIncluded: false;
  reviewEvidenceIncluded: false;
  noBackgroundPolling: true;
  providerCalled: false;
};

type ReadTeacherSupervisoryAssessmentRecordsInput = {
  actorUserId: string;
  actorRoleName: unknown;
  governanceScope: GovernanceScope;
  database?: TeacherSupervisoryAssessmentRecordsDatabase;
};

type AssessmentRecord = {
  id: string;
  cycleId: string;
  instrumentVersionId: string;
  assessorUserId: string;
  status: string;
  revision: number;
  dateObserved: Date | null;
  overallPercentage: number | null;
  finalizedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    scores: number;
  };
  cycle: {
    id: string;
    status: string;
    targetUserId: string;
    targetTenantId: string | null;
    targetZoneId: string | null;
    scopeZoneId: string;
    targetNameSnapshot: string | null;
    targetRoleSnapshot: string | null;
    targetSchoolNameSnapshot: string | null;
    targetZoneNameSnapshot: string | null;
    metadata: unknown;
    scopeZone: {
      id: string;
      name: string;
    };
  };
  instrumentVersion: {
    id: string;
    version: number;
    contentHash: string;
    instrument: {
      id: string;
      code: string;
      purpose: string;
      subjectType: string;
    };
  };
};

export type TeacherSupervisoryAssessmentRecordsDatabase = {
  appraisalAssessment: {
    findMany(args: unknown): Promise<AssessmentRecord[]>;
  };
};

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

function isoDateTime(value: Date | null) {
  return value ? value.toISOString() : null;
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

function fail(code: string, status: number): never {
  const error = new Error(code) as Error & { code: string; status: number };
  error.code = code;
  error.status = status;
  throw error;
}

function operationalRole(role: string) {
  const allowed = new Set<string>(
    TEACHER_SUPERVISORY_ASSESSMENT_POLICY.operationalAssessorRoles.map(
      canonicalTeacherSupervisoryAssessorRole,
    ),
  );
  return allowed.has(role);
}

function contractValid(record: AssessmentRecord) {
  const assessmentMetadata = objectValue(record.metadata);
  const cycleMetadata = objectValue(record.cycle.metadata);
  const status = normalized(record.status);

  return Boolean(
    TEACHER_SUPERVISORY_RECORDS_POLICY.visibleStatuses.includes(
      status as TeacherSupervisoryRecordStatus,
    ) &&
      clean(record.id) &&
      clean(record.cycleId) &&
      record.cycle.id === record.cycleId &&
      clean(record.assessorUserId) &&
      Number.isInteger(record.revision) &&
      record.revision >= 1 &&
      record.dateObserved &&
      clean(record.cycle.targetUserId) &&
      clean(record.cycle.targetTenantId) &&
      clean(record.cycle.targetZoneId) &&
      clean(record.cycle.scopeZoneId) &&
      record.cycle.scopeZone.id === record.cycle.scopeZoneId &&
      normalized(record.cycle.targetRoleSnapshot) ===
        TEACHER_SUPERVISORY_RECORDS_POLICY.targetRole &&
      clean(record.cycle.targetSchoolNameSnapshot) &&
      clean(record.cycle.targetZoneNameSnapshot) &&
      clean(record.cycle.scopeZone.name) &&
      clean(assessmentMetadata.workflow) ===
        TEACHER_SUPERVISORY_RECORDS_POLICY.workflow &&
      clean(assessmentMetadata.evidenceStream) ===
        TEACHER_SUPERVISORY_RECORDS_POLICY.evidenceStream &&
      clean(cycleMetadata.workflow) ===
        TEACHER_SUPERVISORY_RECORDS_POLICY.workflow &&
      clean(cycleMetadata.evidenceStream) ===
        TEACHER_SUPERVISORY_RECORDS_POLICY.evidenceStream &&
      record.instrumentVersion.id === record.instrumentVersionId &&
      record.instrumentVersion.version ===
        TEACHER_SUPERVISORY_RECORDS_POLICY.instrumentVersion &&
      record.instrumentVersion.instrument.code ===
        TEACHER_SUPERVISORY_RECORDS_POLICY.instrumentCode &&
      record.instrumentVersion.instrument.purpose === "TEACHER_OBSERVATION" &&
      record.instrumentVersion.instrument.subjectType === "TEACHER",
  );
}

function completionPercentage(answeredItems: number) {
  const total = TEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedItemCount;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((answeredItems / total) * 100)));
}

function safeRecord(
  record: AssessmentRecord,
): TeacherSupervisoryAssessmentRecord | null {
  if (!contractValid(record)) return null;

  const status = normalized(record.status) as TeacherSupervisoryRecordStatus;
  const answeredItems = Math.max(
    0,
    Math.min(
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedItemCount,
      Number(record._count?.scores ?? 0),
    ),
  );
  const finalized = status === "FINALIZED";

  return {
    assessmentId: record.id,
    cycleId: record.cycleId,
    revision: record.revision,
    status,
    state: finalized ? "SUBMITTED" : "IN_PROGRESS",
    label: finalized
      ? "Submitted and locked"
      : `Continue assessment - ${answeredItems} of ${TEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedItemCount} indicators saved`,
    targetUserId: record.cycle.targetUserId,
    targetName: clean(record.cycle.targetNameSnapshot) || null,
    schoolId: clean(record.cycle.targetTenantId),
    schoolName: clean(record.cycle.targetSchoolNameSnapshot),
    circuitId: clean(record.cycle.targetZoneId),
    circuitName: clean(record.cycle.targetZoneNameSnapshot),
    districtId: record.cycle.scopeZoneId,
    districtName: clean(record.cycle.scopeZone.name),
    dateObserved: isoDateOnly(record.dateObserved)!,
    answeredItems,
    totalItems: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedItemCount,
    completionPercentage: completionPercentage(answeredItems),
    overallPercentage: finalized ? record.overallPercentage : null,
    finalizedAt: finalized ? isoDateTime(record.finalizedAt) : null,
    workspaceUrl:
      `/governance/appraisals/teacher-supervisory?assessmentId=${encodeURIComponent(
        record.id,
      )}`,
  };
}

function emptyRecords(actorRole: string): TeacherSupervisoryAssessmentRecords {
  return {
    actorRole,
    officeLabel: officeLabel(actorRole),
    summary: {
      total: 0,
      inProgress: 0,
      submitted: 0,
    },
    items: [],
    actorAssessmentOnly: true,
    progressOnly: true,
    individualScoresIncluded: false,
    generalCommentsIncluded: false,
    contactDetailsIncluded: false,
    legacyTeacherAppraisalIncluded: false,
    reviewEvidenceIncluded: false,
    noBackgroundPolling: true,
    providerCalled: false,
  };
}

export async function readTeacherSupervisoryAssessmentRecords(
  input: ReadTeacherSupervisoryAssessmentRecordsInput,
): Promise<TeacherSupervisoryAssessmentRecords> {
  const actorUserId = clean(input.actorUserId);
  const actorRole = canonicalTeacherSupervisoryAssessorRole(
    input.actorRoleName,
  );

  if (!actorUserId) {
    fail("TEACHER_SUPERVISORY_RECORDS_ACTOR_REQUIRED", 401);
  }
  if (!operationalRole(actorRole)) {
    fail("TEACHER_SUPERVISORY_RECORDS_ROLE_FORBIDDEN", 403);
  }

  const tenantIds = [
    ...new Set(input.governanceScope.tenantIds.map(clean)),
  ].filter(Boolean);
  const scopedZoneIds = new Set(
    input.governanceScope.zoneIds.map(clean).filter(Boolean),
  );
  if (!tenantIds.length) {
    return emptyRecords(actorRole);
  }

  const tenantIdSet = new Set(tenantIds);
  const database =
    input.database ??
    (prisma as unknown as TeacherSupervisoryAssessmentRecordsDatabase);

  const rows = await database.appraisalAssessment.findMany({
    where: {
      assessorUserId: actorUserId,
      status: {
        in: [...TEACHER_SUPERVISORY_RECORDS_POLICY.visibleStatuses],
      },
      instrumentVersion: {
        version: TEACHER_SUPERVISORY_RECORDS_POLICY.instrumentVersion,
        instrument: {
          code: TEACHER_SUPERVISORY_RECORDS_POLICY.instrumentCode,
          subjectType: "TEACHER",
        },
      },
      cycle: {
        targetRoleSnapshot: TEACHER_SUPERVISORY_RECORDS_POLICY.targetRole,
        targetTenantId: { in: tenantIds },
      },
    },
    select: {
      id: true,
      cycleId: true,
      instrumentVersionId: true,
      assessorUserId: true,
      status: true,
      revision: true,
      dateObserved: true,
      overallPercentage: true,
      finalizedAt: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          scores: true,
        },
      },
      cycle: {
        select: {
          id: true,
          status: true,
          targetUserId: true,
          targetTenantId: true,
          targetZoneId: true,
          scopeZoneId: true,
          targetNameSnapshot: true,
          targetRoleSnapshot: true,
          targetSchoolNameSnapshot: true,
          targetZoneNameSnapshot: true,
          metadata: true,
          scopeZone: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      instrumentVersion: {
        select: {
          id: true,
          version: true,
          contentHash: true,
          instrument: {
            select: {
              id: true,
              code: true,
              purpose: true,
              subjectType: true,
            },
          },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: TEACHER_SUPERVISORY_RECORDS_POLICY.maximumRecords,
  });

  const items = rows
    .filter((row) => {
      if (row.assessorUserId !== actorUserId) return false;

      const tenantId = clean(row.cycle.targetTenantId);
      const circuitId = clean(row.cycle.targetZoneId);
      const districtId = clean(row.cycle.scopeZoneId);
      if (!tenantIdSet.has(tenantId)) return false;

      return (
        input.governanceScope.isSuperAdmin ||
        scopedZoneIds.has(circuitId) ||
        scopedZoneIds.has(districtId)
      );
    })
    .map(safeRecord)
    .filter(
      (row): row is TeacherSupervisoryAssessmentRecord => row !== null,
    );

  const priority: Record<TeacherSupervisoryAssessmentRecordState, number> = {
    IN_PROGRESS: 0,
    SUBMITTED: 1,
  };

  items.sort((left, right) => {
    const stateDifference = priority[left.state] - priority[right.state];
    if (stateDifference !== 0) return stateDifference;

    const dateDifference = right.dateObserved.localeCompare(left.dateObserved);
    if (dateDifference !== 0) return dateDifference;

    const schoolDifference = left.schoolName.localeCompare(right.schoolName);
    if (schoolDifference !== 0) return schoolDifference;

    return left.assessmentId.localeCompare(right.assessmentId);
  });

  const result = emptyRecords(actorRole);
  result.items = items;
  result.summary.total = items.length;
  result.summary.inProgress = items.filter(
    (item) => item.state === "IN_PROGRESS",
  ).length;
  result.summary.submitted = items.filter(
    (item) => item.state === "SUBMITTED",
  ).length;
  return result;
}
