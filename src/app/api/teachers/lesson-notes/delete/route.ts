// src/app/api/teachers/lesson-notes/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/teachers/lesson-notes/delete
 *
 * Rules:
 * - Identity enforced server-side.
 * - Owner-only (tenantId + teacherUserId).
 * - Only DRAFT can be deleted.
 * - Uses deleteMany scoped by tenant+owner+status to avoid race + leakage.
 */

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

  const lessonNoteId =
    typeof body?.lessonNoteId === "string"
      ? body.lessonNoteId.trim()
      : typeof body?.id === "string"
        ? body.id.trim()
        : "";

  if (!lessonNoteId) {
    return jsonNoStore({ ok: false, error: "Missing lessonNoteId in request body." }, { status: 400 });
  }

  try {
    const deleted = await prisma.lessonNote.deleteMany({
      where: {
        id: lessonNoteId,
        tenantId: ctx.tenantId,
        teacherUserId: ctx.userId,
        status: "DRAFT" as any,
      },
    });

    if (deleted.count !== 1) {
      // Either not found, not owned, or not DRAFT -> return 404 to avoid leaking status/ownership
      return jsonNoStore({ ok: false, error: "Lesson note not found." }, { status: 404 });
    }

    return jsonNoStore({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[TEACHER_LESSON_NOTE_DELETE_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Unexpected server error while deleting this draft." }, { status: 500 });
  }
}
