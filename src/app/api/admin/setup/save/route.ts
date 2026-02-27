// src/app/api/admin/setup/save/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function parseISODateOnly(v: unknown): Date | null {
  const s = cleanStr(v);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseTimeHHMM(v: unknown): string | null {
  const s = cleanStr(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function toMinutes(hhmm: string | null) {
  if (!hhmm) return null;
  const [hh, mm] = hhmm.split(":").map(Number);
  return hh * 60 + mm;
}

function parseIntOrNull(v: unknown): number | null {
  const s = cleanStr(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseDecimal41OrNull(v: unknown): Prisma.Decimal | null {
  const s = cleanStr(v);
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n < 30 || n > 45) return null;
  const fixed = Math.round(n * 10) / 10;
  return new Prisma.Decimal(fixed);
}

function assertRange(a: Date | null, b: Date | null, label: string) {
  if (a && b && a.getTime() > b.getTime()) throw new Error(`BAD_RANGE:${label}`);
}

function isComplete(data: {
  currentAcademicYear: string | null;
  currentTerm: string | null;
  term1Start: Date | null;
  term1End: Date | null;
  term2Start: Date | null;
  term2End: Date | null;
  term3Start: Date | null;
  term3End: Date | null;
  attendanceStartTime: string | null;
  attendanceEndTime: string | null;
  lateCutoffMinutes: number | null;
  feverThreshold: Prisma.Decimal | null;
}) {
  const startM = toMinutes(data.attendanceStartTime);
  const endM = toMinutes(data.attendanceEndTime);

  return (
    !!data.currentAcademicYear &&
    !!data.currentTerm &&
    !!data.term1Start &&
    !!data.term1End &&
    !!data.term2Start &&
    !!data.term2End &&
    !!data.term3Start &&
    !!data.term3End &&
    startM != null &&
    endM != null &&
    startM < endM &&
    typeof data.lateCutoffMinutes === "number" &&
    data.lateCutoffMinutes >= 0 &&
    data.lateCutoffMinutes <= 240 &&
    data.feverThreshold != null
  );
}

export async function POST(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN"],
  });
  if (!auth.ok) return auth.res;

  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) return json({ ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" }, 415);

  try {
    const tenantId = auth.ctx.tenantId;
    const body = await req.json().catch(() => ({}));

    const t = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });
    if (!t) return json({ ok: false, error: "TENANT_NOT_FOUND" }, 404);
    if (t.status !== "ACTIVE") return json({ ok: false, error: "TENANT_NOT_ACTIVE" }, 409);

    const data = {
      currentAcademicYear: cleanStr((body as any).currentAcademicYear) || null,
      currentTerm: cleanStr((body as any).currentTerm) || null,

      term1Start: parseISODateOnly((body as any).term1Start),
      term1End: parseISODateOnly((body as any).term1End),
      term2Start: parseISODateOnly((body as any).term2Start),
      term2End: parseISODateOnly((body as any).term2End),
      term3Start: parseISODateOnly((body as any).term3Start),
      term3End: parseISODateOnly((body as any).term3End),

      attendanceStartTime: parseTimeHHMM((body as any).attendanceStartTime),
      attendanceEndTime: parseTimeHHMM((body as any).attendanceEndTime),

      lateCutoffMinutes: parseIntOrNull((body as any).lateCutoffMinutes),
      feverThreshold: parseDecimal41OrNull((body as any).feverThreshold),
    };

    assertRange(data.term1Start, data.term1End, "TERM1");
    assertRange(data.term2Start, data.term2End, "TERM2");
    assertRange(data.term3Start, data.term3End, "TERM3");

    const prev = await prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { setupCompletedAt: true },
    });

    const completeNow = isComplete(data);

    // 🔒 CRITICAL FIX:
    // once setupCompletedAt is set, NEVER clear it again.
    const setupCompletedAt = prev?.setupCompletedAt ?? (completeNow ? new Date() : null);

    await prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data, setupCompletedAt },
      update: { ...data, setupCompletedAt },
    });

    return json({ ok: true, setupComplete: !!setupCompletedAt, completedAt: setupCompletedAt?.toISOString?.() ?? null }, 200);
  } catch (err: any) {
    if (err?.message?.startsWith("BAD_RANGE:")) {
      return json({ ok: false, error: `Invalid date range: ${err.message.replace("BAD_RANGE:", "")}` }, 400);
    }

    console.error("admin/setup/save error:", err);
    return json({ ok: false, error: "FAILED_TO_SAVE_SETUP" }, 500);
  }
}