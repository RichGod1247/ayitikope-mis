// src/app/api/teachers/curriculum/units/list/route.ts
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import {
  listUserAccessibleClassrooms,
  resolveUserClassroomAccess,
} from "@/lib/teacherAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(
  payload: unknown,
  init?: Parameters<typeof NextResponse.json>[1],
) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function parsePositiveInt(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function clean(v: string | null): string {
  return String(v ?? "").trim();
}

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function termVariants(raw: string): string[] {
  const t = normalizeSpaces(raw);
  if (!t) return [];

  const m = t.match(/([1-3])/);
  const n = m ? Number(m[1]) : null;

  const out = new Set<string>();
  out.add(t);

  if (n) {
    out.add(String(n));
    out.add(`Term ${n}`);
    out.add(`Term${n}`);
    out.add(`TERM ${n}`);
    out.add(`TERM${n}`);
    out.add(`${n}st term`);
    out.add(`${n}nd term`);
    out.add(`${n}rd term`);
    out.add(`Term ${n}`.toUpperCase());
    if (n === 1) out.add("First Term");
    if (n === 2) out.add("Second Term");
    if (n === 3) out.add("Third Term");
  }

  return Array.from(out.values());
}

function phaseVariants(raw: string): string[] {
  const p = normalizeSpaces(raw);
  if (!p) return [];

  const out = new Set<string>();
  out.add(p);

  const u = p.toUpperCase();

  if (u === "JHS" || u.includes("JUNIOR")) {
    out.add("JHS");
    out.add("Junior High School");
    out.add("JUNIOR HIGH SCHOOL");
    out.add("Junior High");
  }

  if (
    u === "PRIMARY" ||
    u.includes("PRIMARY") ||
    u.includes("LOWER") ||
    u.includes("UPPER")
  ) {
    out.add("PRIMARY");
    out.add("Primary");
    out.add("Lower Primary");
    out.add("Upper Primary");
    out.add("LOWER PRIMARY");
    out.add("UPPER PRIMARY");
  }

  if (u === "KG" || u.includes("KINDER")) {
    out.add("KG");
    out.add("Kindergarten");
    out.add("KINDERGARTEN");
  }

  return Array.from(out.values());
}

function levelVariants(raw: string): string[] {
  const s = normalizeSpaces(raw);
  if (!s) return [];

  const out = new Set<string>();
  out.add(s);

  let m = s.match(/^JHS\s*([1-3])$/i) || s.match(/^JHS([1-3])$/i);
  if (m) {
    const n = Number(m[1]);
    const basic = 6 + n;

    out.add(`JHS ${n}`);
    out.add(`JHS${n}`);
    out.add(`jhs ${n}`);
    out.add(`jhs${n}`);
    out.add(`Basic ${basic}`);
    out.add(`Basic${basic}`);
    out.add(`B${basic}`);
    out.add(`B ${basic}`);
  }

  m = s.match(/^Basic\s*([1-9])$/i) || s.match(/^Basic([1-9])$/i);
  if (m) {
    const n = Number(m[1]);

    out.add(`Basic ${n}`);
    out.add(`Basic${n}`);
    out.add(`B${n}`);
    out.add(`B ${n}`);
    out.add(`basic ${n}`);
    out.add(`basic${n}`);

    if (n >= 7 && n <= 9) {
      const j = n - 6;
      out.add(`JHS ${j}`);
      out.add(`JHS${j}`);
      out.add(`jhs ${j}`);
      out.add(`jhs${j}`);
    }
  }

  m = s.match(/^B\s*([1-9])$/i) || s.match(/^B([1-9])$/i);
  if (m) {
    const n = Number(m[1]);

    out.add(`B${n}`);
    out.add(`B ${n}`);
    out.add(`Basic ${n}`);
    out.add(`Basic${n}`);

    if (n >= 7 && n <= 9) {
      const j = n - 6;
      out.add(`JHS ${j}`);
      out.add(`JHS${j}`);
    }
  }

  m = s.match(/^KG\s*([12])$/i) || s.match(/^KG([12])$/i);
  if (m) {
    const n = m[1];
    out.add(`KG${n}`);
    out.add(`KG ${n}`);
    out.add(`kg${n}`);
    out.add(`kg ${n}`);
  }

  return Array.from(out.values());
}

function norm(v: unknown) {
  return clean(String(v ?? ""))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function levelMatches(requestedLevel: string, candidateLevel: string) {
  const requested = new Set(levelVariants(requestedLevel).map(norm));
  const candidate = new Set(levelVariants(candidateLevel).map(norm));

  if (requested.size === 0 || candidate.size === 0) return false;

  for (const item of requested) {
    if (candidate.has(item)) return true;
  }

  return false;
}

function classroomLevel(c: { name?: string | null; grade?: string | null }) {
  return clean(c.grade ?? null) || clean(c.name ?? null);
}

async function assertTeacherCanUseCurriculumScope(args: {
  tenantId: string;
  userId: string;
  roleName: string | null;
  level: string;
  subject: string;
}) {
  const classrooms = await listUserAccessibleClassrooms({
    tenantId: args.tenantId,
    userId: args.userId,
    roleName: args.roleName,
  });

  for (const classroom of classrooms) {
    const level = classroomLevel(classroom);
    if (!levelMatches(args.level, level)) continue;

    const access = await resolveUserClassroomAccess({
      tenantId: args.tenantId,
      userId: args.userId,
      roleName: args.roleName,
      classroomId: classroom.id,
      subject: args.subject,
    });

    if (access.ok) return { ok: true as const };
  }

  return {
    ok: false as const,
    error: "Forbidden: not assigned to this subject.",
  };
}

function orEqualsInsensitive(
  field: "phase" | "level" | "subject" | "term",
  variants: string[],
): Prisma.CurriculumUnitWhereInput | null {
  const cleanVars = variants.map((x) => normalizeSpaces(x)).filter(Boolean);
  if (!cleanVars.length) return null;

  return {
    OR: cleanVars.map((v) => ({
      [field]: { equals: v, mode: "insensitive" as const },
    })),
  } as Prisma.CurriculumUnitWhereInput;
}

export async function POST() {
  return jsonNoStore(
    { ok: false, error: "Method not allowed. Use GET." },
    { status: 405, headers: { Allow: "GET" } },
  );
}

export async function GET(req: NextRequest) {
  // Auth
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

  // Membership gate (production-grade)
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: {
      status: true,
      role: { select: { name: true } },
    },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return jsonNoStore(
      { ok: false, error: "Forbidden (membership inactive)." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);

  const phaseRaw = clean(searchParams.get("phase"));
  const levelRaw = clean(searchParams.get("level"));

  // ✅ accept either subject (name) or subjectSlug (slug)
  let subjectRaw = clean(searchParams.get("subject"));
  const subjectSlugRaw = clean(searchParams.get("subjectSlug"));

  const termRaw = clean(searchParams.get("term"));
  const weekNumber = parsePositiveInt(searchParams.get("weekNumber"));

  const q = clean(searchParams.get("q"));
  const take = clamp(Number(searchParams.get("take") ?? 50) || 50, 1, 200);

  /**
   * Safety/perf:
   * Require at least level + (subject OR subjectSlug).
   * Term/week are optional (we normalize them if present).
   */
  if (!levelRaw || (!subjectRaw && !subjectSlugRaw)) {
    return jsonNoStore(
      {
        ok: false,
        error:
          "level and subject (or subjectSlug) are required. (phase/term/weekNumber are optional)",
      },
      { status: 400 },
    );
  }

  // ✅ If only slug provided, try to resolve to subject name (CurriculumSubject.slug -> CurriculumSubject.name)
  // This avoids the classic “slug passed but CurriculumUnit.subject stores human name” mismatch.
  if (!subjectRaw && subjectSlugRaw) {
    try {
      const subj = await prisma.curriculumSubject.findUnique({
        where: { slug: subjectSlugRaw },
        select: { name: true },
      });
      if (subj?.name) subjectRaw = subj.name;
      else subjectRaw = subjectSlugRaw; // fallback: sometimes seed stores slug-like tokens
    } catch {
      subjectRaw = subjectSlugRaw;
    }
  }

  const scope = await assertTeacherCanUseCurriculumScope({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: membership.role?.name ?? null,
    level: levelRaw,
    subject: subjectRaw,
  });

  if (!scope.ok) {
    return jsonNoStore({ ok: false, error: scope.error }, { status: 403 });
  }

  try {
    // ✅ GLOBAL + tenant-scoped units
    const tenantScope: Prisma.CurriculumUnitWhereInput = {
      OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
    };
    const and: Prisma.CurriculumUnitWhereInput[] = [tenantScope];

    // Phase (optional, normalized)
    if (phaseRaw) {
      const pOr = orEqualsInsensitive("phase", phaseVariants(phaseRaw));
      if (pOr) and.push(pOr);
    }

    // Level (required, normalized variants)
    {
      const lOr = orEqualsInsensitive("level", levelVariants(levelRaw));
      if (lOr) and.push(lOr);
    }

    // Subject (required: insensitive exact match + minor robustness)
    {
      const s1 = normalizeSpaces(subjectRaw);
      const subjectSet = new Set<string>([s1]);

      // If both were given, include both tokens as candidates
      if (subjectSlugRaw) subjectSet.add(normalizeSpaces(subjectSlugRaw));

      const sOr = orEqualsInsensitive(
        "subject",
        Array.from(subjectSet.values()),
      );
      if (sOr) and.push(sOr);
    }

    // Term (optional, normalized)
    if (termRaw) {
      const tOr = orEqualsInsensitive("term", termVariants(termRaw));
      if (tOr) and.push(tOr);
    }

    // Week number (optional)
    if (weekNumber) {
      and.push({ weekNumber });
    }

    // Search text (optional)
    if (q) {
      and.push({
        OR: [
          { indicatorCode: { contains: q, mode: "insensitive" } },
          { indicator: { contains: q, mode: "insensitive" } },
          { contentStandardCode: { contains: q, mode: "insensitive" } },
          { contentStandard: { contains: q, mode: "insensitive" } },
          { substrandCode: { contains: q, mode: "insensitive" } },
          { substrand: { contains: q, mode: "insensitive" } },
          { strandCode: { contains: q, mode: "insensitive" } },
          { strand: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    const where = { AND: and };

    const items = await prisma.curriculumUnit.findMany({
      where,
      take,
      orderBy: [{ indicatorCode: "asc" }, { id: "asc" }],
      select: {
        id: true,

        strandCode: true,
        strand: true,
        substrandCode: true,
        substrand: true,
        contentStandardCode: true,
        contentStandard: true,
        indicatorCode: true,
        indicator: true,

        // Useful for debugging/UI (safe)
        phase: true,
        level: true,
        subject: true,
        term: true,
        weekNumber: true,
        tenantId: true,
      },
    });

    return jsonNoStore({ ok: true, items }, { status: 200 });
  } catch (err) {
    console.error("[TEACHER_CURRICULUM_UNITS_LIST_ERROR]", err);
    return jsonNoStore(
      { ok: false, error: "Failed to load curriculum units." },
      { status: 500 },
    );
  }
}
