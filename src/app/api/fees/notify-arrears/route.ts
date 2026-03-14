// src/app/api/fees/notify-arrears/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendViaHubtel, BrandName } from "@/lib/sms/hubtel";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_FEES_ARREARS_TEMPLATE = [
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

type Brand = (typeof BrandName)[number];
const FEES_BRAND: Brand = "EDULIFEOS";

const ItemSchema = z.object({
  studentId: z.string().min(5).optional(),
  studentName: z.string().optional(),
  guardianPhone: z.string().optional(),
  className: z.string().optional(),
  term: z.string().optional(),
  amountDue: z.union([z.string(), z.number()]).optional(),
  dueDate: z.string().optional(),
});

const BodySchema = z.object({
  arrears: z.array(ItemSchema).min(1).max(250),
});

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

function renderTemplate(template: string, ctx: Record<string, string>): string {
  let body = template;
  for (const [key, value] of Object.entries(ctx)) {
    const re = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    body = body.replace(re, value);
  }
  return body;
}

function safeMoney(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return v.toFixed(2);
  if (typeof v === "string" && v.trim()) return v.trim();
  return "0.00";
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function normalizePhoneGhana(raw: string): string {
  const s = clean(raw);
  if (!s) return "";
  if (/^0\d{9}$/.test(s)) return `233${s.slice(1)}`;
  if (/^\+233\d{9}$/.test(s)) return s.slice(1);
  if (/^233\d{9}$/.test(s)) return s;
  return s;
}

async function requireAdminLike(tenantId: string, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    include: { role: true },
  });
  if (!membership) return { ok: false as const, status: 403, error: "Forbidden." };
  const roleName = String(membership.role?.name ?? "").toUpperCase();
  const isAdminLike = roleName.includes("ADMIN") || roleName.includes("HEAD");
  if (!isAdminLike) return { ok: false as const, status: 403, error: "Forbidden." };
  return { ok: true as const };
}

export async function POST(req: NextRequest) {
  let ctx: { tenantId: string; userId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { tenantId: c.tenantId, userId: c.userId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const roleOk = await requireAdminLike(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, { status: roleOk.status });

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "Content-Type must be application/json." }, { status: 415 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonNoStore({ ok: false, error: parsed.error.issues[0]?.message || "Invalid request body." }, { status: 400 });
  }

  const arrears = parsed.data.arrears;
  const studentIds = Array.from(
    new Set(arrears.map((a) => clean(a.studentId)).filter((x) => x.length >= 5))
  );

  const [tenant, students] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, name: true, settingsJson: true },
    }),
    studentIds.length
      ? prisma.student.findMany({
          where: { tenantId: ctx.tenantId, id: { in: studentIds } },
          select: { id: true, firstName: true, lastName: true, guardianPhone: true, guardianSmsOptIn: true },
        })
      : Promise.resolve([] as any[]),
  ]);

  const schoolName = clean(tenant?.name) || "your ward's school";
  const settings = (tenant?.settingsJson as any) || {};
  const storedTemplate = (settings?.smsTemplates as any)?.feesArrears;
  const template =
    typeof storedTemplate === "string" && storedTemplate.trim().length > 0 ? storedTemplate : DEFAULT_FEES_ARREARS_TEMPLATE;

  const studentMap = new Map(students.map((s) => [s.id, s]));
  let successCount = 0;

  const results: any[] = [];

  for (const item of arrears) {
    const sid = clean(item.studentId);

    if (sid) {
      const s = studentMap.get(sid);
      if (!s) {
        results.push({ studentId: sid, ok: false, error: "Student not found; skipped." });
        continue;
      }
      if (!s.guardianSmsOptIn) {
        results.push({ studentId: sid, ok: false, error: "Guardian SMS opt-in is off; skipped." });
        continue;
      }
      const to = normalizePhoneGhana(clean(s.guardianPhone));
      if (!to) {
        results.push({ studentId: sid, ok: false, error: "No guardian phone on record; skipped." });
        continue;
      }

      const studentName = `${clean(s.firstName)} ${clean(s.lastName)}`.trim() || clean(item.studentName) || "your ward";
      const amountStr = safeMoney(item.amountDue);
      const smsBody = renderTemplate(template, {
        studentName,
        amountDue: amountStr,
        className: clean(item.className),
        term: clean(item.term),
        dueDate: clean(item.dueDate),
        schoolName,
      });

      try {
        const sendResult = await sendViaHubtel({
          to,
          body: smsBody,
          brand: FEES_BRAND,
          meta: {
            kind: "fees-arrears",
            tenantId: ctx.tenantId,
            studentId: sid,
            className: clean(item.className) || null,
            term: clean(item.term) || null,
            amountDue: amountStr,
          },
        });

        if (sendResult.ok) successCount++;

        results.push({
          studentId: sid,
          studentName,
          to,
          ok: sendResult.ok,
          brand: FEES_BRAND,
          providerResponse: (sendResult as any).providerResponse ?? null,
        });
      } catch (err: any) {
        console.error("[FEES_NOTIFY_ARREARS_ERROR]", err);
        results.push({ studentId: sid, ok: false, error: err?.message || "Failed to send SMS" });
      }

      continue;
    }

    results.push({
      ok: false,
      error: "Missing studentId; skipped (unverified target).",
    });
  }

  return jsonNoStore(
    {
      ok: true,
      total: arrears.length,
      successCount,
      brand: FEES_BRAND,
      results,
    },
    { status: 200 }
  );
}