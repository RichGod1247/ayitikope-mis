import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NotificationContactDTO = {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
  createdAt: string | null;
  createdAtDisplay: string;
};

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function formatDateAccra(d: Date): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Accra",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function normalizeRoleName(role: unknown) {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z_]/g, "");
}

function effectiveRole(role: unknown) {
  const r = normalizeRoleName(role);
  if (r === "ADMIN") return "SCHOOL_ADMIN";
  if (r === "HEADMASTER") return "HEADTEACHER";
  return r;
}

function isAdminLike(role: unknown) {
  const r = effectiveRole(role);
  return r === "SCHOOL_ADMIN" || r === "HEADTEACHER" || r.includes("OWNER") || r.includes("SUPER");
}

async function requireAdmin() {
  try {
    const ctx = await requireServerUserContext({ requireTenant: true });

    const m = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
      select: { status: true, role: { select: { name: true } } },
    });

    if (!m || m.status !== "ACTIVE" || !isAdminLike(m.role?.name ?? "")) {
      return { ok: false as const, res: json(403, { ok: false, error: "FORBIDDEN" }) };
    }

    return { ok: true as const, ctx };
  } catch {
    return { ok: false as const, res: json(401, { ok: false, error: "UNAUTHORIZED" }) };
  }
}

// Keeps your current behavior: returns LIST (even though this sits under [id])
export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const { searchParams } = new URL(req.url);
  const guard = assertNoTenantOverride(searchParams.get("tenantId"), gate.ctx.tenantId);
  if (!guard.ok) return json(guard.status, { ok: false, error: guard.error });

  try {
    const contacts = await prisma.notificationContact.findMany({
      where: { tenantId: gate.ctx.tenantId },
      orderBy: { id: "asc" },
      take: 2000,
    });

    const plain: NotificationContactDTO[] = contacts.map((c: any) => ({
      id: String(c.id),
      name: String(c.name ?? ""),
      phone: String(c.phone ?? ""),
      isActive: !!c.isActive,
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
      createdAtDisplay: c.createdAt ? formatDateAccra(new Date(c.createdAt)) : "—",
    }));

    return json(200, { ok: true, contacts: plain });
  } catch (err) {
    console.error("GET /api/admin/notification-contacts error:", err);
    return json(503, { ok: false, error: "Database is not reachable right now." });
  }
}
