// src/app/api/admin/fees/arrears/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, RefundStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ArrearsRow = {
  invoiceId: string;
  studentName: string;
  guardianPhone: string | null;
  amountDue: number; // cedis, kept for current SMS reminder compatibility
  grossPaid: number; // cedis
  succeededRefunds: number; // cedis
  pendingRefunds: number; // cedis
  netPaid: number; // cedis
  className: string | null;
  term: string | null;
  academicYear: string | null;
  dueDate: string | null;
};

function jsonNoStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
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

// Legacy compatibility: old ADMIN behaves as SCHOOL_ADMIN.
function effectiveRole(role: unknown) {
  const r = normalizeRoleName(role);
  return r === "ADMIN" ? "SCHOOL_ADMIN" : r;
}

function isAdminLike(role: unknown) {
  const r = effectiveRole(role);
  return (
    r === "SCHOOL_ADMIN" ||
    r === "HEADTEACHER" ||
    r === "SUPERADMIN" ||
    r.includes("HEAD") ||
    r.includes("OWNER") ||
    r.includes("SUPER")
  );
}

async function requireAdminLike(tenantId: string, userId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: {
      status: true,
      role: { select: { name: true } },
    },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false as const, status: 403, error: "FORBIDDEN" };
  }

  if (!isAdminLike(membership.role?.name ?? "")) {
    return { ok: false as const, status: 403, error: "FORBIDDEN" };
  }

  return { ok: true as const };
}

function cedisFromPesewas(pesewas: number) {
  return Number((Math.max(0, Math.floor(pesewas || 0)) / 100).toFixed(2));
}

function buildClassLabel(
  classroom:
    | { name?: string | null; grade?: string | null; arm?: string | null }
    | null
    | undefined
) {
  if (!classroom) return null;
  if (classroom.name?.trim()) return classroom.name.trim();

  const parts = [classroom.grade, classroom.arm]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  return parts.length ? parts.join(" ") : null;
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Unknown learner";
}

