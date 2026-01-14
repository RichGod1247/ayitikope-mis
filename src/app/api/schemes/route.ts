// src/app/api/schemes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerUserContextOrNull } from "@/lib/serverAuth";
import {
  getTeacherScopeOrNull,
  normalizeSubjectKey,
  teacherCanAccess,
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

  const dash = v.match(/^(\d{4})-(\d{4})$/);
  if (dash) return `${dash[1]}/${dash[2]}`;

  if (/^\d{4}\/\d{4}$/.test(v)) return v;
  return null;
}

function isPrivilegedRole(roleName: string | null) {
  if (!roleName) return false;
  const r = roleName.toUpperCase();
  return ["OWNER", "ADMIN", "HEADTEACHER", "SUPER_ADMIN"].includes(r);
}

function inferPhaseFromLevel(level: string | null): "KG" | "PRIMARY" | "JHS" | null {
  if (!level) return null;
  const v = level.trim().toUpperCase();
  if (v.startsWith("KG")) return "KG";
  if (v.startsWith("JHS")) return "JHS";
  // Basic 1..6 and anything else defaults to PRIMARY for UI convenience
  return "PRIMARY";
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

type PostBody = {
  classroomId?: string | null;
  subject: string;
  term?: string | null;
  academicYear?: string | null;
  title?: string | null;
  notes?: string | null;
  weekNumber: number;
  indicatorSlice: {
    indicatorId: string; // curriculumIndicator.id
  };
  schemeId?: string;
};

async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

async function getCanonicalFromIndicator(indicatorId: string) {
  const ind = await prisma.curriculumIndicator.findFirst({
    where: { id: indicatorId },
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

/**
 * GET /api/schemes
 */
export async function GET(req: NextRequest) {
  const ctx = await getCtx();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });

  const url = new URL(req.url);
  const mode = cleanStr(url.searchParams.get("mode"));
  const id = cleanStr(url.searchParams.get("id"));
  const subject = cleanStr(url.searchParams.get("subject"));

  const termRaw = cleanStr(url.searchParams.get("term"));
  const academicYearRaw = cleanStr(url.searchParams.get("academicYear"));

  const term = termRaw ? normalizeTerm(termRaw) : null;
  const academicYear = academicYearRaw ? normalizeAcademicYear(academicYearRaw) : null;

  if (termRaw && !term) return jsonNoStore({ ok: false, error: "Invalid term." }, { status: 400 });
  if (academicYearRaw && !academicYear)
    return jsonNoStore({ ok: false, error: "Invalid academicYear (YYYY/YYYY)." }, { status: 400 });

  const privileged = isPrivilegedRole(ctx.roleName);
  const teacherUserIdParam = cleanStr(url.searchParams.get("teacherUserId"));
  const teacherUserId =
    privileged && teacherUserIdParam && isPlausibleId(teacherUserIdParam) ? teacherUserIdParam : ctx.userId;

  if (id && !isPlausibleId(id)) return jsonNoStore({ ok: false, error: "Invalid id." }, { status: 400 });

  // summary list
  if (mode === "summary") {
    try {
      const where: any = { tenantId: ctx.tenantId, teacherUserId };
      if (term) where.term = term;
      if (academicYear) where.academicYear = academicYear;

      const rows = await prisma.schemeOfWork.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          subject: true,
          subjectSlug: true,
          level: true,
          term: true,
          academicYear: true,
          title: true,
          classroomId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { items: true } },
        },
      });

      return jsonNoStore(
        {
          ok: true,
          items: rows.map((s) => ({
            id: s.id,
            subject: s.subject,
            subjectSlug: s.subjectSlug ?? null,
            level: s.level,
            phase: inferPhaseFromLevel(s.level), // UI convenience (not stored in SchemeOfWork)
            term: s.term,
            academicYear: s.academicYear,
            title: s.title ?? null,
            classroomId: s.classroomId ?? null,
            status: s.status,
            itemCount: s._count.items,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString(),
          })),
        },
        { status: 200 }
      );
    } catch (err) {
      console.error("SCHEMES_SUMMARY_GET_ERROR", err);
      return jsonNoStore({ ok: false, error: "Failed to load schemes summary." }, { status: 500 });
    }
  }

  // detail by id
  if (id) {
    try {
      const scheme = await prisma.schemeOfWork.findFirst({
        where: { id, tenantId: ctx.tenantId, teacherUserId },
        include: { items: true },
      });

      if (!scheme) return jsonNoStore({ ok: false, error: "Scheme not found." }, { status: 404 });

      const items = Array.isArray(scheme.items)
        ? scheme.items
            .slice()
            .sort((a, b) => (a.weekNumber ?? 0) - (b.weekNumber ?? 0))
            .map((it) => ({
              id: it.id,
              weekNumber: it.weekNumber,
              strandTitle: it.strandTitle ?? null,
              subStrandTitle: it.subStrandTitle ?? null,
              contentStandardCode: it.contentStandardCode ?? null,
              contentStandardDescription: it.contentStandardDescription ?? null,
              indicatorCode: it.indicatorCode ?? null,
              indicatorDescription: it.indicatorDescription ?? null,
              indicatorId: it.indicatorId ?? null,
              dayNumber: typeof it.dayNumber === "number" ? it.dayNumber : null,
              notes: it.notes ?? null,
              createdAt: it.createdAt.toISOString(),
              updatedAt: it.updatedAt.toISOString(),
            }))
        : [];

      return jsonNoStore(
        {
          ok: true,
          scheme: {
            id: scheme.id,
            tenantId: scheme.tenantId,
            teacherUserId: scheme.teacherUserId,
            classroomId: scheme.classroomId ?? null,
            subject: scheme.subject,
            subjectSlug: scheme.subjectSlug ?? null,
            level: scheme.level,
            phase: inferPhaseFromLevel(scheme.level),
            term: scheme.term,
            academicYear: scheme.academicYear,
            title: scheme.title ?? null,
            notes: scheme.notes ?? null,
            status: scheme.status,
            createdAt: scheme.createdAt.toISOString(),
            updatedAt: scheme.updatedAt.toISOString(),
            items,
          },
        },
        { status: 200 }
      );
    } catch (err) {
      console.error("SCHEMES_DETAIL_GET_ERROR", err);
      return jsonNoStore({ ok: false, error: "Failed to load scheme detail." }, { status: 500 });
    }
  }

  // list by subject
  if (subject) {
    try {
      const where: any = { tenantId: ctx.tenantId, teacherUserId, subject };
      if (term) where.term = term;
      if (academicYear) where.academicYear = academicYear;

      const rows = await prisma.schemeOfWork.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          subject: true,
          subjectSlug: true,
          level: true,
          term: true,
          academicYear: true,
          title: true,
          classroomId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { items: true } },
        },
      });

      return jsonNoStore(
        {
          ok: true,
          items: rows.map((s) => ({
            id: s.id,
            subject: s.subject,
            subjectSlug: s.subjectSlug ?? null,
            level: s.level,
            phase: inferPhaseFromLevel(s.level),
            term: s.term,
            academicYear: s.academicYear,
            title: s.title ?? null,
            classroomId: s.classroomId ?? null,
            status: s.status,
            itemCount: s._count.items,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString(),
          })),
        },
        { status: 200 }
      );
    } catch (err) {
      console.error("SCHEMES_SUBJECT_GET_ERROR", err);
      return jsonNoStore({ ok: false, error: "Failed to load schemes for this subject." }, { status: 500 });
    }
  }

  return jsonNoStore({ ok: true, items: [] }, { status: 200 });
}

