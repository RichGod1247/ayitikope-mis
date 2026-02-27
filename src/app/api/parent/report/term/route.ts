// src/app/api/parent/report/term/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalisePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return String(phone).replace(/\D/g, "");
}

function phoneMatches(a: string, b: string) {
  const A = normalisePhone(a);
  const B = normalisePhone(b);
  if (!A || !B) return false;
  return A.endsWith(B) || B.endsWith(A);
}

const ADMINISH = new Set(["ADMIN", "SCHOOL_ADMIN", "HEADTEACHER"]);

async function getSafeTenantCtx() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;

  const userId = typeof u?.id === "string" ? u.id : "";
  const tenantId = typeof u?.tenantId === "string" ? u.tenantId : "";
  const userPhone = normalisePhone(u?.phone ?? u?.phoneNumber ?? u?.guardianPhone ?? "");

  if (!session || !userId) {
    return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  }
  if (!tenantId) {
    return { ok: false as const, status: 403, error: "NO_ACTIVE_TENANT" };
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false as const, status: 403, error: "FORBIDDEN" };
  }

  return {
    ok: true as const,
    userId,
    tenantId,
    userPhone,
    roleName: String(membership.role?.name ?? "").trim(),
  };
}

/**
 * Parent Term Report API (session-tenant scoped)
 *
 * GET /api/parent/report/term?tenantId=...&studentId=...&term=...&academicYear=...
 *
 * tenantId param is backward-compat ONLY. Actual tenantId comes from session.
 */
export async function GET(req: NextRequest) {
  try {
    const safe = await getSafeTenantCtx();
    if (!safe.ok) {
      return NextResponse.json(
        { ok: false, error: safe.error },
        { status: safe.status, headers: { "cache-control": "no-store" } }
      );
    }

    // 🔒 Role gate (Roadmap #1)
    const isParent = safe.roleName === "PARENT";
    const isAdminish = ADMINISH.has(safe.roleName);
    if (!isParent && !isAdminish) {
      return NextResponse.json(
        { ok: false, error: "FORBIDDEN" },
        { status: 403, headers: { "cache-control": "no-store" } }
      );
    }

    const { searchParams } = new URL(req.url);

    const tenantIdParam = String(searchParams.get("tenantId") || "").trim();
    if (tenantIdParam && tenantIdParam !== safe.tenantId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden (tenant mismatch)." },
        { status: 403, headers: { "cache-control": "no-store" } }
      );
    }

    const studentId = String(searchParams.get("studentId") || "").trim();
    const term = String(searchParams.get("term") || "1st Term").trim();
    const academicYear = String(searchParams.get("academicYear") || "2025/2026").trim();

    if (!studentId) {
      return NextResponse.json(
        { ok: false, error: "studentId is required." },
        { status: 400, headers: { "cache-control": "no-store" } }
      );
    }

    const client = prisma as any;

    // 1) Load student + classroom (required)
    const student = await client.student.findFirst({
      where: { id: studentId, tenantId: safe.tenantId },
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
        note: true,
        classroom: {
          select: { id: true, name: true, grade: true, arm: true },
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        { ok: false, error: "Student not found for this tenant." },
        { status: 404, headers: { "cache-control": "no-store" } }
      );
    }

    // 1b) Parent authorization: must match student's guardianPhone
    if (isParent) {
      if (!safe.userPhone) {
        return NextResponse.json(
          { ok: false, error: "PARENT_PHONE_MISSING_IN_SESSION" },
          { status: 400, headers: { "cache-control": "no-store" } }
        );
      }

      const studentGuardian = normalisePhone(student.guardianPhone);
      if (!studentGuardian) {
        return NextResponse.json(
          { ok: false, error: "NO_GUARDIAN_PHONE_ON_STUDENT" },
          { status: 403, headers: { "cache-control": "no-store" } }
        );
      }

      if (!phoneMatches(safe.userPhone, studentGuardian)) {
        return NextResponse.json(
          { ok: false, error: "Forbidden (guardian mismatch)." },
          { status: 403, headers: { "cache-control": "no-store" } }
        );
      }
    }

    // 2) Subjects from AssessmentScore – best-effort
    let subjects: any[] = [];
    try {
      const scores = await client.assessmentScore.findMany({
        where: {
          studentId: student.id,
          item: { term, academicYear, tenantId: safe.tenantId },
        },
        select: {
          score: true,
          item: { select: { subject: true, type: true, maxScore: true } },
        },
      });

      const bySubject: Record<string, { subject: string; total: number; max: number }> = {};

      for (const s of scores) {
        const subjectName = s.item?.subject || "Subject";
        if (!bySubject[subjectName]) bySubject[subjectName] = { subject: subjectName, total: 0, max: 0 };

        bySubject[subjectName].total += typeof s.score === "number" ? s.score : 0;
        bySubject[subjectName].max += typeof s.item?.maxScore === "number" ? s.item.maxScore : 0;
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

    // 3) Attendance summary – placeholder
    const attendanceSummary: any = null;

    // 4) Fees summary – robust best-effort (don’t assume relation names always work)
    let feesSummary: any = null;
    try {
      const invAgg = await client.feeInvoice.aggregate({
        where: { tenantId: safe.tenantId, term, academicYear, studentId: student.id },
        _sum: { totalBilledPesewas: true, totalWaivedPesewas: true },
      });

      let paidSum = 0;

      try {
        // If FeePayment.invoice relation exists
        const payAgg = await client.feePayment.aggregate({
          where: { tenantId: safe.tenantId, invoice: { term, academicYear, studentId: student.id } },
          _sum: { amountPesewas: true },
        });
        paidSum = payAgg._sum.amountPesewas ?? 0;
      } catch {
        // Fallback: load invoice IDs then sum payments
        const invoices = await client.feeInvoice.findMany({
          where: { tenantId: safe.tenantId, term, academicYear, studentId: student.id },
          select: { id: true },
        });
        const ids = invoices.map((x: any) => x.id);
        if (ids.length) {
          const pays = await client.feePayment.findMany({
            where: { tenantId: safe.tenantId, invoiceId: { in: ids } },
            select: { amountPesewas: true },
          });
          paidSum = pays.reduce((s: number, p: any) => s + (p.amountPesewas ?? 0), 0);
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

    // 5) Health summary – best-effort
    let healthSummary: any = null;
    try {
      const screenings = await client.studentHealthDaily.findMany({
        where: { tenantId: safe.tenantId, studentId: student.id },
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

    return NextResponse.json(
      {
        ok: true,
        context: { tenantId: safe.tenantId, studentId, term, academicYear },
        student,
        classroom: student.classroom,
        termSummary,
        subjects,
        attendanceSummary,
        feesSummary,
        healthSummary,
      },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    console.error("[PARENT_TERM_REPORT_ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load parent term report." },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
