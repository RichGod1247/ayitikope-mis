// src/app/api/headteacher/health/summary/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/headteacher/health/summary
 *
 * Returns a simple pilot summary of:
 *  - Student daily health entries in the last 7 days
 *  - Teacher weekly wellbeing entries in the last 28 days
 *
 * This is Step 7 of Phase 6 coming alive inside Phase 8.
 */
export async function GET(req: Request) {
  try {
    // 1) Auth – ensure headteacher is signed in
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userId: string | undefined = user?.id;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Not signed in" },
        { status: 401 }
      );
    }

    // 2) Tenant – find which school this headteacher belongs to
    const membership = await prisma.membership.findFirst({
      where: { userId },
    });

    if (!membership?.tenantId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No tenant membership found for this user.",
        },
        { status: 401 }
      );
    }

    const tenantId = membership.tenantId;

    // 3) Time windows
    const now = new Date();
    const sevenDaysAgo = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000
    );
    const twentyEightDaysAgo = new Date(
      now.getTime() - 28 * 24 * 60 * 60 * 1000
    );

    // 4) Counts from real health tables.
    //
    // FIRST VERSION (pilot):
    //  - only rely on tenantId + createdAt
    //  - just counts, no breakdown by status yet
    //
    // Prisma models (from naming convention):
    //   model StudentHealthDaily   -> prisma.studentHealthDaily
    //   model TeacherHealthWeekly  -> prisma.teacherHealthWeekly
    const [studentDailyCount, teacherWeeklyCount] = await Promise.all([
      prisma.studentHealthDaily.count({
        where: {
          tenantId,
          createdAt: {
            gte: sevenDaysAgo,
          },
        },
      }),
      prisma.teacherHealthWeekly.count({
        where: {
          tenantId,
          createdAt: {
            gte: twentyEightDaysAgo,
          },
        },
      }),
    ]);

    return NextResponse.json(
      {
        ok: true,
        tenantId,
        windows: {
          studentDailySince: sevenDaysAgo.toISOString(),
          teacherWeeklySince: twentyEightDaysAgo.toISOString(),
        },
        studentDaily: {
          entriesLast7Days: studentDailyCount,
        },
        teacherWeekly: {
          entriesLast28Days: teacherWeeklyCount,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(
      "Error in /api/headteacher/health/summary",
      err
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Unexpected error while summarising health & wellbeing.",
      },
      { status: 500 }
    );
  }
}
