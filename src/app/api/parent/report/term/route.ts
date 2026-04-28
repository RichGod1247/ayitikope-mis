// src/app/api/parent/report/term/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";
import { StudentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreJson(payload: any, status = 200, extraHeaders?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...(extraHeaders ?? {}),
    },
  });
}

function noStoreEmpty(status = 204, extraHeaders?: HeadersInit) {
  return new NextResponse(null, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...(extraHeaders ?? {}),
    },
  });
}

export async function OPTIONS() {
  return noStoreEmpty(204, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS,HEAD",
    "access-control-allow-headers": "content-type,accept",
  });
}

export async function HEAD() {
  return noStoreEmpty(200);
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

function naccaGrade(pct: number | null): string | null {
  if (pct == null) return null;
  if (pct >= 90) return "1";
  if (pct >= 80) return "2";
  if (pct >= 70) return "3";
  if (pct >= 60) return "4";
  if (pct >= 50) return "5";
  if (pct >= 40) return "6";
  return "7";
}

function naccaRemark(grade: string | null): string | null {
  const map: Record<string, string> = {
    "1": "Excellent",
    "2": "Very Good",
    "3": "Good",
    "4": "Credit",
    "5": "Pass",
    "6": "Below Average",
    "7": "Fail",
  };
  return grade ? (map[grade] ?? null) : null;
}

type TermDates = { gte: Date; lte: Date } | null;

function resolveTermDates(
  term: string,
  s: {
    term1Start: Date | null; term1End: Date | null;
    term2Start: Date | null; term2End: Date | null;
    term3Start: Date | null; term3End: Date | null;
  }
): TermDates {
  const t = term.toLowerCase().replace(/\s+/g, "");
  if (t.startsWith("1") || t === "firstterm") {
    if (s.term1Start && s.term1End) return { gte: s.term1Start, lte: s.term1End };
  }
  if (t.startsWith("2") || t === "secondterm") {
    if (s.term2Start && s.term2End) return { gte: s.term2Start, lte: s.term2End };
  }
  if (t.startsWith("3") || t === "thirdterm") {
    if (s.term3Start && s.term3End) return { gte: s.term3Start, lte: s.term3End };
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const gate = requireParentSession(req as any);
    if (!gate.ok) return gate.res as any;

    const sess = gate.session;

    const tenant = await prisma.tenant.findUnique({
      where: { id: sess.tenantId },
      select: { id: true, status: true, name: true },
    });

    if (!tenant) return noStoreJson({ ok: false, error: "TENANT_NOT_FOUND" }, 401);
    if (tenant.status !== "ACTIVE")
      return noStoreJson({ ok: false, error: "TENANT_NOT_ACTIVE" }, 403);

    const { searchParams } = new URL(req.url);
    const studentId = String(searchParams.get("studentId") || "").trim();
    const term = String(searchParams.get("term") || "1st Term").trim();
    const academicYear = String(searchParams.get("academicYear") || "2025/2026").trim();

    if (!studentId) return noStoreJson({ ok: false, error: "studentId is required." }, 400);

    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId: sess.tenantId, status: StudentStatus.ACTIVE },
      select: {
        id: true,
        tenantId: true,
        classroomId: true,
        firstName: true,
        lastName: true,
        sex: true,
        dob: true,
        guardianName: true,
        guardianPhone: true,
        guardianPhoneNorm: true,
        note: true,
        classroom: { select: { id: true, name: true, grade: true, arm: true } },
      },
    });

    if (!student) return noStoreJson({ ok: false, error: "STUDENT_NOT_FOUND" }, 404);

    const sessE164 = String(sess.guardianPhoneE164 ?? "").trim();
    const sessSuffix9 = normDigits(sess.guardianSuffix9 ?? "");
    const studentGuardianNorm = String(student.guardianPhoneNorm ?? "").trim();
    const studentGuardianRaw = String(student.guardianPhone ?? "").trim();

    const okByE164 =
      !!sessE164 && !!studentGuardianNorm &&
      normDigits(sessE164) === normDigits(studentGuardianNorm);

    const okBySuffix =
      isValidSuffixForLookup(sessSuffix9) &&
      (phoneMatchesBySuffix(sessSuffix9, studentGuardianNorm) ||
        phoneMatchesBySuffix(sessSuffix9, studentGuardianRaw));

    if (!okByE164 && !okBySuffix) {
      return noStoreJson({ ok: false, error: "GUARDIAN_MISMATCH" }, 403);
    }

    const classroomId = student.classroomId ? String(student.classroomId) : "";
    const scopeKeys = ["SCHOOL", ...(classroomId ? [classroomId] : [])];

    const rel = await prisma.resultsRelease.findFirst({
      where: { tenantId: sess.tenantId, term, academicYear, scopeKey: { in: scopeKeys } },
      select: { id: true },
    });

    if (!rel) {
      return noStoreJson({ ok: false, error: "RESULTS_NOT_RELEASED", term, academicYear }, 403);
    }

    // Fetch TenantSettings for term date ranges (used for attendance scoping)
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: sess.tenantId },
      select: {
        term1Start: true, term1End: true,
        term2Start: true, term2End: true,
        term3Start: true, term3End: true,
      },
    });

    // ------------- Subjects with NaCCA grades -------------
    let subjects: any[] = [];
    try {
      const scores = await prisma.assessmentScore.findMany({
        where: {
          studentId: student.id,
          item: { term, academicYear, tenantId: sess.tenantId },
        },
        select: {
          score: true,
          item: { select: { subject: true, maxScore: true } },
        },
      });

      const bySubject: Record<string, { subject: string; total: number; max: number }> = {};
      for (const s of scores) {
        const name = (s.item?.subject || "Subject").trim() || "Subject";
        if (!bySubject[name]) bySubject[name] = { subject: name, total: 0, max: 0 };
        bySubject[name].total += typeof s.score === "number" ? s.score : 0;
        bySubject[name].max += typeof s.item?.maxScore === "number" ? s.item.maxScore : 0;
      }

      subjects = Object.values(bySubject).map((entry) => {
        const pct = entry.max > 0 ? (entry.total / entry.max) * 100 : null;
        const grade = naccaGrade(pct);
        return {
          subject: entry.subject,
          classScore: null,
          examScore: null,
          totalScore: entry.total,
          maxScore: entry.max,
          percentage: pct,
          grade,
          remark: naccaRemark(grade),
          position: null,
        };
      });
    } catch (err) {
      console.error("[PARENT_TERM_REPORT_SUBJECTS_ERROR]", err);
    }

    // Overall percentage from subject totals
    const totalScoreSum = subjects.reduce((s, x) => s + (x.totalScore ?? 0), 0);
    const maxScoreSum = subjects.reduce((s, x) => s + (x.maxScore ?? 0), 0);
    const overallPercentage = maxScoreSum > 0 ? (totalScoreSum / maxScoreSum) * 100 : null;

    // ------------- Attendance summary (scoped to term dates when configured) -------------
    let attendanceSummary: any = null;
    try {
      const termDates = settings ? resolveTermDates(term, settings) : null;
      const sessionFilter: any = {
        tenantId: sess.tenantId,
        ...(classroomId ? { classroomId } : {}),
        ...(termDates ? { date: termDates } : {}),
      };

      const marks = await prisma.attendanceMark.findMany({
        where: { studentId: student.id, session: sessionFilter },
        select: { status: true },
      });

      const totalSchoolDays = classroomId
        ? await prisma.attendanceSession.count({
            where: { ...sessionFilter, isClosed: true },
          })
        : 0;

      attendanceSummary = {
        daysPresent: marks.filter((m: any) => m.status === "PRESENT").length,
        daysAbsent: marks.filter((m: any) => m.status === "ABSENT").length,
        daysLate: marks.filter((m: any) => m.status === "LATE").length,
        totalSchoolDays,
      };
    } catch (err) {
      console.error("[PARENT_TERM_REPORT_ATTENDANCE_ERROR]", err);
    }

    // ------------- Headteacher signature -------------
    let headteacherSignature: string | null = null;
    try {
      const sig = await prisma.headteacherSignature.findFirst({
        where: { tenantId: sess.tenantId },
        select: { signatureSvg: true },
        orderBy: { updatedAt: "desc" },
      });
      headteacherSignature = sig?.signatureSvg ?? null;
    } catch (err) {
      console.error("[PARENT_TERM_REPORT_SIGNATURE_ERROR]", err);
    }

    // ------------- Fees summary (best-effort) -------------
    let feesSummary: any = null;
    try {
      const invAgg = await prisma.feeInvoice.aggregate({
        where: { tenantId: sess.tenantId, term, academicYear, studentId: student.id },
        _sum: { totalBilledPesewas: true, totalWaivedPesewas: true },
      });

      let paidSum = 0;
      try {
        const payAgg = await prisma.feePayment.aggregate({
          where: { tenantId: sess.tenantId, invoice: { term, academicYear, studentId: student.id } },
          _sum: { amountPesewas: true },
        });
        paidSum = payAgg._sum.amountPesewas ?? 0;
      } catch {
        const invoices = await prisma.feeInvoice.findMany({
          where: { tenantId: sess.tenantId, term, academicYear, studentId: student.id },
          select: { id: true },
        });
        const ids = invoices.map((x) => x.id);
        if (ids.length) {
          const pays = await prisma.feePayment.findMany({
            where: { tenantId: sess.tenantId, invoiceId: { in: ids } },
            select: { amountPesewas: true },
          });
          paidSum = pays.reduce((sum, p) => sum + (p.amountPesewas ?? 0), 0);
        }
      }

      const totalBilledPesewas = invAgg._sum.totalBilledPesewas ?? 0;
      const totalWaivedPesewas = invAgg._sum.totalWaivedPesewas ?? 0;
      feesSummary = {
        totalBilledPesewas,
        totalWaivedPesewas,
        totalPaidPesewas: paidSum,
        outstandingPesewas: totalBilledPesewas - totalWaivedPesewas - paidSum,
        lastPaymentDate: null,
      };
    } catch (err) {
      console.error("[PARENT_TERM_REPORT_FEES_ERROR]", err);
    }

    // ------------- Health summary (best-effort) -------------
    let healthSummary: any = null;
    try {
      const screenings = await prisma.studentHealthDaily.findMany({
        where: { tenantId: sess.tenantId, studentId: student.id },
        orderBy: { date: "desc" },
        take: 50,
      });

      healthSummary = {
        totalScreenings: screenings.length,
        feverCount: screenings.filter((h: any) => (h.temperatureC ?? 0) >= 37.8).length,
        symptomsCount: screenings.filter((h: any) => !!h.symptoms && String(h.symptoms).trim().length > 0).length,
        lastScreenedAt: screenings[0]?.date ?? null,
        overallFlag: null,
      };
    } catch (err) {
      console.error("[PARENT_TERM_REPORT_HEALTH_ERROR]", err);
    }

    const termSummary: any = {
      term,
      academicYear,
      overallPercentage,
      overallPosition: null,
      classSize: null,
      promotedTo: null,
      attendance: attendanceSummary,
      fees: feesSummary,
      health: healthSummary,
      behaviour: null, // No Behaviour model in schema yet — will be wired when schema is added
      nextTermBegins: null,
      subjects,
    };

    return noStoreJson({
      ok: true,
      context: { tenantId: sess.tenantId, studentId, term, academicYear },
      student,
      classroom: student.classroom,
      termSummary,
      subjects,
      attendanceSummary,
      feesSummary,
      healthSummary,
      headteacherSignature,
    });
  } catch (err) {
    console.error("[PARENT_TERM_REPORT_ERROR]", err);
    return noStoreJson({ ok: false, error: "Failed to load parent term report." }, 500);
  }
}
