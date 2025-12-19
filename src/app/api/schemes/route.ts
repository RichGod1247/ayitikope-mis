// src/app/api/schemes/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Scheme of Work API
 *
 * Modes (GET):
 *
 * 1) Overview for TeacherSchemesPage (no auth filtering yet)
 *    GET /api/schemes?mode=summary
 *
 * 2) Single scheme detail for /teacher/schemes/[id]
 *    GET /api/schemes?id=SCHEME_ID
 *
 * 3) Subject-filtered list (used by Teacher Curriculum Explorer)
 *    GET /api/schemes?subject=JHS%201%20Computing
 *
 * 4) Legacy teacher-filtered list (kept for future use)
 *    GET /api/schemes?tenantId=...&teacherUserId=...[&subject=...&term=...&academicYear=...]
 *
 * POST:
 *  - Create / extend a Scheme of Work for a given indicator.
 */

type PostBody = {
  tenantId: string;
  teacherUserId: string;
  classroomId?: string | null;
  subject: string;
  term: string;
  academicYear: string;
  title?: string | null;
  notes?: string | null; // accepted in API but not stored on SchemeOfWork (only on items)
  weekNumber: number;
  indicatorSlice: {
    indicatorId: string; // curriculumIndicators.id
    indicatorCode?: string | null;
    indicatorDescription?: string | null;
    strandTitle?: string | null;
    subStrandTitle?: string | null;
    contentStandardCode?: string | null;
    contentStandardDescription?: string | null;
  };
  schemeId?: string;
};

// Small helper to parse JSON safely
async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    const data = (await req.json()) as T;
    return data;
  } catch {
    return null;
  }
}

