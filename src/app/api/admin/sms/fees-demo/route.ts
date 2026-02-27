// src/app/api/admin/sms/fees-demo/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { sendViaHubtel, BrandName } from "@/lib/sms/hubtel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FeeStudent = { name: string; guardianPhone: string; amount: string };
type Mode = "demo";
type RequestBody = {
  termOrPeriod?: string;
  className?: string;
  brand?: string;
  students?: FeeStudent[];
  mode?: Mode;
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

function resolveBrand(input?: string): string {
  if (!input) return "AYITIADMIN";
  const upper = input.toUpperCase();
  if (BrandName.includes(upper as (typeof BrandName)[number])) return upper;
  return "AYITIADMIN";
}

function buildMessage(opts: { studentName: string; className: string; termOrPeriod: string; amount: string }) {
  const { studentName, className, termOrPeriod, amount } = opts;
  return `[EduLife OS] Fees reminder: Dear parent/guardian, fees for ${studentName} (${className}) for ${termOrPeriod} is outstanding. Amount due: GHS ${amount}. Kindly settle payment at Ayitikope M/A Basic School. Thank you.`;
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.res;

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    const className = (body.className ?? "JHS 1").trim();
    const termOrPeriod = (body.termOrPeriod ?? "Current Term").trim();
    const brand = resolveBrand(body.brand);

    let students = Array.isArray(body.students) && body.students.length > 0 ? body.students : [];

    if (students.length === 0) {
      const fallbackTo = (process.env.TEST_SMS_TO ?? "").trim();
      students = [{ name: "Demo Student (Fees)", guardianPhone: fallbackTo, amount: "100.00" }];
    }

    students = students.slice(0, 50); // cap

    if (!students.length || !students[0].guardianPhone) {
      return json(400, { ok: false, error: "No students provided and TEST_SMS_TO is not configured." });
    }

    const results: { student: string; to: string; ok: boolean; error?: string }[] = [];
    let successCount = 0;

    for (const s of students) {
      const phone = (s.guardianPhone ?? "").trim();
      const amount = (s.amount ?? "").trim();

      if (!phone) {
        results.push({ student: s.name, to: "", ok: false, error: "Missing guardian phone number." });
        continue;
      }
      if (!amount) {
        results.push({ student: s.name, to: phone, ok: false, error: "Missing amount for this student." });
        continue;
      }

      const message = buildMessage({ studentName: s.name, className, termOrPeriod, amount });

      try {
        const res = await sendViaHubtel({
          to: phone,
          body: message,
          brand,
          meta: { purpose: "fees-reminder-demo", tenantId: gate.ctx.tenantId, className, termOrPeriod, studentName: s.name, amount },
        });

        results.push({ student: s.name, to: res.to, ok: true });
        successCount += 1;
      } catch (err: any) {
        console.error("[SMS_FEES_DEMO_ERROR]", s.name, err);
        results.push({ student: s.name, to: phone, ok: false, error: err?.message ?? "Unknown SMS send error" });
      }
    }

    return json(200, { ok: true, mode: "demo" as Mode, brand, className, termOrPeriod, count: students.length, successCount, results });
  } catch (err: any) {
    console.error("[SMS_FEES_DEMO_FATAL]", err);
    return json(500, { ok: false, error: err?.message ?? "Unexpected error while sending fees reminder demo SMS alerts." });
  }
}
