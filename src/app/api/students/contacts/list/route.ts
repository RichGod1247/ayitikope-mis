// src/app/api/students/contacts/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const tenantId = searchParams.get("tenantId") || "";
  const classroomId = searchParams.get("classroomId") || "";

  if (!tenantId || !classroomId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing tenantId or classroomId. Please choose a tenant and class before loading contacts.",
      },
      { status: 400 }
    );
  }

  try {
    const client: any = prisma as any;

    // Schema assumptions based on your Prisma errors:
    // Student has:
    //   id, tenantId, classroomId, firstName, lastName,
    //   guardianName, guardianPhone, note, guardianSmsOptIn, healthConsentAt, ...
    // Classroom has:
    //   name, grade, arm, ...
    const students = (await client.student.findMany({
      where: {
        tenantId,
        classroomId,
      },
      orderBy: [
        { lastName: "asc" },
        { firstName: "asc" },
      ],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        classroom: {
          select: {
            name: true,
            grade: true,
            arm: true,
          },
        },
        guardianName: true,
        guardianPhone: true,
        // NOTE: guardianRelationship is NOT in the DB, so we do NOT select it.
        note: true, // single general note field on Student
      },
    })) as any[];

    const items = students.map((s: any) => {
      const cls = s.classroom || null;

      // Build human-friendly class label, e.g. "P3 A", "KG1", "JHS 2 B"
      const parts: string[] = [];
      if (cls?.grade) parts.push(String(cls.grade).trim());
      if (cls?.name) parts.push(String(cls.name).trim());
      if (cls?.arm) parts.push(String(cls.arm).trim());
      const classLabel = parts.length ? parts.join(" ") : null;

      // Normalize note
      const notes =
        typeof s.note === "string" && s.note.trim().length > 0
          ? s.note.trim()
          : null;

      return {
        id: s.id,
        firstName: s.firstName ?? "",
        lastName: s.lastName ?? "",
        classLabel,
        guardianName: s.guardianName ?? null,
        guardianPhone: s.guardianPhone ?? null,
        // Alt phone not in DB yet; return null so UI shows "—"
        guardianAltPhone: null,
        // Relationship field also not in DB (no guardianRelationship column),
        // so we expose it as null for now.
        relationship: null,
        notes,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        items,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[STUDENT_CONTACTS_LIST_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load student contacts from the database. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
