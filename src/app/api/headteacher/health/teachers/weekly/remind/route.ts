// src/app/api/headteacher/health/teachers/weekly/remind/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { sendSMS } from "@/lib/sms";
import { getCurrentUserOrThrow, requireMembershipOrThrow, requireRoleOrThrow } from "@/lib/authz";

function toMondayUTC(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Invalid weekStart (use YYYY-MM-DD)");
  return new Date(`${iso}T00:00:00.000Z`);
}

function normalizePhone(raw: string): string | null {
  const s = String(raw || "").replace(/[^\d]/g, "");
  if (!s) return null;
  if (s.startsWith("0") && s.length === 10) return `233${s.slice(1)}`;
  if (s.startsWith("233") && s.length >= 12) return s;
  return null;
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUserOrThrow();
    if (!user.tenantId) {
      return new Response(JSON.stringify({ ok: false, error: "NO_ACTIVE_TENANT" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }

    const membership = await requireMembershipOrThrow(user.id, user.tenantId);
    requireRoleOrThrow(membership.role?.name, ["HEADTEACHER", "ADMIN"]);

    const body = await req.json().catch(() => ({}));
    const weekStart = String(body?.weekStart ?? "").trim();
    if (!weekStart) {
      return new Response(JSON.stringify({ ok: false, error: "weekStart is required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const weekStartDate = toMondayUTC(weekStart);

    // ✅ Only teachers in this tenant (teacherProfile exists)
    const teachers = await prisma.teacherProfile.findMany({
      where: { tenantId: user.tenantId },
      select: {
        userId: true,
        phone: true,
        user: { select: { name: true, smsOptIn: true } },
      },
    });

    if (teachers.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, weekStart, missingCount: 0, reminded: 0, skippedNoConsent: 0, items: [] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    // ✅ With tenant-aware uniqueness, we filter by tenantId too
    const existing = await prisma.teacherHealthWeekly.findMany({
      where: { tenantId: user.tenantId, weekStart: weekStartDate },
      select: { userId: true },
    });
    const submittedIds = new Set(existing.map((e) => e.userId));

    const missing = teachers.filter((t) => !submittedIds.has(t.userId));

    let reminded = 0;
    let skippedNoConsent = 0;

    const items: Array<{ userId: string; name: string | null; to: string | null; sent: boolean }> = [];

    for (const t of missing) {
      const to = normalizePhone(t.phone);
      const msg = `EduLife OS Reminder: Please submit your weekly health entry for the week starting ${weekStart}.`;

      if (t.user.smsOptIn && to) {
        try {
          await sendSMS({ to, body: msg, tenantId: user.tenantId } as any);
          reminded += 1;
          items.push({ userId: t.userId, name: t.user.name ?? null, to, sent: true });
        } catch {
          items.push({ userId: t.userId, name: t.user.name ?? null, to, sent: false });
        }
      } else {
        skippedNoConsent += 1;
        items.push({ userId: t.userId, name: t.user.name ?? null, to, sent: false });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        tenantId: user.tenantId,
        weekStart,
        missingCount: missing.length,
        reminded,
        skippedNoConsent,
        items,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err: any) {
    console.error("weekly/remind error:", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? "Failed to send reminders" }), {
      status: err?.status ?? 500,
      headers: { "content-type": "application/json" },
    });
  }
}
