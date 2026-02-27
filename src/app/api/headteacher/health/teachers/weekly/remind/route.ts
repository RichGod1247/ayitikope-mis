// src/app/api/headteacher/health/teachers/weekly/remind/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import {
  getCurrentUserOrThrow,
  requireMembershipOrThrow,
  requireRoleOrThrow,
} from "@/lib/authz";

function toWeekStartUTC(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error("Invalid weekStart (use YYYY-MM-DD)");
  }
  const d = new Date(`${iso}T00:00:00.000Z`);
  // Enforce Monday (UTC)
  if (d.getUTCDay() !== 1) {
    throw new Error("weekStart must be a Monday (YYYY-MM-DD)");
  }
  return d;
}

function normalizePhone(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  // keep digits only (handle +233, spaces, dashes)
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return null;

  // Ghana: 0XXXXXXXXX (10 digits) => 233XXXXXXXXX
  if (digits.startsWith("0") && digits.length === 10) return `233${digits.slice(1)}`;

  // Ghana: 233XXXXXXXXX (12 digits) ok
  if (digits.startsWith("233") && digits.length === 12) return digits;

  return null;
}

export async function POST(req: Request) {
  try {
    const actor = await getCurrentUserOrThrow();

    if (!actor.tenantId) {
      return new Response(JSON.stringify({ ok: false, error: "NO_ACTIVE_TENANT" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }

    const membership = await requireMembershipOrThrow(actor.id, actor.tenantId);
    requireRoleOrThrow(membership.role?.name, ["HEADTEACHER", "ADMIN"]);

    const body = await req.json().catch(() => ({} as any));
    const weekStart = String(body?.weekStart ?? "").trim();
    if (!weekStart) {
      return new Response(JSON.stringify({ ok: false, error: "weekStart is required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const weekStartDate = toWeekStartUTC(weekStart);

    // 1) Teachers in this tenant (NO user relation assumed)
    const teachers = await prisma.teacherProfile.findMany({
      where: { tenantId: actor.tenantId },
      select: {
        userId: true,
        phone: true,
      },
    });

    if (!teachers.length) {
      return new Response(
        JSON.stringify({
          ok: true,
          tenantId: actor.tenantId,
          weekStart,
          missingCount: 0,
          reminded: 0,
          skipped: 0,
          items: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    // 2) Who already submitted this week
    const submitted = await prisma.teacherHealthWeekly.findMany({
      where: { tenantId: actor.tenantId, weekStart: weekStartDate },
      select: { userId: true },
    });

    const submittedIds = new Set(submitted.map((x) => x.userId));
    const missingTeachers = teachers.filter((t) => !submittedIds.has(t.userId));

    // 3) Fetch users (separately) for name/consent if available
    const userIds = Array.from(new Set(missingTeachers.map((t) => t.userId)));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      // no select: avoids “unknown field” select errors
    });

    const userMap = new Map<string, any>();
    for (const u of users as any[]) userMap.set(u.id, u);

    const msg = `EduLife OS Reminder: Please submit your weekly health entry for the week starting ${weekStart}.`;

    let reminded = 0;
    let skipped = 0;

    const items: Array<{
      userId: string;
      name: string | null;
      to: string | null;
      sent: boolean;
      reason?: string;
    }> = [];

    for (const t of missingTeachers) {
      const u = userMap.get(t.userId) as any | undefined;
      const name = u?.name ? String(u.name) : null;

      // Consent: if smsOptIn exists, enforce it; if not, default allow.
      const smsOptIn =
        typeof u?.smsOptIn === "boolean" ? Boolean(u.smsOptIn) : true;

      const to = normalizePhone(t.phone);

      if (!smsOptIn) {
        skipped += 1;
        items.push({ userId: t.userId, name, to, sent: false, reason: "NO_SMS_OPT_IN" });
        continue;
      }

      if (!to) {
        skipped += 1;
        items.push({ userId: t.userId, name, to: null, sent: false, reason: "NO_VALID_PHONE" });
        continue;
      }

      try {
        await (sendSms as any)({
          tenantId: actor.tenantId,
          to,
          body: msg,
          message: msg,
          purpose: "TEACHER_HEALTH_WEEKLY_REMINDER",
        });
        reminded += 1;
        items.push({ userId: t.userId, name, to, sent: true });
      } catch (e: any) {
        skipped += 1;
        items.push({
          userId: t.userId,
          name,
          to,
          sent: false,
          reason: e?.message ? `SEND_FAILED: ${String(e.message)}` : "SEND_FAILED",
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        tenantId: actor.tenantId,
        weekStart,
        missingCount: missingTeachers.length,
        reminded,
        skipped,
        items,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err: any) {
    console.error("weekly/remind error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err?.message ?? "Failed to send reminders" }),
      { status: err?.status ?? 500, headers: { "content-type": "application/json" } }
    );
  }
}
