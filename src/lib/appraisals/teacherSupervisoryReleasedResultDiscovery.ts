import { prisma } from "@/lib/prisma";
import { effectiveRole } from "@/lib/roleRouting";
import {
  readTeacherSupervisoryReleasedResult,
  TeacherSupervisoryReleasedResultError,
  type TeacherSupervisoryReleasedResult,
} from "@/lib/appraisals/teacherSupervisoryReleasedResult";

export const TEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_POLICY = {
  schemaVersion: 1,
  audience: "RELEASED_TEACHER",
  requiredRole: "TEACHER",
  requiredCycleStatus: "RELEASED",
  maximumResults: 20,
  exactTargetUserRequired: true,
  exactTargetTenantRequired: true,
  fullReleasedResultReverificationRequired: true,
  scoreValuesIncludedInList: false,
  generalCommentIncludedInList: false,
  assessorIdentityIncluded: false,
  reviewerIdentityIncluded: false,
  returnReasonsIncluded: false,
  releaseProofHashIncluded: false,
  internalIntegrityDetailsIncluded: false,
  legacyTeacherAppraisalIncluded: false,
  combinedWeightingDefined: false,
  databaseWritesAllowed: false,
  providerCallsAllowed: false,
} as const;

type DiscoveryCycleRecord = {
  id: string;
};

export type TeacherSupervisoryReleasedResultDiscoveryDatabase = {
  appraisalCycle: {
    findMany(args: unknown): Promise<DiscoveryCycleRecord[]>;
  };
};

export type TeacherSupervisoryReleasedResultSummary = {
  cycleId: string;
  teacherName: string;
  schoolName: string;
  circuitName: string;
  districtName: string;
  dateObserved: string;
  releasedAt: string;
  assessorOffice: string;
  overallPercentage: number | null;
};

export type ReadTeacherSupervisoryReleasedResultDiscoveryInput = {
  actorUserId: string;
  actorRoleName: unknown;
  actorTenantId: string;
  database?: TeacherSupervisoryReleasedResultDiscoveryDatabase;
  resultReader?: (
    input: {
      actorUserId: string;
      actorRoleName: unknown;
      actorTenantId: string;
      cycleId: string;
    },
  ) => Promise<TeacherSupervisoryReleasedResult>;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    throw new TeacherSupervisoryReleasedResultError(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_INVALID_IDENTIFIER",
      400,
      { fieldName },
    );
  }
  return id;
}

export async function readTeacherSupervisoryReleasedResultDiscovery(
  input: ReadTeacherSupervisoryReleasedResultDiscoveryInput,
): Promise<{
  schemaVersion: 1;
  audience: "RELEASED_TEACHER";
  items: TeacherSupervisoryReleasedResultSummary[];
}> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorTenantId = requireIdentifier(input.actorTenantId, "actorTenantId");
  const actorRole = effectiveRole(input.actorRoleName);

  if (
    actorRole !==
    TEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_POLICY.requiredRole
  ) {
    throw new TeacherSupervisoryReleasedResultError(
      "TEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_ROLE_FORBIDDEN",
      403,
      { actorRole },
    );
  }

  const database =
    input.database ??
    (prisma as unknown as TeacherSupervisoryReleasedResultDiscoveryDatabase);

  const cycles = await database.appraisalCycle.findMany({
    where: {
      targetUserId: actorUserId,
      targetTenantId: actorTenantId,
      targetRoleSnapshot: "TEACHER",
      status:
        TEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_POLICY.requiredCycleStatus,
      cancelledAt: null,
    },
    select: {
      id: true,
    },
    orderBy: [{ releasedAt: "desc" }, { id: "desc" }],
    take: TEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_POLICY.maximumResults,
  });

  const resultReader =
    input.resultReader ?? readTeacherSupervisoryReleasedResult;

  const items: TeacherSupervisoryReleasedResultSummary[] = [];

  for (const cycle of cycles) {
    const cycleId = requireIdentifier(cycle.id, "cycleId");

    const result = await resultReader({
      actorUserId,
      actorRoleName: "TEACHER",
      actorTenantId,
      cycleId,
    });

    if (
      result.audience !== "RELEASED_TEACHER" ||
      result.lifecycleState !== "RELEASED" ||
      result.cycle.id !== cycleId ||
      result.release.integrityVerified !== true
    ) {
      throw new TeacherSupervisoryReleasedResultError(
        "TEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_VERIFICATION_DRIFT",
        409,
        { cycleId },
      );
    }

    items.push({
      cycleId,
      teacherName: result.cycle.teacherName,
      schoolName: result.cycle.schoolName,
      circuitName: result.cycle.circuitName,
      districtName: result.cycle.districtName,
      dateObserved: result.assessment.dateObserved,
      releasedAt: result.cycle.releasedAt,
      assessorOffice: result.assessment.assessorOffice,
      overallPercentage: result.assessment.overallPercentage,
    });
  }

  return {
    schemaVersion: 1,
    audience: "RELEASED_TEACHER",
    items,
  };
}
