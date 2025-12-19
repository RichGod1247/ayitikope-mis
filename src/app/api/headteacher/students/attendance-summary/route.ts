// src/app/api/headteacher/students/attendance-summary/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    // 1) Ensure user is signed in
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId: string | undefined = user?.id;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Not signed in" },
        { status: 401 }
      );
    }

    // 2) Find tenant via membership (for auth gate; DB is effectively single-tenant for now)
    const membership = await prisma.membership.findFirst({
      where: { userId },
    });

    if (!membership?.tenantId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No tenant membership found for this user",
        },
        { status: 401 }
      );
    }

    const tenantId = membership.tenantId;

    // 3) Load all attendance marks.
    //
    // NOTE:
    //  - AttendanceMark currently has no 'tenantId' field in the schema,
    //    so we cannot filter directly by tenant.
    //  - For now (single-tenant DB in practice), we aggregate all marks.
    //  - Later, when AttendanceMark is linked to tenant via relation,
    //    we can tighten this to tenant-specific marks.
    const marks = await prisma.attendanceMark.findMany({
      select: {
        studentId: true,
        status: true,
      },
    });

    type StudentAgg = {
      present: number;
      absent: number;
      late: number;
      other: number;
      totalMarks: number;
      attendanceRate: number | null;
    };

    const byStudent: Record<string, StudentAgg> = {};

    function ensureStudent(id: string): StudentAgg {
      if (!byStudent[id]) {
        byStudent[id] = {
          present: 0,
          absent: 0,
          late: 0,
          other: 0,
          totalMarks: 0,
          attendanceRate: null,
        };
      }
      return byStudent[id];
    }

    for (const m of marks) {
      if (!m.studentId) continue;

      const agg = ensureStudent(m.studentId);
      const raw = (m.status ?? "").toString().toLowerCase();

      if (raw === "present") {
        agg.present += 1;
      } else if (raw === "absent") {
        agg.absent += 1;
      } else if (raw === "late") {
        agg.late += 1;
      } else {
        agg.other += 1;
      }

      agg.totalMarks += 1;
    }

    // Compute attendanceRate per student
    for (const [studentId, agg] of Object.entries(byStudent)) {
      const denom = agg.present + agg.absent;
      agg.attendanceRate = denom > 0 ? agg.present / denom : null;
      byStudent[studentId] = agg;
    }

    return NextResponse.json(
      {
        ok: true,
        tenantId,
        byStudent,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(
      "Error in /api/headteacher/students/attendance-summary",
      err
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Unexpected error while loading per-learner attendance summary.",
      },
      { status: 500 }
    );
  }
}
