// src/app/api/teachers/lesson-notes/submit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { notifyLessonNoteSubmitted } from "@/lib/lessonNotes/submitNotifications";
import { resolveUserClassroomAccess } from "@/lib/teacherAccess";
import {
  approvedSchemeItemMatchesScope,
  findApprovedSchemeItemForScope,
  loadOwnedSchemeItem,
} from "@/lib/lessonNotes/approvedScheme";

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

function safeTrim(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function normCode(v: unknown) {
  return safeTrim(v).toUpperCase().replace(/\s+/g, "");
}

function normTerm(v: unknown) {
  const s = safeTrim(v).toLowerCase();
  if (!s) return "";
  if (s.includes("1")) return "1";
  if (s.includes("2")) return "2";
  if (s.includes("3")) return "3";
  return s;
}

function readBodyValue(body: unknown, key: string) {
  if (!body || typeof body !== "object") return undefined;
  return (body as Record<string, unknown>)[key];
}

export async function GET() {
  return jsonNoStore(
    { ok: false, error: "Method not allowed. Use POST." },
    { status: 405, headers: { Allow: "POST" } }
  );
}

export async function POST(req: NextRequest) {
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

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return jsonNoStore({ ok: false, error: "Forbidden (membership inactive)." }, { status: 403 });
  }

  let body: unknown = null;

  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const idRaw = readBodyValue(body, "id") ?? readBodyValue(body, "lessonNoteId") ?? null;
  const id = typeof idRaw === "string" ? idRaw.trim() : "";

  if (!id) {
    return jsonNoStore({ ok: false, error: "Lesson note id is required." }, { status: 400 });
  }

  try {
    const note = await prisma.lessonNote.findFirst({
      where: { id, tenantId: ctx.tenantId, teacherUserId: ctx.userId },
      select: {
        id: true,
        status: true,
        submittedAt: true,

subject: true,
level: true,
term: true,
academicYear: true,
weekNumber: true,
classroomId: true,

        schemeOfWorkItemId: true,
        curriculumUnitId: true,

        indicator: true,
        objectives: true,
        lessonDevelopment: true,
        assessment: true,

        curriculumUnit: {
          select: {
            id: true,
            subject: true,
            level: true,
            term: true,
            weekNumber: true,
            indicatorCode: true,
            indicator: true,
          },
        },
      },
    });

    if (!note) {
      return jsonNoStore({ ok: false, error: "Lesson note not found." }, { status: 404 });
    }

if (note.classroomId && note.subject) {
  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: membership.role?.name ?? null,
    classroomId: note.classroomId,
    subject: note.subject,
  });

  if (!access.ok) {
    return jsonNoStore(
      {
        ok: false,
        error:
          access.reason === "SUBJECT_OUT_OF_SCOPE"
            ? "You are no longer assigned to submit lesson notes for this subject in this class."
            : "You are no longer assigned to submit lesson notes for this class.",
        reason: access.reason,
      },
      { status: access.reason === "CLASSROOM_NOT_FOUND" ? 404 : 403 }
    );
  }
}

    const status = safeTrim(note.status).toUpperCase();

    if (status === "SUBMITTED" || status === "APPROVED") {
      return jsonNoStore(
        { ok: true, alreadySubmitted: true, status, submittedAt: note.submittedAt ?? null },
        { status: 200 }
      );
    }

    if (status !== "DRAFT" && status !== "REJECTED") {
      return jsonNoStore(
        { ok: false, error: "Only DRAFT or REJECTED lesson notes can be submitted." },
        { status: 400 }
      );
    }

    const indicatorOk = safeTrim(note.indicator).length > 0;
    const objectivesOk = safeTrim(note.objectives).length > 0;
    const devOk = safeTrim(note.lessonDevelopment).length > 0;
    const assessmentOk = safeTrim(note.assessment).length > 0;

    if (!indicatorOk || !objectivesOk || !devOk || !assessmentOk) {
      return jsonNoStore(
        {
          ok: false,
          error: "To submit: fill indicator, objectives, lesson development, and assessment.",
        },
        { status: 400 }
      );
    }

    const hasCurriculum = Boolean(note.curriculumUnitId && note.curriculumUnit);
    const hasSchemeItem = Boolean(note.schemeOfWorkItemId);

    if (!hasCurriculum && !hasSchemeItem) {
      return jsonNoStore(
        {
          ok: false,
          error: "Link a scheme unit (or NaCCA unit) before submitting.",
        },
        { status: 400 }
      );
    }

    let schemeIndicatorCode = "";
    let schemeWeekNumber: number | null = null;
    let schemeTerm = "";
    let schemeYear = "";

    if (hasSchemeItem) {
      const si = await loadOwnedSchemeItem({
        tenantId: ctx.tenantId,
        teacherUserId: ctx.userId,
        schemeItemId: note.schemeOfWorkItemId as string,
      });

      if (!si?.scheme) {
        return jsonNoStore(
          { ok: false, error: "Scheme link is invalid: scheme item not found for this teacher." },
          { status: 400 }
        );
      }

      if (String(si.scheme.status ?? "").toUpperCase() !== "APPROVED") {
        return jsonNoStore(
          {
            ok: false,
            code: "APPROVED_SCHEME_REQUIRED",
            error: "An approved Scheme of Work is required before this lesson note can be submitted.",
          },
          { status: 409 }
        );
      }

      if (!note.subject || !note.level || !note.term || !note.academicYear || !note.weekNumber) {
        return jsonNoStore(
          {
            ok: false,
            code: "APPROVED_SCHEME_REQUIRED",
            error: "This lesson note is missing the scope needed to verify its approved Scheme of Work.",
          },
          { status: 409 }
        );
      }

      if (
        !approvedSchemeItemMatchesScope(si, {
          tenantId: ctx.tenantId,
          teacherUserId: ctx.userId,
          classroomId: note.classroomId,
          subject: note.subject,
          level: note.level,
          term: note.term,
          academicYear: note.academicYear,
          weekNumber: note.weekNumber,
        })
      ) {
        return jsonNoStore(
          {
            ok: false,
            code: "APPROVED_SCHEME_REQUIRED",
            error: "The approved Scheme item linked to this lesson note does not match its teaching scope.",
          },
          { status: 409 }
        );
      }

      schemeIndicatorCode = normCode(si.indicatorCode);
      schemeWeekNumber = typeof si.weekNumber === "number" ? si.weekNumber : null;
      schemeTerm = safeTrim(si.scheme.term);
      schemeYear = safeTrim(si.scheme.academicYear);

      if (note.weekNumber && schemeWeekNumber && note.weekNumber !== schemeWeekNumber) {
        return jsonNoStore(
          { ok: false, error: "Scheme mismatch: linked scheme item week does not match the lesson note week." },
          { status: 400 }
        );
      }

      if (schemeYear && safeTrim(note.academicYear) && schemeYear !== safeTrim(note.academicYear)) {
        return jsonNoStore(
          { ok: false, error: "Scheme mismatch: scheme academic year does not match the lesson note academic year." },
          { status: 400 }
        );
      }

      if (schemeTerm && safeTrim(note.term) && normTerm(schemeTerm) !== normTerm(note.term)) {
        return jsonNoStore(
          { ok: false, error: "Scheme mismatch: scheme term does not match the lesson note term." },
          { status: 400 }
        );
      }
    } else {
      const unit = note.curriculumUnit;

      if (!note.subject || !note.level || !note.term || !note.academicYear || !note.weekNumber) {
        return jsonNoStore(
          {
            ok: false,
            code: "APPROVED_SCHEME_REQUIRED",
            error: "This lesson note is missing the scope needed to verify an approved Scheme of Work.",
          },
          { status: 409 }
        );
      }

      const approvedItem = await findApprovedSchemeItemForScope({
        tenantId: ctx.tenantId,
        teacherUserId: ctx.userId,
        classroomId: note.classroomId,
        subject: unit?.subject ?? note.subject,
        level: unit?.level ?? note.level,
        term: note.term,
        academicYear: note.academicYear,
        weekNumber: note.weekNumber,
        indicatorCode: unit?.indicatorCode ?? null,
      });

      if (!approvedItem) {
        return jsonNoStore(
          {
            ok: false,
            code: "APPROVED_SCHEME_REQUIRED",
            error:
              "An approved Scheme of Work is required for this subject, class, term, year and week before submitting the lesson note.",
          },
          { status: 409 }
        );
      }

      schemeIndicatorCode = normCode(approvedItem.indicatorCode);
    }

    if (hasCurriculum) {
      const unitCode = normCode(note.curriculumUnit?.indicatorCode);
      if (schemeIndicatorCode && unitCode && schemeIndicatorCode !== unitCode) {
        return jsonNoStore(
          {
            ok: false,
            error:
              "Scheme mismatch: the selected NaCCA indicator does not match your Scheme of Work for this week. Fix the scheme week item or re-link the correct unit.",
          },
          { status: 400 }
        );
      }
    }

    const now = new Date();

    const updated = await prisma.lessonNote.updateMany({
      where: {
        id,
        tenantId: ctx.tenantId,
        teacherUserId: ctx.userId,
        status: { in: ["DRAFT", "REJECTED"] },
      },
      data: {
        status: "SUBMITTED",
        submittedAt: now,
        reviewedAt: null,
        approvedAt: null,
        rejectedAt: null,
      },
    });

    if (updated.count !== 1) {
      const fresh = await prisma.lessonNote.findFirst({
        where: { id, tenantId: ctx.tenantId, teacherUserId: ctx.userId },
        select: { status: true, submittedAt: true },
      });

      const st = safeTrim(fresh?.status).toUpperCase();
      if (st === "SUBMITTED" || st === "APPROVED") {
        return jsonNoStore(
          { ok: true, alreadySubmitted: true, status: st, submittedAt: fresh?.submittedAt ?? null },
          { status: 200 }
        );
      }

      return jsonNoStore(
        { ok: false, error: "Conflict: lesson note changed. Refresh and try again." },
        { status: 409 }
      );
    }

    void notifyLessonNoteSubmitted({
      tenantId: ctx.tenantId,
      lessonNoteId: id,
      teacherUserId: ctx.userId,
      submittedAt: now,
    });

    return jsonNoStore({ ok: true, alreadySubmitted: false }, { status: 200 });
  } catch (err) {
    console.error("[TEACHER_LESSON_NOTE_SUBMIT_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to submit lesson note for review." }, { status: 500 });
  }
}