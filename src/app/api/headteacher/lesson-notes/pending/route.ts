// src/app/api/headteacher/lesson-notes/pending/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PendingResp =
  | {
      ok: true;
      count: number;
      items: Array<{
        id: string;
        updatedAt: string;
        subject: string | null;
        term: string | null;
        academicYear: string | null;
        weekNumber: number | null;
        teacherUserId: string | null;
        teacherName: string | null;
      }>;
    }
  | { ok: false; error: string };

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function parseIntBounded(v: string | null, def: number, min: number, max: number) {
  const n = Number.parseInt((v ?? "").trim(), 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function userDisplayName(u: { name: string | null; firstName: string | null; lastName: string | null; email: string | null } | null) {
  if (!u) return null;
  const n = clean(u.name);
  if (n) return n;

  const fn = clean(u.firstName);
  const ln = clean(u.lastName);
  const full = `${fn} ${ln}`.trim();
  if (full) return full;

  const em = clean(u.email);
  return em || null;
}

export async function GET(req: Request) {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized." } satisfies PendingResp, 401);

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return jsonNoStore({ ok: false, error: "Forbidden (membership inactive)." } satisfies PendingResp, 403);
  }

  const { searchParams } = new URL(req.url);
  const limit = parseIntBounded(searchParams.get("limit"), 5, 1, 20);

  try {
    const [count, itemsRaw] = await Promise.all([
      prisma.lessonNote.count({
        where: { tenantId: ctx.tenantId, status: "SUBMITTED" },
      }),
      prisma.lessonNote.findMany({
        where: { tenantId: ctx.tenantId, status: "SUBMITTED" },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: limit,
        select: {
          id: true,
          updatedAt: true,
          subject: true,
          term: true,
          academicYear: true,
          weekNumber: true,
          teacherUserId: true,
          teacher: { select: { name: true, firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    return jsonNoStore({
      ok: true,
      count,
      items: itemsRaw.map((r) => ({
        id: r.id,
        updatedAt: r.updatedAt.toISOString(),
        subject: r.subject ?? null,
        term: r.term ?? null,
        academicYear: r.academicYear ?? null,
        weekNumber: r.weekNumber ?? null,
        teacherUserId: r.teacherUserId ?? null,
        teacherName: userDisplayName(r.teacher) ?? null,
      })),
    } satisfies PendingResp);
  } catch (e) {
    console.error("HEADTEACHER_PENDING_LESSON_NOTES_ERROR", e);
    return jsonNoStore({ ok: false, error: "Failed to load pending lesson notes." } satisfies PendingResp, 500);
  }
}