/**
 * GET: List / describe schemes of work
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "";
  const id = url.searchParams.get("id");
  const subjectFilter = url.searchParams.get("subject") ?? "";

  const tenantId = url.searchParams.get("tenantId") ?? "";
  const teacherUserId = url.searchParams.get("teacherUserId") ?? "";
  const subjectLegacy = url.searchParams.get("subject") ?? "";
  const termLegacy = url.searchParams.get("term") ?? "";
  const academicYearLegacy = url.searchParams.get("academicYear") ?? "";

  const prismaAny = prisma as any;

  // -------------------------
  // 1) Overview: mode=summary
  // -------------------------
  if (mode === "summary") {
    try {
      const schemes = await prismaAny.schemeOfWork.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          items: true,
        },
      });

      const items = (schemes as any[]).map((s: any) => {
        const weekNumbers = Array.isArray(s.items)
          ? (() => {
              const weeks = Array.from(
                new Set(
                  s.items
                    .map((it: any) => it.weekNumber)
                    .filter((w: any) => typeof w === "number")
                )
              ) as number[];
              weeks.sort((a: number, b: number) => a - b);
              return weeks;
            })()
          : [];

        return {
          id: s.id,
          subject: s.subject,
          term: s.term,
          academicYear: s.academicYear,
          classroomName: null as string | null,
          teacherName: null as string | null,
          totalItems: Array.isArray(s.items) ? s.items.length : 0,
          weekNumbers,
          createdAt: s.createdAt?.toISOString
            ? s.createdAt.toISOString()
            : new Date(s.createdAt).toISOString(),
          updatedAt: s.updatedAt
            ? s.updatedAt?.toISOString
              ? s.updatedAt.toISOString()
              : new Date(s.updatedAt).toISOString()
            : new Date(s.createdAt).toISOString(),
        };
      });

      return NextResponse.json(
        {
          ok: true,
          items,
        },
        { status: 200 }
      );
    } catch (err) {
      console.error("SCHEMES_SUMMARY_GET_ERROR", err);
      return NextResponse.json(
        {
          ok: false,
          error:
            "Failed to load schemes of work summary. Please try again.",
        },
        { status: 500 }
      );
    }
  }

  // --------------------------------------
  // 2) Single scheme detail: ?id=SCHEME_ID
  // --------------------------------------
  if (id) {
    try {
      const scheme = await prismaAny.schemeOfWork.findUnique({
        where: { id },
        include: {
          items: true,
        },
      });

      if (!scheme) {
        return NextResponse.json(
          {
            ok: false,
            error: "Scheme of Work not found.",
          },
          { status: 404 }
        );
      }

      const items = Array.isArray(scheme.items)
        ? (scheme.items as any[]).map((it: any) => ({
            id: it.id as string,
            weekNumber:
              typeof it.weekNumber === "number" ? it.weekNumber : 0,
            strandTitle: it.strandTitle ?? null,
            subStrandTitle: it.subStrandTitle ?? null,
            contentStandardCode: it.contentStandardCode ?? null,
            contentStandardDescription:
              it.contentStandardDescription ?? null,
            indicatorCode: it.indicatorCode ?? null,
            indicatorDescription: it.indicatorDescription ?? "",
            notes: it.notes ?? null,
            dayNumber:
              typeof it.dayNumber === "number" ? it.dayNumber : null,
          }))
        : [];

      const detail = {
        id: scheme.id as string,
        subject: scheme.subject as string,
        term: scheme.term as string,
        academicYear: scheme.academicYear as string,
        teacherName: null as string | null,
        className: null as string | null,
        createdAt: scheme.createdAt?.toISOString
          ? scheme.createdAt.toISOString()
          : new Date(scheme.createdAt).toISOString(),
        updatedAt: scheme.updatedAt
          ? scheme.updatedAt?.toISOString
            ? scheme.updatedAt.toISOString()
            : new Date(scheme.updatedAt).toISOString()
          : null,
        items,
      };

      return NextResponse.json(
        {
          ok: true,
          scheme: detail,
        },
        { status: 200 }
      );
    } catch (err) {
      console.error("SCHEMES_DETAIL_GET_ERROR", err);
      return NextResponse.json(
        {
          ok: false,
          error:
            "Failed to load Scheme of Work detail. Please try again.",
        },
        { status: 500 }
      );
    }
  }

  // -----------------------------------------------------
  // 3) Subject-filtered list, used by Teacher Curriculum
  //    GET /api/schemes?subject=JHS%201%20Computing
  //    (no tenant/teacher filter yet; single-tenant world)
  // -----------------------------------------------------
  if (subjectFilter && !tenantId && !teacherUserId && !mode) {
    try {
      const schemes = await prismaAny.schemeOfWork.findMany({
        where: {
          subject: subjectFilter,
        },
        orderBy: { createdAt: "asc" },
        include: {
          items: true,
        },
      });

      const items = (schemes as any[]).map((s: any) => ({
        id: s.id as string,
        title:
          (typeof s.title === "string" && s.title.length > 0
            ? s.title
            : null) ?? null,
        subject: s.subject as string,
        term: s.term as string,
        academicYear: s.academicYear as string,
        classroomId: s.classroomId ?? null,
        itemCount: Array.isArray(s.items) ? s.items.length : 0,
      }));

      return NextResponse.json(
        {
          ok: true,
          items,
        },
        { status: 200 }
      );
    } catch (err) {
      console.error("SCHEMES_SUBJECT_GET_ERROR", err);
      return NextResponse.json(
        {
          ok: false,
          error:
            "Failed to load schemes of work for this subject. Please try again.",
        },
        { status: 500 }
      );
    }
  }

  // ------------------------------------------------------------
  // 4) Legacy teacher-filtered list (tenantId + teacherUserId...)
  // ------------------------------------------------------------
  // ⚠️ TEMP: if no tenant/teacher AND no subjectFilter, just return empty list instead of 400.
  if (!tenantId || !teacherUserId) {
    return NextResponse.json(
      {
        ok: true,
        items: [],
      },
      { status: 200 }
    );
  }

  try {
    const where: any = {
      tenantId,
      teacherUserId,
    };

    if (subjectLegacy) where.subject = subjectLegacy;
    if (termLegacy) where.term = termLegacy;
    if (academicYearLegacy) where.academicYear = academicYearLegacy;

    const schemes = await prismaAny.schemeOfWork.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        items: true,
      },
    });

    const items = (schemes as any[]).map((s: any) => {
      const weekNumbers = Array.isArray(s.items)
        ? (() => {
            const weeks = Array.from(
              new Set(
                s.items
                  .map((it: any) => it.weekNumber)
                  .filter((w: any) => typeof w === "number")
              )
            ) as number[];
            weeks.sort((a: number, b: number) => a - b);
            return weeks;
          })()
        : [];

      return {
        id: s.id,
        subject: s.subject,
        term: s.term,
        academicYear: s.academicYear,
        title: s.title ?? null,
        // s.notes does not exist on the model; keep this as null placeholder
        notes: null as string | null,
        classroomId: s.classroomId ?? null,
        itemCount: Array.isArray(s.items) ? s.items.length : 0,
        weekNumbers,
        createdAt: s.createdAt?.toISOString
          ? s.createdAt.toISOString()
          : new Date(s.createdAt).toISOString(),
      };
    });

    return NextResponse.json(
      {
        ok: true,
        items,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("SCHEMES_GET_ERROR", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load schemes of work. Please try again.",
      },
      { status: 500 }
    );
  }
}

/**
 * POST: Create / extend a Scheme of Work for an indicator
 */
