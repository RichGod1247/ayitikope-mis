// src/app/api/admin/attendance/absentees/route.ts
import { NextRequest, NextResponse } from "next/server";
import { AttendanceStatus, StudentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";
import { getGuardianEssentialAlertEligibilityMap } from "@/lib/essentialAlerts/enrollment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SmsEligibility = "SMS_ELIGIBLE" | "NO_SMS_OPT_IN" | "NO_PHONE";

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeRoleName(role: unknown) {
  return clean(role)
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z_]/g, "");
}

function roleEffective(role: unknown) {
  const r = normalizeRoleName(role);
  if (r === "ADMIN") return "SCHOOL_ADMIN";
  if (r === "HEADMASTER") return "HEADTEACHER";
  return r;
}

function isAdminLike(role: unknown) {
  const r = roleEffective(role);
  return r === "SCHOOL_ADMIN" || r === "HEADTEACHER" || r.includes("OWNER") || r.includes("SUPER");
}

async function requireAdminLike(tenantId: string, userId: string, fallbackRoleName?: string | null) {
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  const roleName = membership?.role?.name ?? fallbackRoleName ?? null;

  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false as const, status: 403, error: "FORBIDDEN" };
  }

  if (!isAdminLike(roleName)) {
    return { ok: false as const, status: 403, error: "FORBIDDEN" };
  }

  return { ok: true as const };
}

