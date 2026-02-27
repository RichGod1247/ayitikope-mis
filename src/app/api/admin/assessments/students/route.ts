// src/app/api/admin/assessments/students/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function normalizeRoleName(role: unknown) {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z_]/g, "");
}

function roleEffective(role: unknown) {
  const r = normalizeRoleName(role);
  if (r === "ADMIN") return "SCHOOL_ADMIN";
  if (r === "HEADMASTER") return "HEADTEACHER";
  return r;
}

function isAdminLike(role: unknown) {
  const r = roleEffective(role);
  return r === "SCHOOL_ADMIN" || r === "HEADTEACHER" || r.includes("OWNER") || r.includes("SUPER");
}

async function requireAdmin(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return { ok: false as const, res: auth.res };

  const m = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: auth.ctx.userId, tenantId: auth.ctx.tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!m || m.status !== "ACTIVE" || !isAdminLike(m.role?.name ?? "")) {
    return { ok: false as const, res: json(403, { ok: false, error: "FORBIDDEN" }) };
  }

  if (process.env.NODE_ENV === "production") {
    const key = req.headers.get("x-admin-key") || "";
    if (!process.env.ADMIN_DASHBOARD_KEY || key !== process.env.ADMIN_DASHBOARD_KEY) {
      return { ok: false as const, res: json(401, { ok: false, error: "UNAUTHORIZED" }) };
    }
  }

  return { ok: true as const };
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.res;

  try {
    const { data, error } = await supabaseAdmin
      .from("students")
      .select("student_id, first_name, last_name, class_code")
      .order("class_code", { ascending: true })
      .order("last_name", { ascending: true })
      .limit(1000);

    if (error) return json(500, { ok: false, error: error.message });

    return json(200, { ok: true, students: data ?? [] });
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
}
