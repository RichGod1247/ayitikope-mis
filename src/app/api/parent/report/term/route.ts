// src/app/api/parent/report/term/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Parent Term Report API
 *
 * GET /api/parent/report/term?tenantId=...&studentId=...&term=...&academicYear=...
 *
 * Returns a BECE-style report shell for a single learner:
 * - student + classroom info
 * - subjects (from assessment scores) – best-effort
 * - fees summary – per learner
 * - health summary – per learner
 * - placeholders for attendance & behaviour
 *
 * All sub-sections are wrapped in try/catch so a failure
 * in one section doesn't crash the whole route.
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const tenantId = searchParams.get("tenantId");
    const studentId = searchParams.get("studentId");
    const term = searchParams.get("term") ?? "1st Term";
    const academicYear =
      searchParams.get("academicYear") ?? "2025/2026";

    // Basic validation
    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required." },
        { status: 400 }
      );
    }

    if (!studentId) {
      return NextResponse.json(
        { ok: false, error: "studentId is required." },
        { status: 400 }
      );
    }

    // Use "any" client to avoid TS complaining about Prisma types
    const client = prisma as any;

    // 1) Load student + classroom (this is the only REQUIRED query)
    const student = await client.student.findFirst({
      where: {
        id: studentId,
        tenantId,
      },
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
      // If this fails, front-end will show "Student not found..."
      return NextResponse.json(
        {
          ok: false,
          error: "Student not found for this tenant.",
        },
        { status: 404 }
      );
    }

    // 2) Subjects from AssessmentScore – best-effort
    let subjects: any[] = [];
    try {
      const scores = await client.assessmentScore.findMany({
        where: {
          studentId: student.id,
          item: {
            term,
            academicYear,
            tenantId,
          },
        },
        select: {
          score: true,
          item: {
            select: {
              subject: true,
              type: true,
              maxScore: true,
            },
          },
        },
      });

      const bySubject: Record<
        string,
        { subject: string; total: number; max: number }
      > = {};

      for (const s of scores) {
        const subjectName = s.item?.subject || "Subject";
        if (!bySubject[subjectName]) {
          bySubject[subjectName] = {
            subject: subjectName,
            total: 0,
            max: 0,
          };
        }
        const entry = bySubject[subjectName];
        const scr =
          typeof s.score === "number" ? s.score : 0;
        entry.total += scr;

        const max =
          typeof s.item?.maxScore === "number"
            ? s.item.maxScore
            : 0;
        entry.max += max;
      }

      subjects = Object.values(bySubject).map((entry) => {
        const percentage =
          entry.max > 0
            ? (entry.total / entry.max) * 100
            : null;

        return {
          subject: entry.subject,
          classScore: null, // can be wired later
          examScore: null, // can be wired later
          totalScore: entry.total,
          maxScore: entry.max,
          percentage,
          grade: null, // UI will recompute GES grade from percentage
          remark: null, // UI will compute remark
          position: null, // subject position – later
        };
      });
    } catch (err) {
      console.error(
        "[PARENT_TERM_REPORT_SUBJECTS_ERROR]",
        err
      );
      subjects = [];
    }

    // 3) Attendance summary – placeholder for now
    let attendanceSummary: any = null;
    try {
      // When we are ready, we will plug in AttendanceMark here.
      attendanceSummary = null;
    } catch (err) {
      console.error(
        "[PARENT_TERM_REPORT_ATTENDANCE_ERROR]",
        err
      );
      attendanceSummary = null;
    }

    // 4) Fees summary – per learner, wrapped in try/catch
    let feesSummary: any = null;
    try {
      const feeInvoiceAgg =
        await client.feeInvoice.aggregate({
          where: {
            tenantId,
            term,
            academicYear,
            // We assume FeeInvoice has a studentId field
            studentId: student.id,
          },
          _sum: {
            totalBilledPesewas: true,
            totalWaivedPesewas: true,
          },
        });

      const feePaymentAgg =
        await client.feePayment.aggregate({
          where: {
            tenantId,
            invoice: {
              term,
              academicYear,
              // We assume FeePayment -> invoice -> studentId exists
              studentId: student.id,
            },
          },
          _sum: {
            amountPesewas: true,
          },
        });

      const totalBilledPesewas =
        feeInvoiceAgg._sum.totalBilledPesewas ?? 0;
      const totalWaivedPesewas =
        feeInvoiceAgg._sum.totalWaivedPesewas ?? 0;
      const totalPaidPesewas =
        feePaymentAgg._sum.amountPesewas ?? 0;

      const outstandingPesewas =
        totalBilledPesewas -
        totalWaivedPesewas -
        totalPaidPesewas;

      feesSummary = {
        totalBilledPesewas,
        totalWaivedPesewas,
        totalPaidPesewas,
        outstandingPesewas,
        lastPaymentDate: null, // can be added later
      };
    } catch (err) {
      console.error(
        "[PARENT_TERM_REPORT_FEES_ERROR]",
        err
      );
      feesSummary = null;
    }

    // 5) Health summary – per learner, wrapped in try/catch
    let healthSummary: any = null;
    try {
      const screenings =
        await client.studentHealthDaily.findMany({
          where: {
            tenantId,
            studentId: student.id,
          },
          orderBy: {
            date: "desc",
          },
          take: 50,
        });

      const totalScreenings = screenings.length;
      const feverCount = screenings.filter(
        (h: any) => (h.temperatureC ?? 0) >= 37.8
      ).length;
      const symptomsCount = screenings.filter(
        (h: any) =>
          !!h.symptoms && h.symptoms.trim().length > 0
      ).length;
      const lastScreenedAt = screenings[0]?.date ?? null;

      healthSummary = {
        totalScreenings,
        feverCount,
        symptomsCount,
        lastScreenedAt,
        overallFlag: null,
      };
    } catch (err) {
      console.error(
        "[PARENT_TERM_REPORT_HEALTH_ERROR]",
        err
      );
      healthSummary = null;
    }

    // 6) Term-wide summary – mostly placeholders, UI will still render nicely
    const termSummary: any = {
      term,
      academicYear,
      overallPercentage: null, // we can compute later
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

    const payload = {
      ok: true,
      context: {
        tenantId,
        studentId,
        term,
        academicYear,
      },
      student,
      classroom: student.classroom,
      termSummary,
      subjects,
      attendanceSummary,
      feesSummary,
      healthSummary,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[PARENT_TERM_REPORT_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load parent term report.",
      },
      { status: 500 }
    );
  }
}
