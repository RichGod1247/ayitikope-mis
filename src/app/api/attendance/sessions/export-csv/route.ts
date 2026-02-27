// src/app/api/attendance/sessions/export-csv/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function isISODateOnly(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function dateOnlyUTCFromISO(dateISO: string) {
  return new Date(Date.UTC(Number(dateISO.slice(0, 4)), Number(dateISO.slice(5, 7)) - 1, Number(dateISO.slice(8, 10))));
}

// GET /api/attendance/sessions/export-csv?tenantId=...&classroomId=...&date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(req.url);

  const tenantIdParam = String(searchParams.get("tenantId") || "").trim(); // back-compat only
  if (tenantIdParam && tenantIdParam !== auth.ctx.tenantId) {
    return json(403, { ok: false, error: "FORBIDDEN_TENANT_MISMATCH" });
  }

  const classroomId = String(searchParams.get("classroomId") || "").trim();
  const date = String(searchParams.get("date") || "").trim() || new Date().toISOString().slice(0, 10);

  if (!classroomId) return json(400, { ok: false, error: "classroomId is required" });
  if (!isISODateOnly(date)) return json(400, { ok: false, error: "date must be YYYY-MM-DD" });

  // Verify classroom exists in tenant
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, tenantId: auth.ctx.tenantId },
    select: { id: true, name: true, grade: true, arm: true },
  });
  if (!classroom) return json(404, { ok: false, error: "CLASSROOM_NOT_FOUND" });

  // Teacher access gate
  await assertCanAccessClassroom({ userId: auth.ctx.userId, tenantId: auth.ctx.tenantId, classroomId });

  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.ctx.tenantId },
    select: { name: true },
  });

  const session = await prisma.attendanceSession.findFirst({
    where: { tenantId: auth.ctx.tenantId, classroomId, date: dateOnlyUTCFromISO(date) },
    select: { id: true, isClosed: true, certifiedAt: true },
  });

  if (!session) return json(404, { ok: false, error: "SESSION_NOT_FOUND" });

  const students = await prisma.student.findMany({
    where: { tenantId: auth.ctx.tenantId, classroomId },
    select: { id: true, lastName: true, firstName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const marks = await prisma.attendanceMark.findMany({
    where: { sessionId: session.id },
    select: { studentId: true, status: true, note: true },
  });

  const markByStudent = new Map<string, { status: string; note: string }>();
  for (const m of marks as any[]) {
    markByStudent.set(String(m.studentId), {
      status: m.status ? String(m.status) : "",
      note: m.note ? String(m.note) : "",
    });
  }

  const tenantName = tenant?.name ?? "";
  const baseLabel = String(classroom.grade ?? classroom.name ?? "").trim();
  const arm = String(classroom.arm ?? "").trim();
  const classLabel = baseLabel ? (arm ? `${baseLabel} ${arm}` : baseLabel) : arm;

  const statusLabel = session.certifiedAt ? "CLOSED & CERTIFIED" : session.isClosed ? "CLOSED" : "OPEN";

  const esc = (v: any) => {
    const s = (v ?? "").toString();
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const headerLines = [
    `School,${esc(tenantName)}`,
    `Class,${esc(classLabel)}`,
    `Date,${esc(date)}`,
    `Status,${esc(statusLabel)}`,
    ``,
  ];

  const tableHeader = ["StudentID", "LastName", "FirstName", "Status", "Note"].map(esc).join(",");

  const tableRows = students.map((st) => {
    const mk = markByStudent.get(st.id);
    return [st.id, st.lastName ?? "", st.firstName ?? "", mk?.status ?? "", mk?.note ?? ""].map(esc).join(",");
  });

  const csv = [...headerLines, tableHeader, ...tableRows].join("\r\n");
  const filename = `attendance_${(classLabel || "class").replace(/\s+/g, "_")}_${date}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
