// src/app/api/headteacher/student/detail/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function isNextRedirectError(err: any) {
  return typeof err?.digest === "string" && err.digest.startsWith("NEXT_REDIRECT");
}

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normRole(name: any) {
  return String(name ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function looksLikeHeadOrAdmin(roleName: string) {
  if (!roleName) return false;
  if (roleName.includes("ADMIN")) return true;
  if (roleName.includes("HEAD")) return true;
  if (roleName === "HT") return true;
  if (roleName === "HEADTEACHER") return true;
  if (roleName === "SCHOOL_ADMIN") return true;
  return false;
}

async function requireHeadOrAdmin(tenantId: string, userId: string) {
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { role: { select: { name: true } } },
  });
  if (!m) return { ok: false as const, status: 403, error: "FORBIDDEN" };
  const roleName = normRole(m.role?.name);
  return looksLikeHeadOrAdmin(roleName)
    ? ({ ok: true as const } as const)
    : ({ ok: false as const, status: 403, error: "FORBIDDEN" } as const);
}

type ItemStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | "NO_MARK";

export async function GET(req: NextRequest) {
  let tenantId = "";
  let userId = "";
  try {
    const r: any = await requireServerUserContext({ requireTenant: true } as any);
    const ctx = r?.ctx ?? r;
    tenantId = String(ctx.tenantId ?? ctx.activeTenantId ?? "").trim();
    userId = String(ctx.userId ?? ctx.user?.id ?? "").trim();
  } catch (err: any) {
    if (isNextRedirectError(err)) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  if (!tenantId || !userId) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);

  const roleOk = await requireHeadOrAdmin(tenantId, userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  try {
    const { searchParams } = req.nextUrl;
    const studentId = String(searchParams.get("studentId") || "").trim();
    const start = toISODateOnly(searchParams.get("start"));
    const end = toISODateOnly(searchParams.get("end"));

    if (!studentId || !start || !end) return jsonNoStore({ ok: false, error: "studentId, start, end are required" }, 400);

    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true, firstName: true, lastName: true, guardianName: true, guardianPhone: true, classroomId: true },
    });

    if (!student) return jsonNoStore({ ok: false, error: "Student not found for this tenant" }, 404);

    if (!student.classroomId) {
      return jsonNoStore(
        {
          ok: true,
          meta: {
            studentId,
            start,
            end,
            fullName: [student.firstName, student.lastName].filter(Boolean).join(" "),
            guardianName: student.guardianName ?? "",
            guardianPhone: student.guardianPhone ?? "",
            sessions: 0,
            present: 0,
            absent: 0,
            late: 0,
            excused: 0,
            noMark: 0,
            pctPresent: 0,
          },
          items: [],
        },
        200
      );
    }

    const rows = await prisma.$queryRaw<Array<{ date: string; status: string | null; note: string | null }>>`
      SELECT
        s."date"::date::text AS "date",
        m."status"::text     AS "status",
        m."note"             AS "note"
      FROM "edulife_os"."AttendanceSession" s
      LEFT JOIN "edulife_os"."AttendanceMark" m
        ON m."sessionId" = s."id"
       AND m."studentId" = ${studentId}
      WHERE s."tenantId" = ${tenantId}
        AND s."classroomId" = ${student.classroomId}
        AND s."date"::date BETWEEN ${start}::date AND ${end}::date
      ORDER BY s."date"::date ASC
    `;

    const items = rows.map((r) => {
      const raw = (r.status ?? "").toUpperCase();
      const status: ItemStatus =
        raw === "PRESENT" || raw === "ABSENT" || raw === "LATE" || raw === "EXCUSED" ? (raw as ItemStatus) : "NO_MARK";
      return { date: r.date, status, note: r.note ?? "" };
    });

    const counts = {
      sessions: items.length,
      present: items.filter((i) => i.status === "PRESENT").length,
      absent: items.filter((i) => i.status === "ABSENT").length,
      late: items.filter((i) => i.status === "LATE").length,
      excused: items.filter((i) => i.status === "EXCUSED").length,
      noMark: items.filter((i) => i.status === "NO_MARK").length,
    };

    const pctPresent = counts.sessions > 0 ? Math.round((counts.present / counts.sessions) * 100) : 0;

    return jsonNoStore(
      {
        ok: true,
        meta: {
          studentId,
          start,
          end,
          fullName: [student.firstName, student.lastName].filter(Boolean).join(" "),
          guardianName: student.guardianName ?? "",
          guardianPhone: student.guardianPhone ?? "",
          ...counts,
          pctPresent,
        },
        items,
      },
      200
    );
  } catch (err) {
    console.error("student/detail error:", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_LOAD_STUDENT_DETAIL" }, 500);
  }
}
