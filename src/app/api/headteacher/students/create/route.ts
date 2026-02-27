// src/app/api/headteacher/students/create/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export async function POST(req: Request) {
  let ctx: any;
  try {
    ctx = await requireServerUserContext({
      requireTenant: true,
      requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "ADMIN"],
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const tenantId = ctx.tenantId;
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const {
      firstName,
      lastName,
      sex,
      dob,
      classroomId,
      guardianName,
      guardianPhone,
      guardianSmsOptIn,
      note,
    } = body as {
      firstName?: string;
      lastName?: string;
      sex?: string;
      dob?: string; // YYYY-MM-DD
      classroomId?: string;
      guardianName?: string;
      guardianPhone?: string;
      guardianSmsOptIn?: boolean;
      note?: string;
    };

    if (!firstName || !lastName) {
      return NextResponse.json(
        { ok: false, error: "First name and last name are required" },
        { status: 400 }
      );
    }

    let safeClassroomId: string | null = null;
    if (typeof classroomId === "string" && classroomId.trim()) {
      const cls = await prisma.classroom.findFirst({
        where: { id: classroomId.trim(), tenantId },
        select: { id: true },
      });
      if (!cls) {
        return NextResponse.json(
          { ok: false, error: "Invalid classroomId for this tenant" },
          { status: 400 }
        );
      }
      safeClassroomId = cls.id;
    }

    let parsedDob: Date | null = null;
    if (typeof dob === "string" && dob.trim()) {
      const d = new Date(dob.trim());
      if (!Number.isNaN(d.getTime())) parsedDob = d;
    }

    const created = await prisma.student.create({
      data: {
        tenantId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        sex: sex?.trim() || "",
        dob: parsedDob,
        classroomId: safeClassroomId,
        guardianName: guardianName?.trim() || "",
        guardianPhone: guardianPhone?.trim() || "",
        guardianSmsOptIn: !!guardianSmsOptIn,
        note: note?.trim() || "",
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        sex: true,
        dob: true,
        classroomId: true,
        guardianName: true,
        guardianPhone: true,
        guardianSmsOptIn: true,
        note: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        tenantId,
        student: {
          ...created,
          dob: created.dob ? created.dob.toISOString().slice(0, 10) : "",
          guardianSmsOptIn: !!created.guardianSmsOptIn,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Error creating student", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unexpected error while creating learner." },
      { status: 500 }
    );
  }
}
