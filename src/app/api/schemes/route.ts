// src/app/api/schemes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getServerUserContextOrNull } from "@/lib/serverAuth";
import {
  getTeacherScopeOrNull,
  normalizeSubjectKey,
  teacherCanPlanLessonNotesOrSchemes,
} from "@/lib/teacherScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function isPlausibleId(id: string) {
  const v = cleanStr(id);
  if (!v) return false;
  if (v.length < 5 || v.length > 128) return false;
  return /^[a-zA-Z0-9_-]+$/.test(v);
}

function normalizeSubjectSlug(raw: unknown): string | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) return null;
  return v;
}

function normalizeWs(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * BANK-GRADE SUBJECT VARIANTS (scope matching)
 */
function subjectVariantsForScope(rawSubject: unknown, subjectSlug: string | null): string[] {
  const base = normalizeWs(String(rawSubject ?? ""));
  if (!base) return subjectSlug ? [subjectSlug] : [];

  const out = new Set<string>();
  out.add(base);

  const stripped = normalizeWs(
    base.replace(
      /^(?:(?:JHS\s*[1-3]|JHS[1-3])|(?:BASIC\s*[1-9]|BASIC[1-9])|(?:BS\s*[1-9]|BS[1-9])|(?:B\s*[1-9]|B[1-9])|(?:P\s*[1-6]|P[1-6]))\s*[:\-–—]?\s*/i,
      ""
    )
  );
  if (stripped && stripped.toLowerCase() !== base.toLowerCase()) out.add(stripped);

  if (subjectSlug) out.add(subjectSlug);

  return Array.from(out);
}

const VALID_TERMS = ["1st Term", "2nd Term", "3rd Term"] as const;
type Term = (typeof VALID_TERMS)[number];

function normalizeTerm(raw: unknown): Term | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;

  if (v === "1st term" || v === "term 1" || v === "term1" || v === "1" || v === "first term") return "1st Term";
  if (v === "2nd term" || v === "term 2" || v === "term2" || v === "2" || v === "second term") return "2nd Term";
  if (v === "3rd term" || v === "term 3" || v === "term3" || v === "3" || v === "third term") return "3rd Term";

  const exact = VALID_TERMS.find((t) => t.toLowerCase() === v);
  return exact ?? null;
}

function normalizeAcademicYear(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;

  const fullSlash = v.match(/^(\d{4})\/(\d{4})$/);
  if (fullSlash) return `${fullSlash[1]}/${fullSlash[2]}`;

  const fullDash = v.match(/^(\d{4})-(\d{4})$/);
  if (fullDash) return `${fullDash[1]}/${fullDash[2]}`;

  const shortSlash = v.match(/^(\d{4})\/(\d{2})$/);
  if (shortSlash) {
    const start = Number(shortSlash[1]);
    const end2 = Number(shortSlash[2]);
    const century = Math.floor(start / 100) * 100;
    const derived = century + end2;
    return `${start}/${derived}`;
  }

  const shortDash = v.match(/^(\d{4})-(\d{2})$/);
  if (shortDash) {
    const start = Number(shortDash[1]);
    const end2 = Number(shortDash[2]);
    const century = Math.floor(start / 100) * 100;
    const derived = century + end2;
    return `${start}/${derived}`;
  }

  return null;
}

function isPrivilegedRole(roleName: string | null) {
  if (!roleName) return false;
  const r = roleName.toUpperCase();
  return ["OWNER", "ADMIN", "HEADTEACHER", "SUPER_ADMIN", "SCHOOL_ADMIN", "SYSTEM_ADMIN"].includes(r);
}

/**
 * BANK-GRADE LEVEL NORMALIZATION
 */
function normalizeLevelToken(raw: unknown): string | null {
  const s0 = String(raw ?? "").trim();
  if (!s0) return null;

  const s = s0.replace(/\s+/g, " ").trim();
  const up = s.toUpperCase();

  let m = up.match(/^JHS\s*([1-3])(?:\s*[A-D])?$/) || up.match(/^JHS([1-3])(?:[A-D])?$/);
  if (m) return `JHS${m[1]}`;

  m = up.match(/^KG\s*([1-2])$/) || up.match(/^KG([1-2])$/);
  if (m) return `KG${m[1]}`;

  m =
    up.match(/^BASIC\s*([1-9])$/) ||
    up.match(/^BASIC([1-9])$/) ||
    up.match(/^B\s*([1-9])$/) ||
    up.match(/^B([1-9])$/) ||
    up.match(/^BS\s*([1-9])$/) ||
    up.match(/^BS([1-9])$/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 7 && n <= 9) return `JHS${n - 6}`;
    return `B${n}`;
  }

  m = up.match(/^P\s*([1-6])(?:\s*[A-D])?$/) || up.match(/^P([1-6])(?:[A-D])?$/);
  if (m) return `B${m[1]}`;

  return null;
}

