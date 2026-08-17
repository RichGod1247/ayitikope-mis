import { prisma } from "@/lib/prisma";
import {
  HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY,
} from "@/lib/appraisals/headteacherSupervisoryDirectorDirectRelease";
import {
  readHeadteacherSupervisoryReleasedResult,
  type HeadteacherSupervisoryReleasedResultDatabase,
} from "@/lib/appraisals/headteacherSupervisoryReleasedResult";
import { effectiveRole } from "@/lib/roleRouting";

export const HEADTEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_POLICY = {
  schemaVersion: 1,
  audience: "RELEASED_HEADTEACHER_GOVERNANCE",
  requiredRole: "HEADTEACHER",
  discoverySource: "ASSESSMENT_KEYED_INDEPENDENT_RELEASE_MAP",
  carrierCycleReleasedStatusRequired: false,
  finalizedAssessmentRequired: true,
  fullResultReverificationRequired: true,
  maximumCyclesScanned: 100,
  maximumResultsReturned: 50,
  readMode: "SEQUENTIAL",
  staffFeedbackPrerequisite: false,
  staffResponsesAccessed: false,
  respondentIdentitiesAccessed: false,
  combinedWeightingDefined: false,
  databaseWritesAllowed: false,
  providerCallsAllowed: false,
} as const;

export type HeadteacherSupervisoryReleasedResultSummary = {
  assessmentId: string;
  dateObserved: string;
  releasedAt: string;
  assessorOffice: "District Director";
  overallPercentage: number | null;
  schoolName: string;
  circuitName: string;
  districtName: string;
  releaseStatus: "RELEASED";
};

export type ListHeadteacherSupervisoryReleasedResultsInput = {
  actorUserId: string;
  actorRoleName: unknown;
  actorTenantId: string;
  database?: HeadteacherSupervisoryReleasedResultDiscoveryDatabase;
};

type CycleRecord = {
  id: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetRoleSnapshot: string | null;
  metadata: unknown;
};

export type HeadteacherSupervisoryReleasedResultDiscoveryDatabase =
  HeadteacherSupervisoryReleasedResultDatabase & {
    appraisalCycle: {
      findMany(args: unknown): Promise<CycleRecord[]>;
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

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    const error = new Error(
      "HEADTEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_INVALID_IDENTIFIER",
    ) as Error & { code?: string; status?: number; details?: Record<string, unknown> };
    error.code = "HEADTEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_INVALID_IDENTIFIER";
    error.status = 400;
    error.details = { fieldName };
    throw error;
  }
  return id;
}

function fail(code: string, status: number, details?: Record<string, unknown>): never {
  const error = new Error(code) as Error & {
    code?: string;
    status?: number;
    details?: Record<string, unknown>;
  };
  error.code = code;
  error.status = status;
  error.details = details;
  throw error;
}

function releaseMap(metadata: unknown) {
  const raw = objectValue(metadata)[HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY];
  if (raw == null) return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_RELEASE_MAP_DRIFT", 409);
  }
  return raw as Record<string, unknown>;
}

export async function listHeadteacherSupervisoryReleasedResults(
  input: ListHeadteacherSupervisoryReleasedResultsInput,
): Promise<HeadteacherSupervisoryReleasedResultSummary[]> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const actorTenantId = requireIdentifier(input.actorTenantId, "actorTenantId");
  const actorRole = effectiveRole(input.actorRoleName);

  if (
    actorRole !==
    HEADTEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_POLICY.requiredRole
  ) {
    fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_ROLE_FORBIDDEN", 403, {
      actorRole,
    });
  }

  const database =
    input.database ??
    (prisma as unknown as HeadteacherSupervisoryReleasedResultDiscoveryDatabase);

  const cycles = await database.appraisalCycle.findMany({
    where: {
      targetUserId: actorUserId,
      targetTenantId: actorTenantId,
      targetRoleSnapshot: "HEADTEACHER",
    },
    select: {
      id: true,
      targetUserId: true,
      targetTenantId: true,
      targetRoleSnapshot: true,
      metadata: true,
    },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    take: HEADTEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_POLICY.maximumCyclesScanned,
  });

  const assessmentIds: string[] = [];
  const seen = new Set<string>();

  for (const cycle of cycles) {
    if (
      cycle.targetUserId !== actorUserId ||
      clean(cycle.targetTenantId) !== actorTenantId ||
      normalized(cycle.targetRoleSnapshot) !== "HEADTEACHER"
    ) {
      fail("HEADTEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_SCOPE_DRIFT", 409, {
        cycleId: cycle.id,
      });
    }

    const releases = releaseMap(cycle.metadata);
    for (const assessmentIdRaw of Object.keys(releases)) {
      const assessmentId = requireIdentifier(assessmentIdRaw, "assessmentId");
      if (seen.has(assessmentId)) continue;
      seen.add(assessmentId);
      assessmentIds.push(assessmentId);
    }
  }

  const results = [];

  for (const assessmentId of assessmentIds) {
    const result = await readHeadteacherSupervisoryReleasedResult({
      actorUserId,
      actorRoleName: actorRole,
      actorTenantId,
      assessmentId,
      database,
    });

    results.push({
      assessmentId: result.assessment.assessmentId,
      dateObserved: result.assessment.dateObserved,
      releasedAt: result.release.releasedAt,
      assessorOffice: result.assessment.assessorOffice,
      overallPercentage: result.assessment.overallPercentage,
      schoolName: result.context.schoolName,
      circuitName: result.context.circuitName,
      districtName: result.context.districtName,
      releaseStatus: "RELEASED" as const,
    });
  }

  return results
    .sort((left, right) => {
      const byRelease = right.releasedAt.localeCompare(left.releasedAt);
      if (byRelease !== 0) return byRelease;
      return right.assessmentId.localeCompare(left.assessmentId);
    })
    .slice(
      0,
      HEADTEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_POLICY.maximumResultsReturned,
    );
}
