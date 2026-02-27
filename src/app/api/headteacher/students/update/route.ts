// src/app/api/headteacher/students/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function isNextRedirectError(err: any) {
  return typeof err?.digest === "string" && err.digest.startsWith("NEXT_REDIRECT");
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
  let tenantId = "";
  let userId = "";
  try {
    const r: any = await requireServerUserContext({ requireTenant: true } as any);
    const ctx = r?.ctx ?? r;
    tenantId = String(ctx.tenantId ?? ctx.activeTenantId ?? "").trim();
    userId = String(ctx.userId ?? ctx.user?.id ?? "").trim();
  } catch (err: any) {
    if (isNextRedirectError(err)) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  if (!tenantId || !userId) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);

  const roleOk = await requireHeadOrAdmin(tenantId, userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonNoStore({ ok: false, error: "INVALID_JSON" }, 400);

    const { id, sex, guardianName, guardianPhone, guardianSmsOptIn, note } = body as {
      id?: string;
      sex?: string | null;
      guardianName?: string | null;
      guardianPhone?: string | null;
      guardianSmsOptIn?: boolean;
      note?: string | null;
    };

    const sid = typeof id === "string" ? id.trim() : "";
    if (!sid) return jsonNoStore({ ok: false, error: "Student id is required." }, 400);

    const existing = await prisma.student.findFirst({ where: { id: sid, tenantId }, select: { id: true } });
    if (!existing) return jsonNoStore({ ok: false, error: "Student not found for this tenant." }, 404);

    const data: any = {};
    if (typeof sex === "string") data.sex = sex.trim() || "";
    if (typeof guardianName === "string") data.guardianName = guardianName.trim() || "";
    if (typeof guardianPhone === "string") data.guardianPhone = guardianPhone.trim() || "";
    if (typeof guardianSmsOptIn === "boolean") data.guardianSmsOptIn = guardianSmsOptIn;
    if (typeof note === "string") data.note = note.trim() || "";

    if (Object.keys(data).length === 0) return jsonNoStore({ ok: false, error: "No valid fields to update." }, 400);

    const updated = await prisma.student.update({ where: { id: sid }, data, select: { id: true } });
    return jsonNoStore({ ok: true, id: updated.id }, 200);
  } catch (err) {
    console.error("[HEAD_STUDENTS_UPDATE_ERROR]", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_UPDATE_STUDENT" }, 500);
  }
}
