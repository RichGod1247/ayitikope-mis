// src/app/api/admin/fees/arrears/list/route.ts
import { NextResponse } from "next/server";

type ArrearsItem = {
  studentId?: string;
  studentName: string;
  guardianPhone: string;
  className?: string;
  term?: string;
  amountDue?: string | number;
  dueDate?: string;
};

/**
 * For now this endpoint returns safe, sample arrears data from the server.
 * In a later sprint, we'll replace the sample block with a Prisma/SQL query
 * that fetches REAL invoice data for the given tenantId.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId");

  // 🔒 Guard: require tenantId (even though we don't use it yet)
  if (!tenantId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing tenantId. Cannot load arrears.",
      },
      { status: 400 }
    );
  }

  // ✅ Sample arrears data (server-side)
  const items: ArrearsItem[] = [
    {
      studentId: "stu-1",
      studentName: "Test Student One",
      guardianPhone: "0242914353",
      className: "JHS 1",
      term: "3rd Term 2025",
      amountDue: 150,
      dueDate: "30/11/2025",
    },
    {
      studentId: "stu-2",
      studentName: "Test Student Two",
      guardianPhone: "0242914353",
      className: "JHS 2",
      term: "3rd Term 2025",
      amountDue: 120,
      dueDate: "30/11/2025",
    },
  ];

  // 📝 Later we’ll replace this block with something like:
  // const items = await prisma.$queryRaw<ArrearsItem[]>`SELECT ... WHERE tenant_id = ${tenantId} AND amount_due > 0`;

  return NextResponse.json({
    ok: true,
    tenantId,
    count: items.length,
    items,
  });
}
