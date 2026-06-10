//src/app/api/admin/attendance/badges/classrooms/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ClassroomStatus, StudentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLES = [
  "ADMIN",
  "SCHOOL_ADMIN",
  "SCHOOLADMIN",
  "HEADTEACHER",
  "SUPERADMIN",
];

type ClassroomRow = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
  status: ClassroomStatus;
  _count: {
    students: number;
  };
};

function json(status: number, payload: unknown) {
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

function normalize(v: unknown) {
  return clean(v)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function hasArm(c: ClassroomRow) {
  return Boolean(clean(c.arm));
}

function levelKey(c: ClassroomRow) {
  return normalize(c.grade || c.name || c.id);
}

function classLabel(c: ClassroomRow) {
  return [c.name, c.grade, c.arm].filter(Boolean).join(" • ");
}

function chooseSingleStreamRows(rows: ClassroomRow[]) {
  const byLevel = new Map<string, ClassroomRow[]>();

  for (const row of rows) {
    const key = levelKey(row);
    const existing = byLevel.get(key) ?? [];
    existing.push(row);
    byLevel.set(key, existing);
  }

  const picked: ClassroomRow[] = [];

  for (const group of byLevel.values()) {
    const sorted = [...group].sort((a, b) => {
      // Prefer the no-arm canonical class first.
      if (!hasArm(a) && hasArm(b)) return -1;
      if (hasArm(a) && !hasArm(b)) return 1;

      // Then prefer the class with more learners.
      const learnerDelta = b._count.students - a._count.students;
      if (learnerDelta !== 0) return learnerDelta;

      return classLabel(a).localeCompare(classLabel(b));
    });

    if (sorted[0]) picked.push(sorted[0]);
  }

  return picked.sort((a, b) => classLabel(a).localeCompare(classLabel(b)));
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiUserContext(req, {
      requireTenant: true,
      requireRoleNames: ADMIN_ROLES,
    });

    if (!auth.ok) return auth.res;

    const { searchParams } = new URL(req.url);
    const mode = clean(searchParams.get("mode")).toLowerCase();

    const rows = await prisma.classroom.findMany({
      where: {
        tenantId: auth.ctx.tenantId,
        status: ClassroomStatus.ACTIVE,
        students: {
          some: {
            tenantId: auth.ctx.tenantId,
            status: StudentStatus.ACTIVE,
          },
        },
      },
      select: {
        id: true,
        name: true,
        grade: true,
        arm: true,
        status: true,
        _count: {
          select: {
            students: {
              where: {
                tenantId: auth.ctx.tenantId,
                status: StudentStatus.ACTIVE,
              },
            },
          },
        },
      },
      orderBy: [{ grade: "asc" }, { name: "asc" }, { arm: "asc" }],
      take: 500,
    });

    const selectedRows = mode === "streams" ? rows : chooseSingleStreamRows(rows);

    return json(200, {
      ok: true,
      mode: mode === "streams" ? "streams" : "single",
      items: selectedRows.map((row) => ({
        id: row.id,
        status: row.status,
        name: row.name,
        grade: row.grade,
        arm: row.arm,
        label: classLabel(row),
        activeLearnerCount: row._count.students,
        hasArm: hasArm(row),
      })),
      summary: {
        totalStudentBearingClasses: rows.length,
        returnedClasses: selectedRows.length,
      },
    });
  } catch (e) {
    console.error("ADMIN_ATTENDANCE_BADGE_CLASSROOMS_ERROR", e);

    return json(500, {
      ok: false,
      error: "Could not load badge classrooms.",
    });
  }
}