// src/app/api/headteacher/health/teachers/weekly/missing/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

/**
 * GET /api/headteacher/health/teachers/weekly/missing?weekStart=YYYY-MM-DD
 *
 * Tenant is derived from session (NOT query params).
 * Headteacher-only.
 *
 * Returns:
 * { ok: true, weekStart: "YYYY-MM-DD", items: [{ userId, name, email }] }
 *
 * Production-grade: teacher roster comes from Membership + Role (ACTIVE only).
 * No /api/test/* dependencies.
 */

export const dynamic = "force-dynamic";

function mondayISO(input: string): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;

  // force to UTC date (no time)
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // normalize to Monday
  const day = date.getUTCDay(); // 0..6 (Sun..Sat)
  const diff = (day + 6) % 7; // days since Monday
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function displayName(u: { name?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null }) {
  const n = cleanStr(u.name);
  if (n) return n;

  const first = cleanStr(u.firstName);
  const last = cleanStr(u.lastName);
  const full = `${first} ${last}`.trim();
  if (full) return full;

  return u.email ?? null;
}

export async function GET(req: NextRequest) {
  // 🔐 AUTH + TENANT + ROLE
  const ctx = await requireServerUserContext({
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER"],
  });

  const { searchParams } = new URL(req.url);
  const weekStartRaw = cleanStr(searchParams.get("weekStart"));
  const weekStartISO = mondayISO(weekStartRaw);

  if (!weekStartISO) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION_ERROR", message: "valid weekStart is required (YYYY-MM-DD)" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const tenantId = ctx.tenantId;

  try {
    // ✅ Teacher roster from memberships (ACTIVE only).
    // Adjust role names here if your DB uses different labels.
    const TEACHER_ROLE_NAMES = ["TEACHER"]; // optionally add "HEADTEACHER" if they must also submit

    const teacherMemberships = await prisma.membership.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        role: { name: { in: TEACHER_ROLE_NAMES } },
      },
      select: {
        userId: true,
        user: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const roster = teacherMemberships
      .map((m) => m.user)
      .filter(Boolean)
      .map((u) => ({
        id: u!.id,
        name: displayName(u!),
        email: u!.email ?? null,
      }));

    // submissions already made this week
    const submitted = await prisma.teacherHealthWeekly.findMany({
      where: {
        tenantId,
        weekStart: new Date(`${weekStartISO}T00:00:00.000Z`),
      },
      select: { userId: true },
    });

    const submittedSet = new Set(submitted.map((s) => s.userId));

    const items = roster
      .filter((t) => !submittedSet.has(t.id))
      .map((t) => ({
        userId: t.id,
        name: t.name,
        email: t.email,
      }));

    return NextResponse.json(
      { ok: true, weekStart: weekStartISO, items },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("weekly/missing error:", err);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: "Failed to compute missing list" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
