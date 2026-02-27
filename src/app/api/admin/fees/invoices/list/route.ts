// src/app/api/admin/fees/invoices/list/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, status = 200) {
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
  return r === "ADMIN" ? "SCHOOL_ADMIN" : r;
}

function isAdminLike(role: unknown) {
  const r = roleEffective(role);
  return r === "SCHOOL_ADMIN" || r.includes("HEAD") || r.includes("OWNER") || r.includes("SUPER");
}

async function requireAdminLike(tenantId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!m || m.status !== "ACTIVE") return { ok: false as const, status: 403, error: "Forbidden." };
  if (!isAdminLike(m.role?.name ?? "")) return { ok: false as const, status: 403, error: "Forbidden." };
  return { ok: true as const };
}

function buildClassLabel(cls: { name?: string | null; grade?: string | null; arm?: string | null } | null | undefined) {
  if (!cls) return null;
  if (cls.name) return cls.name;
  const parts = [cls.grade, cls.arm].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

export async function GET(req: Request) {
  // Auth + session tenant
  let ctx: { tenantId: string; userId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { tenantId: c.tenantId, userId: c.userId };
  } catch {
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const roleOk = await requireAdminLike(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  const url = new URL(req.url);

  // Back-compat: tenantId may be passed by legacy UI, but must match session tenant
  const guard = assertNoTenantOverride(url.searchParams.get("tenantId"), ctx.tenantId);
  if (!guard.ok) return jsonNoStore({ ok: false, error: guard.error }, guard.status);

  const term = (url.searchParams.get("term") ?? "").trim() || null;
  const academicYear = (url.searchParams.get("academicYear") ?? "").trim() || null;
  const classroomId = (url.searchParams.get("classroomId") ?? "").trim() || null;

  // Optional: cap rows
  const takeParam = Number(url.searchParams.get("take") ?? "");
  const take = Number.isFinite(takeParam) ? Math.max(1, Math.min(2000, Math.floor(takeParam))) : 1200;

  try {
    const tenantId = ctx.tenantId;

    // 1) Students (optional classroom filter)
    const studentWhere: any = { tenantId };
    if (classroomId) studentWhere.classroomId = classroomId;

    const students = await prisma.student.findMany({
      where: studentWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        classroomId: true,
        guardianPhone: true,
      },
      take: 8000,
    });

    if (classroomId && students.length === 0) {
      return jsonNoStore({ ok: true, items: [] }, 200);
    }

    const studentMap = new Map<string, (typeof students)[number]>();
    for (const s of students) studentMap.set(s.id, s);

    const classroomIds = Array.from(
      new Set(
        students
          .map((s) => s.classroomId)
          .filter((v): v is string => typeof v === "string" && v.length > 0)
      )
    );

    const classrooms = classroomIds.length
      ? await prisma.classroom.findMany({
          where: { tenantId, id: { in: classroomIds } },
          select: { id: true, name: true, grade: true, arm: true },
          take: 4000,
        })
      : [];

    const classroomMap = new Map<string, (typeof classrooms)[number]>();
    for (const c of classrooms) classroomMap.set(c.id, c);

    // 2) Invoices (tenant scoped always)
    const invoiceWhere: any = { tenantId };
    if (term) invoiceWhere.term = term;
    if (academicYear) invoiceWhere.academicYear = academicYear;

    if (classroomId) {
      const ids = students.map((s) => s.id);
      if (ids.length === 0) return jsonNoStore({ ok: true, items: [] }, 200);
      invoiceWhere.studentId = { in: ids };
    }

    const invoices = await prisma.feeInvoice.findMany({
      where: invoiceWhere,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        studentId: true,
        term: true,
        academicYear: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
        createdAt: true,
      },
    });

    if (invoices.length === 0) return jsonNoStore({ ok: true, items: [] }, 200);

    const invoiceIds = invoices.map((inv) => inv.id);

    // 3) Aggregate payments per invoice (sum + last payment date)
    const payAgg = await prisma.feePayment.groupBy({
      by: ["invoiceId"],
      where: { tenantId, invoiceId: { in: invoiceIds } },
      _sum: { amountPesewas: true },
      _max: { paidAt: true },
    });

    const payMap = new Map<string, { totalPaid: number; lastPaidAt: Date | null }>();
    for (const row of payAgg) {
      payMap.set(row.invoiceId, {
        totalPaid: row._sum.amountPesewas ?? 0,
        lastPaidAt: row._max.paidAt ?? null,
      });
    }

    // 4) Shape UI payload
    const items = invoices.map((inv) => {
      const s = inv.studentId ? studentMap.get(inv.studentId) : null;

      const studentName = s
        ? ([s.firstName, s.lastName].filter(Boolean).join(" ").trim() || "Unknown learner")
        : "Unknown learner";

      const cls = s?.classroomId ? (classroomMap.get(s.classroomId) ?? null) : null;
      const classLabel = buildClassLabel(cls);

      const billed = inv.totalBilledPesewas ?? 0;
      const waived = inv.totalWaivedPesewas ?? 0;

      const pay = payMap.get(inv.id) ?? { totalPaid: 0, lastPaidAt: null };
      const balance = billed - waived - pay.totalPaid;

      return {
        invoiceId: inv.id,
        studentId: inv.studentId,
        studentName,
        classLabel,
        term: inv.term ?? "",
        academicYear: inv.academicYear ?? "",
        amountBilledPesewas: billed,
        totalPaidPesewas: pay.totalPaid,
        balancePesewas: balance,
        lastPaymentAt: pay.lastPaidAt ? pay.lastPaidAt.toISOString() : null,
      };
    });

    return jsonNoStore({ ok: true, items }, 200);
  } catch (err) {
    console.error("[ADMIN_FEE_INVOICES_LIST_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load fee invoices. Please try again." }, 500);
  }
}
