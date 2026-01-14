// src/app/api/teachers/classrooms/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function normalizeKey(s: string) {
  return String(s ?? "").trim().toUpperCase();
}
function normalizeClassKey(s: string) {
  return normalizeKey(s).replace(/\s+/g, "");
}

type JhsAssignmentRow = { subject: string; classes: string[] };

function uniqStrings(xs: string[]) {
  return Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));
}

function parseJhsAssignmentRows(j: any): JhsAssignmentRow[] {
  if (!Array.isArray(j)) return [];
  const rows: JhsAssignmentRow[] = [];
  for (const row of j) {
    const subject = typeof row?.subject === "string" ? row.subject.trim() : "";
    const classesRaw = row?.classes;

    const classes = Array.isArray(classesRaw)
      ? classesRaw.map((c: any) => (typeof c === "string" ? c.trim() : "")).filter(Boolean)
      : [];

    if (!subject || classes.length === 0) continue;

    rows.push({
      subject,
      classes: uniqStrings(classes),
    });
  }
  return rows;
}

export async function POST() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use GET." }, { status: 405, headers: { Allow: "GET" } });
}

export async function GET(_req: NextRequest) {
  let ctx: { userId: string; tenantId: string };
  try {
    const c = await requireServerUserContext({
      redirectTo: "/teacher/lesson-notes",
      requireTenant: true,
    });
    ctx = { userId: c.userId, tenantId: c.tenantId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { tenantId: ctx.tenantId, userId: ctx.userId, status: "ACTIVE" },
      include: { role: true },
    });
    if (!membership) return jsonNoStore({ ok: false, error: "Forbidden." }, { status: 403 });

    const roleName = String(membership.role?.name ?? "").toUpperCase();
    const isAdminLike = roleName.includes("ADMIN") || roleName.includes("HEAD");

    const all = await prisma.classroom.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, grade: true },
      orderBy: [{ name: "asc" }],
    });

    if (isAdminLike) return jsonNoStore({ ok: true, items: all }, { status: 200 });

    const teacherProfile = await prisma.teacherProfile.findFirst({
      where: { tenantId: ctx.tenantId, userId: ctx.userId },
      select: { phase: true, classLevel: true, jhsAssignments: true },
    });
    if (!teacherProfile) return jsonNoStore({ ok: false, error: "Teacher profile not found for this tenant." }, { status: 403 });

    // JHS: union of all assigned classes across subjects
    if (teacherProfile.phase === "JHS") {
      const rows = parseJhsAssignmentRows(teacherProfile.jhsAssignments);
      const clsA = new Set<string>();
      const clsB = new Set<string>();
      for (const r of rows) {
        for (const c of r.classes) {
          clsA.add(normalizeKey(c));
          clsB.add(normalizeClassKey(c));
        }
      }

      const filtered = all.filter((c) => {
        const gradeA = normalizeKey(String(c.grade ?? ""));
        const nameA = normalizeKey(String(c.name ?? ""));
        const gradeB = normalizeClassKey(String(c.grade ?? ""));
        const nameB = normalizeClassKey(String(c.name ?? ""));
        return clsA.has(gradeA) || clsA.has(nameA) || clsB.has(gradeB) || clsB.has(nameB);
      });

      return jsonNoStore({ ok: true, items: filtered }, { status: 200 });
    }

    // KG/PRIMARY: match classLevel
    const classLevel = String(teacherProfile.classLevel ?? "").trim();
    if (!classLevel) return jsonNoStore({ ok: true, items: [] }, { status: 200 });

    const classLevelA = normalizeKey(classLevel);
    const classLevelB = normalizeClassKey(classLevel);

    const filtered = all.filter((c) => {
      const gradeA = normalizeKey(String(c.grade ?? ""));
      const nameA = normalizeKey(String(c.name ?? ""));
      const gradeB = normalizeClassKey(String(c.grade ?? ""));
      const nameB = normalizeClassKey(String(c.name ?? ""));
      return gradeA === classLevelA || nameA === classLevelA || gradeB === classLevelB || nameB === classLevelB;
    });

    return jsonNoStore({ ok: true, items: filtered }, { status: 200 });
  } catch (err) {
    console.error("[TEACHER_CLASSROOMS_LIST_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load classrooms." }, { status: 500 });
  }
}
