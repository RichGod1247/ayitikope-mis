// src/app/api/headteacher/attendance/summary/route.ts

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

    // 2) Find tenant via membership (for auth / future filtering)
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

    // 3) Load all attendance marks
    //
    // NOTE:
    //  - Your AttendanceMark model currently does NOT expose `tenantId`,
    //    so we cannot filter by tenantId at the moment.
    //  - For now, we summarise ALL AttendanceMark records.
    //  - Later, once AttendanceMark is linked to tenant via a field
    //    or relation, we can tighten this filter.
    const marks = await prisma.attendanceMark.findMany({
      select: {
        status: true,
      },
    });

    const totalMarks = marks.length;

    let present = 0;
    let absent = 0;
    let late = 0;
    let other = 0;

    for (const m of marks) {
      const raw = (m.status ?? "").toString().toLowerCase();

      if (raw === "present") {
        present += 1;
      } else if (raw === "absent") {
        absent += 1;
      } else if (raw === "late") {
        late += 1;
      } else {
        other += 1;
      }
    }

    const denom = present + absent;
    const attendanceRate = denom > 0 ? present / denom : null;

    return NextResponse.json(
      {
        ok: true,
        tenantId,
        totalMarks,
        byStatus: {
          present,
          absent,
          late,
          other,
        },
        attendanceRate,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(
      "Error in /api/headteacher/attendance/summary",
      err
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Unexpected error while loading attendance summary.",
      },
      { status: 500 }
    );
  }
}