export async function GET(req: NextRequest) {
  let ctx: { tenantId: string; userId: string };

  try {
    const safe = await requireServerUserContext({ requireTenant: true });
    ctx = { tenantId: safe.tenantId, userId: safe.userId };
  } catch {
    return jsonNoStore(401, { ok: false, error: "UNAUTHORIZED" });
  }

  const roleGate = await requireAdminLike(ctx.tenantId, ctx.userId);
  if (!roleGate.ok) {
    return jsonNoStore(roleGate.status, { ok: false, error: roleGate.error });
  }

  const url = new URL(req.url);

  // Backward compatibility only: client may send tenantId, but it cannot override session tenant.
  const tenantGuard = assertNoTenantOverride(
    url.searchParams.get("tenantId"),
    ctx.tenantId
  );

  if (!tenantGuard.ok) {
    return jsonNoStore(tenantGuard.status, {
      ok: false,
      error: tenantGuard.error,
    });
  }

  const term = url.searchParams.get("term")?.trim() || null;
  const academicYear = url.searchParams.get("academicYear")?.trim() || null;
  const classroomId = url.searchParams.get("classroomId")?.trim() || null;

  try {
    let studentIdsInClass: string[] | null = null;

    if (classroomId) {
      const scopedStudents = await prisma.student.findMany({
        where: {
          tenantId: ctx.tenantId,
          classroomId,
          status: "ACTIVE",
        },
        select: { id: true },
        take: 6000,
      });

      studentIdsInClass = scopedStudents.map((s) => s.id);

      if (studentIdsInClass.length === 0) {
        return jsonNoStore(200, {
          ok: true,
          source: "db",
          tenantId: ctx.tenantId,
          count: 0,
          items: [] satisfies ArrearsRow[],
        });
      }
    }

    const invoiceWhere: Prisma.FeeInvoiceWhereInput = {
      tenantId: ctx.tenantId,
      status: { notIn: ["CANCELLED", "WRITTEN_OFF"] },
      ...(term ? { term } : {}),
      ...(academicYear ? { academicYear } : {}),
      ...(studentIdsInClass ? { studentId: { in: studentIdsInClass } } : {}),
    };

    const invoices = await prisma.feeInvoice.findMany({
      where: invoiceWhere,
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      take: 1200,
      select: {
        id: true,
        studentId: true,
        term: true,
        academicYear: true,
        dueDate: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
      },
    });

    if (invoices.length === 0) {
      return jsonNoStore(200, {
        ok: true,
        source: "db",
        tenantId: ctx.tenantId,
        count: 0,
        items: [] satisfies ArrearsRow[],
      });
    }

    const invoiceIds = invoices.map((invoice) => invoice.id);

    const payments = await prisma.feePayment.findMany({
      where: {
        tenantId: ctx.tenantId,
        invoiceId: { in: invoiceIds },
        status: PaymentStatus.SUCCESS,
      },
      select: {
        id: true,
        invoiceId: true,
        amountPesewas: true,
      },
      take: 10000,
    });

    const grossPaidByInvoice = new Map<string, number>();
    const paymentIdToInvoiceId = new Map<string, string>();

    for (const payment of payments) {
      paymentIdToInvoiceId.set(payment.id, payment.invoiceId);
      grossPaidByInvoice.set(
        payment.invoiceId,
        (grossPaidByInvoice.get(payment.invoiceId) ?? 0) +
          (payment.amountPesewas ?? 0)
      );
    }

    const paymentIds = payments.map((payment) => payment.id);

    const succeededRefundByInvoice = new Map<string, number>();
    const pendingRefundByInvoice = new Map<string, number>();

    if (paymentIds.length > 0) {
      const refunds = await prisma.feeRefund.findMany({
        where: {
          tenantId: ctx.tenantId,
          feePaymentId: { in: paymentIds },
          status: {
            in: [
              RefundStatus.REQUESTED,
              RefundStatus.APPROVED,
              RefundStatus.PROCESSING,
              RefundStatus.SUCCEEDED,
            ],
          },
        },
        select: {
          feePaymentId: true,
          status: true,
          amountPesewas: true,
        },
        take: 10000,
      });

      for (const refund of refunds) {
        const invoiceId = paymentIdToInvoiceId.get(refund.feePaymentId);
        if (!invoiceId) continue;

        if (refund.status === RefundStatus.SUCCEEDED) {
          succeededRefundByInvoice.set(
            invoiceId,
            (succeededRefundByInvoice.get(invoiceId) ?? 0) +
              (refund.amountPesewas ?? 0)
          );
        } else {
          pendingRefundByInvoice.set(
            invoiceId,
            (pendingRefundByInvoice.get(invoiceId) ?? 0) +
              (refund.amountPesewas ?? 0)
          );
        }
      }
    }

    const studentIds = Array.from(
      new Set(
        invoices
          .map((invoice) => invoice.studentId)
          .filter((id): id is string => Boolean(id))
      )
    );

    const students = await prisma.student.findMany({
      where: {
        tenantId: ctx.tenantId,
        id: { in: studentIds },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianPhone: true,
        guardianPhoneNorm: true,
        classroomId: true,
      },
      take: 8000,
    });

    const studentMap = new Map<string, (typeof students)[number]>();
    for (const student of students) studentMap.set(student.id, student);

    const classroomIds = Array.from(
      new Set(
        students
          .map((student) => student.classroomId)
          .filter((id): id is string => Boolean(id))
      )
    );

    const classrooms = classroomIds.length
      ? await prisma.classroom.findMany({
          where: {
            tenantId: ctx.tenantId,
            id: { in: classroomIds },
          },
          select: {
            id: true,
            name: true,
            grade: true,
            arm: true,
          },
          take: 4000,
        })
      : [];

    const classroomMap = new Map<string, (typeof classrooms)[number]>();
    for (const classroom of classrooms) classroomMap.set(classroom.id, classroom);

    const items: ArrearsRow[] = [];

    for (const invoice of invoices) {
      const billedPesewas = invoice.totalBilledPesewas ?? 0;
      const waivedPesewas = invoice.totalWaivedPesewas ?? 0;
      const netDuePesewas = Math.max(0, billedPesewas - waivedPesewas);

      const grossPaidPesewas = grossPaidByInvoice.get(invoice.id) ?? 0;
      const succeededRefundPesewas = succeededRefundByInvoice.get(invoice.id) ?? 0;
      const pendingRefundPesewas = pendingRefundByInvoice.get(invoice.id) ?? 0;
      const netPaidPesewas = Math.max(0, grossPaidPesewas - succeededRefundPesewas);
      const balancePesewas = Math.max(0, netDuePesewas - netPaidPesewas);

      if (balancePesewas <= 0) continue;

      const student = invoice.studentId ? studentMap.get(invoice.studentId) : null;
      const classroom = student?.classroomId
        ? classroomMap.get(student.classroomId) ?? null
        : null;

      items.push({
        invoiceId: invoice.id,
        studentName: student
          ? fullName(student.firstName, student.lastName)
          : "Unknown learner",
        guardianPhone:
          student?.guardianPhoneNorm || student?.guardianPhone || null,
        amountDue: cedisFromPesewas(balancePesewas),
        grossPaid: cedisFromPesewas(grossPaidPesewas),
        succeededRefunds: cedisFromPesewas(succeededRefundPesewas),
        pendingRefunds: cedisFromPesewas(pendingRefundPesewas),
        netPaid: cedisFromPesewas(netPaidPesewas),
        className: buildClassLabel(classroom),
        term: invoice.term ?? null,
        academicYear: invoice.academicYear ?? null,
        dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
      });
    }

    items.sort((a, b) => b.amountDue - a.amountDue);

    return jsonNoStore(200, {
      ok: true,
      source: "db",
      tenantId: ctx.tenantId,
      count: items.length,
      formula:
        "arrears = billed - waived - (successful payments - succeeded refunds)",
      items,
    });
  } catch (err) {
    console.error("[ADMIN_FEES_ARREARS_LIST_ERROR]", err);

    return jsonNoStore(500, {
      ok: false,
      error: "FAILED_TO_LOAD_ARREARS",
    });
  }
}