// src/app/api/students/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "../../../lib/prisma";

type CreateStudentBody = {
  firstName: string;
  lastName: string;
  sex?: string | null;
  dob?: string | null; // ISO date string from client
  guardianName?: string | null;
  guardianPhone?: string | null;
  note?: string | null;
  classroomId?: string | null;
};

async function getActiveTenant() {
  const cookieStore = await cookies();
  const slug = cookieStore.get("x-tenant")?.value || "ayitikope-basic";

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });

  return { tenant, slug };
}

// GET /api/students
export async function GET() {
  try {
    const { tenant, slug } = await getActiveTenant();
    if (!tenant) {
      return NextResponse.json(
        { ok: true, tenant: null, count: 0, items: [] },
        { status: 200 }
      );
    }

    const items = await prisma.student.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        sex: true,
        dob: true,
        guardianName: true,
        guardianPhone: true,
        note: true,
        classroomId: true,
        createdAt: true,
        updatedAt: true,
        classroom: { select: { id: true, name: true } },
      },
      take: 200,
    });

    return NextResponse.json({
      ok: true,
      tenant,
      tenantSlug: slug,
      count: items.length,
      items,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error fetching students";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST /api/students
export async function POST(req: NextRequest) {
  try {
    const { tenant } = await getActiveTenant();
    if (!tenant) {
      return NextResponse.json(
        { ok: false, error: "No active tenant" },
        { status: 400 }
      );
    }

    const body = (await req.json()) as CreateStudentBody;

    // Basic validation (tiny & explicit to avoid implicit any warnings)
    if (!body || typeof body.firstName !== "string" || typeof body.lastName !== "string") {
      return NextResponse.json(
        { ok: false, error: "firstName and lastName are required" },
        { status: 400 }
      );
    }

    // Normalize optional fields
    const firstName = body.firstName.trim();
    const lastName = body.lastName.trim();
    const sex = body.sex?.trim() ?? null;
    const guardianName = body.guardianName?.trim() ?? null;
    const guardianPhone = body.guardianPhone?.trim() ?? null;
    const note = body.note?.trim() ?? null;
    const classroomId = body.classroomId ?? null;

    // Parse DOB safely
    let dob: Date | null = null;
    if (body.dob) {
      const d = new Date(body.dob);
      if (!Number.isNaN(d.getTime())) dob = d;
    }

    const created = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        classroomId,
        firstName,
        lastName,
        sex,
        dob,
        guardianName,
        guardianPhone,
        note,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        sex: true,
        dob: true,
        guardianName: true,
        guardianPhone: true,
        note: true,
        classroomId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, item: created }, { status: 201 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error creating student";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
