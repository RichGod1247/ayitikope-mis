// src/app/api/parent/attendance/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession } from "@/lib/parentSession";
import { StudentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function clampInt(v: string | null, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export async function GET(req: NextRequest) {
  const auth = requireParentSession(req);
  if (!auth.ok) return auth.res;

  const { tenantId, guardianPhoneE164, guardianSuffix9 } = auth.session;

  const url = new URL(req.url);
  const studentId = String(url.searchParams.get("studentId") ?? "").trim();
  const days = clampInt(url.searchParams.get("days"), 1, 365, 60);

  if (!studentId) return noStoreJson(400, { ok: false, error: "studentId is required." });

  // 1) Load student (tenant boundary) + verify ownership by guardian phone
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId, status: StudentStatus.ACTIVE },
    select: { id: true, guardianPhone: true, guardianPhoneNorm: true },
  });

  if (!student) return noStoreJson(404, { ok: false, error: "STUDENT_NOT_FOUND" });

  const owned =
    (guardianPhoneE164 && student.guardianPhoneNorm === guardianPhoneE164) ||
    (guardianSuffix9 &&
      (student.guardianPhoneNorm?.endsWith(guardianSuffix9) ||
        student.guardianPhone?.endsWith(guardianSuffix9))) ||
    false;

  if (!owned) return noStoreJson(403, { ok: false, error: "FORBIDDEN_GUARDIAN_MISMATCH" });

  // 2) Window
  const now = new Date();
  const windowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // 3) Marks
  let marks: { sessionId: string; status: string }[] = [];
  try {
    marks = await (prisma as any).attendanceMark.findMany({
      where: {
        studentId,
        session: { tenantId, date: { gte: windowStart } },
      },
      select: { sessionId: true, status: true },
    });
  } catch (e) {
    // If attendance models not present/renamed, fail soft but honest
    console.error("[PARENT_ATTENDANCE_SUMMARY_QUERY_ERROR]", e);
    return noStoreJson(200, {
      ok: true,
      studentId,
      days,
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
      summary: {
        totalSessions: 0,
        daysPresent: 0,
        daysAbsent: 0,
        daysLate: 0,
        daysExcused: 0,
        attendanceRate: null as number | null,
        note: "Attendance models are not available or query failed. Summary is 0 for now.",
      },
    });
  }

  const sessionIds = new Set<string>();
  let daysPresent = 0;
  let daysAbsent = 0;
  let daysLate = 0;
  let daysExcused = 0;

  for (const m of marks) {
    if (m.sessionId) sessionIds.add(String(m.sessionId));
    switch (String(m.status)) {
      case "PRESENT":
        daysPresent++;
        break;
      case "ABSENT":
        daysAbsent++;
        break;
      case "LATE":
        daysLate++;
        break;
      case "EXCUSED":
        daysExcused++;
        break;
      default:
        break;
    }
  }

  const totalSessions = sessionIds.size || marks.length;
  const attendanceRate =
    totalSessions > 0 ? Number((((daysPresent + daysExcused) / totalSessions) * 100).toFixed(1)) : null;

  return noStoreJson(200, {
    ok: true,
    studentId,
    days,
    windowStart: windowStart.toISOString(),
    windowEnd: now.toISOString(),
    summary: {
      totalSessions,
      daysPresent,
      daysAbsent,
      daysLate,
      daysExcused,
      attendanceRate,
      note: "Attendance rate counts PRESENT + EXCUSED as attended.",
    },
  });
}