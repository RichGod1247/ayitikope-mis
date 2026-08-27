// src/app/api/headteacher/assessment/mock/release/notify/route.ts
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import {
  getGuardianEssentialAlertEligibilityMap,
  type GuardianEssentialAlertEligibilityReason,
} from "@/lib/essentialAlerts/enrollment";
import { buildMockResultsReleaseSmsBody } from "@/lib/essentialAlerts/mockResultsReleaseSms";
import { essentialAlertParentPortalUrl } from "@/lib/essentialAlerts/publicPage";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESULTS_RELEASE_PURPOSE = "RESULTS_RELEASE" as const;
const ESSENTIAL_ALERT_AUTHORITY = "ESSENTIAL_ALERT_ENROLLMENT" as const;
const MAX_MOCK_NOTIFICATION_STUDENTS = 5000;

function noStoreJson(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function roleUpper(role: string | null | undefined) {
  return cleanStr(role).toUpperCase();
}

function isHeadOrAdmin(role: string) {
  return (
    role === "HEADTEACHER" ||
    role === "SCHOOL_ADMIN" ||
    role === "ADMIN" ||
    role === "SUPERADMIN"
  );
}

function normalizeGuardianNameKey(value: unknown) {
  return cleanStr(value).toLowerCase().replace(/\s+/g, " ");
}

function studentName(s: { firstName: string | null; lastName: string | null }) {
  return [s.firstName, s.lastName].filter(Boolean).join(" ").trim() || "Learner";
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

type Body = {
  sessionId?: string;
  releaseId?: string;
  dryRun?: boolean;
};

type RecipientBucket = {
  guardianPhoneNorm: string;
  studentIds: string[];
  studentNames: string[];
  guardianNameKeys: Set<string>;
  missingGuardianNameCount: number;
};

export async function GET(req: NextRequest) {
  const gate = await requireApiUserContext(req, { requireTenant: true });
  if (!gate.ok) return gate.res;

  const ctx = gate.ctx;
  const role = roleUpper(ctx.roleName);

  if (!isHeadOrAdmin(role)) {
    return noStoreJson(403, { ok: false, error: "FORBIDDEN", role });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = cleanStr(searchParams.get("sessionId"));
  const releaseId = cleanStr(searchParams.get("releaseId"));

  if (!sessionId && !releaseId) {
    return noStoreJson(400, {
      ok: false,
      error: "MISSING_RELEASE_OR_SESSION_ID",
    });
  }

  return previewOrCreateJob({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    sessionId,
    releaseId,
    dryRun: true,
    parentPortalUrl: essentialAlertParentPortalUrl(req),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireApiUserContext(req, { requireTenant: true });
  if (!gate.ok) return gate.res;

  const ctx = gate.ctx;
  const role = roleUpper(ctx.roleName);

  if (!isHeadOrAdmin(role)) {
    return noStoreJson(403, { ok: false, error: "FORBIDDEN", role });
  }

  const body = (await req.json().catch(() => null)) as Body | null;

  const sessionId = cleanStr(body?.sessionId);
  const releaseId = cleanStr(body?.releaseId);
  const dryRun = !!body?.dryRun;

  if (!sessionId && !releaseId) {
    return noStoreJson(400, {
      ok: false,
      error: "MISSING_RELEASE_OR_SESSION_ID",
    });
  }

  return previewOrCreateJob({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    sessionId,
    releaseId,
    dryRun,
    parentPortalUrl: essentialAlertParentPortalUrl(req),
  });
}

async function previewOrCreateJob(args: {
  tenantId: string;
  userId: string;
  sessionId: string;
  releaseId: string;
  dryRun: boolean;
  parentPortalUrl: string;
}) {
  const release = await prisma.mockResultsRelease.findFirst({
    where: {
      tenantId: args.tenantId,
      ...(args.releaseId ? { id: args.releaseId } : {}),
      ...(args.sessionId ? { mockExamSessionId: args.sessionId } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      mockExamSessionId: true,
      classroomId: true,
      academicYear: true,
      term: true,
      mockNumber: true,
      mockLabel: true,
      title: true,
      readinessStatus: true,
      readinessScore: true,
      releaseSnapshotHash: true,
      parentVisible: true,
      smsNotifiedAt: true,
      releasedAt: true,
      mockExamSession: {
        select: {
          id: true,
          status: true,
          title: true,
          mockLabel: true,
          mockNumber: true,
          academicYear: true,
          term: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      classroom: {
        select: {
          id: true,
          name: true,
          grade: true,
          arm: true,
          status: true,
        },
      },
      notifyJobs: {
        orderBy: [{ createdAt: "desc" }],
        take: 1,
        select: {
          id: true,
          status: true,
          totalTargets: true,
          sentCount: true,
          skippedCount: true,
          failedCount: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!release) {
    return noStoreJson(404, {
      ok: false,
      error: "MOCK_RELEASE_NOT_FOUND",
    });
  }

  const blockers: string[] = [];

  if (release.tenant.status !== "ACTIVE") {
    blockers.push("School tenant is not active.");
  }

  if (release.mockExamSession.status !== "LOCKED") {
    blockers.push("Mock session is not sealed.");
  }

  if (!release.parentVisible) {
    blockers.push("Mock release is not parent-visible.");
  }

  if (!["READY", "OVERRIDE"].includes(String(release.readinessStatus))) {
    blockers.push("Mock release readiness is not eligible for parent notification.");
  }

  if (!/^[a-f0-9]{64}$/i.test(cleanStr(release.releaseSnapshotHash))) {
    blockers.push("Mock release snapshot evidence is missing or invalid.");
  }

  if (release.classroom.status && release.classroom.status !== "ACTIVE") {
    blockers.push("Classroom is not active.");
  }

  const students = await prisma.student.findMany({
    where: {
      tenantId: args.tenantId,
      classroomId: release.classroomId,
      status: "ACTIVE",
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
    },
    take: MAX_MOCK_NOTIFICATION_STUDENTS + 1,
  });

  if (students.length > MAX_MOCK_NOTIFICATION_STUDENTS) {
    return noStoreJson(409, {
      ok: false,
      error: "MOCK_RELEASE_NOTIFY_TARGET_LIMIT_EXCEEDED",
      maxStudents: MAX_MOCK_NOTIFICATION_STUDENTS,
      eligibilityAuthority: ESSENTIAL_ALERT_AUTHORITY,
      essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
    });
  }

  const eligibility = await getGuardianEssentialAlertEligibilityMap({
    tenantId: args.tenantId,
    purpose: RESULTS_RELEASE_PURPOSE,
    students,
  });

  const reasonCounts = new Map<GuardianEssentialAlertEligibilityReason, number>();
  const grouped = new Map<string, RecipientBucket>();

  let skippedNoPhone = 0;
  let notEligibleLearners = 0;
  let authorityEligibleLearners = 0;

  for (const student of students) {
    const result = eligibility.get(student.id);
    const reason = result?.reason ?? "NOT_ENROLLED";

    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);

    if (!result?.eligible || !result.phoneNorm) {
      if (reason === "NO_PHONE") skippedNoPhone += 1;
      else notEligibleLearners += 1;
      continue;
    }

    authorityEligibleLearners += 1;

    const existing =
      grouped.get(result.phoneNorm) ??
      ({
        guardianPhoneNorm: result.phoneNorm,
        studentIds: [],
        studentNames: [],
        guardianNameKeys: new Set<string>(),
        missingGuardianNameCount: 0,
      } satisfies RecipientBucket);

    const guardianNameKey = normalizeGuardianNameKey(student.guardianName);

    if (guardianNameKey) {
      existing.guardianNameKeys.add(guardianNameKey);
    } else {
      existing.missingGuardianNameCount += 1;
    }

    existing.studentIds.push(student.id);
    existing.studentNames.push(studentName(student));
    grouped.set(result.phoneNorm, existing);
  }

  let ambiguousFamilyLearners = 0;
  const recipients: Array<{
    guardianPhoneNorm: string;
    studentIds: string[];
    studentNames: string[];
    smsBody: string;
  }> = [];

  for (const bucket of grouped.values()) {
    const familyAmbiguous =
      bucket.studentIds.length > 1 &&
      (bucket.missingGuardianNameCount > 0 || bucket.guardianNameKeys.size !== 1);

    if (familyAmbiguous) {
      ambiguousFamilyLearners += bucket.studentIds.length;
      continue;
    }

    recipients.push({
      guardianPhoneNorm: bucket.guardianPhoneNorm,
      studentIds: bucket.studentIds,
      studentNames: bucket.studentNames,
      smsBody: buildMockResultsReleaseSmsBody({
        schoolName: release.tenant.name,
        studentNames: bucket.studentNames,
        mockLabel: release.mockLabel,
        parentPortalUrl: args.parentPortalUrl,
      }),
    });
  }

  const alreadyNotified = !!release.smsNotifiedAt;
  const existingJob = release.notifyJobs[0] ?? null;

  if (!recipients.length) {
    blockers.push("No currently eligible parent recipients found.");
  }

  if (existingJob && !alreadyNotified) {
    blockers.push(
      "A Mock SMS notification job already exists. Refresh its status instead of queueing another.",
    );
  }

  const eligibleLearners = recipients.reduce(
    (sum, recipient) => sum + recipient.studentIds.length,
    0,
  );

  const preview = {
    eligibilityAuthority: ESSENTIAL_ALERT_AUTHORITY,
    essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
    release: {
      id: release.id,
      mockExamSessionId: release.mockExamSessionId,
      classroomId: release.classroomId,
      academicYear: release.academicYear,
      term: release.term,
      mockNumber: release.mockNumber,
      mockLabel: release.mockLabel,
      title: release.title,
      readinessStatus: String(release.readinessStatus),
      readinessScore: release.readinessScore,
      releaseSnapshotHash: release.releaseSnapshotHash,
      parentVisible: release.parentVisible,
      releasedAt: release.releasedAt.toISOString(),
      smsNotifiedAt: release.smsNotifiedAt
        ? release.smsNotifiedAt.toISOString()
        : null,
    },
    classroom: release.classroom,
    session: release.mockExamSession,
    totals: {
      activeStudents: students.length,
      authorityEligibleLearners,
      eligibleGuardianPhones: recipients.length,
      eligibleLearners,
      notEligibleLearners,
      skippedNoPhone,
      ambiguousFamilyLearners,
    },
    eligibilityReasonCounts: Object.fromEntries(reasonCounts.entries()),
    alreadyNotified,
    existingJob,
    recipients,
    blockers,
    canQueue: blockers.length === 0 && !alreadyNotified && !existingJob,
  };

  if (args.dryRun) {
    return noStoreJson(200, {
      ok: true,
      dryRun: true,
      ...preview,
    });
  }

  if (alreadyNotified) {
    return noStoreJson(409, {
      ok: false,
      error: "MOCK_RELEASE_ALREADY_NOTIFIED",
      message: "Parents have already been notified for this Mock release.",
      ...preview,
    });
  }

  if (blockers.length) {
    return noStoreJson(409, {
      ok: false,
      error: "MOCK_RELEASE_NOTIFY_BLOCKED",
      ...preview,
    });
  }

  let result: {
    jobId: string;
    alreadyQueued: boolean;
  };

  try {
    result = await prisma.$transaction(async (tx) => {
      const concurrentJob = await tx.mockResultsReleaseNotifyJob.findFirst({
        where: {
          tenantId: args.tenantId,
          mockResultsReleaseId: release.id,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (concurrentJob) {
        return {
          jobId: concurrentJob.id,
          alreadyQueued: true,
        };
      }

      const job = await tx.mockResultsReleaseNotifyJob.create({
        data: {
          tenantId: args.tenantId,
          mockResultsReleaseId: release.id,
          mockExamSessionId: release.mockExamSessionId,
          classroomId: release.classroomId,
          status: "PENDING",
          totalTargets: recipients.length,
          sentCount: 0,
          skippedCount: 0,
          failedCount: 0,
          createdByUserId: args.userId,
        },
        select: {
          id: true,
        },
      });

      for (const recipient of recipients) {
        await tx.mockResultsReleaseNotifyRecipient.create({
          data: {
            jobId: job.id,
            tenantId: args.tenantId,
            guardianPhoneNorm: recipient.guardianPhoneNorm,
            studentIds: recipient.studentIds,
            status: "PENDING",
          },
        });

        await tx.financeOutboxEvent.create({
          data: {
            tenantId: args.tenantId,
            type: "SMS_MOCK_RESULTS_RELEASE",
            status: "PENDING",
            idempotencyKey: `mock-results-release:${release.id}:${recipient.guardianPhoneNorm}`,
            aggregateType: "MockResultsRelease",
            aggregateId: release.id,
            payload: {
              jobId: job.id,
              releaseId: release.id,
              mockExamSessionId: release.mockExamSessionId,
              classroomId: release.classroomId,
              guardianPhoneNorm: recipient.guardianPhoneNorm,
              studentIds: recipient.studentIds,
              actorId: args.userId,
              essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
              eligibilityAuthority: ESSENTIAL_ALERT_AUTHORITY,
              queuedEligibleLearnerCount: recipient.studentIds.length,
              releaseSnapshotHash: release.releaseSnapshotHash,
            },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: args.tenantId,
          userId: args.userId,
          action: "MOCK_RESULTS_RELEASE_SMS_QUEUED",
          resource: "MockResultsRelease",
          resourceId: release.id,
          metadata: {
            jobId: job.id,
            mockExamSessionId: release.mockExamSessionId,
            classroomId: release.classroomId,
            eligibleGuardianPhones: recipients.length,
            eligibleLearners,
            authorityEligibleLearners,
            notEligibleLearners,
            skippedNoPhone,
            ambiguousFamilyLearners,
            essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
            eligibilityAuthority: ESSENTIAL_ALERT_AUTHORITY,
            releaseSnapshotHash: release.releaseSnapshotHash,
          },
        },
      });

      return {
        jobId: job.id,
        alreadyQueued: false,
      };
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const concurrentJob = await prisma.mockResultsReleaseNotifyJob.findFirst({
      where: {
        tenantId: args.tenantId,
        mockResultsReleaseId: release.id,
      },
      select: { id: true },
    });

    if (!concurrentJob) throw error;

    result = {
      jobId: concurrentJob.id,
      alreadyQueued: true,
    };
  }

  return noStoreJson(200, {
    ok: true,
    dryRun: false,
    queued: !result.alreadyQueued,
    ...preview,
    jobId: result.jobId,
    alreadyQueued: result.alreadyQueued,
  });
}
