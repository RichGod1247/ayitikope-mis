// src/app/api/admin/sms/attendance-demo/route.ts

import { NextResponse } from "next/server";
import { sendViaHubtel, BrandName } from "@/lib/sms/hubtel";

type AttendanceStudent = {
  name: string;
  guardianPhone: string;
};

type Mode = "demo"; // reserved for future (e.g. "live")

type RequestBody = {
  date?: string; // e.g. "2025-11-14" or any readable string
  className?: string;
  brand?: string;
  students?: AttendanceStudent[];
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
  dateLabel: string;
}) {
  const { studentName, className, dateLabel } = opts;
  return `[EduLife OS] Attendance alert: ${studentName} was ABSENT today in ${className} on ${dateLabel}. If this is unexpected, kindly contact Ayitikope M/A Basic School.`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;

    const className = (body.className ?? "JHS 1").trim();
    const rawDate = body.date ?? new Date().toISOString().slice(0, 10);
    const dateLabel = rawDate; // keep simple for now

    const brand = resolveBrand(body.brand);

    let students: AttendanceStudent[] =
      body.students && Array.isArray(body.students) && body.students.length > 0
        ? body.students
        : [];

    // If none provided, fall back to a single demo student to your TEST_SMS_TO
    if (students.length === 0) {
      const fallbackTo = process.env.TEST_SMS_TO ?? "";
      students = [
        {
          name: "Demo Student 1",
          guardianPhone: fallbackTo,
        },
      ];
    }

    if (!students.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No students provided and TEST_SMS_TO is not configured. Cannot send attendance alerts.",
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

      if (!phone) {
        results.push({
          student: s.name,
          to: "",
          ok: false,
          error: "Missing guardian phone number.",
        });
        continue;
      }

      const message = buildMessage({
        studentName: s.name,
        className,
        dateLabel,
      });

      try {
        const res = await sendViaHubtel({
          to: phone,
          body: message,
          brand,
          meta: {
            purpose: "attendance-alert-demo",
            className,
            date: dateLabel,
            studentName: s.name,
          },
        });

        results.push({
          student: s.name,
          to: res.to,
          ok: true,
        });
        successCount += 1;
      } catch (err: any) {
        console.error("[SMS_ATTENDANCE_DEMO_ERROR]", s.name, err);
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
      date: dateLabel,
      count: students.length,
      successCount,
      results,
    });
  } catch (err: any) {
    console.error("[SMS_ATTENDANCE_DEMO_FATAL]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ??
          "Unexpected error while sending attendance demo SMS alerts.",
      },
      { status: 500 }
    );
  }
}
