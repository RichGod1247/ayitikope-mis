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

export async function GET() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use POST." }, { status: 405, headers: { Allow: "POST" } });
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
    const note = await prisma.lessonNote.findFirst({
      where: { id, tenantId: ctx.tenantId, teacherUserId: ctx.userId },
      select: {
        id: true,
        status: true,
        curriculumUnitId: true,
        indicator: true,
        objectives: true,
        lessonDevelopment: true,
        assessment: true,
      },
    });

    if (!note) return jsonNoStore({ ok: false, error: "Lesson note not found." }, { status: 404 });

    const status = String(note.status ?? "DRAFT").toUpperCase();
    if (status !== "DRAFT" && status !== "REJECTED") {
      return jsonNoStore({ ok: false, error: "Only DRAFT or REJECTED lesson notes can be submitted." }, { status: 400 });
    }

    // ✅ enforce completeness here too (don’t rely on frontend)
    const unitOk = !!note.curriculumUnitId && safeTrim(note.curriculumUnitId).length > 0;
    const indicatorOk = safeTrim(note.indicator).length > 0;
    const objectivesOk = safeTrim(note.objectives).length > 0;
    const devOk = safeTrim(note.lessonDevelopment).length > 0;
    const assessmentOk = safeTrim(note.assessment).length > 0;

    if (!unitOk || !indicatorOk || !objectivesOk || !devOk || !assessmentOk) {
      return jsonNoStore(
        {
          ok: false,
          error:
            "To submit: select a NaCCA curriculum unit/indicator and fill objectives, lesson development, and assessment.",
        },
        { status: 400 }
      );
    }

    const now = new Date();

    // ✅ race-safe: updateMany scoped by tenant+owner+status
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
      return jsonNoStore({ ok: false, error: "Conflict: lesson note changed. Refresh and try again." }, { status: 409 });
    }

    return jsonNoStore({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[TEACHER_LESSON_NOTE_SUBMIT_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to submit lesson note for review." }, { status: 500 });
  }
}
