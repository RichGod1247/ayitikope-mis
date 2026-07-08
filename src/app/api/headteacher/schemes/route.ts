//src/app/api/headteacher/schemes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SchemeStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED";
type StatusFilter = SchemeStatus | "ALL";

const VALID_STATUSES = new Set<SchemeStatus>([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "RETURNED",
]);

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

function isLikelyId(id: string) {
  return /^[a-zA-Z0-9_-]{5,128}$/.test(id);
}

function normalizeRole(v: unknown) {
  return clean(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeStatus(raw: unknown): SchemeStatus {
  const s = clean(raw).toUpperCase();
  if (VALID_STATUSES.has(s as SchemeStatus)) return s as SchemeStatus;
  return "DRAFT";
}

function parseStatus(raw: unknown): StatusFilter | null {
  const s = clean(raw).toUpperCase();
  if (!s) return null;
  if (s === "ALL") return "ALL";
  if (VALID_STATUSES.has(s as SchemeStatus)) return s as SchemeStatus;
  return null;
}

function isoOrNull(v: Date | string | null | undefined) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function displayName(u: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
} | null) {
  if (!u) return "Unknown teacher";

  const name = clean(u.name);
  if (name) return name;

  const full = [clean(u.firstName), clean(u.lastName)].filter(Boolean).join(" ");
  if (full) return full;

  return clean(u.email) || "Unknown teacher";
}

function classroomName(c: {
  name?: string | null;
  grade?: string | null;
  arm?: string | null;
} | null) {
  if (!c) return null;
  const name = clean(c.name);
  const arm = clean(c.arm);
  if (name && arm) return `${name} ${arm}`;
  return name || clean(c.grade) || null;
}

function requestMeta(req: NextRequest) {
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: req.headers.get("user-agent") || null,
  };
}

