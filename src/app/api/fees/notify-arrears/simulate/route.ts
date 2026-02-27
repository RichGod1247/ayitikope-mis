// src/app/api/fees/notify-arrears/simulate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ArrearsItem = {
  invoiceId?: string;
  studentName?: string;
  guardianPhone?: string | null;
  amountDue?: number; // cedis
  className?: string | null;
  term?: string | null;
  dueDate?: string | null;
};

type NotifySimulateRequestBody = {
  tenantId?: string; // legacy optional, must match session if present
  arrears?: ArrearsItem[];
  templateOverride?: string;
};

const DEFAULT_TEMPLATE = [
  "Dear Parent/Guardian of {{studentName}},",
  "",
  "Our records show that fees of GHS {{amountDue}} for {{className}} ({{term}})",
  "are still outstanding as of {{dueDate}}.",
  "",
  "If you have already paid, kindly disregard this message.",
  "Otherwise, we encourage you to settle at your earliest convenience.",
  "",
  "Thank you,",
  "{{schoolName}}",
].join("\n");

function jsonNoStore(payload: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function normRole(v: unknown) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

// Back-compat role mapping used by this route historically
function effectiveRole(roleName: unknown) {
  const r = normRole(roleName);
  if (r === "ADMIN") return "SCHOOL_ADMIN";
  if (r === "HEADMASTER") return "HEADTEACHER";
  return r;
}

async function requireFeesAdminOrHead(tenantId: string, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    include: { role: true },
  });

  if (!membership) return { ok: false as const, status: 403, error: "FORBIDDEN" };

  const role = effectiveRole(membership.role?.name);
  const allowed = role === "SCHOOL_ADMIN" || role === "HEADTEACHER" || role === "SUPERADMIN";
  if (!allowed) return { ok: false as const, status: 403, error: "FORBIDDEN" };

  return { ok: true as const, role };
}

function renderTemplate(tpl: string, vars: Record<string, string>) {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{{${k}}}`, v);
  return out;
}

function accraISODate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Accra",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

function normalizeGhanaPhone(raw: string) {
  const s = String(raw || "").replace(/\s+/g, "").replace(/[^\d+]/g, "");
  if (!s) return null;

  if (s.startsWith("+233") && s.length === 13) return s;
  if (s.startsWith("233") && s.length === 12) return `+${s}`;
  if (s.startsWith("0") && s.length === 10) return `+233${s.slice(1)}`;
  if (s.startsWith("+") && s.length >= 8) return s;
  return s.length >= 8 ? `+${s}` : null;
}

function parseBodyTenantId(body: any) {
  const v = String(body?.tenantId ?? "").trim();
  return v || null;
}

export async function POST(req: NextRequest) {
  // ✅ API auth (never redirects)
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;

  const ctx = auth.ctx;

  const roleOk = await requireFeesAdminOrHead(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, { status: roleOk.status });

  let body: NotifySimulateRequestBody;
  try {
    body = (await req.json()) as NotifySimulateRequestBody;
  } catch {
    return jsonNoStore({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const bodyTenantId = parseBodyTenantId(body);
  if (bodyTenantId && bodyTenantId !== ctx.tenantId) {
    return jsonNoStore({ ok: false, error: "FORBIDDEN_TENANT_MISMATCH" }, { status: 403 });
  }

  const arrears = Array.isArray(body.arrears) ? body.arrears : [];
  if (!arrears.length) {
    return jsonNoStore({ ok: false, error: "Payload must include a non-empty 'arrears' array." }, { status: 400 });
  }

  if (arrears.length > 500) {
    return jsonNoStore(
      { ok: false, error: "Too many items in one request. Please simulate in batches of 500 or less." },
      { status: 400 }
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { name: true, settingsJson: true },
  });

  const schoolName = tenant?.name ?? "School";
  const settings = (tenant?.settingsJson as any) || {};
  const tplFromSettings = settings?.smsTemplates?.feesArrears;

  const template =
    typeof body.templateOverride === "string" && body.templateOverride.trim()
      ? body.templateOverride.trim()
      : typeof tplFromSettings === "string" && tplFromSettings.trim()
      ? tplFromSettings.trim()
      : DEFAULT_TEMPLATE;

  const withValidPhone = arrears
    .map((a) => {
      const to = a.guardianPhone ? normalizeGhanaPhone(a.guardianPhone) : null;
      if (!to) return null;

      const vars = {
        studentName: String(a.studentName ?? "Learner"),
        amountDue: (Number.isFinite(a.amountDue as any) ? Number(a.amountDue) : 0).toFixed(2),
        className: String(a.className ?? "Class"),
        term: String(a.term ?? "Term"),
        dueDate: String(a.dueDate ?? accraISODate()),
        schoolName,
      };

      return { to, studentName: vars.studentName, message: renderTemplate(template, vars).trim() };
    })
    .filter(Boolean) as { to: string; studentName: string; message: string }[];

  return jsonNoStore({
    ok: true,
    tenantId: ctx.tenantId,
    total: withValidPhone.length,
    skippedNoPhone: arrears.length - withValidPhone.length,
    preview: withValidPhone.slice(0, 3),
  });
}