function parseDayUtc(dateParam: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return null;

  const start = new Date(`${dateParam}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;

  const endExclusive = new Date(start);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  return { start, endExclusive };
}

function classLabel(c: { name?: string | null; grade?: string | null; arm?: string | null }) {
  const name = clean(c.name);
  const gradeArm = [clean(c.grade), clean(c.arm)].filter(Boolean).join(" ");
  return name || gradeArm || "Unknown class";
}

function studentName(s: { firstName?: string | null; lastName?: string | null }) {
  return [clean(s.firstName), clean(s.lastName)].filter(Boolean).join(" ") || "Unnamed learner";
}

export async function GET(req: NextRequest) {
  let ctx: { tenantId: string; userId: string; roleName?: string | null };

  try {
    const safe = await requireServerUserContext({ requireTenant: true });
    ctx = {
      tenantId: safe.tenantId,
      userId: safe.userId,
      roleName: safe.roleName ?? null,
    };
  } catch {
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const roleOk = await requireAdminLike(ctx.tenantId, ctx.userId, ctx.roleName ?? null);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  const { searchParams } = new URL(req.url);

  const guard = assertNoTenantOverride(searchParams.get("tenantId"), ctx.tenantId);
  if (!guard.ok) return jsonNoStore({ ok: false, error: guard.error }, guard.status);

  const dateParam = clean(searchParams.get("date"));
  if (!dateParam) {
    return jsonNoStore({ ok: false, error: "date (YYYY-MM-DD) is required." }, 400);
  }

  const day = parseDayUtc(dateParam);
  if (!day) {
    return jsonNoStore({ ok: false, error: "Invalid date format. Use YYYY-MM-DD." }, 400);
  }

  const classroomId = clean(searchParams.get("classroomId"));
  const classQuery = clean(searchParams.get("class"));

  try {
    const classrooms = await prisma.classroom.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(classroomId ? { id: classroomId } : {}),
        ...(classQuery
          ? {
              OR: [
                { name: { contains: classQuery, mode: "insensitive" } },
                { grade: { contains: classQuery, mode: "insensitive" } },
                { arm: { contains: classQuery, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        grade: true,
        arm: true,
      },
      orderBy: [{ grade: "asc" }, { arm: "asc" }, { name: "asc" }],
    });

    const classroomIds = classrooms.map((classroom) => classroom.id);

    if (!classroomIds.length) {
      return jsonNoStore(
        {
          ok: true,
          items: [],
          count: 0,
          date: dateParam,
          tenantId: ctx.tenantId,
          summary: {
            absentCount: 0,
            smsEligible: 0,
            skippedNoOptIn: 0,
            skippedNotEnrolled: 0,
            skippedNoPhone: 0,
            eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT",
            essentialAlertPurpose: "STUDENT_ATTENDANCE",
          },
        },
        200
      );
    }

    const sessions = await prisma.attendanceSession.findMany({
      where: {
        tenantId: ctx.tenantId,
        classroomId: { in: classroomIds },
        date: { gte: day.start, lt: day.endExclusive },
      },
      select: {
        id: true,
        date: true,
        classroomId: true,
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            arm: true,
          },
        },
        marks: {
          where: {
            status: AttendanceStatus.ABSENT,
            student: {
              tenantId: ctx.tenantId,
              status: StudentStatus.ACTIVE,
            },
          },
          select: {
            id: true,
            note: true,
            createdAt: true,
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                guardianName: true,
                guardianPhone: true,
                guardianPhoneNorm: true,
                guardianSmsOptIn: true,
                classroomId: true,
              },
            },
          },
        },
      },
      orderBy: [{ date: "asc" }],
      take: 2000,
    });

    const guardianEligibilityByStudent =
      await getGuardianEssentialAlertEligibilityMap({
        tenantId: ctx.tenantId,
        purpose: "STUDENT_ATTENDANCE",
        students: sessions.flatMap((session) =>
          session.marks.map((mark) => ({
            id: mark.student.id,
            guardianPhone: mark.student.guardianPhone,
            guardianPhoneNorm: mark.student.guardianPhoneNorm,
          })),
        ),
      });

    const items = sessions.flatMap((session) => {
      const label = classLabel(session.classroom);
      const dateISO = session.date.toISOString().slice(0, 10);

      return session.marks.map((mark) => {
        const essentialAlertEligibility =
          guardianEligibilityByStudent.get(mark.student.id) ?? {
            eligible: false,
            reason: "NOT_ENROLLED" as const,
            phoneNorm: null,
            enrollmentStatus: null,
          };

        const eligibility: SmsEligibility = essentialAlertEligibility.eligible
          ? "SMS_ELIGIBLE"
          : essentialAlertEligibility.reason === "NO_PHONE"
            ? "NO_PHONE"
            : "NO_SMS_OPT_IN";

        return {
          markId: mark.id,
          studentId: mark.student.id,
          studentName: studentName(mark.student),
          classLabel: label,
          classroomId: session.classroomId,
          guardianName: mark.student.guardianName ?? null,
          guardianPhone: mark.student.guardianPhone ?? null,
          guardianPhoneNorm: mark.student.guardianPhoneNorm ?? null,
          guardianSmsOptIn: !!mark.student.guardianSmsOptIn,
          legacyGuardianSmsOptIn: !!mark.student.guardianSmsOptIn,
          essentialAlertEligibility: essentialAlertEligibility.reason,
          eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT" as const,
          essentialAlertPurpose: "STUDENT_ATTENDANCE" as const,
          smsEligibility: eligibility,
          smsEligible: eligibility === "SMS_ELIGIBLE",
          note: mark.note ?? null,
          markedAt: mark.createdAt.toISOString(),
          date: dateISO,
          sessionId: session.id,
        };
      });
    });

    const summary = items.reduce(
      (acc, item) => {
        acc.absentCount += 1;

        if (item.smsEligibility === "SMS_ELIGIBLE") acc.smsEligible += 1;
        if (item.smsEligibility === "NO_SMS_OPT_IN") acc.skippedNoOptIn += 1;
        if (item.smsEligibility === "NO_PHONE") acc.skippedNoPhone += 1;

        return acc;
      },
      {
        absentCount: 0,
        smsEligible: 0,
        skippedNoOptIn: 0,
        skippedNoPhone: 0,
      }
    );

    return jsonNoStore(
      {
        ok: true,
        items,
        count: items.length,
        date: dateParam,
        tenantId: ctx.tenantId,
        summary: {
          ...summary,
          skippedNotEnrolled: summary.skippedNoOptIn,
          eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT",
          essentialAlertPurpose: "STUDENT_ATTENDANCE",
        },
      },
      200
    );
  } catch (err: unknown) {
    console.error("[ADMIN_ABSENTEES_ERROR]", err);
    return jsonNoStore(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to load absentees. Please try again.",
      },
      500
    );
  }
}
