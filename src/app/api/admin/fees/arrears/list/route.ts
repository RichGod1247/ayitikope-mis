// src/app/api/admin/fees/arrears/list/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type ArrearsItem = {
  studentId?: string;
  studentName: string;
  guardianPhone: string;
  className?: string;
  term?: string;
  amountDue?: number;
  dueDate?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId");

  // 🔒 Guard: require tenantId (even though this is admin-only)
  if (!tenantId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing tenantId. Cannot load arrears.",
      },
      { status: 400 }
    );
  }

  // ✅ Read from real FeesInvoice table
  let invoices: any[] = [];
  try {
    invoices = (await (prisma as any).feesInvoice.findMany({
      where: {
        tenantId,
        isPaid: false,
        // amountDue > 0 — we'll filter defensively in JS as well
      },
      orderBy: {
        dueDate: "asc",
      },
      take: 500, // safety cap
    })) as any[];
  } catch (err) {
    console.error("[FEES_ARREARS_LIST_DB_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Internal error loading arrears from database. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }

  // Map DB rows → safe API shape
  const items: ArrearsItem[] = invoices
    .filter((inv) => {
      // defensive filter: amountDue > 0
      const amtRaw = inv.amountDue;
      const amt =
        typeof amtRaw === "number"
          ? amtRaw
          : amtRaw?.toNumber
          ? amtRaw.toNumber()
          : Number(amtRaw ?? 0);
      return !Number.isNaN(amt) && amt > 0;
    })
    .map((inv) => {
      const amtRaw = inv.amountDue;
      const amountDue =
        typeof amtRaw === "number"
          ? amtRaw
          : amtRaw?.toNumber
          ? amtRaw.toNumber()
          : Number(amtRaw ?? 0);

      return {
        studentId: inv.studentId ?? undefined,
        studentName: inv.studentName,
        guardianPhone: inv.guardianPhone,
        className: inv.className ?? undefined,
        term: inv.term ?? undefined,
        amountDue,
        dueDate: inv.dueDate
          ? new Date(inv.dueDate).toISOString().slice(0, 10)
          : undefined,
      };
    });

  console.log(
    "[FEES_ARREARS_LIST_API_REAL] tenantId=%s returning %d invoice(s)",
    tenantId,
    items.length
  );

  return NextResponse.json({
    ok: true,
    tenantId,
    count: items.length,
    items,
  });
}
