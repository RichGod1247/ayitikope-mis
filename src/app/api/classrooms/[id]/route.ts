// src/app/api/classrooms/[id]/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "../../../../lib/prisma"; // ← fixed depth

/** Helper: get active tenant by slug cookie */
async function getActiveTenantId() {
  const cookieStore = await cookies();
  const slug = cookieStore.get("x-tenant")?.value || "ayitikope-basic";
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true },
  });
  return tenant?.id ?? null;
}

/**
 * GET /api/classrooms/:id
 * Returns one classroom for the active tenant.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "Active tenant not found" },
        { status: 400 }
      );
    }

    const item = await prisma.classroom.findFirst({
      where: { id: params.id, tenantId },
      select: {
        id: true,
        name: true,
        grade: true,
        arm: true,
        note: true,
        createdAt: true,
        updatedAt: true,
        tenantId: true,
      },
    });

    if (!item) {
      return NextResponse.json(
        { ok: false, error: "Classroom not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, item }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load classroom" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/classrooms/:id
 * Body: { name?: string; grade?: string | null; arm?: string | null; note?: string | null }
 * Updates a classroom (scoped to active tenant).
 */
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "Active tenant not found" },
        { status: 400 }
      );
    }

    // Ensure the classroom belongs to the active tenant
    const existing = await prisma.classroom.findFirst({
      where: { id: params.id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Classroom not found" },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const data: {
      name?: string;
      grade?: string | null;
      arm?: string | null;
      note?: string | null;
    } = {};

    if (typeof body.name === "string") data.name = body.name.trim();
    if (typeof body.grade === "string") data.grade = body.grade.trim() || null;
    if (body.grade === null) data.grade = null;

    if (typeof body.arm === "string") data.arm = body.arm.trim() || null;
    if (body.arm === null) data.arm = null;

    if (typeof body.note === "string") data.note = body.note.trim() || null;
    if (body.note === null) data.note = null;

    const updated = await prisma.classroom.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        name: true,
        grade: true,
        arm: true,
        note: true,
        createdAt: true,
        updatedAt: true,
        tenantId: true,
      },
    });

    return NextResponse.json(
      { ok: true, message: "Classroom updated", item: updated },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to update classroom" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/classrooms/:id
 * Deletes a classroom (scoped to active tenant).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "Active tenant not found" },
        { status: 400 }
      );
    }

    // Ensure it belongs to the tenant before deleting
    const existing = await prisma.classroom.findFirst({
      where: { id: params.id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Classroom not found" },
        { status: 404 }
      );
    }

    await prisma.classroom.delete({ where: { id: params.id } });

    return NextResponse.json(
      { ok: true, message: "Classroom deleted" },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to delete classroom" },
      { status: 500 }
    );
  }
}
