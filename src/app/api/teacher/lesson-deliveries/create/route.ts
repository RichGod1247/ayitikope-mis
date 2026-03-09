// src/app/api/teacher/lesson-deliveries/create/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  isAdminLikeRole,
  resolveUserClassroomAccess,
  subjectEquals,
} from "@/lib/teacherAccess";

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

const BodySchema = z
  .object({
    classroomId: z.string().min(5),
    subject: z.string().min(1),
    term: z.string().min(1),
    academicYear: z.string().min(3),
    dateTaught: z.string().min(1),
    lessonNoteId: z.string().min(5),
    curriculumUnitId: z.string().min(5).optional().nullable(),
    notes: z.string().optional().nullable(),
  })
  .strict();

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

function parseDateTaught(raw: string): Date | null {
  const t = raw.trim();
  if (!t) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = new Date(`${t}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function resolveCodes(args: {
  tenantId: string;
  curriculumUnitId: string | null;
  schemeOfWorkItemId: string | null;
}): Promise<{ contentStandardCode: string | null; indicatorCode: string | null }> {
  // 1) CurriculumUnit (strongest)
  if (args.curriculumUnitId) {
    const unit = await prisma.curriculumUnit.findFirst({
      where: {
        id: args.curriculumUnitId,
        OR: [{ tenantId: args.tenantId }, { tenantId: null }],
      },
      select: { contentStandardCode: true, indicatorCode: true },
    });

    if (!unit) throw new Error("CURRICULUM_UNIT_NOT_FOUND");

    return {
      contentStandardCode: unit.contentStandardCode ?? null,
      indicatorCode: unit.indicatorCode ?? null,
    };
  }

  // 2) Scheme item anchor (still strong for 2A.6 analytics)
  if (args.schemeOfWorkItemId) {
    const si = await prisma.schemeOfWorkItem.findFirst({
      where: {
        id: args.schemeOfWorkItemId,
        scheme: { tenantId: args.tenantId },
      },
      select: { contentStandardCode: true, indicatorCode: true },
    });

    if (si) {
      return {
        contentStandardCode: si.contentStandardCode ?? null,
        indicatorCode: si.indicatorCode ?? null,
      };
    }
  }

  return { contentStandardCode: null, indicatorCode: null };
}

export async function POST(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res as any;

  const { ctx } = auth;

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return noStore(400, {
      ok: false,
      error: parsed.error.issues[0]?.message || "INVALID_BODY",
    });
  }

  const b = parsed.data;

  const classroomId = clean(b.classroomId);
  const term = clean(b.term);
  const academicYear = clean(b.academicYear);
  const requestedSubject = clean(b.subject);
  const lessonNoteId = clean(b.lessonNoteId);
  const dateTaught = parseDateTaught(b.dateTaught);

  if (!dateTaught) return noStore(400, { ok: false, error: "INVALID_DATE_TAUGHT" });

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId,
    subject: requestedSubject,
  });

  if (!access.ok) {
    const status =
      access.reason === "OUT_OF_SCOPE" || access.reason === "SUBJECT_OUT_OF_SCOPE"
        ? 403
        : 404;
    return noStore(status, { ok: false, error: access.reason });
  }

  const note = await prisma.lessonNote.findFirst({
    where: { id: lessonNoteId, tenantId: ctx.tenantId },
    select: {
      id: true,
      status: true,
      teacherUserId: true,
      classroomId: true,
      subject: true,
      term: true,
      academicYear: true,
      curriculumUnitId: true,
      schemeOfWorkItemId: true,
    },
  });

  if (!note) return noStore(404, { ok: false, error: "LESSON_NOTE_NOT_FOUND" });

  if (note.status !== "APPROVED") {
    return noStore(400, { ok: false, error: "LESSON_NOTE_NOT_APPROVED" });
  }

  if (!isAdminLikeRole(ctx.roleName) && note.teacherUserId !== ctx.userId) {
    return noStore(403, { ok: false, error: "LESSON_NOTE_FORBIDDEN" });
  }

  // Approved note is truth: prevent mismatches
  if (note.classroomId && note.classroomId !== classroomId) {
    return noStore(400, { ok: false, error: "LESSON_NOTE_CLASSROOM_MISMATCH" });
  }
  if (note.term && clean(note.term) !== term) {
    return noStore(400, { ok: false, error: "LESSON_NOTE_TERM_MISMATCH" });
  }
  if (note.academicYear && clean(note.academicYear) !== academicYear) {
    return noStore(400, { ok: false, error: "LESSON_NOTE_YEAR_MISMATCH" });
  }
  if (note.subject && !subjectEquals(note.subject, requestedSubject)) {
    return noStore(400, { ok: false, error: "LESSON_NOTE_SUBJECT_MISMATCH" });
  }

  // Bind delivery to note-owner when admin creates on behalf of teacher (more correct data)
  const teacherUserId =
    isAdminLikeRole(ctx.roleName) && note.teacherUserId ? note.teacherUserId : ctx.userId;

  const bodyUnitId = clean(b.curriculumUnitId) || null;
  const noteUnitId = clean(note.curriculumUnitId) || null;

  if (bodyUnitId && noteUnitId && bodyUnitId !== noteUnitId) {
    return noStore(400, { ok: false, error: "CURRICULUM_UNIT_MISMATCH_WITH_APPROVED_NOTE" });
  }

  const curriculumUnitId = noteUnitId || bodyUnitId;

  let contentStandardCode: string | null = null;
  let indicatorCode: string | null = null;

  try {
    const codes = await resolveCodes({
      tenantId: ctx.tenantId,
      curriculumUnitId,
      schemeOfWorkItemId: clean(note.schemeOfWorkItemId) || null,
    });
    contentStandardCode = codes.contentStandardCode;
    indicatorCode = codes.indicatorCode;
  } catch (e: any) {
    if (String(e?.message ?? "") === "CURRICULUM_UNIT_NOT_FOUND") {
      return noStore(404, { ok: false, error: "CURRICULUM_UNIT_NOT_FOUND" });
    }
    console.error("[LESSON_DELIVERY_CODE_RESOLVE_ERROR]", e);
    return noStore(500, { ok: false, error: "FAILED_TO_RESOLVE_CURRICULUM_CODES" });
  }

  // Dedupe: same note already delivered for this teacher+class
  const existingByNote = await prisma.lessonDelivery.findFirst({
    where: {
      tenantId: ctx.tenantId,
      classroomId,
      teacherUserId,
      lessonNoteId,
    },
    select: { id: true },
  });

  if (existingByNote?.id) {
    return noStore(200, { ok: true, lessonDeliveryId: existingByNote.id, reused: true });
  }

  // Dedupe: double-click protection (same subject/date in last 2 mins)
  const subject = clean(note.subject) || requestedSubject;
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);

  const existing = await prisma.lessonDelivery.findFirst({
    where: {
      tenantId: ctx.tenantId,
      classroomId,
      teacherUserId,
      subject,
      dateTaught,
      createdAt: { gte: twoMinAgo },
    },
    select: { id: true },
  });

  if (existing?.id) {
    return noStore(200, { ok: true, lessonDeliveryId: existing.id, reused: true });
  }

  const created = await prisma.lessonDelivery.create({
    data: {
      tenantId: ctx.tenantId,
      classroomId,
      teacherUserId,
      term,
      academicYear,
      subject,
      dateTaught,
      lessonNoteId,
      curriculumUnitId: curriculumUnitId || null,
      contentStandardCode,
      indicatorCode,
      notes: clean(b.notes) || null,
    },
    select: { id: true },
  });

  return noStore(200, { ok: true, lessonDeliveryId: created.id, reused: false });
}