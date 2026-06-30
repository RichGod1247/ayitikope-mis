// src/app/api/parent/assessment/mock/release-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(payload: any, status = 200) {
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

function normDigits(v: unknown) {
  return digitsOnly(String(v ?? ""));
}

function phoneMatchesBySuffix(a: string, b: string) {
  const A = normDigits(a);
  const B = normDigits(b);
  if (!A || !B) return false;
  return A.endsWith(B) || B.endsWith(A);
}

function isValidSuffixForLookup(suffix: string) {
  return normDigits(suffix).length >= 7;
}

function parentOwnsStudent(args: {
  sessGuardianPhoneE164?: string | null;
  sessGuardianSuffix9?: string | null;
  studentGuardianPhoneNorm?: string | null;
  studentGuardianPhone?: string | null;
}) {
  const sessE164 = cleanStr(args.sessGuardianPhoneE164);
  const sessSuffix9 = normDigits(args.sessGuardianSuffix9);
  const guardianNorm = cleanStr(args.studentGuardianPhoneNorm);
  const guardianRaw = cleanStr(args.studentGuardianPhone);

  const okByE164 =
    !!sessE164 &&
    !!guardianNorm &&
    normDigits(sessE164) === normDigits(guardianNorm);

  const okBySuffix =
    isValidSuffixForLookup(sessSuffix9) &&
    (phoneMatchesBySuffix(sessSuffix9, guardianNorm) ||
      phoneMatchesBySuffix(sessSuffix9, guardianRaw));

  return okByE164 || okBySuffix;
}

export async function GET(req: NextRequest) {
  try {
    const gate = requireParentSession(req as any);
    if (!gate.ok) return gate.res as any;

    const sess = gate.session;
    const { searchParams } = new URL(req.url);

    const studentId = cleanStr(searchParams.get("studentId"));

    if (!studentId) {
      return noStoreJson({ ok: false, error: "MISSING_STUDENT_ID" }, 400);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: sess.tenantId },
      select: { id: true, name: true, status: true },
    });

    if (!tenant) {
      return noStoreJson({ ok: false, error: "TENANT_NOT_FOUND" }, 401);
    }

    if (tenant.status !== "ACTIVE") {
      return noStoreJson({ ok: false, error: "TENANT_NOT_ACTIVE" }, 403);
    }

    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        tenantId: sess.tenantId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        tenantId: true,
        classroomId: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        guardianPhoneNorm: true,
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            arm: true,
          },
        },
      },
    });

    if (!student) {
      return noStoreJson({ ok: false, error: "STUDENT_NOT_FOUND" }, 404);
    }

    const ownsStudent = parentOwnsStudent({
      sessGuardianPhoneE164: sess.guardianPhoneE164,
      sessGuardianSuffix9: sess.guardianSuffix9,
      studentGuardianPhoneNorm: student.guardianPhoneNorm,
      studentGuardianPhone: student.guardianPhone,
    });

    if (!ownsStudent) {
      return noStoreJson({ ok: false, error: "GUARDIAN_MISMATCH" }, 403);
    }

    if (!student.classroomId) {
      return noStoreJson(
        {
          ok: true,
          released: false,
          reason: "NO_CLASSROOM",
          message: "No classroom is assigned to this learner yet.",
          student,
          releases: [],
          latestRelease: null,
        },
        200,
      );
    }

    const releases = await prisma.mockResultsRelease.findMany({
      where: {
        tenantId: sess.tenantId,
        classroomId: student.classroomId,
        parentVisible: true,
        readinessStatus: { in: ["READY", "OVERRIDE"] },
        releaseSnapshotHash: { not: "" },
        mockExamSession: {
          tenantId: sess.tenantId,
          classroomId: student.classroomId,
          status: "LOCKED",
        },
      },
      orderBy: [{ releasedAt: "desc" }],
      select: {
        id: true,
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
        releaseMode: true,
        parentVisible: true,
        smsNotifiedAt: true,
        releasedAt: true,
        releasedByUser: {
          select: {
            name: true,
            email: true,
          },
        },
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
      },
    });

    const shaped = releases.map((release) => ({
      id: release.id,
      mockExamSessionId: release.mockExamSessionId,
      classroomId: release.classroomId,
      academicYear: release.academicYear,
      term: release.term,
      mockNumber: release.mockNumber,
      mockLabel: release.mockLabel,
      title: release.title,
      readinessStatus: String(release.readinessStatus),
      readinessScore: Number(release.readinessScore ?? 0),
      releaseSnapshotHash: release.releaseSnapshotHash,
      releaseMode: release.releaseMode,
      parentVisible: release.parentVisible,
      smsNotifiedAt: release.smsNotifiedAt
        ? release.smsNotifiedAt.toISOString()
        : null,
      releasedAt: release.releasedAt.toISOString(),
      releasedByName:
        cleanStr(release.releasedByUser?.name) ||
        cleanStr(release.releasedByUser?.email) ||
        null,
      session: {
        id: release.mockExamSession.id,
        status: release.mockExamSession.status,
        title: release.mockExamSession.title,
        mockLabel: release.mockExamSession.mockLabel,
        mockNumber: release.mockExamSession.mockNumber,
        academicYear: release.mockExamSession.academicYear,
        term: release.mockExamSession.term,
      },
    }));

    return noStoreJson({
      ok: true,
      released: shaped.length > 0,
      student: {
        id: student.id,
        name: [student.firstName, student.lastName].filter(Boolean).join(" ").trim(),
        classroomId: student.classroomId,
        classroom: student.classroom,
      },
      latestRelease: shaped[0] ?? null,
      releases: shaped,
    });
  } catch (err) {
    console.error("[PARENT_MOCK_RELEASE_STATUS_ERROR]", err);
    return noStoreJson(
      { ok: false, error: "FAILED_TO_LOAD_PARENT_MOCK_RELEASE_STATUS" },
      500,
    );
  }
}