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

// If the browser ever preflights (or a proxy/middleware does), don't let it 405.
export async function OPTIONS() {
  return noStoreEmpty(204, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS,HEAD",
    "access-control-allow-headers": "content-type,accept",
  });
}

// Some environments/browsers can issue HEAD; don't let it 405 either.
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
  const s = normDigits(suffix);
  return s.length >= 7;
}

/**
 * Parent Term Report API (parent-cookie scoped)
 *
 * GET /api/parent/report/term?studentId=...&term=...&academicYear=...
 *
 * Parents are blocked unless results are released for:
 *  - whole school (scopeKey="SCHOOL"), OR
 *  - the student's classroom (scopeKey=classroomId)
 */
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

    // ✅ Parent authorization (match phone)
    const sessE164 = String(sess.guardianPhoneE164 ?? "").trim();
    const sessSuffix9 = normDigits(sess.guardianSuffix9 ?? "");

    const studentGuardianNorm = String(student.guardianPhoneNorm ?? "").trim();
    const studentGuardianRaw = String(student.guardianPhone ?? "").trim();

    const okByE164 =
      !!sessE164 &&
      !!studentGuardianNorm &&
      normDigits(sessE164) === normDigits(studentGuardianNorm);

    const okBySuffix =
      isValidSuffixForLookup(sessSuffix9) &&
      (phoneMatchesBySuffix(sessSuffix9, studentGuardianNorm) ||
        phoneMatchesBySuffix(sessSuffix9, studentGuardianRaw));

    if (!okByE164 && !okBySuffix) {
      return noStoreJson({ ok: false, error: "GUARDIAN_MISMATCH" }, 403);
    }

    // ✅ RELEASE ENFORCEMENT
    const classroomId = student.classroomId ? String(student.classroomId) : "";
    const scopeKeys = ["SCHOOL", ...(classroomId ? [classroomId] : [])];

    const rel = await prisma.resultsRelease.findFirst({
      where: { tenantId: sess.tenantId, term, academicYear, scopeKey: { in: scopeKeys } },
      select: { id: true, scope: true, scopeKey: true, releasedAt: true },
    });

    if (!rel) {
      return noStoreJson(
        { ok: false, error: "RESULTS_NOT_RELEASED", term, academicYear },
        403
      );
    }

    // ------------- Subjects (best-effort from AssessmentScore) -------------
    let subjects: any[] = [];
    try {
      const scores = await prisma.assessmentScore.findMany({
        where: {
          studentId: student.id,
          item: { term, academicYear, tenantId: sess.tenantId },
        },
        select: {
          score: true,
          item: { select: { subject: true, type: true, maxScore: true } },
        },
      });

      const bySubject: Record<string, { subject: string; total: number; max: number }> = {};

      for (const s of scores) {
        const subjectName = (s.item?.subject || "Subject").trim() || "Subject";
        if (!bySubject[subjectName]) bySubject[subjectName] = { subject: subjectName, total: 0, max: 0 };

        const sc = typeof s.score === "number" ? s.score : 0;
        const mx = typeof s.item?.maxScore === "number" ? s.item.maxScore : 0;

        bySubject[subjectName].total += sc;
        bySubject[subjectName].max += mx;
      }

      subjects = Object.values(bySubject).map((entry) => ({
        subject: entry.subject,
        classScore: null,
        examScore: null,
        totalScore: entry.total,
        maxScore: entry.max,
        percentage: entry.max > 0 ? (entry.total / entry.max) * 100 : null,
        grade: null,
        remark: null,
        position: null,
      }));
    } catch (err) {
      console.error("[PARENT_TERM_REPORT_SUBJECTS_ERROR]", err);
      subjects = [];
    }

    // Attendance summary: still null for now (safe)
    const attendanceSummary: any = null;

    // Fees summary (best-effort)
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
      const totalPaidPesewas = paidSum;

      feesSummary = {
        totalBilledPesewas,
        totalWaivedPesewas,
        totalPaidPesewas,
        outstandingPesewas: totalBilledPesewas - totalWaivedPesewas - totalPaidPesewas,
        lastPaymentDate: null,
      };
    } catch (err) {
      console.error("[PARENT_TERM_REPORT_FEES_ERROR]", err);
      feesSummary = null;
    }

    // Health summary (best-effort)
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
      healthSummary = null;
    }

    const termSummary: any = {
      term,
      academicYear,
      overallPercentage: null,
      overallPosition: null,
      classSize: null,
      promotedTo: null,
      attendance: attendanceSummary,
      fees: feesSummary,
      health: healthSummary,
      behaviour: null,
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
    });
  } catch (err) {
    console.error("[PARENT_TERM_REPORT_ERROR]", err);
    return noStoreJson({ ok: false, error: "Failed to load parent term report." }, 500);
  }
}