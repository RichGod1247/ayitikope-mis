// src/app/api/headteacher/students/attendance-summary/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export async function GET(req: Request) {
  let ctx: any;
  try {
    ctx = await requireServerUserContext({
      requireTenant: true,
      requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "ADMIN"],
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const tenantId = ctx.tenantId;

    // Tenant-safe aggregation: AttendanceSession has tenantId, so join through it.
    const rows = await prisma.$queryRaw<
      Array<{
        studentId: string;
        present: number;
        absent: number;
        late: number;
        other: number;
        totalMarks: number;
      }>
    >`
      SELECT
        m."studentId"::text AS "studentId",
        SUM(CASE WHEN m."status" = 'PRESENT' THEN 1 ELSE 0 END)::int AS "present",
        SUM(CASE WHEN m."status" = 'ABSENT'  THEN 1 ELSE 0 END)::int AS "absent",
        SUM(CASE WHEN m."status" = 'LATE'    THEN 1 ELSE 0 END)::int AS "late",
        SUM(
          CASE
            WHEN m."status" IS NULL THEN 1
            WHEN m."status" NOT IN ('PRESENT','ABSENT','LATE') THEN 1
            ELSE 0
          END
        )::int AS "other",
        COUNT(*)::int AS "totalMarks"
      FROM "edulife_os"."AttendanceMark" m
      JOIN "edulife_os"."AttendanceSession" s
        ON s."id" = m."sessionId"
      WHERE s."tenantId" = ${tenantId}
        AND s."certifiedAt" IS NOT NULL
        AND s."isHoliday" = false
        AND m."studentId" IS NOT NULL
      GROUP BY m."studentId"
    `;

    const byStudent: Record<
      string,
      {
        present: number;
        absent: number;
        late: number;
        other: number;
        totalMarks: number;
        attendanceRate: number | null;
      }
    > = {};

    for (const r of rows) {
      const denom = (r.present ?? 0) + (r.absent ?? 0);
      byStudent[r.studentId] = {
        present: r.present ?? 0,
        absent: r.absent ?? 0,
        late: r.late ?? 0,
        other: r.other ?? 0,
        totalMarks: r.totalMarks ?? 0,
        attendanceRate: denom > 0 ? (r.present ?? 0) / denom : null,
      };
    }

    return NextResponse.json({ ok: true, tenantId, byStudent }, { status: 200 });
  } catch (err: any) {
    console.error("Error in /api/headteacher/students/attendance-summary", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unexpected error while loading attendance summary." },
      { status: 500 }
    );
  }
}
