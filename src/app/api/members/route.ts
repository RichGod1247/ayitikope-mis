// src/app/api/members/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "../../../lib/prisma";

// GET /api/members
// Returns the members (user + role + status) for the active tenant (from x-tenant cookie)
export async function GET() {
  try {
    const cookieStore = await cookies();
    const slug = cookieStore.get("x-tenant")?.value || "ayitikope-basic";

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { ok: false, error: "Tenant not found", tenantSlug: slug },
        { status: 404 }
      );
    }

    const memberships = await prisma.membership.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
        role: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      ok: true,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      count: memberships.length,
      items: memberships,
    });
  } catch (err: any) {
    console.error("GET /api/members error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
