// src/app/api/headteacher/results/release/notify/route.ts
import crypto from "crypto";
import { StudentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import {
  getGuardianEssentialAlertEligibilityMap,
  type GuardianEssentialAlertEligibilityReason,
} from "@/lib/essentialAlerts/enrollment";
import {
  ESSENTIAL_ALERT_POLICY,
  normalizeGhanaPhone,
} from "@/lib/essentialAlerts/policy";
import { essentialAlertPublicOrigin } from "@/lib/essentialAlerts/publicPage";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { sendSms } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESULTS_RELEASE_BRAND = "EDULIFEOS" as const;
const RESULTS_RELEASE_PURPOSE = "RESULTS_RELEASE" as const;
const MAX_RESULTS_RELEASE_CANDIDATE_STUDENTS = 5_000;
const JOB_LOCK_TTL_MINUTES = 30;

function noStoreJson(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function roleUpper(role: string | null | undefined) {
  return String(role ?? "").trim().toUpperCase();
}

function isHeadOrAdmin(role: string) {
  return (
    role === "HEADTEACHER" ||
    role === "SCHOOL_ADMIN" ||
    role === "ADMIN" ||
    role === "SUPERADMIN"
  );
}

function safeStr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : String(error ?? "UNKNOWN_ERROR");
}

function errorStatus(error: unknown) {
  const code = errorMessage(error);

  if (
    code === "RESULTS_RELEASE_GUARDIAN_DIRECTORY_LIMIT_EXCEEDED" ||
    code === "RESULTS_RELEASE_NOTIFY_LEASE_LOST"
  ) {
    return 409;
  }

  return 500;
}

function isEvidenceBackedRelease(input: {
  readinessStatus: unknown;
  releaseSnapshotHash: string | null;
}) {
  const status = safeStr(input.readinessStatus).toUpperCase();
  return (
    (status === "READY" || status === "OVERRIDE") &&
    !!safeStr(input.releaseSnapshotHash)
  );
}

type Body = {
  scope?: "SCHOOL" | "CLASSROOM";
  term?: string;
  academicYear?: string;
  classroomId?: string | null;
  batchSize?: number;
};

type EligibleLearner = {
  studentId: string;
  name: string;
};

type PhoneEligibility = {
  eligibleLearners: EligibleLearner[];
  reasons: Set<GuardianEssentialAlertEligibilityReason>;
};

function studentName(student: {
  firstName?: string | null;
  lastName?: string | null;
}) {
  return (
    [safeStr(student.firstName), safeStr(student.lastName)]
      .filter(Boolean)
      .join(" ") || "Learner"
  );
}

function eligibleLearnerLabel(names: string[]) {
  const uniqueNames = [...new Set(names.map(safeStr).filter(Boolean))];

  if (uniqueNames.length === 0) return "Released results";
  if (uniqueNames.length === 1) return `Results for ${uniqueNames[0]}`;
  if (uniqueNames.length === 2) {
    return `Results for ${uniqueNames[0]} & ${uniqueNames[1]}`;
  }

  return `Results for ${uniqueNames[0]}, ${uniqueNames[1]} +${
    uniqueNames.length - 2
  } more`;
}

async function findOrCreateJob(input: {
  tenantId: string;
  userId: string;
  term: string;
  academicYear: string;
  scope: "SCHOOL" | "CLASSROOM";
  scopeKey: string;
  classroomId: string | null;
}) {
  const existing = await prisma.resultsReleaseNotifyJob.findFirst({
    where: {
      tenantId: input.tenantId,
      term: input.term,
      academicYear: input.academicYear,
      scopeKey: input.scopeKey,
    },
    select: {
      id: true,
      status: true,
      startedAt: true,
      updatedAt: true,
    },
  });

  if (existing) return existing;

  try {
    return await prisma.resultsReleaseNotifyJob.create({
      data: {
        id: crypto.randomBytes(16).toString("hex"),
        tenantId: input.tenantId,
        term: input.term,
        academicYear: input.academicYear,
        scope: input.scope,
        scopeKey: input.scopeKey,
        classroomId: input.classroomId,
        status: "PENDING",
        createdByUserId: input.userId,
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        updatedAt: true,
      },
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";

    if (code !== "P2002") throw error;

    const raced = await prisma.resultsReleaseNotifyJob.findFirst({
      where: {
        tenantId: input.tenantId,
        term: input.term,
        academicYear: input.academicYear,
        scopeKey: input.scopeKey,
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        updatedAt: true,
      },
    });

    if (!raced) throw error;
    return raced;
  }
}

async function loadEligibility(input: {
  tenantId: string;
  scope: "SCHOOL" | "CLASSROOM";
  classroomId: string | null;
}) {
  const students = await prisma.student.findMany({
    where: {
      tenantId: input.tenantId,
      status: StudentStatus.ACTIVE,
      ...(input.scope === "CLASSROOM"
        ? { classroomId: input.classroomId }
        : {}),
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
    },
    take: MAX_RESULTS_RELEASE_CANDIDATE_STUDENTS + 1,
  });

  if (students.length > MAX_RESULTS_RELEASE_CANDIDATE_STUDENTS) {
    throw new Error("RESULTS_RELEASE_GUARDIAN_DIRECTORY_LIMIT_EXCEEDED");
  }

  const eligibility = await getGuardianEssentialAlertEligibilityMap({
    tenantId: input.tenantId,
    purpose: RESULTS_RELEASE_PURPOSE,
    students,
  });

  const phoneEligibility = new Map<string, PhoneEligibility>();
  let eligibleLearners = 0;
  let notEligibleLearners = 0;
  let noPhoneLearners = 0;

  for (const student of students) {
    const result = eligibility.get(student.id);

    if (!result) {
      notEligibleLearners += 1;
      continue;
    }

    if (!result.phoneNorm) {
      notEligibleLearners += 1;
      if (result.reason === "NO_PHONE") noPhoneLearners += 1;
      continue;
    }

    const phoneNorm = normalizeGhanaPhone(result.phoneNorm);
    if (!phoneNorm) {
      notEligibleLearners += 1;
      noPhoneLearners += 1;
      continue;
    }

    const current = phoneEligibility.get(phoneNorm) ?? {
      eligibleLearners: [],
      reasons: new Set<GuardianEssentialAlertEligibilityReason>(),
    };

    current.reasons.add(result.reason);

    if (result.eligible) {
      current.eligibleLearners.push({
        studentId: student.id,
        name: studentName(student),
      });
      eligibleLearners += 1;
    } else {
      notEligibleLearners += 1;
    }

    phoneEligibility.set(phoneNorm, current);
  }

  const eligibleTargetsByPhone = new Map(
    [...phoneEligibility.entries()].filter(
      ([, value]) => value.eligibleLearners.length > 0,
    ),
  );

  const eligiblePhones = [...eligibleTargetsByPhone.keys()].sort();

  const notEligiblePhones = [...phoneEligibility.entries()]
    .filter(([, value]) => value.eligibleLearners.length === 0)
    .map(([phone]) => phone)
    .sort();

  return {
    eligiblePhones,
    eligiblePhoneSet: new Set(eligiblePhones),
    eligibleTargetsByPhone,
    summary: {
      candidateLearners: students.length,
      eligibleLearners,
      notEligibleLearners,
      noPhoneLearners,
      eligiblePhoneTargets: eligiblePhones.length,
      notEligiblePhoneTargets: notEligiblePhones.length,
    },
  };
}

async function syncRecipientAuthority(input: {
  jobId: string;
  tenantId: string;
  eligiblePhones: string[];
  eligiblePhoneSet: Set<string>;
}) {
  const existingRows =
    await prisma.resultsReleaseNotifyRecipient.findMany({
      where: {
        jobId: input.jobId,
        tenantId: input.tenantId,
      },
      select: {
        id: true,
        guardianPhoneNorm: true,
        status: true,
      },
    });

  const existingCanonicalPhones = new Set(
    existingRows
      .map((row) => normalizeGhanaPhone(row.guardianPhoneNorm))
      .filter((phone): phone is string => !!phone),
  );

  const missingEligiblePhones = input.eligiblePhones.filter(
    (phone) => !existingCanonicalPhones.has(phone),
  );

  if (missingEligiblePhones.length) {
    await prisma.resultsReleaseNotifyRecipient.createMany({
      data: missingEligiblePhones.map((phone) => ({
        jobId: input.jobId,
        tenantId: input.tenantId,
        guardianPhoneNorm: phone,
        status: "PENDING",
      })),
      skipDuplicates: true,
    });
  }

  const rows = missingEligiblePhones.length
    ? await prisma.resultsReleaseNotifyRecipient.findMany({
        where: {
          jobId: input.jobId,
          tenantId: input.tenantId,
        },
        select: {
          id: true,
          guardianPhoneNorm: true,
          status: true,
        },
      })
    : existingRows;

  const skippedRows = rows.filter((row) => row.status === "SKIPPED");

  const reactivateIds = skippedRows
    .filter((row) => {
      const phone = normalizeGhanaPhone(row.guardianPhoneNorm);
      return !!phone && input.eligiblePhoneSet.has(phone);
    })
    .map((row) => row.id);

  if (reactivateIds.length) {
    await prisma.resultsReleaseNotifyRecipient.updateMany({
      where: {
        id: { in: reactivateIds },
        jobId: input.jobId,
        tenantId: input.tenantId,
        status: "SKIPPED",
      },
      data: {
        status: "PENDING",
        providerMessageId: null,
        providerStatus: null,
        providerStatusDescription: null,
      },
    });
  }

  const pendingRows = rows.filter((row) => row.status === "PENDING");

  const skipIds = pendingRows
    .filter((row) => {
      const phone = normalizeGhanaPhone(row.guardianPhoneNorm);
      return !phone || !input.eligiblePhoneSet.has(phone);
    })
    .map((row) => row.id);

  if (skipIds.length) {
    await prisma.resultsReleaseNotifyRecipient.updateMany({
      where: {
        id: { in: skipIds },
        jobId: input.jobId,
        tenantId: input.tenantId,
        status: "PENDING",
      },
      data: {
        status: "SKIPPED",
        providerMessageId: null,
        providerStatus: null,
        providerStatusDescription:
          "SKIPPED: ESSENTIAL_ALERT_RESULTS_RELEASE_NOT_ELIGIBLE",
      },
    });
  }

  return {
    reactivated: reactivateIds.length,
    skipped: skipIds.length,
  };
}

async function recipientCounts(jobId: string) {
  const [totalTargets, sentCount, skippedCount, failedCount, remaining] =
    await Promise.all([
      prisma.resultsReleaseNotifyRecipient.count({ where: { jobId } }),
      prisma.resultsReleaseNotifyRecipient.count({
        where: { jobId, status: "SENT" },
      }),
      prisma.resultsReleaseNotifyRecipient.count({
        where: { jobId, status: "SKIPPED" },
      }),
      prisma.resultsReleaseNotifyRecipient.count({
        where: { jobId, status: "FAILED" },
      }),
      prisma.resultsReleaseNotifyRecipient.count({
        where: { jobId, status: "PENDING" },
      }),
    ]);

  return {
    totalTargets,
    sentCount,
    skippedCount,
    failedCount,
    remaining,
  };
}

async function finalizeJob(input: {
  jobId: string;
  tenantId: string;
  leaseAt: Date;
  counts: Awaited<ReturnType<typeof recipientCounts>>;
}) {
  const now = new Date();
  const done = input.counts.remaining === 0;

  const updated = await prisma.resultsReleaseNotifyJob.updateMany({
    where: {
      id: input.jobId,
      tenantId: input.tenantId,
      status: "RUNNING",
      updatedAt: input.leaseAt,
    },
    data: {
      status: done ? "DONE" : "PENDING",
      totalTargets: input.counts.totalTargets,
      sentCount: input.counts.sentCount,
      skippedCount: input.counts.skippedCount,
      failedCount: input.counts.failedCount,
      completedAt: done ? now : null,
      lastError: null,
      updatedAt: now,
    },
  });

  if (updated.count !== 1) {
    throw new Error("RESULTS_RELEASE_NOTIFY_LEASE_LOST");
  }

  const job = await prisma.resultsReleaseNotifyJob.findFirst({
    where: {
      id: input.jobId,
      tenantId: input.tenantId,
    },
  });

  if (!job) {
    throw new Error(
      "RESULTS_RELEASE_NOTIFY_JOB_NOT_FOUND_AFTER_FINALIZE",
    );
  }

  return { job, done };
}

export async function POST(req: NextRequest) {
  const gate = await requireApiUserContext(req as any, {
    requireTenant: true,
  });
  if (!gate.ok) return gate.res as any;

  const ctx = gate.ctx;
  const role = roleUpper(ctx.roleName);

  if (!isHeadOrAdmin(role)) {
    return noStoreJson(403, {
      ok: false,
      error: "FORBIDDEN",
      role,
    });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const scope = (body?.scope ?? "SCHOOL") as
    | "SCHOOL"
    | "CLASSROOM";
  const term = safeStr(body?.term) || "1st Term";
  const academicYear =
    safeStr(body?.academicYear) || "2025/2026";
  const classroomId = safeStr(body?.classroomId) || null;
  const batchSizeRaw = Number(body?.batchSize ?? 25);
  const batchSize = Number.isFinite(batchSizeRaw)
    ? Math.max(5, Math.min(60, Math.trunc(batchSizeRaw)))
    : 25;

  if (scope !== "SCHOOL" && scope !== "CLASSROOM") {
    return noStoreJson(400, {
      ok: false,
      error: "INVALID_SCOPE",
    });
  }

  if (!term || !academicYear) {
    return noStoreJson(400, {
      ok: false,
      error: "MISSING_TERM_OR_YEAR",
    });
  }

  let scopeKey = "SCHOOL";
  let classroomIdToStore: string | null = null;

  if (scope === "CLASSROOM") {
    if (!classroomId) {
      return noStoreJson(400, {
        ok: false,
        error: "MISSING_CLASSROOM_ID",
      });
    }

    const classroom = await prisma.classroom.findFirst({
      where: {
        id: classroomId,
        tenantId: ctx.tenantId,
      },
      select: { id: true },
    });

    if (!classroom) {
      return noStoreJson(404, {
        ok: false,
        error: "CLASSROOM_NOT_FOUND",
      });
    }

    scopeKey = classroomId;
    classroomIdToStore = classroomId;
  }

  const release = await prisma.resultsRelease.findFirst({
    where: {
      tenantId: ctx.tenantId,
      term,
      academicYear,
      scopeKey,
    },
    select: {
      id: true,
      readinessStatus: true,
      releaseSnapshotHash: true,
    },
  });

  if (!release) {
    return noStoreJson(400, {
      ok: false,
      error: "RESULTS_NOT_RELEASED_YET",
      term,
      academicYear,
      scope,
      scopeKey,
    });
  }

  if (!isEvidenceBackedRelease(release)) {
    return noStoreJson(409, {
      ok: false,
      error: "RESULTS_RELEASE_NOT_EVIDENCE_BACKED",
      term,
      academicYear,
      scope,
      scopeKey,
    });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { name: true },
  });

  const job = await findOrCreateJob({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    term,
    academicYear,
    scope,
    scopeKey,
    classroomId: classroomIdToStore,
  });

  const leaseAt = new Date();
  const lockCutoff = new Date(
    leaseAt.getTime() - JOB_LOCK_TTL_MINUTES * 60 * 1000,
  );

  const claim = await prisma.resultsReleaseNotifyJob.updateMany({
    where: {
      id: job.id,
      tenantId: ctx.tenantId,
      OR: [
        { status: { not: "RUNNING" } },
        { updatedAt: { lt: lockCutoff } },
      ],
    },
    data: {
      scope,
      classroomId: classroomIdToStore,
      status: "RUNNING",
      startedAt: job.startedAt ?? leaseAt,
      completedAt: null,
      lastError: null,
      updatedAt: leaseAt,
    },
  });

  if (claim.count !== 1) {
    return noStoreJson(409, {
      ok: false,
      error: "RESULTS_RELEASE_NOTIFY_IN_PROGRESS",
      retryAfterMinutes: JOB_LOCK_TTL_MINUTES,
      eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT",
      essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
    });
  }

  try {
    const authority = await loadEligibility({
      tenantId: ctx.tenantId,
      scope,
      classroomId: classroomIdToStore,
    });

    const sync = await syncRecipientAuthority({
      jobId: job.id,
      tenantId: ctx.tenantId,
      eligiblePhones: authority.eligiblePhones,
      eligiblePhoneSet: authority.eligiblePhoneSet,
    });

    const pending =
      await prisma.resultsReleaseNotifyRecipient.findMany({
        where: {
          jobId: job.id,
          tenantId: ctx.tenantId,
          status: "PENDING",
        },
        orderBy: { guardianPhoneNorm: "asc" },
        take: batchSize,
        select: {
          id: true,
          guardianPhoneNorm: true,
        },
      });

    if (pending.length === 0) {
      const counts = await recipientCounts(job.id);
      const finalized = await finalizeJob({
        jobId: job.id,
        tenantId: ctx.tenantId,
        leaseAt,
        counts,
      });

      return noStoreJson(200, {
        ok: true,
        job: finalized.job,
        batch: {
          sent: 0,
          skipped: sync.skipped,
          failed: 0,
          providerAttempts: 0,
        },
        remaining: counts.remaining,
        done: finalized.done,
        message: "No eligible pending recipients left.",
        brand: RESULTS_RELEASE_BRAND,
        eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT",
        essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
        eligibilitySummary: authority.summary,
      });
    }

    const baseUrl = essentialAlertPublicOrigin(req);
    const schoolName = tenant?.name ?? "Your school";

    let sent = 0;
    let failed = 0;
    let skipped = sync.skipped;
    let providerAttempts = 0;

    for (const recipient of pending) {
      const currentPhone = normalizeGhanaPhone(
        recipient.guardianPhoneNorm,
      );

      const eligibleTarget = currentPhone
        ? authority.eligibleTargetsByPhone.get(currentPhone)
        : null;

      if (
        !currentPhone ||
        !eligibleTarget ||
        eligibleTarget.eligibleLearners.length === 0
      ) {
        const changed =
          await prisma.resultsReleaseNotifyRecipient.updateMany({
            where: {
              id: recipient.id,
              jobId: job.id,
              tenantId: ctx.tenantId,
              status: "PENDING",
            },
            data: {
              status: "SKIPPED",
              providerMessageId: null,
              providerStatus: null,
              providerStatusDescription:
                "SKIPPED: ESSENTIAL_ALERT_RESULTS_RELEASE_NOT_ELIGIBLE",
            },
          });

        skipped += changed.count;
        continue;
      }

      const learnerLabel = eligibleLearnerLabel(
        eligibleTarget.eligibleLearners.map((student) => student.name),
      );
      const text =
        `${schoolName}: ${learnerLabel} (${term} ${academicYear}) are now available on EduLife OS Parent Portal.` +
        ` Open: ${baseUrl}/parent-portal`;

      providerAttempts += 1;

      try {
        const sms = await sendSms({
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          to: currentPhone,
          message: text,
          from: ESSENTIAL_ALERT_POLICY.senderId,
          template: "RESULTS_RELEASE_ALERT",
          payload: {
            purpose: "results_release_alert",
            essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
            eligibilityAuthority:
              "ESSENTIAL_ALERT_ENROLLMENT",
            recipientKind: "GUARDIAN",
            term,
            academicYear,
            scope,
            scopeKey,
            releaseId: release.id,
            releaseSnapshotHash: release.releaseSnapshotHash,
            eligibleLearnerCount: eligibleTarget.eligibleLearners.length,
          },
        });

        const changed =
          await prisma.resultsReleaseNotifyRecipient.updateMany({
            where: {
              id: recipient.id,
              jobId: job.id,
              tenantId: ctx.tenantId,
              status: "PENDING",
            },
            data: {
              status: sms.ok ? "SENT" : "FAILED",
              providerMessageId:
                sms.providerMessageId ?? null,
              providerStatus:
                typeof sms.status === "number" &&
                Number.isFinite(sms.status)
                  ? sms.status
                  : null,
              providerStatusDescription:
                sms.providerStatusDescription ??
                (sms.ok ? "SENT" : sms.error ?? "FAILED"),
            },
          });

        if (changed.count !== 1) {
          throw new Error(
            "RESULTS_RELEASE_NOTIFY_RECIPIENT_STATE_CHANGED",
          );
        }

        if (sms.ok) sent += 1;
        else failed += 1;
      } catch (error) {
        failed += 1;

        await prisma.resultsReleaseNotifyRecipient.updateMany({
          where: {
            id: recipient.id,
            jobId: job.id,
            tenantId: ctx.tenantId,
            status: "PENDING",
          },
          data: {
            status: "FAILED",
            providerStatusDescription:
              errorMessage(error).slice(0, 500),
          },
        });
      }
    }

    const counts = await recipientCounts(job.id);
    const finalized = await finalizeJob({
      jobId: job.id,
      tenantId: ctx.tenantId,
      leaseAt,
      counts,
    });

    return noStoreJson(200, {
      ok: true,
      job: finalized.job,
      batch: {
        sent,
        skipped,
        failed,
        providerAttempts,
      },
      remaining: counts.remaining,
      done: finalized.done,
      brand: RESULTS_RELEASE_BRAND,
      eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT",
      essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
      eligibilitySummary: authority.summary,
    });
  } catch (error) {
    const message = errorMessage(error);

    await prisma.resultsReleaseNotifyJob
      .updateMany({
        where: {
          id: job.id,
          tenantId: ctx.tenantId,
          status: "RUNNING",
          updatedAt: leaseAt,
        },
        data: {
          status: "PENDING",
          lastError: message.slice(0, 1000),
          updatedAt: new Date(),
        },
      })
      .catch(() => null);

    return noStoreJson(errorStatus(error), {
      ok: false,
      error: message,
      eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT",
      essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
    });
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireApiUserContext(req as any, {
    requireTenant: true,
  });
  if (!gate.ok) return gate.res as any;

  const ctx = gate.ctx;
  const role = roleUpper(ctx.roleName);

  if (!isHeadOrAdmin(role)) {
    return noStoreJson(403, {
      ok: false,
      error: "FORBIDDEN",
      role,
    });
  }

  const { searchParams } = new URL(req.url);
  const term = String(searchParams.get("term") || "").trim();
  const academicYear = String(
    searchParams.get("academicYear") || "",
  ).trim();
  const scopeKey = String(
    searchParams.get("scopeKey") || "SCHOOL",
  ).trim();

  if (!term || !academicYear) {
    return noStoreJson(400, {
      ok: false,
      error: "MISSING_TERM_OR_YEAR",
    });
  }

  const job = await prisma.resultsReleaseNotifyJob.findFirst({
    where: {
      tenantId: ctx.tenantId,
      term,
      academicYear,
      scopeKey,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!job) {
    return noStoreJson(200, {
      ok: true,
      job: null,
      remaining: 0,
      eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT",
      essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
    });
  }

  const remaining =
    await prisma.resultsReleaseNotifyRecipient.count({
      where: {
        jobId: job.id,
        tenantId: ctx.tenantId,
        status: "PENDING",
      },
    });

  return noStoreJson(200, {
    ok: true,
    job,
    remaining,
    eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT",
    essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
  });
}