/**
 * POST /api/schemes
 * - Canonicalize indicator context from DB (NO TRUST in client indicatorSlice fields)
 * - Enforce teacher scope for non-privileged roles
 * - Prevent duplicates (app-level)
 */
export async function POST(req: NextRequest) {
  const ctx = await getCtx();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });

  const body = await readJson<PostBody>(req);
  if (!body) return jsonNoStore({ ok: false, error: "Invalid JSON body." }, { status: 400 });

  const weekNumber = Number(body.weekNumber);
  if (!Number.isInteger(weekNumber) || weekNumber <= 0) {
    return jsonNoStore({ ok: false, error: "weekNumber must be a positive whole number." }, { status: 400 });
  }

  const indicatorId = cleanStr(body.indicatorSlice?.indicatorId);
  if (!indicatorId || !isPlausibleId(indicatorId)) {
    return jsonNoStore({ ok: false, error: "indicatorSlice.indicatorId is required." }, { status: 400 });
  }

  const canonical = await getCanonicalFromIndicator(indicatorId);
  if (!canonical) return jsonNoStore({ ok: false, error: "Curriculum indicator not found." }, { status: 404 });

  // Subject mismatch = spoof attempt or client bug
  const subjectFromClient = cleanStr(body.subject);
  if (!subjectFromClient) return jsonNoStore({ ok: false, error: "subject is required." }, { status: 400 });

  if (normalizeSubjectKey(subjectFromClient) !== normalizeSubjectKey(canonical.subject)) {
    return jsonNoStore(
      { ok: false, error: "Subject mismatch. Select an indicator from the same subject you are adding to the scheme." },
      { status: 400 }
    );
  }

  // ✅ SchemeOfWork.level is REQUIRED in your schema
  if (!canonical.level) {
    return jsonNoStore(
      { ok: false, error: "This indicator's subject is missing a 'level' in CurriculumSubject. Fix curriculum seeding." },
      { status: 500 }
    );
  }

  const privileged = isPrivilegedRole(ctx.roleName);

  // ✅ enforce teacher scope for non-privileged users
  if (!privileged) {
    const scope = await getTeacherScopeOrNull(ctx.tenantId, ctx.userId);
    if (!scope) return jsonNoStore({ ok: false, error: "Forbidden: teacher profile missing." }, { status: 403 });

    if (!teacherCanAccess(scope, canonical.subject, canonical.level)) {
      return jsonNoStore({ ok: false, error: "Forbidden: not assigned to this subject/class." }, { status: 403 });
    }
  }

  // Term/year resolution (client or tenant settings fallback)
  let term = body.term ? normalizeTerm(body.term) : null;
  let academicYear = body.academicYear ? normalizeAcademicYear(body.academicYear) : null;

  if (!term || !academicYear) {
    const fallback = await getTenantTermYearOrNull(ctx.tenantId);
    term = term ?? fallback?.term ?? null;
    academicYear = academicYear ?? fallback?.academicYear ?? null;
  }

  if (!term || !academicYear) {
    return jsonNoStore(
      { ok: false, error: "Term/AcademicYear not provided and not configured for this tenant." },
      { status: 400 }
    );
  }

  const classroomId = body.classroomId ?? null;

  const schemeIdRaw = cleanStr(body.schemeId);
  if (schemeIdRaw && !isPlausibleId(schemeIdRaw)) {
    return jsonNoStore({ ok: false, error: "Invalid schemeId." }, { status: 400 });
  }

  try {
    let scheme = null as any;

    if (schemeIdRaw) {
      scheme = await prisma.schemeOfWork.findFirst({
        where: { id: schemeIdRaw, tenantId: ctx.tenantId, teacherUserId: ctx.userId },
      });
      if (!scheme) return jsonNoStore({ ok: false, error: "Scheme not found." }, { status: 404 });
    } else {
      // ✅ matches your unique constraint: tenantId + teacherUserId + subject + level + term + academicYear
      scheme = await prisma.schemeOfWork.findFirst({
        where: {
          tenantId: ctx.tenantId,
          teacherUserId: ctx.userId,
          subject: canonical.subject,
          level: canonical.level,
          term,
          academicYear,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!scheme) {
        const autoTitle = (body.title && cleanStr(body.title)) || `${canonical.subject} – ${term} (${academicYear})`;

        scheme = await prisma.schemeOfWork.create({
          data: {
            tenantId: ctx.tenantId,
            teacherUserId: ctx.userId,
            classroomId,
            subject: canonical.subject,
            subjectSlug: canonical.subjectSlug ?? null,
            level: canonical.level,
            term,
            academicYear,
            title: autoTitle,
            notes: body.notes ? String(body.notes) : null,
          },
        });
      } else if (classroomId && !scheme.classroomId) {
        // optional: set classroomId if the scheme was created without one
        scheme = await prisma.schemeOfWork.update({
          where: { id: scheme.id },
          data: { classroomId },
        });
      }
    }

    // prevent duplicates (app-level)
    const existingItem = await prisma.schemeOfWorkItem.findFirst({
      where: {
        schemeOfWorkId: scheme.id,
        weekNumber,
        indicatorId: canonical.indicatorId,
      },
      select: { id: true },
    });

    if (existingItem) {
      return jsonNoStore(
        {
          ok: true,
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

        // ✅ Schema supports indicatorId (no curriculumIndicatorId in your model)
        indicatorId: canonical.indicatorId,
        indicatorCode: canonical.indicatorCode ?? null,
        indicatorDescription: canonical.indicatorDescription ?? null,

        strandTitle: canonical.strandTitle ?? null,
        subStrandTitle: canonical.subStrandTitle ?? null,
        contentStandardCode: canonical.contentStandardCode ?? null,
        contentStandardDescription: canonical.contentStandardDescription ?? null,
      },
    });

    return jsonNoStore(
      {
        ok: true,
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
    console.error("SCHEMES_POST_ERROR", err);
    return jsonNoStore({ ok: false, error: "Failed to save scheme item." }, { status: 500 });
  }
}