function rawLevelVariantsFromToken(token: string): string[] {
  const out = new Set<string>([token]);

  const mJ = token.match(/^JHS([1-3])$/);
  if (mJ) {
    const j = Number(mJ[1]);
    const basic = j + 6;

    out.add(`JHS ${j}`);
    out.add(`jhs ${j}`);
    out.add(`jhs${j}`);
    out.add(`JHS${j}A`);
    out.add(`JHS ${j} A`);

    out.add(`Basic ${basic}`);
    out.add(`basic ${basic}`);
    out.add(`BASIC ${basic}`);

    out.add(`B${basic}`);
    out.add(`B ${basic}`);

    out.add(`BS${basic}`);
    out.add(`BS ${basic}`);
  }

  const mK = token.match(/^KG([1-2])$/);
  if (mK) {
    const n = mK[1];
    out.add(`KG ${n}`);
    out.add(`kg ${n}`);
    out.add(`kg${n}`);
  }

  const mB = token.match(/^B([1-6])$/);
  if (mB) {
    const n = Number(mB[1]);

    out.add(`B${n}`);
    out.add(`B ${n}`);
    out.add(`basic ${n}`);
    out.add(`Basic ${n}`);
    out.add(`BASIC ${n}`);

    out.add(`BS${n}`);
    out.add(`BS ${n}`);

    out.add(`P${n}`);
    out.add(`P ${n}`);
    out.add(`p${n}`);
    out.add(`p ${n}`);
  }

  return Array.from(out);
}

function normalizeLevelForComparisons(raw: unknown): { token: string | null; variants: string[] } {
  const token = normalizeLevelToken(raw);
  if (!token) return { token: null, variants: [] };
  const variants = rawLevelVariantsFromToken(token);

  const rawTrim = cleanStr(raw);
  if (rawTrim) variants.push(rawTrim);

  return {
    token,
    variants: Array.from(new Set(variants.map((x) => cleanStr(x)).filter(Boolean))),
  };
}

function inferPhaseFromLevel(level: string | null): "KG" | "PRIMARY" | "JHS" | null {
  const t = normalizeLevelToken(level);
  if (!t) return null;
  if (t.startsWith("KG")) return "KG";
  if (t.startsWith("JHS")) return "JHS";
  if (t.startsWith("B")) return "PRIMARY";
  return null;
}

function formatTeacherName(
  u: { firstName?: string | null; lastName?: string | null; name?: string | null; email?: string | null } | null
) {
  if (!u) return null;
  const a = cleanStr(u.firstName);
  const b = cleanStr(u.lastName);
  const full = cleanStr(`${a} ${b}`.trim());
  if (full) return full;
  const n = cleanStr(u.name);
  if (n) return n;
  const e = cleanStr(u.email);
  return e || null;
}

function formatClassroomName(c: { name?: string | null; arm?: string | null; grade?: string | null } | null) {
  if (!c) return null;
  const name = cleanStr(c.name);
  const arm = cleanStr(c.arm);
  if (name && arm) return `${name} ${arm}`;
  return name || null;
}

async function getTenantTermYearOrNull(tenantId: string) {
  try {
    const row = await prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { currentTerm: true, currentAcademicYear: true },
    });
    const term = normalizeTerm(row?.currentTerm);
    const academicYear = normalizeAcademicYear(row?.currentAcademicYear);
    if (!term || !academicYear) return null;
    return { term, academicYear };
  } catch {
    return null;
  }
}

async function getCtx() {
  const ctx = await getServerUserContextOrNull({ requireTenant: true });
  if (!ctx?.userId || !ctx.tenantId) return null;

  const membership = await prisma.membership.findFirst({
    where: { userId: ctx.userId, tenantId: ctx.tenantId, status: "ACTIVE" },
    select: { id: true, role: { select: { name: true } } },
  });
  if (!membership) return null;

  return { userId: ctx.userId, tenantId: ctx.tenantId, roleName: membership.role?.name ?? null };
}

type IndicatorSliceInput = {
  indicatorId?: string | null;
  indicatorCode?: string | null;
  indicatorDescription?: string | null;
  strandTitle?: string | null;
  subStrandTitle?: string | null;
  contentStandardCode?: string | null;
  contentStandardDescription?: string | null;
  phase?: string | null;
  level?: string | null;
  subjectSlug?: string | null;
  strandCode?: string | null;
  subStrandCode?: string | null;
};

type PostBody = {
  classroomId?: string | null;
  subject?: string | null;
  subjectSlug?: string | null;
  term?: string | null;
  academicYear?: string | null;
  title?: string | null;
  notes?: string | null;
  weekNumber: number;
  indicatorSlice?: IndicatorSliceInput | null;
  schemeId?: string;
};

async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

