// src/app/api/teachers/lesson-notes/submit/route.ts
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

export async function GET() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use POST." }, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(req: NextRequest) {
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

  // Membership gate
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return jsonNoStore({ ok: false, error: "Forbidden (membership inactive)." }, { status: 403 });
  }

  // Parse body
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const idRaw = body?.id ?? body?.lessonNoteId ?? null;
  const id = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!id) return jsonNoStore({ ok: false, error: "Lesson note id is required." }, { status: 400 });

  try {
    // Load note + optional curriculum unit
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

    if (!note) return jsonNoStore({ ok: false, error: "Lesson note not found." }, { status: 404 });

    const status = safeTrim(note.status).toUpperCase();

    // Idempotent
    if (status === "SUBMITTED" || status === "APPROVED") {
      return jsonNoStore(
        { ok: true, alreadySubmitted: true, status, submittedAt: note.submittedAt ?? null },
        { status: 200 }
      );
    }

    if (status !== "DRAFT" && status !== "REJECTED") {
      return jsonNoStore({ ok: false, error: "Only DRAFT or REJECTED lesson notes can be submitted." }, { status: 400 });
    }

    // Completeness checks
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

    // ✅ MVP reality: accept scheme-backed even if curriculum seed is missing
    if (!hasCurriculum && !hasSchemeItem) {
      return jsonNoStore(
        {
          ok: false,
          error: "Link a scheme unit (or NaCCA unit) before submitting.",
        },
        { status: 400 }
      );
    }

    // --- Scheme gate ---
    // If we have schemeOfWorkItemId, validate it directly (strongest proof).
    // Else fall back to searching by scope (legacy).
    let schemeIndicatorCode = "";
    let schemeWeekNumber: number | null = null;
    let schemeTerm = "";
    let schemeYear = "";

    if (hasSchemeItem) {
      const si = await prisma.schemeOfWorkItem.findFirst({
        where: {
          id: note.schemeOfWorkItemId as string,
          scheme: { tenantId: ctx.tenantId, teacherUserId: ctx.userId },
        } as any,
        select: {
          id: true,
          weekNumber: true,
          indicatorCode: true,
          scheme: { select: { term: true, academicYear: true, status: true } },
        },
      });

      if (!si || !si.scheme) {
        return jsonNoStore(
          { ok: false, error: "Scheme link is invalid: scheme item not found for this teacher." },
          { status: 400 }
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
      // Legacy fallback: must have a scheme with matching week
      const unit = note.curriculumUnit;
      const scheme = await prisma.schemeOfWork.findFirst({
        where: {
          tenantId: ctx.tenantId,
          teacherUserId: ctx.userId,
          subject: unit?.subject ?? safeTrim(note.subject),
          level: unit?.level ?? safeTrim(note.level),
          term: safeTrim(note.term),
          academicYear: safeTrim(note.academicYear),
          status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] as any },
        },
        select: {
          id: true,
          status: true,
          items: {
            where: { weekNumber: note.weekNumber ?? undefined },
            select: { weekNumber: true, indicatorCode: true },
            take: 1,
          },
        },
      });

      if (!scheme) {
        return jsonNoStore(
          { ok: false, error: "Scheme of Work required: create your Scheme of Work for this subject/level/term/year before submitting." },
          { status: 400 }
        );
      }

      const item = scheme.items?.[0] ?? null;
      if (!item) {
        return jsonNoStore(
          { ok: false, error: "Scheme of Work required: your scheme has no item for this week. Add the week plan first, then submit the lesson note." },
          { status: 400 }
        );
      }

      schemeIndicatorCode = normCode(item.indicatorCode);
    }

    // --- Optional code match gate (only when BOTH exist) ---
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

    // Submit (race-safe)
    const now = new Date();
    const updated = await prisma.lessonNote.updateMany({
      where: {
        id,
        tenantId: ctx.tenantId,
        teacherUserId: ctx.userId,
        status: { in: ["DRAFT", "REJECTED"] as any },
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
        return jsonNoStore({ ok: true, alreadySubmitted: true, status: st, submittedAt: fresh?.submittedAt ?? null }, { status: 200 });
      }

      return jsonNoStore({ ok: false, error: "Conflict: lesson note changed. Refresh and try again." }, { status: 409 });
    }

    return jsonNoStore({ ok: true, alreadySubmitted: false }, { status: 200 });
  } catch (err) {
    console.error("[TEACHER_LESSON_NOTE_SUBMIT_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to submit lesson note for review." }, { status: 500 });
  }
}
