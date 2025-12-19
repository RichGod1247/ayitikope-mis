// src/app/api/parent/sms/summary/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Parent SMS Summary (Placeholder for Phase 7)
 *
 * GET /api/parent/sms/summary?guardianPhone=...&studentId=...
 *
 * Jason rules:
 *  - Always returns JSON: { ok:boolean, ... }
 *  - 400 if guardianPhone missing
 *  - 200 + ok:true on success
 *
 * IMPORTANT:
 *  This implementation does NOT hit the database yet.
 *  In a later phase we will connect this to:
 *    - SmsLog
 *    - SMSSendAudit
 *  and filter by guardianPhone (+ optionally studentId, term, academicYear).
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const guardianPhone = searchParams.get("guardianPhone") || "";
    const studentId = searchParams.get("studentId") || null;

    if (!guardianPhone.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "guardianPhone is required.",
        },
        { status: 400 }
      );
    }

    // PLACEHOLDER DEMO MESSAGES
    // These are static / generated examples to prove the API + UI
    // wiring. Later, we will replace with real SmsLog queries.
    const now = new Date();
    const isoNow = now.toISOString();

    const messages = [
      {
        id: "demo-1",
        sentAt: isoNow,
        direction: "OUTBOUND" as const,
        channel: "Hubtel (demo)",
        status: "SENT",
        category: "FEES",
        textPreview:
          "Fees reminder: kindly note your child’s fees balance for the term. (Demo only)",
      },
      {
        id: "demo-2",
        sentAt: isoNow,
        direction: "OUTBOUND" as const,
        channel: "Hubtel (demo)",
        status: "DELIVERED",
        category: "HEALTH",
        textPreview:
          "Health update: your child’s temperature was checked at school today. (Demo only)",
      },
    ];

    return NextResponse.json(
      {
        ok: true,
        guardianPhone,
        studentId,
        messages,
        note:
          "This SMS list is currently a demo placeholder. In a later EduLife OS phase it will show real messages from SmsLog and SMSSendAudit.",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[PARENT_SMS_SUMMARY_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load SMS summary for this guardian. Please try again.",
      },
      { status: 500 }
    );
  }
}
