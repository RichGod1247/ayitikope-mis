// src/app/api/headteacher/day/bulk-certify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  date: z.string(),
});

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isNextRedirectError(err: any) {
  return typeof err?.digest === "string" && err.digest.startsWith("NEXT_REDIRECT");
}

function parseYMD(d: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, da = Number(m[3]);
  const start = new Date(Date.UTC(y, mo, da, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo, da + 1, 0, 0, 0, 0));
  return { start, end };
}

function normRole(name: any) {
  return String(name ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function looksLikeHeadOrAdmin(roleName: string) {
  if (!roleName) return false;
  if (roleName.includes("ADMIN")) return true;
  if (roleName.includes("HEAD")) return true;
  if (roleName === "HT") return true;
  if (roleName === "HEADTEACHER") return true;
  if (roleName === "SCHOOL_ADMIN") return true;
  return false;
}

async function requireHeadOrAdmin(tenantId: string, userId: string) {
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { role: { select: { name: true } } },
  });
  if (!m) return { ok: false as const, status: 403, error: "FORBIDDEN" };
  const roleName = normRole(m.role?.name);
  return looksLikeHeadOrAdmin(roleName)
    ? ({ ok: true as const } as const)
    : ({ ok: false as const, status: 403, error: "FORBIDDEN" } as const);
}

export async function POST(req: NextRequest) {
  let safe: { userId: string; tenantId: string };
  try {
    const r: any = await requireServerUserContext({ requireTenant: true } as any);
    const ctx = r?.ctx ?? r;
    safe = { userId: String(ctx.userId ?? ctx.user?.id ?? ""), tenantId: String(ctx.tenantId ?? ctx.activeTenantId ?? "") };
  } catch (err: any) {
    if (isNextRedirectError(err)) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  if (!safe.userId || !safe.tenantId) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);

  const roleOk = await requireHeadOrAdmin(safe.tenantId, safe.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return jsonNoStore({ ok: false, error: "INVALID_BODY", details: parsed.error.flatten() }, 400);

  const date = String(parsed.data.date).trim();
  const range = parseYMD(date);
  if (!range) return jsonNoStore({ ok: false, error: "date must be YYYY-MM-DD" }, 400);

  try {
    const now = new Date();
    const result = await prisma.attendanceSession.updateMany({
      where: {
        tenantId: safe.tenantId,
        isClosed: true,
        certifiedAt: null,
        date: { gte: range.start, lt: range.end },
      },
      data: { certifiedAt: now },
    });

    return jsonNoStore({ ok: true, tenantId: safe.tenantId, date, updatedCount: result.count }, 200);
  } catch (err) {
    console.error("[HEADTEACHER_BULK_CERTIFY_ERROR]", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_BULK_CERTIFY" }, 500);
  }
}
