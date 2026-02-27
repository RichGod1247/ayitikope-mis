//src/app/api/admin/fees/arrears/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ArrearsRow = {
  invoiceId: string;
  studentName: string;
  guardianPhone: string | null;
  amountDue: number; // cedis
  className?: string | null;
  term?: string | null;
  dueDate?: string | null; // reserved for future
};

function jsonNoStore(payload: any, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(headers ?? {}),
    },
  });
}

function normalizeRoleName(role: unknown) {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z_]/g, "");
}

// Legacy compat: treat ADMIN as SCHOOL_ADMIN.
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

function cedisFromPesewas(pesewas: number) {
  return Math.round(Number(pesewas) || 0) / 100;
}

function buildClassLabel(
  cls: { name?: string | null; grade?: string | null; arm?: string | null } | null | undefined
) {
  if (!cls) return null;
  if (cls.name) return cls.name;
  const parts = [cls.grade, cls.arm].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

export async function GET(req: NextRequest) {
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

  // Back-compat: if tenantId is sent, it must match session tenant
  const guard = assertNoTenantOverride(url.searchParams.get("tenantId"), ctx.tenantId);
  if (!guard.ok) return jsonNoStore({ ok: false, error: guard.error }, guard.status);

  const term = (url.searchParams.get("term") ?? "").trim() || null;
  const academicYear = (url.searchParams.get("academicYear") ?? "").trim() || null;
  const classroomId = (url.searchParams.get("classroomId") ?? "").trim() || null;

  try {
    // Optional classroom filter → student ids
    let studentIdsInClass: string[] | null = null;

    if (classroomId) {
      const ss = await prisma.student.findMany({
        where: { tenantId: ctx.tenantId, classroomId },
        select: { id: true },
        take: 6000,
      });

      const ids = ss.map((s) => s.id).filter((id): id is string => typeof id === "string" && id.length > 0);
      if (ids.length === 0) {
        return jsonNoStore({ ok: true, source: "db", tenantId: ctx.tenantId, count: 0, items: [] }, 200);
      }
      studentIdsInClass = ids;
    }

    const invoiceWhere: Prisma.FeeInvoiceWhereInput = { tenantId: ctx.tenantId };
    if (term) invoiceWhere.term = term;
    if (academicYear) invoiceWhere.academicYear = academicYear;
    if (studentIdsInClass) invoiceWhere.studentId = { in: studentIdsInClass };

    const invoices = await prisma.feeInvoice.findMany({
      where: invoiceWhere,
      orderBy: { createdAt: "desc" },
      take: 1200,
      select: {
        id: true,
        studentId: true,
        term: true,
        academicYear: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
      },
    });

    if (invoices.length === 0) {
      return jsonNoStore({ ok: true, source: "db", tenantId: ctx.tenantId, count: 0, items: [] }, 200);
    }

    const invoiceIds = invoices.map((i) => i.id);

    // Sum payments by invoice
    const paymentAgg = await prisma.feePayment.groupBy({
      by: ["invoiceId"],
      where: { tenantId: ctx.tenantId, invoiceId: { in: invoiceIds } },
      _sum: { amountPesewas: true },
    });

    const paidByInvoice = new Map<string, number>();
    for (const row of paymentAgg) paidByInvoice.set(row.invoiceId, row._sum.amountPesewas ?? 0);

    const studentIds = Array.from(new Set(invoices.map((i) => i.studentId).filter((id): id is string => !!id)));

    const students = await prisma.student.findMany({
      where: { tenantId: ctx.tenantId, id: { in: studentIds } },
      select: { id: true, firstName: true, lastName: true, guardianPhone: true, classroomId: true },
      take: 8000,
    });

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
          where: { tenantId: ctx.tenantId, id: { in: classroomIds } },
          select: { id: true, name: true, grade: true, arm: true },
          take: 4000,
        })
      : [];

    const classroomMap = new Map<string, (typeof classrooms)[number]>();
    for (const c of classrooms) classroomMap.set(c.id, c);

    const items: ArrearsRow[] = [];

    for (const inv of invoices) {
      const billed = inv.totalBilledPesewas ?? 0;
      const waived = inv.totalWaivedPesewas ?? 0;
      const paid = paidByInvoice.get(inv.id) ?? 0;

      const balancePesewas = billed - waived - paid;
      if (balancePesewas <= 0) continue;

      const s = inv.studentId ? studentMap.get(inv.studentId) : null;
      const studentName = s
        ? ([s.firstName, s.lastName].filter(Boolean).join(" ").trim() || "Unknown learner")
        : "Unknown learner";

      const cls = s?.classroomId ? (classroomMap.get(s.classroomId) ?? null) : null;

      items.push({
        invoiceId: inv.id,
        studentName,
        guardianPhone: s?.guardianPhone ?? null,
        amountDue: cedisFromPesewas(balancePesewas),
        className: buildClassLabel(cls),
        term: inv.term ?? null,
        dueDate: null,
      });
    }

    items.sort((a, b) => (b.amountDue ?? 0) - (a.amountDue ?? 0));

    return jsonNoStore({ ok: true, source: "db", tenantId: ctx.tenantId, count: items.length, items }, 200);
  } catch (err) {
    console.error("[ADMIN_FEES_ARREARS_LIST_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load arrears. Please try again." }, 500);
  }
}
