// src/app/api/classrooms/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "../../../lib/prisma"; // correct depth from /api/classrooms

/** Resolve active tenantId from cookie (falls back to ayitikope-basic) */
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
 * GET /api/classrooms
 * List classrooms for the active tenant.
 */
export async function GET() {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "Active tenant not found" },
        { status: 400 }
      );
    }

    const items = await prisma.classroom.findMany({
      where: { tenantId },
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
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
      take: 200,
    });

    return NextResponse.json({ ok: true, items }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load classrooms" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/classrooms
 * Body: { name: string; grade?: string | null; arm?: string | null; note?: string | null }
 * Create a classroom under the active tenant.
 */
export async function POST(req: Request) {
  try {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "Active tenant not found" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const name: string | undefined =
      typeof body.name === "string" ? body.name.trim() : undefined;
    const grade: string | null =
      body.grade === null
        ? null
        : typeof body.grade === "string"
        ? body.grade.trim() || null
        : null;
    const arm: string | null =
      body.arm === null
        ? null
        : typeof body.arm === "string"
        ? body.arm.trim() || null
        : null;
    const note: string | null =
      body.note === null
        ? null
        : typeof body.note === "string"
        ? body.note.trim() || null
        : null;

    if (!name) {
      return NextResponse.json(
        { ok: false, error: "Name is required" },
        { status: 422 }
      );
    }

    const created = await prisma.classroom.create({
      data: {
        name,
        grade,
        arm,
        note,
        tenantId,
      },
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
      { ok: true, message: "Classroom created", item: created },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to create classroom" },
      { status: 500 }
    );
  }
}