async function getCanonicalFromIndicatorWhere(where: any) {
  const ind = await prisma.curriculumIndicator.findFirst({
    where,
    select: {
      id: true,
      code: true,
      description: true,
      contentStandard: {
        select: {
          code: true,
          description: true,
          subStrand: {
            select: {
              code: true,
              title: true,
              strand: {
                select: {
                  code: true,
                  title: true,
                  subject: {
                    select: { name: true, slug: true, phase: true, level: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const subj = ind?.contentStandard?.subStrand?.strand?.subject;
  if (!ind || !subj) return null;

  return {
    subject: subj.name,
    subjectSlug: subj.slug ?? null,
    phase: subj.phase ?? null,
    level: subj.level ?? null,

    strandTitle: ind.contentStandard.subStrand.strand.title ?? null,
    strandCode: ind.contentStandard.subStrand.strand.code ?? null,

    subStrandTitle: ind.contentStandard.subStrand.title ?? null,
    subStrandCode: ind.contentStandard.subStrand.code ?? null,

    contentStandardCode: ind.contentStandard.code ?? null,
    contentStandardDescription: ind.contentStandard.description ?? null,

    indicatorId: ind.id,
    indicatorCode: ind.code ?? null,
    indicatorDescription: ind.description ?? null,
  };
}

async function getCanonicalFromIndicator(indicatorId: string) {
  return getCanonicalFromIndicatorWhere({ id: indicatorId });
}

async function getCanonicalFromIndicatorSlice(
  slice: IndicatorSliceInput | null | undefined,
  bodySubjectSlug: string | null
) {
  const directIndicatorId = cleanStr(slice?.indicatorId);

  // 1) Fast path for real DB IDs
  if (directIndicatorId && isPlausibleId(directIndicatorId)) {
    const byId = await getCanonicalFromIndicator(directIndicatorId);
    if (byId) return byId;
  }

  // 2) Canonical resolution path for synthetic UI ids
  const subjectSlug =
    normalizeSubjectSlug(slice?.subjectSlug) ??
    normalizeSubjectSlug(bodySubjectSlug);

  const indicatorCode = cleanStr(slice?.indicatorCode);
  const contentStandardCode = cleanStr(slice?.contentStandardCode);
  const subStrandCode = cleanStr(slice?.subStrandCode);
  const strandCode = cleanStr(slice?.strandCode);

  if (subjectSlug && indicatorCode && contentStandardCode && subStrandCode && strandCode) {
    const byFullChain = await getCanonicalFromIndicatorWhere({
      code: indicatorCode,
      contentStandard: {
        code: contentStandardCode,
        subStrand: {
          code: subStrandCode,
          strand: {
            code: strandCode,
            subject: {
              slug: subjectSlug,
            },
          },
        },
      },
    });
    if (byFullChain) return byFullChain;
  }

  // 3) Fallback: code within subject slug
  if (subjectSlug && indicatorCode) {
    const bySubjectAndCode = await getCanonicalFromIndicatorWhere({
      code: indicatorCode,
      contentStandard: {
        subStrand: {
          strand: {
            subject: {
              slug: subjectSlug,
            },
          },
        },
      },
    });
    if (bySubjectAndCode) return bySubjectAndCode;
  }

  return null;
}

function isPrismaSchemaOutOfSyncError(err: unknown) {
  const anyErr = err as any;
  const code = String(anyErr?.code ?? "");
  if (code === "P2021" || code === "P2022") return true;

  const msg = String(anyErr?.message ?? "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("unknown column") ||
    (msg.includes("column") && msg.includes("does not exist")) ||
    (msg.includes("relation") && msg.includes("does not exist")) ||
    (msg.includes("table") && msg.includes("does not exist"))
  );
}

function schemaOutOfSyncPublicMessage() {
  return (
    "Database schema appears out of sync with Prisma. " +
    "Run migrations and regenerate Prisma Client (e.g., `npx prisma migrate dev` then `npx prisma generate`)."
  );
}

function parseSchemaParamFromUrl(url: string | undefined) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.searchParams.get("schema");
  } catch {
    const m = url.match(/[?&]schema=([^&]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
  }
}

// Scalars only — never selects relations that may not exist in your Prisma schema.
const schemeSelect = {
  id: true,
  tenantId: true,
  teacherUserId: true,
  classroomId: true,
  subject: true,
  subjectSlug: true,
  level: true,
  term: true,
  academicYear: true,
  title: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ClassroomLite = { id: string; name: string | null; arm: string | null; grade: string | null };
type UserLite = { id: string; firstName?: string | null; lastName?: string | null; name?: string | null; email?: string | null };

async function getClassroomMap(tenantId: string, classroomIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(classroomIds.map((x) => cleanStr(x)).filter((x) => !!x && isPlausibleId(x))));
  const map = new Map<string, ClassroomLite>();
  if (ids.length === 0) return map;

  const classroomModel = (prisma as any).classroom;
  if (!classroomModel?.findMany) return map;

  const rows: ClassroomLite[] = await classroomModel.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, name: true, arm: true, grade: true },
  });

  for (const r of rows) map.set(r.id, r);
  return map;
}

async function getUserMap(userIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(userIds.map((x) => cleanStr(x)).filter((x) => !!x && isPlausibleId(x))));
  const map = new Map<string, UserLite>();
  if (ids.length === 0) return map;

  const userModel = (prisma as any).user;
  if (!userModel?.findMany) return map;

  const rows: UserLite[] = await userModel.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, name: true, email: true },
  });

  for (const r of rows) map.set(r.id, r);
  return map;
}

async function getWeekNumbersBySchemeIds(schemeIds: string[]) {
  const ids = Array.from(new Set(schemeIds.map((x) => cleanStr(x)).filter(Boolean)));
  const map = new Map<string, number[]>();
  if (ids.length === 0) return map;

  const rows = await prisma.schemeOfWorkItem.findMany({
    where: { schemeOfWorkId: { in: ids } },
    select: { schemeOfWorkId: true, weekNumber: true },
  });

  for (const r of rows) {
    const arr = map.get(r.schemeOfWorkId) ?? [];
    if (Number.isFinite(r.weekNumber)) arr.push(r.weekNumber);
    map.set(r.schemeOfWorkId, arr);
  }

  for (const [k, arr] of map.entries()) {
    const uniq = Array.from(new Set(arr)).sort((a, b) => a - b);
    map.set(k, uniq);
  }

  return map;
}

/**
 * GET /api/schemes
 */
export async function GET(req: NextRequest) {
  const reqId = randomUUID();

  const ctx = await getCtx();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized.", reqId }, { status: 401 });

  const tenantId = ctx.tenantId;

  const url = new URL(req.url);
  const mode = cleanStr(url.searchParams.get("mode"));
  const id = cleanStr(url.searchParams.get("id"));

  if (mode === "diagnose") {
    const privileged = isPrivilegedRole(ctx.roleName);
    const envSchemaParam = parseSchemaParamFromUrl(process.env.DATABASE_URL) || null;

    const prismaInfo = await prisma.$queryRaw<Array<{ currentSchema: string; searchPath: string }>>`
      select current_schema() as "currentSchema", current_setting('search_path') as "searchPath"
    `;

    const currentSchema = prismaInfo?.[0]?.currentSchema ?? null;
    const searchPath = prismaInfo?.[0]?.searchPath ?? null;

    const schemasChecked = privileged ? [currentSchema, "public"].filter(Boolean) : [currentSchema].filter(Boolean);

    const requiredTables = [
      "CurriculumSubject",
      "CurriculumStrand",
      "CurriculumSubStrand",
      "CurriculumContentStandard",
      "CurriculumIndicator",
      "Membership",
      "SchemeOfWork",
      "SchemeOfWorkItem",
      "tenant_settings",
    ];

    const checks: Record<string, any> = {};

    for (const sch of schemasChecked) {
      const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
        select table_name
        from information_schema.tables
        where table_schema = ${sch}
          and table_type = 'BASE TABLE'
      `;

      const presentSet = new Set(tables.map((t) => t.table_name));
      const presentTables = requiredTables.filter((t) => presentSet.has(t));
      const missingTables = requiredTables.filter((t) => !presentSet.has(t));

      let missingColumns: string[] = [];
      if (presentSet.has("SchemeOfWork")) {
        const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
          select column_name
          from information_schema.columns
          where table_schema = ${sch}
            and table_name = 'SchemeOfWork'
        `;
        const colSet = new Set(cols.map((c) => c.column_name));
        const expected = ["reviewedAt", "submittedAt", "approvedAt", "returnedAt"];
        missingColumns = expected.filter((c) => !colSet.has(c)).map((c) => `SchemeOfWork.${c}`);
      }

      checks[sch] = {
        presentTables,
        missingTables,
        missingColumns,
        tenantSettings: {
          expectedByPrisma: "tenant_settings",
          presentAs: presentSet.has("tenant_settings") ? "tenant_settings" : null,
        },
      };
    }

    return jsonNoStore(
      {
        ok: true,
        reqId,
        roleName: ctx.roleName,
        privileged,
        prisma: { envSchemaParam, currentSchema, searchPath },
        schemasChecked,
        checks,
      },
      { status: 200 }
    );
  }

  const subject = cleanStr(url.searchParams.get("subject"));
  const subjectSlugRaw = cleanStr(url.searchParams.get("subjectSlug"));
  const subjectSlug = subjectSlugRaw ? normalizeSubjectSlug(subjectSlugRaw) : null;

  if (subjectSlugRaw && !subjectSlug) {
    return jsonNoStore({ ok: false, error: "Invalid subjectSlug.", reqId }, { status: 400 });
  }

  const termRaw = cleanStr(url.searchParams.get("term"));
  const academicYearRaw = cleanStr(url.searchParams.get("academicYear"));

  const term = termRaw ? normalizeTerm(termRaw) : null;
  const academicYear = academicYearRaw ? normalizeAcademicYear(academicYearRaw) : null;

  if (termRaw && !term) return jsonNoStore({ ok: false, error: "Invalid term.", reqId }, { status: 400 });
  if (academicYearRaw && !academicYear) {
    return jsonNoStore({ ok: false, error: "Invalid academicYear (YYYY/YYYY).", reqId }, { status: 400 });
  }

  const levelRaw = cleanStr(url.searchParams.get("level"));
  const levelFilter = levelRaw ? normalizeLevelForComparisons(levelRaw) : null;
  if (levelRaw && !levelFilter?.token) {
    return jsonNoStore(
      { ok: false, error: 'Invalid level. Examples: "B4", "Basic 4", "JHS1", "JHS 1", "KG1", "Basic 7".', reqId },
      { status: 400 }
    );
  }

  const privileged = isPrivilegedRole(ctx.roleName);
  const teacherUserIdParam = cleanStr(url.searchParams.get("teacherUserId"));
  const teacherUserId =
    privileged && teacherUserIdParam && isPlausibleId(teacherUserIdParam) ? teacherUserIdParam : ctx.userId;

  if (id && !isPlausibleId(id)) return jsonNoStore({ ok: false, error: "Invalid id.", reqId }, { status: 400 });

  async function hydrateList(rows: Array<any>) {
    const schemeIds = rows.map((r) => String(r.id));
    const classroomMap = await getClassroomMap(tenantId, rows.map((r) => r.classroomId));
    const userMap = await getUserMap(rows.map((r) => r.teacherUserId));
    const weeksMap = await getWeekNumbersBySchemeIds(schemeIds);

    return rows.map((s) => {
      const classroom = s.classroomId ? classroomMap.get(String(s.classroomId)) ?? null : null;
      const teacher = s.teacherUserId ? userMap.get(String(s.teacherUserId)) ?? null : null;
      const weekNumbers = weeksMap.get(String(s.id)) ?? [];

      return {
        id: s.id,
        subject: s.subject,
        subjectSlug: s.subjectSlug ?? null,
        level: s.level,
        term: s.term,
        academicYear: s.academicYear,
        classroomName: formatClassroomName(classroom),
        teacherName: formatTeacherName(teacher),
        totalItems: weekNumbers.length,
        weekNumbers,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      };
    });
  }

  if (mode === "summary") {
    try {
      const where: any = { tenantId, teacherUserId };
      if (term) where.term = term;
      if (academicYear) where.academicYear = academicYear;
      if (levelFilter?.variants?.length) where.level = { in: levelFilter.variants };

      const rows = await prisma.schemeOfWork.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        select: schemeSelect,
      });

      const items = await hydrateList(rows as any[]);
      return jsonNoStore({ ok: true, items, reqId }, { status: 200 });
    } catch (err) {
      console.error("SCHEMES_SUMMARY_GET_ERROR", { reqId, err });
      if (isPrismaSchemaOutOfSyncError(err)) {
        return jsonNoStore({ ok: false, error: schemaOutOfSyncPublicMessage(), reqId }, { status: 500 });
      }
      return jsonNoStore({ ok: false, error: "Failed to load schemes summary.", reqId }, { status: 500 });
    }
  }

  if (id) {
    try {
      const scheme = await prisma.schemeOfWork.findFirst({
        where: { id, tenantId, teacherUserId },
        select: schemeSelect,
      });

      if (!scheme) return jsonNoStore({ ok: false, error: "Scheme not found.", reqId }, { status: 404 });

      const [classroomMap, userMap] = await Promise.all([
        getClassroomMap(tenantId, [scheme.classroomId]),
        getUserMap([scheme.teacherUserId]),
      ]);

      const classroom = scheme.classroomId ? classroomMap.get(String(scheme.classroomId)) ?? null : null;
      const teacher = scheme.teacherUserId ? userMap.get(String(scheme.teacherUserId)) ?? null : null;

      const itemsRaw = await prisma.schemeOfWorkItem.findMany({
        where: { schemeOfWorkId: scheme.id },
        select: {
          id: true,
          weekNumber: true,
          strandTitle: true,
          subStrandTitle: true,
          contentStandardCode: true,
          contentStandardDescription: true,
          indicatorCode: true,
          indicatorDescription: true,
        },
        orderBy: [{ weekNumber: "asc" }],
      });

      const items = itemsRaw.map((it) => ({
        id: it.id,
        weekNumber: it.weekNumber,
        strandTitle: it.strandTitle ?? null,
        subStrandTitle: it.subStrandTitle ?? null,
        contentStandardCode: it.contentStandardCode ?? null,
        contentStandardDescription: it.contentStandardDescription ?? null,
        indicatorCode: it.indicatorCode ?? null,
        indicatorDescription: (it.indicatorDescription ?? "").trim(),
      }));

      return jsonNoStore(
        {
          ok: true,
          reqId,
          scheme: {
            id: scheme.id,
            subject: scheme.subject,
            subjectSlug: scheme.subjectSlug ?? null,
            level: scheme.level,
            term: scheme.term,
            academicYear: scheme.academicYear,
            teacherName: formatTeacherName(teacher),
            className: formatClassroomName(classroom),
            createdAt: scheme.createdAt.toISOString(),
            updatedAt: scheme.updatedAt?.toISOString?.() ?? null,
            items,
          },
        },
        { status: 200 }
      );
    } catch (err) {
      console.error("SCHEMES_DETAIL_GET_ERROR", { reqId, err });
      if (isPrismaSchemaOutOfSyncError(err)) {
        return jsonNoStore({ ok: false, error: schemaOutOfSyncPublicMessage(), reqId }, { status: 500 });
      }
      return jsonNoStore({ ok: false, error: "Failed to load scheme detail.", reqId }, { status: 500 });
    }
  }

  if (subjectSlug || subject) {
    try {
      const where: any = { tenantId, teacherUserId };
      if (term) where.term = term;
      if (academicYear) where.academicYear = academicYear;
      if (levelFilter?.variants?.length) where.level = { in: levelFilter.variants };

      if (subjectSlug && subject) {
        where.OR = [{ subjectSlug }, { subject }];
      } else if (subjectSlug) {
        where.subjectSlug = subjectSlug;
      } else if (subject) {
        where.subject = subject;
      }

      const rows = await prisma.schemeOfWork.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        select: schemeSelect,
      });

      const items = await hydrateList(rows as any[]);
      return jsonNoStore({ ok: true, items, reqId }, { status: 200 });
    } catch (err) {
      console.error("SCHEMES_SUBJECT_GET_ERROR", { reqId, err });
      if (isPrismaSchemaOutOfSyncError(err)) {
        return jsonNoStore({ ok: false, error: schemaOutOfSyncPublicMessage(), reqId }, { status: 500 });
      }
      return jsonNoStore({ ok: false, error: "Failed to load schemes for this subject.", reqId }, { status: 500 });
    }
  }

  return jsonNoStore({ ok: true, items: [], reqId }, { status: 200 });
}

