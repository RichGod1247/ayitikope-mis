// src/app/api/teachers/lesson-notes/delete/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      lessonNoteId?: string;
      id?: string;
    };

    // Accept either lessonNoteId (what the UI sends) or id, just to be safe.
    const lessonNoteId = body.lessonNoteId ?? body.id;

    if (!lessonNoteId || typeof lessonNoteId !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing lessonNoteId in request body." },
        { status: 400 }
      );
    }

    const note = await prisma.lessonNote.findUnique({
      where: { id: lessonNoteId },
      select: { id: true, status: true },
    });

    if (!note) {
      return NextResponse.json(
        { ok: false, error: "Lesson note not found." },
        { status: 404 }
      );
    }

    // Business rule: only DRAFT can be deleted
    if (note.status !== "DRAFT") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Only draft lesson notes can be deleted. Submitted or approved notes cannot be deleted.",
        },
        { status: 400 }
      );
    }

    await prisma.lessonNote.delete({
      where: { id: lessonNoteId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error deleting lesson note draft", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Unexpected server error while deleting this draft. Please try again.",
      },
      { status: 500 }
    );
  }
}
