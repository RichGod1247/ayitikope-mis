//src/app/api/headteacher/teacher-attendance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

function jsonNoStore(payload: any, status = 200) {
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

function normalizeRole(v: unknown) {
  return clean(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function toISODateOnly(input: unknown): string | null {
  const raw = clean(input);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toDbDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

function isoOrNull(v: Date | null | undefined) {
  return v ? v.toISOString() : null;
}

function displayName(user: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
} | null | undefined) {
  const full = clean(user?.name);
  if (full) return full;

  const parts = [clean(user?.firstName), clean(user?.lastName)].filter(Boolean).join(" ");
  if (parts) return parts;

  return clean(user?.email) || "User";
}

function emptyCounts(totalTeachers: number) {
  return {
    totalTeachers,
    marked: 0,
    unmarked: totalTeachers,
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
  };
}

export async function GET(req: NextRequest) {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);

  const { searchParams } = new URL(req.url);
  const isoDate = toISODateOnly(searchParams.get("date")) ?? new Date().toISOString().slice(0, 10);
  const dbDate = toDbDate(isoDate);

  try {
    const [memberships, session] = await Promise.all([
      prisma.membership.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: "ACTIVE",
        },
        orderBy: [{ createdAt: "asc" }],
        select: {
          id: true,
          staffId: true,
          userId: true,
          role: { select: { name: true } },
          user: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
              email: true,
              teacherProfiles: {
                where: { tenantId: ctx.tenantId },
                select: {
                  phone: true,
                  phase: true,
                  classLevel: true,
                  primaryClassroom: {
                    select: { name: true, grade: true, arm: true },
                  },
                },
                take: 1,
              },
            },
          },
        },
      }),
      prisma.teacherAttendanceSession.findUnique({
        where: {
          tenantId_date: {
            tenantId: ctx.tenantId,
            date: dbDate,
          },
        },
        select: {
          id: true,
          tenantId: true,
          date: true,
          openedAt: true,
          openedByUserId: true,
          isClosed: true,
          closedAt: true,
          closedByUserId: true,
          certifiedAt: true,
          certifiedByUserId: true,
          certifiedNote: true,
          openedBy: { select: { name: true, firstName: true, lastName: true, email: true } },
          closedBy: { select: { name: true, firstName: true, lastName: true, email: true } },
          certifiedBy: { select: { name: true, firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    const teachers = memberships
      .filter((m) => normalizeRole(m.role?.name) === "TEACHER")
      .map((m) => {
        const profile = m.user.teacherProfiles?.[0] ?? null;
        const c = profile?.primaryClassroom ?? null;
        const classLabel =
          c?.name?.trim() ||
          (c?.grade ? (c?.arm ? `${c.grade} · Arm ${c.arm}` : c.grade) : null);

        return {
          membershipId: m.id,
          teacherUserId: m.userId,
          staffId: m.staffId ?? null,
          name: displayName(m.user),
          email: m.user.email,
          phone: profile?.phone ?? null,
          phase: profile?.phase ?? null,
          classLevel: profile?.classLevel ?? null,
          classLabel,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const teacherIds = teachers.map((t) => t.teacherUserId);

    const records = session && teacherIds.length
      ? await prisma.teacherAttendanceRecord.findMany({
          where: {
            tenantId: ctx.tenantId,
            sessionId: session.id,
            teacherUserId: { in: teacherIds },
          },
          select: {
            id: true,
            teacherUserId: true,
            date: true,
            status: true,
            note: true,
            markedAt: true,
            markedByUserId: true,
            updatedAt: true,
            markedBy: {
              select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        })
      : [];

    const byTeacher = new Map(records.map((r) => [r.teacherUserId, r]));
    const counts = emptyCounts(teachers.length);

    const items = teachers.map((t) => {
      const record = byTeacher.get(t.teacherUserId) ?? null;

      if (record) {
        counts.marked += 1;
        if (record.status === "PRESENT") counts.present += 1;
        if (record.status === "ABSENT") counts.absent += 1;
        if (record.status === "LATE") counts.late += 1;
        if (record.status === "EXCUSED") counts.excused += 1;
      }

      return {
        ...t,
        record: record
          ? {
              id: record.id,
              date: record.date.toISOString().slice(0, 10),
              status: record.status,
              note: record.note ?? "",
              markedAt: record.markedAt.toISOString(),
              markedByUserId: record.markedByUserId,
              markedByName: displayName(record.markedBy),
              updatedAt: record.updatedAt.toISOString(),
            }
          : null,
      };
    });

    counts.unmarked = Math.max(0, counts.totalTeachers - counts.marked);

    return jsonNoStore({
      ok: true,
      date: isoDate,
      statuses: STATUS,
      session: session
        ? {
            id: session.id,
            tenantId: session.tenantId,
            date: session.date.toISOString().slice(0, 10),
            openedAt: session.openedAt.toISOString(),
            openedByUserId: session.openedByUserId,
            openedByName: displayName(session.openedBy),
            isClosed: session.isClosed,
            closedAt: isoOrNull(session.closedAt),
            closedByUserId: session.closedByUserId ?? null,
            closedByName: session.closedBy ? displayName(session.closedBy) : null,
            certifiedAt: isoOrNull(session.certifiedAt),
            certifiedByUserId: session.certifiedByUserId ?? null,
            certifiedByName: session.certifiedBy ? displayName(session.certifiedBy) : null,
            certifiedNote: session.certifiedNote ?? null,
          }
        : null,
      counts,
      summary: counts,
      items,
    });
  } catch (err) {
    console.error("[HEADTEACHER_TEACHER_ATTENDANCE_GET_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load teacher attendance register." }, 500);
  }
}