/**
 * POST /api/schemes
 */
export async function POST(req: NextRequest) {
  const reqId = randomUUID();

  const ctx = await getCtx();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized.", reqId }, { status: 401 });

  const tenantId = ctx.tenantId;
  const privileged = isPrivilegedRole(ctx.roleName);

  const body = await readJson<PostBody>(req);
  if (!body) return jsonNoStore({ ok: false, error: "Invalid JSON body.", reqId }, { status: 400 });

  const weekNumber = Number(body.weekNumber);
  if (!Number.isInteger(weekNumber) || weekNumber <= 0) {
    return jsonNoStore({ ok: false, error: "weekNumber must be a positive whole number.", reqId }, { status: 400 });
  }

  const rawIndicatorId = cleanStr(body.indicatorSlice?.indicatorId);
  const hasCanonicalFields =
    !!cleanStr(body.indicatorSlice?.indicatorCode) &&
    !!cleanStr(body.indicatorSlice?.contentStandardCode) &&
    !!cleanStr(body.indicatorSlice?.subStrandCode) &&
    !!cleanStr(body.indicatorSlice?.strandCode) &&
    !!(normalizeSubjectSlug(body.indicatorSlice?.subjectSlug) ?? normalizeSubjectSlug(body.subjectSlug));

  if (!rawIndicatorId && !hasCanonicalFields) {
    return jsonNoStore(
      { ok: false, error: "indicatorSlice is missing both a usable indicator id and canonical curriculum fields.", reqId },
      { status: 400 }
    );
  }

  const canonical = await getCanonicalFromIndicatorSlice(
    body.indicatorSlice,
    normalizeSubjectSlug(body.subjectSlug)
  );

  if (!canonical) {
    return jsonNoStore(
      { ok: false, error: "Curriculum indicator not found. Refresh the curriculum explorer and try again.", reqId },
      { status: 404 }
    );
  }

  const canonicalLevelRaw = canonical.level ? cleanStr(canonical.level) : null;
  if (!canonicalLevelRaw) {
    return jsonNoStore(
      { ok: false, error: "This indicator's subject is missing a 'level' in CurriculumSubject. Fix curriculum seeding.", reqId },
      { status: 500 }
    );
  }

  const canonicalLevelNorm = normalizeLevelForComparisons(canonicalLevelRaw);
  if (!canonicalLevelNorm.token || canonicalLevelNorm.variants.length === 0) {
    return jsonNoStore(
      { ok: false, error: "This indicator's subject has an unrecognized 'level'. Fix curriculum seeding.", reqId },
      { status: 500 }
    );
  }

  const canonicalSlug = normalizeSubjectSlug(canonical.subjectSlug);
  if (!canonicalSlug) {
    return jsonNoStore(
      { ok: false, error: "This indicator's subject is missing a valid 'slug'. Fix curriculum seeding.", reqId },
      { status: 500 }
    );
  }

  const subjectFromClient = cleanStr(body.subject);
  const subjectSlugFromClient = normalizeSubjectSlug(body.subjectSlug);

  if (subjectFromClient) {
    const clientKey = normalizeSubjectKey(subjectFromClient);
    const canonicalVariants = subjectVariantsForScope(canonical.subject, canonicalSlug);
    const ok = canonicalVariants.some((v) => normalizeSubjectKey(v) === clientKey);
    if (!ok) {
      return jsonNoStore(
        { ok: false, error: "Subject mismatch. Select an indicator from the same subject you are adding to the scheme.", reqId },
        { status: 400 }
      );
    }
  }

  if (body.subjectSlug != null && !subjectSlugFromClient) {
    return jsonNoStore({ ok: false, error: "Invalid subjectSlug.", reqId }, { status: 400 });
  }

  if (subjectSlugFromClient && subjectSlugFromClient !== canonicalSlug) {
    return jsonNoStore({ ok: false, error: "Subject slug mismatch. Please refresh and try again.", reqId }, { status: 400 });
  }

  if (!privileged) {
    const scope = await getTeacherScopeOrNull(tenantId, ctx.userId);
    if (!scope) return jsonNoStore({ ok: false, error: "Forbidden: teacher profile missing.", reqId }, { status: 403 });

    const levelsToTry = new Set<string>();
    levelsToTry.add(canonicalLevelNorm.token);
    for (const v of canonicalLevelNorm.variants) levelsToTry.add(v);
    for (const v of canonicalLevelNorm.variants) {
      const t = normalizeLevelToken(v);
      if (t) levelsToTry.add(t);
    }

    const subjectsToTry = new Set<string>(subjectVariantsForScope(canonical.subject, canonicalSlug));
    let allowed = false;

    for (const subj of subjectsToTry) {
      for (const lv of levelsToTry) {
        if (teacherCanPlanLessonNotesOrSchemes(scope, subj, lv)) {
          allowed = true;
          break;
        }
      }
      if (allowed) break;
    }

    if (!allowed) {
      console.warn("SCHEME_SCOPE_DENIED", {
        reqId,
        tenantId,
        userId: ctx.userId,
        subject: canonical.subject,
        subjectSlug: canonicalSlug,
        subjectsTried: Array.from(subjectsToTry),
        canonicalLevel: canonicalLevelRaw,
        canonicalToken: canonicalLevelNorm.token,
        triedLevels: Array.from(levelsToTry),
      });

      return jsonNoStore({ ok: false, error: "Forbidden: not assigned to this subject/class.", reqId }, { status: 403 });
    }
  }

  let term = body.term ? normalizeTerm(body.term) : null;
  let academicYear = body.academicYear ? normalizeAcademicYear(body.academicYear) : null;

  if (!term || !academicYear) {
    const fallback = await getTenantTermYearOrNull(tenantId);
    term = term ?? fallback?.term ?? null;
    academicYear = academicYear ?? fallback?.academicYear ?? null;
  }

  if (!term || !academicYear) {
    return jsonNoStore({ ok: false, error: "Term/AcademicYear not provided and not configured for this tenant.", reqId }, { status: 400 });
  }

  const classroomId = body.classroomId ?? null;

  const schemeIdRaw = cleanStr(body.schemeId);
  if (schemeIdRaw && !isPlausibleId(schemeIdRaw)) {
    return jsonNoStore({ ok: false, error: "Invalid schemeId.", reqId }, { status: 400 });
  }

  try {
    let scheme: any = null;

    if (schemeIdRaw) {
      scheme = await prisma.schemeOfWork.findFirst({
        where: { id: schemeIdRaw, tenantId, teacherUserId: ctx.userId },
        select: schemeSelect,
      });
      if (!scheme) return jsonNoStore({ ok: false, error: "Scheme not found.", reqId }, { status: 404 });

      const schemeSlug = normalizeSubjectSlug(scheme.subjectSlug);
      if (!schemeSlug || schemeSlug !== canonicalSlug) {
        return jsonNoStore({ ok: false, error: "Scheme subject mismatch. Open the correct scheme for this indicator.", reqId }, { status: 400 });
      }

      const schemeLevelTok = normalizeLevelToken(scheme.level);
      const canonicalTok = canonicalLevelNorm.token;
      if (!schemeLevelTok || schemeLevelTok !== canonicalTok) {
        return jsonNoStore({ ok: false, error: "Scheme level mismatch. Open the correct scheme for this indicator.", reqId }, { status: 400 });
      }

      if (scheme.term !== term || scheme.academicYear !== academicYear) {
        return jsonNoStore({ ok: false, error: "Scheme term/year mismatch. Open the correct scheme for this term/year.", reqId }, { status: 400 });
      }

      if (classroomId && !scheme.classroomId) {
        scheme = await prisma.schemeOfWork.update({
          where: { id: scheme.id },
          data: { classroomId },
          select: schemeSelect,
        });
      }
    } else {
      const levelVariants = canonicalLevelNorm.variants;

      scheme = await prisma.schemeOfWork.findFirst({
        where: {
          tenantId,
          teacherUserId: ctx.userId,
          term,
          academicYear,
          level: { in: levelVariants },
          OR: [{ subjectSlug: canonicalSlug }, { subject: canonical.subject }],
        },
        orderBy: { createdAt: "desc" },
        select: schemeSelect,
      });

      if (!scheme) {
        const autoTitle = (body.title && cleanStr(body.title)) || `${canonical.subject} – ${term} (${academicYear})`;

        scheme = await prisma.schemeOfWork.create({
          data: {
            tenantId,
            teacherUserId: ctx.userId,
            classroomId,
            subject: canonical.subject,
            subjectSlug: canonicalSlug,
            level: canonicalLevelRaw,
            term,
            academicYear,
            title: autoTitle,
            notes: body.notes ? String(body.notes) : null,
          },
          select: schemeSelect,
        });
      } else {
        if (!normalizeSubjectSlug(scheme.subjectSlug)) {
          scheme = await prisma.schemeOfWork.update({
            where: { id: scheme.id },
            data: { subjectSlug: canonicalSlug },
            select: schemeSelect,
          });
        }
        if (classroomId && !scheme.classroomId) {
          scheme = await prisma.schemeOfWork.update({
            where: { id: scheme.id },
            data: { classroomId },
            select: schemeSelect,
          });
        }
      }
    }

    const existingItem = await prisma.schemeOfWorkItem.findFirst({
      where: { schemeOfWorkId: scheme.id, weekNumber, indicatorId: canonical.indicatorId },
      select: { id: true },
    });

    if (existingItem) {
      return jsonNoStore(
        {
          ok: true,
          reqId,
          reused: true,
          scheme: {
            id: scheme.id,
            subject: scheme.subject,
            subjectSlug: scheme.subjectSlug ?? null,
            level: scheme.level,
            phase: inferPhaseFromLevel(scheme.level),
            term: scheme.term,
            academicYear: scheme.academicYear,
            title: scheme.title ?? null,
            classroomId: scheme.classroomId ?? null,
          },
          item: { id: existingItem.id },
        },
        { status: 200 }
      );
    }

    const item = await prisma.schemeOfWorkItem.create({
      data: {
        schemeOfWorkId: scheme.id,
        weekNumber,
        indicatorId: canonical.indicatorId,
        indicatorCode: canonical.indicatorCode ?? null,
        indicatorDescription: canonical.indicatorDescription ?? null,
        strandTitle: canonical.strandTitle ?? null,
        subStrandTitle: canonical.subStrandTitle ?? null,
        contentStandardCode: canonical.contentStandardCode ?? null,
        contentStandardDescription: canonical.contentStandardDescription ?? null,
      },
      select: {
        id: true,
        schemeOfWorkId: true,
        weekNumber: true,
        indicatorId: true,
        indicatorCode: true,
        indicatorDescription: true,
        strandTitle: true,
        subStrandTitle: true,
        contentStandardCode: true,
        contentStandardDescription: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return jsonNoStore(
      {
        ok: true,
        reqId,
        reused: false,
        scheme: {
          id: scheme.id,
          subject: scheme.subject,
          subjectSlug: scheme.subjectSlug ?? null,
          level: scheme.level,
          phase: inferPhaseFromLevel(scheme.level),
          term: scheme.term,
          academicYear: scheme.academicYear,
          title: scheme.title ?? null,
          classroomId: scheme.classroomId ?? null,
        },
        item,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("SCHEMES_POST_ERROR", { reqId, err });
    if (isPrismaSchemaOutOfSyncError(err)) {
      return jsonNoStore({ ok: false, error: schemaOutOfSyncPublicMessage(), reqId }, { status: 500 });
    }
    return jsonNoStore({ ok: false, error: "Failed to save scheme item.", reqId }, { status: 500 });
  }
}