async function getTenantTermYear(tenantId: string) {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { currentTerm: true, currentAcademicYear: true },
  });

  return {
    term: clean(settings?.currentTerm) || null,
    academicYear: clean(settings?.currentAcademicYear) || null,
  };
}

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
  status: true,
  submittedAt: true,
  reviewedAt: true,
  approvedAt: true,
  returnedAt: true,
  headteacherComment: true,
  reviewedByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function hydrateSchemes(tenantId: string, schemes: any[]) {
  const teacherIds = Array.from(
    new Set(schemes.map((s) => clean(s.teacherUserId)).filter(Boolean)),
  );

  const classroomIds = Array.from(
    new Set(schemes.map((s) => clean(s.classroomId)).filter(Boolean)),
  );

  const schemeIds = schemes.map((s) => s.id);

  const [teachers, classrooms, schemeItems] = await Promise.all([
    teacherIds.length
      ? prisma.user.findMany({
          where: { id: { in: teacherIds } },
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        })
      : Promise.resolve([]),

    classroomIds.length
      ? prisma.classroom.findMany({
          where: { tenantId, id: { in: classroomIds } },
          select: { id: true, name: true, grade: true, arm: true },
        })
      : Promise.resolve([]),

    schemeIds.length
      ? prisma.schemeOfWorkItem.findMany({
          where: { schemeOfWorkId: { in: schemeIds } },
          select: {
            id: true,
            schemeOfWorkId: true,
            weekNumber: true,
            strandTitle: true,
            subStrandTitle: true,
            contentStandardCode: true,
            indicatorCode: true,
            indicatorDescription: true,
          },
          orderBy: [{ weekNumber: "asc" }, { createdAt: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const classroomMap = new Map(classrooms.map((c) => [c.id, c]));
  const itemMap = new Map<string, typeof schemeItems>();

  for (const item of schemeItems) {
    const arr = itemMap.get(item.schemeOfWorkId) ?? [];
    arr.push(item);
    itemMap.set(item.schemeOfWorkId, arr);
  }

  return schemes.map((s) => {
    const status = normalizeStatus(s.status);
    const items = itemMap.get(s.id) ?? [];

    return {
      id: s.id,
      teacherUserId: s.teacherUserId,
      teacherName: displayName(teacherMap.get(s.teacherUserId) ?? null),
      classroomId: s.classroomId ?? null,
      classroomName: s.classroomId
        ? classroomName(classroomMap.get(s.classroomId) ?? null)
        : null,
      subject: s.subject,
      subjectSlug: s.subjectSlug ?? null,
      level: s.level ?? null,
      term: s.term,
      academicYear: s.academicYear,
      title: s.title ?? null,
      notes: s.notes ?? null,
      status,
      itemCount: items.length,
      schemeItems: items.map((item) => ({
        id: item.id,
        weekNumber: item.weekNumber,
        strandTitle: item.strandTitle ?? null,
        subStrandTitle: item.subStrandTitle ?? null,
        contentStandardCode: item.contentStandardCode ?? null,
        indicatorCode: item.indicatorCode ?? null,
        indicatorDescription: clean(item.indicatorDescription),
      })),
      submittedAt: isoOrNull(s.submittedAt),
      reviewedAt: isoOrNull(s.reviewedAt),
      approvedAt: isoOrNull(s.approvedAt),
      returnedAt: isoOrNull(s.returnedAt),
      headteacherComment: s.headteacherComment ?? null,
      reviewedByUserId: s.reviewedByUserId ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  });
}

export async function GET(req: NextRequest) {
  const reqId = randomUUID();

  const ctx = await getHeadteacherApiContext();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized.", reqId }, 401);

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return jsonNoStore(
      { ok: false, error: "Forbidden (membership inactive).", reqId },
      403,
    );
  }

  const { searchParams } = new URL(req.url);

  const statusRaw = searchParams.get("status");
  const status = parseStatus(statusRaw);
  if (statusRaw && !status) {
    return jsonNoStore(
      {
        ok: false,
        error: "Invalid status. Use DRAFT|SUBMITTED|APPROVED|RETURNED|ALL.",
        reqId,
      },
      400,
    );
  }

  const teacher = clean(searchParams.get("teacher"));
  const subject = clean(searchParams.get("subject"));
  const term = clean(searchParams.get("term"));
  const academicYear = clean(searchParams.get("academicYear"));

  const limitRaw = Number.parseInt(clean(searchParams.get("limit")), 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(100, limitRaw))
    : 50;

  const where: any = { tenantId: ctx.tenantId };

  if (status && status !== "ALL") where.status = status;
  if (subject) where.subject = { contains: subject, mode: "insensitive" };
  if (term) where.term = term;
  if (academicYear) where.academicYear = academicYear;

  if (teacher) {
    if (teacher.length > 80) {
      return jsonNoStore(
        { ok: false, error: "Teacher filter too long.", reqId },
        400,
      );
    }

    if (isLikelyId(teacher)) {
      where.teacherUserId = teacher;
    } else if (teacher.length >= 2) {
      const matchingUsers = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: teacher, mode: "insensitive" } },
            { firstName: { contains: teacher, mode: "insensitive" } },
            { lastName: { contains: teacher, mode: "insensitive" } },
            { email: { contains: teacher, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 50,
      });

      where.teacherUserId = { in: matchingUsers.map((u) => u.id) };
    } else {
      return jsonNoStore(
        { ok: false, error: "Teacher filter must be at least 2 characters.", reqId },
        400,
      );
    }
  }

  try {
    const [schemes, current] = await Promise.all([
      prisma.schemeOfWork.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: limit,
        select: schemeSelect,
      }),
      getTenantTermYear(ctx.tenantId),
    ]);

    const items = await hydrateSchemes(ctx.tenantId, schemes);

    const summary = {
      total: items.length,
      draft: items.filter((s) => s.status === "DRAFT").length,
      submitted: items.filter((s) => s.status === "SUBMITTED").length,
      returned: items.filter((s) => s.status === "RETURNED").length,
      approved: items.filter((s) => s.status === "APPROVED").length,
    };

    const teacherMembershipsRaw = await prisma.membership.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "ACTIVE",
      },
      select: {
        userId: true,
        staffId: true,
        role: { select: { name: true } },
        user: {
          select: {
            name: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const teacherMemberships = teacherMembershipsRaw.filter(
      (m) => normalizeRole(m.role?.name) === "TEACHER",
    );

    const termForMissing = term || current.term;
    const yearForMissing = academicYear || current.academicYear;

    let missingTeachers: Array<{
      teacherUserId: string;
      teacherName: string;
      staffId: string | null;
    }> = [];

    if (termForMissing && yearForMissing) {
      const submittedTeacherIds = new Set(
        await prisma.schemeOfWork
          .findMany({
            where: {
              tenantId: ctx.tenantId,
              term: termForMissing,
              academicYear: yearForMissing,
            },
            select: { teacherUserId: true },
            distinct: ["teacherUserId"],
          })
          .then((rows) => rows.map((r) => r.teacherUserId)),
      );

      missingTeachers = teacherMemberships
        .filter((m) => !submittedTeacherIds.has(m.userId))
        .map((m) => ({
          teacherUserId: m.userId,
          teacherName: displayName(m.user),
          staffId: m.staffId ?? null,
        }));
    }

    return jsonNoStore({
      ok: true,
      reqId,
      current,
      summary,
      items,
      missingTeachers,
    });
  } catch (err) {
    console.error("HEADTEACHER_SCHEMES_GET_ERROR", { reqId, err });
    return jsonNoStore(
      { ok: false, error: "Failed to load schemes for review.", reqId },
      500,
    );
  }
}

export async function POST(req: NextRequest) {
  const reqId = randomUUID();

  const ctx = await getHeadteacherApiContext();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized.", reqId }, 401);

  const raw = await req.json().catch(() => null);
  const schemeId = clean(raw?.schemeId);
  const action = clean(raw?.action).toLowerCase();
  const comment = clean(raw?.comment);

  if (!schemeId || !isLikelyId(schemeId)) {
    return jsonNoStore({ ok: false, error: "Invalid schemeId.", reqId }, 400);
  }

  if (action !== "approve" && action !== "return") {
    return jsonNoStore(
      { ok: false, error: "Invalid action. Use approve or return.", reqId },
      400,
    );
  }

  if (action === "return" && comment.length < 3) {
    return jsonNoStore(
      {
        ok: false,
        error: "Return comment is required so the teacher knows what to fix.",
        reqId,
      },
      400,
    );
  }

  if (comment.length > 1500) {
    return jsonNoStore(
      { ok: false, error: "Comment is too long.", reqId },
      400,
    );
  }

  const meta = requestMeta(req);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const scheme = await tx.schemeOfWork.findFirst({
        where: { id: schemeId, tenantId: ctx.tenantId },
        select: schemeSelect,
      });

      if (!scheme) return { kind: "NOT_FOUND" as const };

      const status = normalizeStatus(scheme.status);

      if (status !== "SUBMITTED") {
        return { kind: "BAD_STATUS" as const, status };
      }

      const itemCount = await tx.schemeOfWorkItem.count({
        where: { schemeOfWorkId: scheme.id },
      });

      if (itemCount < 1) {
        return { kind: "EMPTY" as const };
      }

      const now = new Date();

      const updated =
        action === "approve"
          ? await tx.schemeOfWork.update({
              where: { id: scheme.id },
              data: {
                status: "APPROVED",
                reviewedAt: now,
                approvedAt: now,
                returnedAt: null,
                reviewedByUserId: ctx.userId,
                headteacherComment:
                  comment ||
                  "Approved. Manually checked against the office-issued scheme of work.",
              },
              select: schemeSelect,
            })
          : await tx.schemeOfWork.update({
              where: { id: scheme.id },
              data: {
                status: "RETURNED",
                reviewedAt: now,
                returnedAt: now,
                approvedAt: null,
                reviewedByUserId: ctx.userId,
                headteacherComment: comment,
              },
              select: schemeSelect,
            });

      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action:
            action === "approve"
              ? "SCHEME_OF_WORK_APPROVED"
              : "SCHEME_OF_WORK_RETURNED",
          resource: "SchemeOfWork",
          resourceId: scheme.id,
          ip: meta.ip ?? undefined,
          userAgent: meta.userAgent ?? undefined,
          metadata: {
            reqId,
            previousStatus: status,
            nextStatus: updated.status,
            subject: scheme.subject,
            level: scheme.level,
            term: scheme.term,
            academicYear: scheme.academicYear,
            teacherUserId: scheme.teacherUserId,
            itemCount,
            manualOfficialSchemeCheck: action === "approve",
            comment: comment || null,
          },
        },
      });

      return { kind: "OK" as const, scheme: updated };
    });

    if (result.kind === "NOT_FOUND") {
      return jsonNoStore({ ok: false, error: "Scheme not found.", reqId }, 404);
    }

    if (result.kind === "EMPTY") {
      return jsonNoStore(
        { ok: false, error: "Cannot review an empty scheme.", reqId },
        400,
      );
    }

    if (result.kind === "BAD_STATUS") {
      return jsonNoStore(
        {
          ok: false,
          error:
            result.status === "APPROVED"
              ? "This scheme is already approved and locked."
              : result.status === "RETURNED"
                ? "This scheme has already been returned to the teacher."
                : "Only submitted schemes can be reviewed.",
          status: result.status,
          reqId,
        },
        409,
      );
    }

    return jsonNoStore({
      ok: true,
      reqId,
      scheme: {
        id: result.scheme.id,
        status: normalizeStatus(result.scheme.status),
        reviewedAt: isoOrNull(result.scheme.reviewedAt),
        approvedAt: isoOrNull(result.scheme.approvedAt),
        returnedAt: isoOrNull(result.scheme.returnedAt),
        headteacherComment: result.scheme.headteacherComment ?? null,
      },
    });
  } catch (err) {
    console.error("HEADTEACHER_SCHEMES_REVIEW_ERROR", { reqId, err });
    return jsonNoStore(
      { ok: false, error: "Failed to review scheme.", reqId },
      500,
    );
  }
}
