// src/app/api/headteacher/students/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/headteacher/students/update
 *
 * Body:
 * {
 *   id: string;
 *   sex?: string | null;
 *   guardianName?: string | null;
 *   guardianPhone?: string | null;
 *   guardianSmsOptIn?: boolean;
 *   note?: string | null;
 * }
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid JSON body.",
        },
        { status: 400 }
      );
    }

    const {
      id,
      sex,
      guardianName,
      guardianPhone,
      guardianSmsOptIn,
      note,
    } = body as {
      id?: string;
      sex?: string | null;
      guardianName?: string | null;
      guardianPhone?: string | null;
      guardianSmsOptIn?: boolean;
      note?: string | null;
    };

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        {
          ok: false,
          error: "Student id is required.",
        },
        { status: 400 }
      );
    }

    const data: any = {};

    if (typeof sex === "string") {
      const trimmed = sex.trim();
      if (trimmed) {
        data.sex = trimmed;
      } else {
        // Allow clearing sex if needed
        data.sex = "";
      }
    }

    if (typeof guardianName === "string") {
      const trimmed = guardianName.trim();
      data.guardianName = trimmed || null;
    }

    if (typeof guardianPhone === "string") {
      const trimmed = guardianPhone.trim();
      data.guardianPhone = trimmed || null;
    }

    if (typeof guardianSmsOptIn === "boolean") {
      data.guardianSmsOptIn = guardianSmsOptIn;
    }

    if (typeof note === "string") {
      const trimmed = note.trim();
      data.note = trimmed || null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No valid fields to update. Change at least one value before saving.",
        },
        { status: 400 }
      );
    }

    const updated = await prisma.student.update({
      where: { id },
      data,
      select: {
        id: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        id: updated.id,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[HEAD_STUDENTS_UPDATE_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to update learner. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
