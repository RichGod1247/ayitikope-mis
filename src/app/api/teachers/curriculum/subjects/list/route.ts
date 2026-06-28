// src/app/api/teachers/curriculum/subjects/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import {
  listUserAccessibleClassrooms,
  resolveUserClassroomAccess,
} from "@/lib/teacherAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClassroomLite = {
  id: string;
  name?: string | null;
  grade?: string | null;
  arm?: string | null;
};

function jsonNoStore(payload: unknown, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function norm(v: unknown) {
  return cleanStr(v).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function levelLookupVariants(raw: unknown): string[] {
  const s0 = normalizeSpaces(cleanStr(raw));
  if (!s0) return [];

  const out = new Set<string>();
  out.add(s0);

  let m = s0.match(/^KG\s*([12])$/i) || s0.match(/^KG([12])$/i);
  if (m) {
    const n = m[1];
    [`KG${n}`, `KG ${n}`].forEach((x) => out.add(x));
    return Array.from(out.values());
  }

  m =
    s0.match(/^Basic\s*([1-9])$/i) ||
    s0.match(/^Basic([1-9])$/i) ||
    s0.match(/^B\s*([1-9])$/i) ||
    s0.match(/^B([1-9])$/i) ||
    s0.match(/^P\s*([1-6])$/i) ||
    s0.match(/^P([1-6])$/i);

  if (m) {
    const n = Number(m[1]);
    [`B${n}`, `B ${n}`, `Basic ${n}`, `Basic${n}`, `P${n}`, `P ${n}`].forEach((x) => out.add(x));

    if (n >= 7 && n <= 9) {
      const j = n - 6;
      [`JHS ${j}`, `JHS${j}`].forEach((x) => out.add(x));
    }

    return Array.from(out.values());
  }

  m = s0.match(/^JHS\s*([1-3])$/i) || s0.match(/^JHS([1-3])$/i);
  if (m) {
    const j = Number(m[1]);
    const basic = 6 + j;
    [`JHS ${j}`, `JHS${j}`, `Basic ${basic}`, `Basic${basic}`, `B${basic}`, `B ${basic}`].forEach((x) =>
      out.add(x)
    );
    return Array.from(out.values());
  }

  return Array.from(out.values());
}

function phaseFromLevel(raw: unknown): "KG" | "PRIMARY" | "JHS" | null {
  const s = norm(raw);

  if (/^KG[12]$/.test(s)) return "KG";
  if (/^(BASIC|B|PRIMARY|P)[1-6]$/.test(s)) return "PRIMARY";
  if (/^JHS[1-3]$/.test(s) || /^(BASIC|B|BS)[7-9]$/.test(s)) return "JHS";

  return null;
}

function classroomLevel(c: ClassroomLite) {
  return cleanStr(c.grade) || cleanStr(c.name);
}

function curriculumPhaseMatch(rowPhase: string | null, allowedPhase: string | null) {
  if (!allowedPhase) return true;

  const rp = norm(rowPhase);
  if (!rp) return true;

  if (allowedPhase === "JHS") return rp === "JHS" || rp.includes("JUNIOR");
  if (allowedPhase === "PRIMARY") return rp === "PRIMARY" || rp.includes("PRIMARY");
  if (allowedPhase === "KG") return rp === "KG" || rp.includes("KINDER");

  return true;
}

export async function POST() {
  return jsonNoStore(
    { ok: false, error: "Method not allowed. Use GET." },
    { status: 405, headers: { Allow: "GET" } }
  );
}

export async function GET(_req: NextRequest) {
  let ctx: { userId: string; tenantId: string };

  try {
    const c = await requireServerUserContext({
      requireTenant: true,
    });
    ctx = { userId: c.userId, tenantId: c.tenantId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: {
      status: true,
      role: { select: { name: true } },
    },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return jsonNoStore({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  try {
    const roleName = membership.role?.name ?? null;

    const accessibleClassrooms = await listUserAccessibleClassrooms({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      roleName,
    });

    const allowed = new Map<
      string,
      {
        subject: string;
        levels: Set<string>;
        phases: Set<string>;
      }
    >();

    for (const classroom of accessibleClassrooms) {
      const access = await resolveUserClassroomAccess({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        roleName,
        classroomId: classroom.id,
      });

      if (!access.ok) continue;

      const level =
        cleanStr(access.normalizedClassLevel) ||
        classroomLevel(classroom) ||
        "";

      const phase = phaseFromLevel(level);
      const subjects = Array.isArray(access.allowedSubjects) ? access.allowedSubjects : [];

      for (const subject of subjects) {
        const label = cleanStr(subject);
        const key = norm(label);
        if (!key) continue;

        const item = allowed.get(key) ?? {
          subject: label,
          levels: new Set<string>(),
          phases: new Set<string>(),
        };

        for (const lv of levelLookupVariants(level)) item.levels.add(norm(lv));
        if (phase) item.phases.add(phase);

        allowed.set(key, item);
      }
    }

    if (allowed.size === 0) {
      return jsonNoStore({ ok: true, items: [] }, { status: 200 });
    }

    const rows = await prisma.curriculumSubject.findMany({
      where: {
        isActive: true,
        OR: [{ tenantId: ctx.tenantId }, { isGlobal: true }],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        phase: true,
        level: true,
        isGlobal: true,
      },
      orderBy: [{ phase: "asc" }, { level: "asc" }, { name: "asc" }],
      take: 1000,
    });

    const items = rows.filter((row) => {
      const a = allowed.get(norm(row.name));
      if (!a) return false;

      const rowLevelVariants = levelLookupVariants(row.level).map(norm);
      const levelOk =
        rowLevelVariants.length === 0 ||
        rowLevelVariants.some((lv) => a.levels.has(lv));

      const phaseOk =
        a.phases.size === 0 ||
        Array.from(a.phases).some((phase) => curriculumPhaseMatch(row.phase, phase));

      return levelOk && phaseOk;
    });

    return jsonNoStore({ ok: true, items }, { status: 200 });
  } catch (err) {
    console.error("[TEACHER_CURRICULUM_SUBJECTS_LIST_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load curriculum subjects." }, { status: 500 });
  }
}