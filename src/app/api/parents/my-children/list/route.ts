// src/app/api/parents/my-children/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required." },
        { status: 400 }
      );
    }

    // For now, return all students for this tenant.
    // Later we can filter by guardian phone / login identity.
    const students = await prisma.student.findMany({
      where: {
        tenantId,
      },
      orderBy: [
        { lastName: "asc" },
        { firstName: "asc" },
      ],
      include: {
        classroom: {
          select: {
            name: true,
            arm: true,
          },
        },
      },
    });

    const items = students.map((s) => {
      const fullName = [s.firstName, s.lastName].filter(Boolean).join(" ").trim();
      const classLabel = s.classroom
        ? `${s.classroom.name}${s.classroom.arm ? ` ${s.classroom.arm}` : ""}`
        : null;

      return {
        // 🔹 These match the ParentMyChildrenPage types exactly
        studentId: s.id,
        studentName: fullName || "Unnamed learner",
        classLabel,
        guardianName: s.guardianName ?? null,
        guardianPhone: s.guardianPhone ?? null,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("[PARENT_CHILDREN_LIST_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load linked learners from the database. Please try again or contact the school.",
      },
      { status: 500 }
    );
  }
}
