// src/app/api/admin/attendance/absentees/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function normalizeRoleName(role: unknown) {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z_]/g, "");
}

// Legacy compat:
// - ADMIN behaves as SCHOOL_ADMIN
// - HEADMASTER behaves as HEADTEACHER
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

async function requireAdminLike(tenantId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!m || m.status !== "ACTIVE") return { ok: false as const, status: 403, error: "FORBIDDEN" };
  if (!isAdminLike(m.role?.name ?? "")) return { ok: false as const, status: 403, error: "FORBIDDEN" };
  return { ok: true as const };
}

function parseDayUtc(dateParam: string) {
  // YYYY-MM-DD
  const d = new Date(`${dateParam}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: d, endExclusive: end };
}

export async function GET(req: NextRequest) {
  // ✅ Cookie-session auth (NextAuth)
  let ctx: { tenantId: string; userId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { tenantId: c.tenantId, userId: c.userId };
  } catch {
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const roleOk = await requireAdminLike(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  const { searchParams } = new URL(req.url);

  // Back-compat: tenantId may be passed by legacy UI, must match session tenant
  const guard = assertNoTenantOverride(searchParams.get("tenantId"), ctx.tenantId);
  if (!guard.ok) return jsonNoStore({ ok: false, error: guard.error }, guard.status);

  const dateParam = (searchParams.get("date") ?? "").trim(); // YYYY-MM-DD
  if (!dateParam) return jsonNoStore({ ok: false, error: "date (YYYY-MM-DD) is required." }, 400);

  const day = parseDayUtc(dateParam);
  if (!day) return jsonNoStore({ ok: false, error: "Invalid date format. Use YYYY-MM-DD." }, 400);

  try {
    const sessions = await prisma.attendanceSession.findMany({
      where: {
        tenantId: ctx.tenantId,
        date: { gte: day.start, lt: day.endExclusive },
      },
      select: {
        id: true,
        date: true,
        classroom: { select: { name: true, grade: true, arm: true } },
        marks: {
          where: { status: "ABSENT" },
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
                classroomId: true,
              },
            },
          },
        },
      },
      orderBy: { date: "asc" },
      take: 2000,
    });

    type AbsenteeItem = {
      markId: string;
      studentId: string;
      studentName: string;
      classLabel: string;
      guardianName?: string | null;
      guardianPhone?: string | null;
      note?: string | null;
      date: string;
      sessionId: string;
    };

    const items: AbsenteeItem[] = [];

    for (const session of sessions as any[]) {
      const grade = (session.classroom?.grade as string | undefined) ?? "";
      const arm = (session.classroom?.arm as string | undefined) ?? "";
      const name = (session.classroom?.name as string | undefined) ?? "";

      const classLabel =
        name && name.trim()
          ? name.trim()
          : ([grade, arm].filter(Boolean).join(" ").trim() || "Unknown class");

      const sessionDateIso =
        session.date instanceof Date ? session.date.toISOString() : new Date(day.start).toISOString();

      for (const m of session.marks as any[]) {
        const s = m.student;
        const studentId = String(s?.id ?? "").trim();
        if (!studentId) continue;

        const studentName = [s?.firstName, s?.lastName].filter(Boolean).join(" ").trim() || "Unnamed learner";

        items.push({
          markId: String(m.id),
          studentId,
          studentName,
          classLabel,
          guardianName: s?.guardianName ?? null,
          guardianPhone: s?.guardianPhone ?? null,
          note: m.note ?? null,
          date: sessionDateIso,
          sessionId: String(session.id),
        });
      }
    }

    return jsonNoStore({ ok: true, items, count: items.length, date: dateParam, tenantId: ctx.tenantId }, 200);
  } catch (err: any) {
    console.error("[ADMIN_ABSENTEES_ERROR]", err);
    return jsonNoStore({ ok: false, error: err?.message || "Failed to load absentees. Please try again." }, 500);
  }
}
