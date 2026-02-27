// src/app/api/admin/assessments/add/route.ts
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

  // Supabase service-role bypasses RLS → require an extra key in production
  if (process.env.NODE_ENV === "production") {
    const key = req.headers.get("x-admin-key") || "";
    if (!process.env.ADMIN_DASHBOARD_KEY || key !== process.env.ADMIN_DASHBOARD_KEY) {
      return { ok: false as const, res: json(401, { ok: false, error: "UNAUTHORIZED" }) };
    }
  }

  return { ok: true as const, ctx: auth.ctx };
}

function asNumberOrNull(v: any) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.res;

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  try {
    const body = (await req.json().catch(() => null)) as any;
    if (!body) return json(400, { ok: false, error: "INVALID_PAYLOAD" });

    // NOTE: This is a LEGACY Supabase table design (class_code/student_id).
    // We cannot truly tenant-scope unless the table has a tenant_id column.
    // Bank-grade mitigation: admin-only + production x-admin-key.

    const payload = {
      student_id: body.student_id ? String(body.student_id).trim() : null,
      class_code: body.class_code ? String(body.class_code).trim().toUpperCase() : null,
      subject: body.subject ? String(body.subject).trim() : null,
      assessment_type: body.assessment_type ? String(body.assessment_type).trim() : null,
      max_score: asNumberOrNull(body.max_score),
      score: asNumberOrNull(body.score),
      date: body.date ? String(body.date).trim() : null,
      term: body.term ? String(body.term).trim() : null,
      academic_year: body.academic_year ? String(body.academic_year).trim() : null,
      grade: body.grade ? String(body.grade).trim() : null,
      comment: body.comment ? String(body.comment).trim() : null,
    };

    if (!payload.student_id || !payload.class_code || !payload.subject || !payload.assessment_type) {
      return json(400, {
        ok: false,
        error: "student_id, class_code, subject, assessment_type are required",
      });
    }

    const { error } = await supabaseAdmin.from("assessments").insert([payload]);
    if (error) return json(400, { ok: false, error: error.message });

    return json(200, { ok: true });
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
}
