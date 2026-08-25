// src/app/api/parent/sms/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { StudentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SmsHistoryRecord = {
  id: string;
  category: "MOCK_RESULTS_RELEASE" | "TERM_RESULTS_RELEASE" | "GENERAL";
  source:
    | "MockResultsReleaseNotifyRecipient"
    | "ResultsReleaseNotifyRecipient"
    | "SmsLog";
  phone: string;
  title: string;
  message: string;
  status: string;
  channel: string;
  createdAt: string;
  students: Array<{ id: string; name: string; classroomName: string | null }>;
  release?: {
    type: "MOCK" | "TERM_REPORT";
    title: string;
    term: string | null;
    academicYear: string | null;
    releasedAt: string | null;
    smsNotifiedAt?: string | null;
    releaseSnapshotHash?: string | null;
    mockExamSessionId?: string | null;
  };
  provider?: {
    providerMessageId: string | null;
    providerStatus: number | null;
    providerStatusDescription: string | null;
  };
};

function noStoreJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normDigits(v: unknown) {
  return digitsOnly(String(v ?? ""));
}

function phoneMatches(a: unknown, b: unknown) {
  const A = normDigits(a);
  const B = normDigits(b);
  if (!A || !B) return false;
  return A.endsWith(B) || B.endsWith(A);
}

