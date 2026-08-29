// src/app/api/teacher/lesson-deliveries/approved-notes/list/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { isAdminLikeRole, resolveUserClassroomAccess } from "@/lib/teacherAccess";
import {
  subjectAllowedInTeachingScope,
  subjectMatchesTeachingScope,
} from "@/lib/teachingSubjectScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isForbiddenReason(reason: string) {
  return reason === "OUT_OF_SCOPE" || reason === "SUBJECT_OUT_OF_SCOPE";
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeLevelToken(raw: unknown): string | null {
  const s = cleanStr(raw).toUpperCase().replace(/\s+/g, " ");
  if (!s) return null;

  let m =
    s.match(/^KG\s*([12])$/) ||
    s.match(/^KG([12])$/) ||
    s.match(/^K\.?G\.?\s*([12])$/);
  if (m) return `KG${m[1]}`;

  m =
    s.match(/^JHS\s*([1-3])$/) ||
    s.match(/^JHS([1-3])$/) ||
    s.match(/^J\.?H\.?S\.?\s*([1-3])$/);
  if (m) return `JHS${m[1]}`;

  m =
    s.match(/^BASIC\s*([7-9])$/) ||
    s.match(/^BASIC([7-9])$/) ||
    s.match(/^B\s*([7-9])$/) ||
    s.match(/^B([7-9])$/) ||
    s.match(/^BS\s*([7-9])$/) ||
    s.match(/^BS([7-9])$/);
  if (m) return `JHS${Number(m[1]) - 6}`;

  m =
    s.match(/^BASIC\s*([1-6])$/) ||
    s.match(/^BASIC([1-6])$/) ||
    s.match(/^B\s*([1-6])$/) ||
    s.match(/^B([1-6])$/) ||
    s.match(/^PRIMARY\s*([1-6])$/) ||
    s.match(/^PRIMARY([1-6])$/) ||
    s.match(/^P\s*([1-6])$/) ||
    s.match(/^P([1-6])$/);
  if (m) return `B${m[1]}`;

  return null;
}

function classroomLevelToken(classroom: any): string | null {
  return normalizeLevelToken(classroom?.grade) ?? normalizeLevelToken(classroom?.name);
}

function noteMatchesClassroomScope(note: { classroomId: string | null; level: string | null }, classroomId: string, classroom: any) {
  if (note.classroomId === classroomId) return true;

  // Legacy notes created before classroom binding had classroomId = null,
  // but they still carried phase/level such as JHS + JHS 3.
  if (note.classroomId !== null) return false;

  const noteLevel = normalizeLevelToken(note.level);
  const classLevel = classroomLevelToken(classroom);

  return !!noteLevel && !!classLevel && noteLevel === classLevel;
}

function filterRowsByTruthScope<T extends { classroomId: string | null; level: string | null; subject: string | null }>(
  rows: T[],
  args: {
    classroomId: string;
    classroom: any;
    allowedSubjects: string[] | null;
    scopeLevel: string | null;
    preferredSubject?: string | null;
  }
) {
  const classroomScoped = rows.filter((r) =>
    noteMatchesClassroomScope(r, args.classroomId, args.classroom)
  );

  const subjectScoped = classroomScoped.filter((r) =>
    subjectAllowedInTeachingScope(r.subject, args.allowedSubjects, args.scopeLevel)
  );

  const preferred = cleanStr(args.preferredSubject);
  if (!preferred) return subjectScoped;

  const preferredRows = subjectScoped.filter((r) =>
    subjectMatchesTeachingScope(r.subject, preferred, args.scopeLevel)
  );

  return preferredRows.length > 0 ? preferredRows : subjectScoped;
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res as any;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);

  const classroomId = cleanStr(searchParams.get("classroomId"));
  const term = cleanStr(searchParams.get("term"));
  const academicYear = cleanStr(searchParams.get("academicYear"));
  const subject = cleanStr(searchParams.get("subject"));

  if (!classroomId || !term || !academicYear) {
    return noStore(400, {
      ok: false,
      error: "MISSING_REQUIRED_FILTERS",
    });
  }

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId,
  });

  if (!access.ok) {
    return noStore(isForbiddenReason(access.reason) ? 403 : 404, {
      ok: false,
      error: access.reason,
    });
  }

  const where: any = {
    tenantId: ctx.tenantId,
    term,
    academicYear,
    status: "APPROVED",
    OR: [{ classroomId }, { classroomId: null }],
  };

  if (!isAdminLikeRole(ctx.roleName)) {
    where.teacherUserId = ctx.userId;
  }

  const rowsRaw = await prisma.lessonNote.findMany({
    where,
    orderBy: [{ lessonDate: "asc" }, { approvedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      classroomId: true,
      teacherUserId: true,
      phase: true,
      level: true,
      subject: true,
      term: true,
      academicYear: true,
      lessonDate: true,
      lessonTitle: true,
      curriculumUnitId: true,
      contentStandard: true,
      indicator: true,
      approvedAt: true,
    },
    take: 200,
  });

  const rows = filterRowsByTruthScope(rowsRaw, {
    classroomId,
    classroom: access.classroom,
    allowedSubjects: isAdminLikeRole(ctx.roleName) ? null : access.allowedSubjects,
    scopeLevel: access.normalizedClassLevel,
    preferredSubject: subject,
  });

  return noStore(200, {
    ok: true,
    classroom: access.classroom,
    items: rows.map((r) => ({
      ...r,
      legacyClassroomMatch: r.classroomId === null,
      lessonDate: r.lessonDate ? new Date(r.lessonDate).toISOString() : null,
      approvedAt: r.approvedAt ? new Date(r.approvedAt).toISOString() : null,
    })),
  });
}