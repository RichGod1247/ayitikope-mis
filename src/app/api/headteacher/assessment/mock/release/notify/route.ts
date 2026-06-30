// src/app/api/headteacher/assessment/mock/release/notify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function digitsOnly(v: unknown) {
  return cleanStr(v).replace(/\D/g, "");
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

function normalizePhoneForSms(phone: unknown) {
  const digits = digitsOnly(phone);
  if (!digits) return "";

  if (digits.startsWith("233") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `233${digits.slice(1)}`;
  if (digits.length === 9) return `233${digits}`;

  return digits;
}

function buildSmsBody(args: {
  schoolName: string;
  studentNames: string[];
  mockLabel: string;
}) {
  const names =
    args.studentNames.length === 1
      ? args.studentNames[0]
      : `${args.studentNames.length} children`;

  return `EduLife OS: ${args.schoolName} has released ${args.mockLabel} BECE readiness for ${names}. Login to the parent portal to view support guidance.`;
}

function studentName(s: { firstName: string | null; lastName: string | null }) {
  return [s.firstName, s.lastName].filter(Boolean).join(" ").trim() || "Learner";
}

type Body = {
  sessionId?: string;
  releaseId?: string;
  dryRun?: boolean;
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
  });
}

async function previewOrCreateJob(args: {
  tenantId: string;
  userId: string;
  sessionId: string;
  releaseId: string;
  dryRun: boolean;
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
      guardianPhone: true,
      guardianPhoneNorm: true,
      guardianSmsOptIn: true,
    },
  });

  type Bucket = {
    guardianPhoneNorm: string;
    sendPhone: string;
    studentIds: string[];
    studentNames: string[];
    optedInCount: number;
    skippedNoPhone: number;
    skippedOptOut: number;
  };

  const grouped = new Map<string, Bucket>();

  let skippedNoPhone = 0;
  let skippedOptOut = 0;

  for (const student of students) {
    const sendPhone =
      normalizePhoneForSms(student.guardianPhoneNorm) ||
      normalizePhoneForSms(student.guardianPhone);

    if (!sendPhone) {
      skippedNoPhone += 1;
      continue;
    }

    if (!student.guardianSmsOptIn) {
      skippedOptOut += 1;
      continue;
    }

    const guardianPhoneNorm = sendPhone;

    const existing =
      grouped.get(guardianPhoneNorm) ??
      ({
        guardianPhoneNorm,
        sendPhone,
        studentIds: [],
        studentNames: [],
        optedInCount: 0,
        skippedNoPhone: 0,
        skippedOptOut: 0,
      } satisfies Bucket);

    existing.studentIds.push(student.id);
    existing.studentNames.push(studentName(student));
    existing.optedInCount += 1;

    grouped.set(guardianPhoneNorm, existing);
  }

  const recipients = Array.from(grouped.values()).map((bucket) => ({
    guardianPhoneNorm: bucket.guardianPhoneNorm,
    sendPhone: bucket.sendPhone,
    studentIds: bucket.studentIds,
    studentNames: bucket.studentNames,
    smsBody: buildSmsBody({
      schoolName: release.tenant.name,
      studentNames: bucket.studentNames,
      mockLabel: release.mockLabel,
    }),
  }));

  const alreadyNotified = !!release.smsNotifiedAt;

  if (!recipients.length) {
    blockers.push("No SMS-eligible parent recipients found.");
  }

  const preview = {
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
      eligibleGuardianPhones: recipients.length,
      eligibleLearners: recipients.reduce(
        (sum, r) => sum + r.studentIds.length,
        0,
      ),
      skippedNoPhone,
      skippedOptOut,
    },
    alreadyNotified,
    existingJob: release.notifyJobs[0] ?? null,
    recipients,
    blockers,
    canQueue: blockers.length === 0 && !alreadyNotified,
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

  const result = await prisma.$transaction(async (tx) => {
    const existingJob = await tx.mockResultsReleaseNotifyJob.findFirst({
      where: {
        tenantId: args.tenantId,
        mockResultsReleaseId: release.id,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (existingJob) {
      return {
        jobId: existingJob.id,
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
        skippedCount: skippedNoPhone + skippedOptOut,
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
            to: recipient.sendPhone,
            body: recipient.smsBody,
            studentIds: recipient.studentIds,
            studentNames: recipient.studentNames,
            mockLabel: release.mockLabel,
            schoolName: release.tenant.name,
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
          eligibleLearners: recipients.reduce(
            (sum, r) => sum + r.studentIds.length,
            0,
          ),
          skippedNoPhone,
          skippedOptOut,
        },
      },
    });

    return {
      jobId: job.id,
      alreadyQueued: false,
    };
  });

  return noStoreJson(200, {
    ok: true,
    dryRun: false,
    queued: true,
    ...preview,
    jobId: result.jobId,
    alreadyQueued: result.alreadyQueued,
  });
}