// src/app/api/teachers/lesson-notes/item/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// If you need edge runtime you can add:
// export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ✅ In Next 15 / latest app router, params is a Promise
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Missing lesson note ID." },
      { status: 400 }
    );
  }

  try {
    const item = await prisma.lessonNote.findUnique({
      where: { id },
      // You can add select here if you want to trim fields:
      // select: { id: true, subject: true, ... }
    });

    if (!item) {
      return NextResponse.json(
        { ok: false, error: "Lesson note not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, item }, { status: 200 });
  } catch (error) {
    console.error("Error loading lesson note by ID:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Server error while loading this lesson note. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
