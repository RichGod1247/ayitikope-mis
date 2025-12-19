// src/app/api/admin/sms/fees-demo/route.ts

import { NextResponse } from "next/server";
import { sendViaHubtel, BrandName } from "@/lib/sms/hubtel";

type FeeStudent = {
  name: string;
  guardianPhone: string;
  amount: string; // keep as string for flexibility, e.g. "150" or "150.50"
};

type Mode = "demo";

type RequestBody = {
  termOrPeriod?: string; // e.g. "3rd Term 2025"
  className?: string;
  brand?: string;
  students?: FeeStudent[];
  mode?: Mode;
};

function resolveBrand(input?: string): string {
  if (!input) return "AYITIADMIN";
  const upper = input.toUpperCase();
  if (BrandName.includes(upper as (typeof BrandName)[number])) {
    return upper;
  }
  return "AYITIADMIN";
}

function buildMessage(opts: {
  studentName: string;
  className: string;
  termOrPeriod: string;
  amount: string;
}) {
  const { studentName, className, termOrPeriod, amount } = opts;
  return `[EduLife OS] Fees reminder: Dear parent/guardian, fees for ${studentName} (${className}) for ${termOrPeriod} is outstanding. Amount due: GHS ${amount}. Kindly settle payment at Ayitikope M/A Basic School. Thank you.`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;

    const className = (body.className ?? "JHS 1").trim();
    const termOrPeriod = (body.termOrPeriod ?? "Current Term").trim();
    const brand = resolveBrand(body.brand);

    let students: FeeStudent[] =
      body.students && Array.isArray(body.students) && body.students.length > 0
        ? body.students
        : [];

    // Fallback: if no students provided, send a single demo SMS to TEST_SMS_TO
    if (students.length === 0) {
      const fallbackTo = process.env.TEST_SMS_TO ?? "";
      students = [
        {
          name: "Demo Student (Fees)",
          guardianPhone: fallbackTo,
          amount: "100.00",
        },
      ];
    }

    if (!students.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No students provided and TEST_SMS_TO is not configured. Cannot send fees reminders.",
        },
        { status: 400 }
      );
    }

    const results: {
      student: string;
      to: string;
      ok: boolean;
      error?: string;
    }[] = [];

    let successCount = 0;

    for (const s of students) {
      const phone = (s.guardianPhone ?? "").trim();
      const amount = (s.amount ?? "").trim();

      if (!phone) {
        results.push({
          student: s.name,
          to: "",
          ok: false,
          error: "Missing guardian phone number.",
        });
        continue;
      }

      if (!amount) {
        results.push({
          student: s.name,
          to: phone,
          ok: false,
          error: "Missing amount for this student.",
        });
        continue;
      }

      const message = buildMessage({
        studentName: s.name,
        className,
        termOrPeriod,
        amount,
      });

      try {
        const res = await sendViaHubtel({
          to: phone,
          body: message,
          brand,
          meta: {
            purpose: "fees-reminder-demo",
            className,
            termOrPeriod,
            studentName: s.name,
            amount,
          },
        });

        results.push({
          student: s.name,
          to: res.to,
          ok: true,
        });
        successCount += 1;
      } catch (err: any) {
        console.error("[SMS_FEES_DEMO_ERROR]", s.name, err);
        results.push({
          student: s.name,
          to: phone,
          ok: false,
          error: err?.message ?? "Unknown SMS send error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "demo" as Mode,
      brand,
      className,
      termOrPeriod,
      count: students.length,
      successCount,
      results,
    });
  } catch (err: any) {
    console.error("[SMS_FEES_DEMO_FATAL]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ??
          "Unexpected error while sending fees reminder demo SMS alerts.",
      },
      { status: 500 }
    );
  }
}
