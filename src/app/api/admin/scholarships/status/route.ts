// src/app/api/admin/scholarships/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  id: string; // scholarship_applications.id (uuid)
  status: "accepted" | "rejected" | "reviewed";
};

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

async function requireAdmin(req: NextRequest) {
  try {
    const ctx = await requireServerUserContext({ requireTenant: true });

    const m = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
      select: { status: true, role: { select: { name: true } } },
    });

    if (!m || m.status !== "ACTIVE" || !isAdminLike(m.role?.name ?? "")) {
      return { ok: false as const, res: json(403, { ok: false, error: "FORBIDDEN" }) };
    }

    // Optional hardening for production since supabaseAdmin bypasses RLS
    if (process.env.NODE_ENV === "production") {
      const key = req.headers.get("x-admin-key") || "";
      if (!process.env.ADMIN_DASHBOARD_KEY || key !== process.env.ADMIN_DASHBOARD_KEY) {
        return { ok: false as const, res: json(401, { ok: false, error: "UNAUTHORIZED" }) };
      }
    }

    return { ok: true as const, ctx };
  } catch {
    return { ok: false as const, res: json(401, { ok: false, error: "UNAUTHORIZED" }) };
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.res;

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  try {
    const body = (await req.json().catch(() => null)) as Payload | null;
    if (!body?.id || !body?.status) return json(400, { ok: false, error: "Missing id or status" });

    const allowed = new Set(["accepted", "rejected", "reviewed"]);
    if (!allowed.has(body.status)) return json(400, { ok: false, error: "Invalid status" });

    // 1) Fetch the application (tenant scoped)
    const { data: app, error: getErr } = await supabaseAdmin
      .from("scholarship_applications")
      .select("*")
      .eq("id", body.id)
      .eq("tenant_id", gate.ctx.tenantId)
      .maybeSingle();

    if (getErr) return json(500, { ok: false, error: `Fetch error: ${getErr.message}` });
    if (!app) return json(404, { ok: false, error: "Application not found" });

    // 2) Update status (tenant scoped)
    const { error: updErr } = await supabaseAdmin
      .from("scholarship_applications")
      .update({ status: body.status })
      .eq("id", body.id)
      .eq("tenant_id", gate.ctx.tenantId);

    if (updErr) return json(500, { ok: false, error: `Update error: ${updErr.message}` });

    // 3) Enqueue WhatsApp notification (tenant scoped)
    const template_key =
      body.status === "accepted"
        ? "scholarship_accepted"
        : body.status === "rejected"
        ? "scholarship_rejected"
        : "scholarship_reviewed";

    const parentName = app.guardian_name || "Parent/Guardian";
    const studentName = app.student_name || "your ward";
    const level = app.level || "the school";

    const meta = {
      parentName,
      studentName,
      level,
      status: body.status,
      message:
        body.status === "accepted"
          ? `Hello ${parentName}, ${studentName} has been ACCEPTED for scholarship consideration at ${level}. We’ll contact you with next steps.`
          : body.status === "rejected"
          ? `Hello ${parentName}, we’re sorry—${studentName} was NOT selected for a scholarship at this time.`
          : `Hello ${parentName}, ${studentName}’s scholarship application has been marked as REVIEWED.`,
    };

    const recipient =
      (app.guardian_phone as string | null)?.trim() || app.parent_phone || null;

    let notifyQueued = false;

    if (recipient) {
      const { error: logErr } = await supabaseAdmin.from("notifications_log").insert([
        {
          tenant_id: gate.ctx.tenantId,
          channel: "whatsapp",
          template_key,
          recipient,
          student_id: null,
          status: "queued",
          meta,
        },
      ]);

      if (!logErr) notifyQueued = true;
      if (logErr) {
        return json(200, {
          ok: true,
          updated: true,
          notifyQueued: false,
          warn: `Queued notification failed: ${logErr.message}`,
        });
      }
    }

    return json(200, { ok: true, updated: true, notifyQueued: !!recipient && notifyQueued });
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
}
