// src/app/api/fees/notify-arrears/simulate/route.ts
import { NextResponse } from "next/server";

type ArrearsItem = {
  invoiceId?: string;
  studentName?: string;
  guardianPhone?: string | null;
  amountDue?: number;
  className?: string | null;
  term?: string | null;
  dueDate?: string | null;
};

type NotifySimulateRequestBody = {
  tenantId?: string;
  arrears?: ArrearsItem[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as NotifySimulateRequestBody;

    const tenantId = (body.tenantId || "").trim();
    const arrears = Array.isArray(body.arrears) ? body.arrears : [];

    if (!tenantId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "tenantId is required to simulate arrears notifications. Please reload and try again.",
        },
        { status: 400 }
      );
    }

    if (!arrears.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "Payload must include a non-empty 'arrears' array.",
        },
        { status: 400 }
      );
    }

    const withPhone = arrears.filter(
      (a) => a.guardianPhone && a.guardianPhone.trim().length > 0
    );

    return NextResponse.json({
      ok: true,
      tenantId,
      total: withPhone.length,
      skippedNoPhone: arrears.length - withPhone.length,
      // No SMS is sent from this route. It is pure simulation.
    });
  } catch (err: any) {
    console.error("[FEES_NOTIFY_SIMULATE_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Internal error during simulation. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
