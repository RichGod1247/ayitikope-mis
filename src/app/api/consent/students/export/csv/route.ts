// src/app/api/consent/students/export/csv/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function dateOnly(d?: Date | null): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SUPERADMIN", "SCHOOL_ADMIN", "HEADTEACHER", "ADMIN"],
  });
  if (!gate.ok) return gate.res;
  const ctx = gate.ctx;

  const { searchParams } = new URL(req.url);

  // Optional filter
  const classroomId = (searchParams.get("classroomId") ?? "").trim() || null;

  // Legacy/back-compat tenantId param: allowed ONLY if matches session tenant
  const suppliedTenantId = (searchParams.get("tenantId") ?? "").trim();
  if (suppliedTenantId && suppliedTenantId !== ctx.tenantId) {
    return new Response(JSON.stringify({ ok: false, error: "FORBIDDEN_TENANT_MISMATCH" }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const students = await prisma.student.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(classroomId ? { classroomId } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      healthConsentAt: true,
      guardianSmsOptIn: true,
      note: true,
      createdAt: true,
      updatedAt: true,
      classroom: { select: { name: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const headers = [
    "studentId",
    "firstName",
    "lastName",
    "classroom",
    "guardianName",
    "guardianPhone",
    "healthConsentAt",
    "guardianSmsOptIn",
    "note",
    "createdAt",
    "updatedAt",
  ];

  const rows = students.map((s) => [
    csvEscape(s.id),
    csvEscape(s.firstName ?? ""),
    csvEscape(s.lastName ?? ""),
    csvEscape(s.classroom?.name ?? ""),
    csvEscape(s.guardianName ?? ""),
    csvEscape(s.guardianPhone ?? ""),
    csvEscape(dateOnly(s.healthConsentAt)),
    csvEscape(s.guardianSmsOptIn ? "True" : "False"),
    csvEscape(s.note ?? ""),
    csvEscape(dateOnly(s.createdAt)),
    csvEscape(dateOnly(s.updatedAt)),
  ]);

  // Excel-friendly: BOM + CRLF
  const csv =
    "\ufeff" + headers.map(csvEscape).join(",") + "\r\n" + rows.map((r) => r.join(",")).join("\r\n");

  const fname = `students-consent-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fname}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