export async function POST(req: NextRequest) {
  const body = await readJson<PostBody>(req);

  if (!body) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid JSON body.",
      },
      { status: 400 }
    );
  }

  const {
    tenantId,
    teacherUserId,
    classroomId,
    subject,
    term,
    academicYear,
    title,
    // notes – we ignore this at Scheme level; notes live on SchemeOfWorkItem
    weekNumber,
    indicatorSlice,
    schemeId,
  } = body;

  if (!tenantId || !teacherUserId) {
    return NextResponse.json(
      {
        ok: false,
        error: "tenantId and teacherUserId are required.",
      },
      { status: 400 }
    );
  }

  if (!subject || !term || !academicYear) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "subject, term and academicYear are required to build a Scheme of Work.",
      },
      { status: 400 }
    );
  }

  if (!indicatorSlice || !indicatorSlice.indicatorId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "indicatorSlice with at least indicatorId is required.",
      },
      { status: 400 }
    );
  }

  if (!weekNumber || weekNumber <= 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "weekNumber must be a positive integer.",
      },
      { status: 400 }
    );
  }

  const prismaAny = prisma as any;

  try {
    // 1) Either find / validate existing scheme, or create new
    let scheme: any | null = null;

    if (schemeId) {
      scheme = await prismaAny.schemeOfWork.findFirst({
        where: {
          id: schemeId,
          tenantId,
          teacherUserId,
        },
      });

      if (!scheme) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Scheme not found for this teacher and tenant. It may have been deleted.",
          },
          { status: 404 }
        );
      }
    } else {
      // Auto-generate a simple title if none provided
      const autoTitle =
        title || `${subject} – ${term} (${academicYear})`;

      scheme = await prismaAny.schemeOfWork.create({
        data: {
          tenantId,
          teacherUserId,
          classroomId: classroomId ?? null,
          subject,
          term,
          academicYear,
          title: autoTitle,
          // model has no notes column; we do NOT try to write notes here
        },
      });
    }

    // 2) Create the SchemeOfWorkItem for this indicator/week
    //    NOTE: the model does NOT have indicatorId;
    //    we store indicatorSlice.indicatorId into curriculumIndicatorId.
    const item = await prismaAny.schemeOfWorkItem.create({
      data: {
        schemeOfWorkId: scheme.id,
        weekNumber,
        curriculumIndicatorId: indicatorSlice.indicatorId,
        indicatorCode: indicatorSlice.indicatorCode ?? null,
        indicatorDescription: indicatorSlice.indicatorDescription ?? null,
        strandTitle: indicatorSlice.strandTitle ?? null,
        subStrandTitle: indicatorSlice.subStrandTitle ?? null,
        contentStandardCode: indicatorSlice.contentStandardCode ?? null,
        contentStandardDescription:
          indicatorSlice.contentStandardDescription ?? null,
        // dayNumber and notes remain null by default
      },
    });

    return NextResponse.json(
      {
        ok: true,
        scheme: {
          id: scheme.id,
          subject: scheme.subject,
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
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to save Scheme of Work item. Please try again.",
      },
      { status: 500 }
    );
  }
}
