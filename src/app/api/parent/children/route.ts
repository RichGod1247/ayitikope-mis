// src/app/api/parent/children/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalisePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return String(phone).replace(/\D/g, "");
}

function suffix9(phone: string) {
  const d = normalisePhone(phone);
  if (!d) return "";
  return d.slice(-9);
}

const ADMINISH = new Set(["ADMIN", "SCHOOL_ADMIN", "HEADTEACHER"]);

async function getSafeTenantCtx() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;

  const userId = typeof u?.id === "string" ? u.id : "";
  const tenantId = typeof u?.tenantId === "string" ? u.tenantId : "";
  const userPhone = normalisePhone(u?.phone ?? u?.phoneNumber ?? u?.guardianPhone ?? "");

  if (!session || !userId) return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  if (!tenantId) return { ok: false as const, status: 403, error: "NO_ACTIVE_TENANT" };

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false as const, status: 403, error: "FORBIDDEN" };
  }

  return {
    ok: true as const,
    userId,
    tenantId,
    roleName: String(membership.role?.name ?? "").trim(),
    userPhone,
  };
}

/**
 * GET /api/parent/children?guardianPhone=...&tenantId=...
 *
 * 🔒 tenantId comes from session (tenantId param is backward-compat only)
 * 🔒 PARENT can only query their own phone (from session)
 * 🔒 ADMIN/HEADTEACHER can query any guardianPhone inside the tenant
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getSafeTenantCtx();
    if (!ctx.ok) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status, headers: { "cache-control": "no-store" } }
      );
    }

    const isParent = ctx.roleName === "PARENT";
    const isAdminish = ADMINISH.has(ctx.roleName);

    if (!isParent && !isAdminish) {
      return NextResponse.json(
        { ok: false, error: "FORBIDDEN" },
        { status: 403, headers: { "cache-control": "no-store" } }
      );
    }

    const { searchParams } = new URL(req.url);

    // Backward compat only (never trust it)
    const tenantIdParam = String(searchParams.get("tenantId") || "").trim();
    if (tenantIdParam && tenantIdParam !== ctx.tenantId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden (tenant mismatch)." },
        { status: 403, headers: { "cache-control": "no-store" } }
      );
    }

    const guardianPhoneParam = String(searchParams.get("guardianPhone") || "").trim();

    // Determine lookup phone
    let guardianPhone = "";
    if (isParent) {
      if (!ctx.userPhone) {
        return NextResponse.json(
          { ok: false, error: "PARENT_PHONE_MISSING_IN_SESSION" },
          { status: 400, headers: { "cache-control": "no-store" } }
        );
      }

      // Parent may pass param but it must match
      if (guardianPhoneParam) {
        const a = normalisePhone(guardianPhoneParam);
        if (a && a !== ctx.userPhone && !a.endsWith(ctx.userPhone) && !ctx.userPhone.endsWith(a)) {
          return NextResponse.json(
            { ok: false, error: "Forbidden (guardianPhone mismatch)." },
            { status: 403, headers: { "cache-control": "no-store" } }
          );
        }
      }

      guardianPhone = ctx.userPhone;
    } else {
      // Adminish must specify which guardian
      guardianPhone = normalisePhone(guardianPhoneParam);
      if (!guardianPhone) {
        return NextResponse.json(
          { ok: false, error: "guardianPhone is required." },
          { status: 400, headers: { "cache-control": "no-store" } }
        );
      }
    }

    const s9 = suffix9(guardianPhone);
    if (!s9) {
      return NextResponse.json(
        { ok: false, error: "guardianPhone is invalid." },
        { status: 400, headers: { "cache-control": "no-store" } }
      );
    }

    const client = prisma as any;

    // Use suffix match to tolerate 0XXXXXXXXX vs 233XXXXXXXXX vs +233
    const students = await client.student.findMany({
      where: {
        tenantId: ctx.tenantId,
        guardianPhone: { endsWith: s9 },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        classroom: { select: { id: true, name: true, grade: true, arm: true } },
      },
      orderBy: { firstName: "asc" },
    });

    const result = (students || []).map((s: any) => ({
      id: String(s.id),
      name: [s.firstName, s.lastName].filter(Boolean).join(" ").trim(),
      guardianName: s.guardianName ?? null,
      guardianPhone: s.guardianPhone ?? null,
      classroom: s.classroom
        ? {
            id: String(s.classroom.id),
            name: s.classroom.name ?? null,
            grade: s.classroom.grade ?? null,
            arm: s.classroom.arm ?? null,
          }
        : null,
    }));

    return NextResponse.json(
      { ok: true, guardianPhone, students: result, count: result.length },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    console.error("[PARENT_CHILDREN_ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load learners for this parent." },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