function phoneMatchesAny(phone: unknown, candidates: string[]) {
  return candidates.some((candidate) => phoneMatches(phone, candidate));
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function isoDate(v: Date | string | null | undefined) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function displayName(student: { firstName: string | null; lastName: string | null }) {
  return [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || "Learner";
}

function classroomName(
  classroom: { name: string | null; grade: string | null; arm: string | null } | null,
) {
  if (!classroom) return null;

  return [
    classroom.name || classroom.grade || "",
    classroom.arm ? `(${classroom.arm})` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || null;
}

function jsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanStr(item)).filter(Boolean);
}

function inferGenericTitle(message: string) {
  const m = message.toLowerCase();

  if (m.includes("fee") || m.includes("arrears") || m.includes("balance")) {
    return "Fee SMS";
  }

  if (m.includes("attendance") || m.includes("absent") || m.includes("late")) {
    return "Attendance SMS";
  }

  if (m.includes("health") || m.includes("temperature") || m.includes("fever")) {
    return "Health SMS";
  }

  return "School SMS";
}

function termResultsHistoryMessage(
  status: string,
  term: string,
  academicYear: string,
) {
  const s = cleanStr(status).toUpperCase();
  const label = `${term} ${academicYear} term report notification`;

  if (s === "SENT") {
    return `The ${label} was sent to this parent phone.`;
  }

  if (s === "SKIPPED") {
    return `The ${label} was not sent because released-result Essential School Alerts were not currently enabled for this phone.`;
  }

  if (s === "FAILED") {
    return `The ${label} could not be sent successfully.`;
  }

  return `The ${label} is still pending.`;
}

export async function GET(req: NextRequest) {
  try {
    const gate = requireParentSession(req as any);
    if (!gate.ok) return gate.res as any;

    const sess = gate.session;
    const { searchParams } = new URL(req.url);
    const limit = clampInt(searchParams.get("limit"), 1, 100, 30);

    const tenant = await prisma.tenant.findUnique({
      where: { id: sess.tenantId },
      select: { id: true, name: true, status: true },
    });

    if (!tenant || tenant.status !== "ACTIVE") {
      return noStoreJson({ ok: false, error: "TENANT_NOT_ACTIVE" }, 403);
    }

    const guardianCandidates = [
      normDigits(sess.guardianPhoneE164),
      normDigits(sess.guardianSuffix9),
    ].filter((v) => v.length >= 7);

    if (!guardianCandidates.length) {
      return noStoreJson({ ok: false, error: "PARENT_PHONE_MISSING_IN_SESSION" }, 400);
    }

    const students = await prisma.student.findMany({
      where: {
        tenantId: sess.tenantId,
        status: StudentStatus.ACTIVE,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianPhone: true,
        guardianPhoneNorm: true,
        classroom: {
          select: {
            name: true,
            grade: true,
            arm: true,
          },
        },
      },
      take: 1000,
    });

    const linkedStudents = students
      .filter(
        (student) =>
          phoneMatchesAny(student.guardianPhoneNorm, guardianCandidates) ||
          phoneMatchesAny(student.guardianPhone, guardianCandidates),
      )
      .map((student) => ({
        id: student.id,
        name: displayName(student),
        classroomName: classroomName(student.classroom),
      }));

    const linkedStudentById = new Map(linkedStudents.map((student) => [student.id, student]));
    const linkedStudentIds = new Set(linkedStudents.map((student) => student.id));

    const records: SmsHistoryRecord[] = [];

    const mockRecipients = await prisma.mockResultsReleaseNotifyRecipient.findMany({
      where: { tenantId: sess.tenantId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 300,
      select: {
        id: true,
        guardianPhoneNorm: true,
        studentIds: true,
        status: true,
        providerMessageId: true,
        providerStatus: true,
        providerStatusDescription: true,
        createdAt: true,
        updatedAt: true,
        job: {
          select: {
            id: true,
            status: true,
            mockExamSessionId: true,
            completedAt: true,
            mockResultsRelease: {
              select: {
                title: true,
                academicYear: true,
                term: true,
                mockLabel: true,
                releasedAt: true,
                smsNotifiedAt: true,
                releaseSnapshotHash: true,
              },
            },
            mockExamSession: {
              select: {
                id: true,
                title: true,
                academicYear: true,
                term: true,
                mockLabel: true,
              },
            },
          },
        },
      },
    });

    for (const recipient of mockRecipients) {
      if (!phoneMatchesAny(recipient.guardianPhoneNorm, guardianCandidates)) continue;

      const rawStudentIds = jsonStringArray(recipient.studentIds);
      const visibleStudentIds = rawStudentIds.filter((id) => linkedStudentIds.has(id));

      const studentsForRecord =
        visibleStudentIds.length > 0
          ? visibleStudentIds
              .map((id) => linkedStudentById.get(id))
              .filter((student): student is SmsHistoryRecord["students"][number] =>
                Boolean(student),
              )
          : linkedStudents;

      const release = recipient.job.mockResultsRelease;
      const session = recipient.job.mockExamSession;
      const title = release.title || session.title || "Released BECE Mock readiness";

      records.push({
        id: `mock:${String(recipient.id)}`,
        category: "MOCK_RESULTS_RELEASE",
        source: "MockResultsReleaseNotifyRecipient",
        phone: recipient.guardianPhoneNorm,
        title: "Mock readiness released",
        message: `${title} is available in the parent portal. Open Mock readiness to view support guidance and download the PDF.`,
        status: recipient.status || recipient.job.status || "SENT",
        channel: "SMS",
        createdAt:
          isoDate(recipient.updatedAt) ||
          isoDate(recipient.job.completedAt) ||
          isoDate(recipient.createdAt) ||
          new Date(0).toISOString(),
        students: studentsForRecord,
        release: {
          type: "MOCK",
          title,
          term: release.term ?? session.term ?? null,
          academicYear: release.academicYear ?? session.academicYear ?? null,
          releasedAt: isoDate(release.releasedAt),
          smsNotifiedAt: isoDate(release.smsNotifiedAt),
          releaseSnapshotHash: release.releaseSnapshotHash ?? null,
          mockExamSessionId: recipient.job.mockExamSessionId,
        },
        provider: {
          providerMessageId: recipient.providerMessageId ?? null,
          providerStatus: recipient.providerStatus ?? null,
          providerStatusDescription: recipient.providerStatusDescription ?? null,
        },
      });
    }

    const normalRecipients = await prisma.resultsReleaseNotifyRecipient.findMany({
      where: { tenantId: sess.tenantId },
      orderBy: [{ createdAt: "desc" }],
      take: 300,
      select: {
        id: true,
        guardianPhoneNorm: true,
        status: true,
        providerMessageId: true,
        providerStatus: true,
        providerStatusDescription: true,
        createdAt: true,
        job: {
          select: {
            term: true,
            academicYear: true,
            status: true,
            completedAt: true,
          },
        },
      },
    });

    for (const recipient of normalRecipients) {
      if (!phoneMatchesAny(recipient.guardianPhoneNorm, guardianCandidates)) continue;

      records.push({
        id: `term:${String(recipient.id)}`,
        category: "TERM_RESULTS_RELEASE",
        source: "ResultsReleaseNotifyRecipient",
        phone: recipient.guardianPhoneNorm,
        title: "Term report notification",
        message: termResultsHistoryMessage(
          recipient.status,
          recipient.job.term,
          recipient.job.academicYear,
        ),
        status: recipient.status || recipient.job.status || "SENT",
        channel: "SMS",
        createdAt:
          isoDate(recipient.job.completedAt) ||
          isoDate(recipient.createdAt) ||
          new Date(0).toISOString(),
        students: linkedStudents,
        release: {
          type: "TERM_REPORT",
          title: `${recipient.job.term} ${recipient.job.academicYear} Term Report`,
          term: recipient.job.term,
          academicYear: recipient.job.academicYear,
          releasedAt: null,
        },
        provider: {
          providerMessageId: recipient.providerMessageId ?? null,
          providerStatus: recipient.providerStatus ?? null,
          providerStatusDescription: recipient.providerStatusDescription ?? null,
        },
      });
    }

    const officialMockExists = records.some(
      (record) => record.category === "MOCK_RESULTS_RELEASE",
    );
    const officialTermExists = records.some(
      (record) => record.category === "TERM_RESULTS_RELEASE",
    );

    const smsLogs = await prisma.smsLog.findMany({
      where: { tenantId: sess.tenantId },
      orderBy: [{ createdAt: "desc" }],
      take: 300,
      select: {
        id: true,
        createdAt: true,
        to: true,
        body: true,
        brand: true,
        providerMessageId: true,
        providerStatus: true,
        providerStatusDescription: true,
      },
    });

    for (const log of smsLogs) {
      if (!phoneMatchesAny(log.to, guardianCandidates)) continue;

      const bodyLower = log.body.toLowerCase();

      if ((bodyLower.includes("mock") || bodyLower.includes("bece")) && officialMockExists) {
        continue;
      }

      if ((bodyLower.includes("result") || bodyLower.includes("report")) && officialTermExists) {
        continue;
      }

      records.push({
        id: `smslog:${String(log.id)}`,
        category: "GENERAL",
        source: "SmsLog",
        phone: normDigits(log.to),
        title: inferGenericTitle(log.body),
        message: log.body,
        status: log.providerStatusDescription || String(log.providerStatus ?? "SENT"),
        channel: log.brand || "SMS",
        createdAt: isoDate(log.createdAt) || new Date(0).toISOString(),
        students: linkedStudents,
        provider: {
          providerMessageId: log.providerMessageId ?? null,
          providerStatus: log.providerStatus ?? null,
          providerStatusDescription: log.providerStatusDescription ?? null,
        },
      });
    }

    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const limitedRecords = records.slice(0, limit);

    return noStoreJson({
      ok: true,
      tenantId: sess.tenantId,
      tenantName: tenant.name,
      guardianPhone: guardianCandidates[0] ?? "",
      linkedStudents,
      count: limitedRecords.length,
      totalAvailable: records.length,
      records: limitedRecords,
    });
  } catch (err) {
    console.error("[PARENT_SMS_HISTORY_ERROR]", err);
    return noStoreJson({ ok: false, error: "FAILED_TO_LOAD_PARENT_SMS_HISTORY" }, 500);
  }
}