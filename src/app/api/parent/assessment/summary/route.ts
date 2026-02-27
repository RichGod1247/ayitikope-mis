// src/app/api/parent/assessment/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GesRemark = { grade: number; label: string; band: string };

function mapPercentageToGes(percentage: number | null): GesRemark | null {
  if (percentage == null || isNaN(percentage)) return null;
  const p = percentage;

  if (p >= 90 && p <= 100) return { grade: 1, label: "Excellent", band: "A+" };
  if (p >= 80 && p <= 89) return { grade: 2, label: "Very Good", band: "A" };
  if (p >= 70 && p <= 79) return { grade: 3, label: "Good", band: "B+" };
  if (p >= 60 && p <= 69) return { grade: 4, label: "High Average", band: "B" };
  if (p >= 55 && p <= 59) return { grade: 5, label: "Average", band: "C+" };
  if (p >= 50 && p <= 54) return { grade: 6, label: "Low Average", band: "C" };
  if (p >= 40 && p <= 49) return { grade: 7, label: "Low Average", band: "D" };
  if (p >= 35 && p <= 39) return { grade: 8, label: "Lower", band: "E" };
  return { grade: 9, label: "Lowest / Fail", band: "F" };
}

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

  if (!session || !userId) return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  if (!tenantId) return { ok: false as const, status: 403, error: "NO_ACTIVE_TENANT" };

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
    roleName: String(membership.role?.name ?? "").trim(),
    userPhone,
  };
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getSafeTenantCtx();
    if (!ctx.ok) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status, headers: { "cache-control": "no-store" } }
      );
    }

    const isParent = ctx.roleName === "PARENT";
    const isAdminish = ADMINISH.has(ctx.roleName);
    if (!isParent && !isAdminish) {
      return NextResponse.json(
        { ok: false, error: "FORBIDDEN" },
        { status: 403, headers: { "cache-control": "no-store" } }
      );
    }

    const { searchParams } = new URL(req.url);

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

    // Ensure student belongs to this tenant + guardian match if PARENT
    const student = await client.student.findFirst({
      where: { id: studentId, tenantId: ctx.tenantId },
      select: { id: true, guardianPhone: true },
    });

    if (!student) {
      return NextResponse.json(
        { ok: false, error: "Student not found for this tenant." },
        { status: 404, headers: { "cache-control": "no-store" } }
      );
    }

    if (isParent) {
      if (!ctx.userPhone) {
        return NextResponse.json(
          { ok: false, error: "PARENT_PHONE_MISSING_IN_SESSION" },
          { status: 400, headers: { "cache-control": "no-store" } }
        );
      }
      const studentGuardian = normalisePhone(student.guardianPhone);
      if (!studentGuardian || !phoneMatches(ctx.userPhone, studentGuardian)) {
        return NextResponse.json(
          { ok: false, error: "Forbidden (guardian mismatch)." },
          { status: 403, headers: { "cache-control": "no-store" } }
        );
      }
    }

    // Strict tenant scope via AssessmentItem.tenantId (if present).
    // If your schema doesn't have tenantId on item, we refuse to leak by returning empty.
    let scores: any[] = [];
    try {
      scores = await client.assessmentScore.findMany({
        where: {
          studentId,
          item: { term, academicYear, tenantId: ctx.tenantId },
        },
        select: {
          score: true,
          comment: true,
          item: {
            select: {
              id: true,
              subject: true,
              maxScore: true,
              term: true,
              academicYear: true,
              title: true,
              type: true,
              weighting: true,
              date: true,
              tenantId: true,
            },
          },
        },
      });
    } catch (err) {
      console.error("[PARENT_ASSESSMENT_SUMMARY_QUERY_ERROR]", err);
      return NextResponse.json(
        {
          ok: true,
          studentId,
          term,
          academicYear,
          summary: {
            totalItems: 0,
            totalObtained: 0,
            totalMax: 0,
            percentage: null,
            ges: null,
            subjects: [],
            note:
              "Assessment summary is unavailable because tenant-scoped assessment items are not yet configured safely.",
          },
        },
        { status: 200, headers: { "cache-control": "no-store" } }
      );
    }

    const totalItems = scores.length;

    if (totalItems === 0) {
      return NextResponse.json(
        {
          ok: true,
          studentId,
          term,
          academicYear,
          summary: {
            totalItems: 0,
            totalObtained: 0,
            totalMax: 0,
            percentage: null,
            ges: null,
            subjects: [],
            note:
              "No continuous assessment scores recorded yet for this learner in the selected term and academic year.",
          },
        },
        { status: 200, headers: { "cache-control": "no-store" } }
      );
    }

    let totalObtained = 0;
    let totalMax = 0;

    type SubjectAgg = { subject: string; itemCount: number; totalObtained: number; totalMax: number };
    const bySubject = new Map<string, SubjectAgg>();

    for (const row of scores) {
      const rawScore = typeof row.score === "number" ? row.score : 0;
      const maxScore = typeof row.item?.maxScore === "number" ? row.item.maxScore : 0;
      const subject = row.item?.subject || "Unknown";

      totalObtained += rawScore;
      totalMax += maxScore;

      if (!bySubject.has(subject)) {
        bySubject.set(subject, { subject, itemCount: 0, totalObtained: 0, totalMax: 0 });
      }
      const agg = bySubject.get(subject)!;
      agg.itemCount += 1;
      agg.totalObtained += rawScore;
      agg.totalMax += maxScore;
    }

    const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : null;
    const gesOverall = mapPercentageToGes(percentage != null ? Number(percentage.toFixed(2)) : null);

    const subjects = Array.from(bySubject.values()).map((agg) => {
      const subjectPercent = agg.totalMax > 0 ? (agg.totalObtained / agg.totalMax) * 100 : null;
      return {
        subject: agg.subject,
        itemCount: agg.itemCount,
        totalObtained: agg.totalObtained,
        totalMax: agg.totalMax,
        percentage: subjectPercent != null ? Number(subjectPercent.toFixed(2)) : null,
        ges: mapPercentageToGes(subjectPercent != null ? Number(subjectPercent.toFixed(2)) : null),
      };
    });

    return NextResponse.json(
      {
        ok: true,
        studentId,
        term,
        academicYear,
        summary: {
          totalItems,
          totalObtained,
          totalMax,
          percentage: percentage != null ? Number(percentage.toFixed(2)) : null,
          ges: gesOverall,
          subjects,
          note:
            "This summary uses recorded continuous assessment scores for this learner in the selected term and academic year, mapped to the GES BECE grading scale.",
        },
      },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    console.error("[PARENT_ASSESSMENT_SUMMARY_ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load assessment summary for this learner." },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
