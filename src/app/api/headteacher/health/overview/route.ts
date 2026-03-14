// src/app/api/headteacher/health/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_FEVER_THRESHOLD_C = 37.8;
const ALLOWED_ROLES = new Set(["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"]);

type ClassroomSummary = {
  classroomId: string | null;
  classroomName: string;
  totalRecords: number;
  feverCount: number;
  maxTemp: number | null;
};

type SampleRow = {
  studentName: string;
  classroomName: string;
  temperatureC: number | null;
  symptoms: string | null;
  notes: string | null;
  isFever: boolean;
};

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanStr(v: unknown): string {
  return String(v ?? "").trim();
}

function isIsoDateOnly(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function utcDateOnlyFromIso(iso: string): Date {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function roleUpper(v: unknown): string {
  return effectiveRole(v).trim().toUpperCase();
}

function decimalToNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object" && v && typeof (v as any).toNumber === "function") {
    const n = (v as any).toNumber();
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  }
  const n = Number(v as any);
  return Number.isFinite(n) ? n : null;
}

function displayStudentName(firstName?: string | null, lastName?: string | null): string {
  const name = [cleanStr(firstName), cleanStr(lastName)].filter(Boolean).join(" ").trim();
  return name || "Learner";
}

function displayClassroomName(
  classroomName?: string | null,
  grade?: string | null,
  arm?: string | null
): string {
  const direct = cleanStr(classroomName);
  if (direct) return direct;

  const gradePart = cleanStr(grade);
  const armPart = cleanStr(arm);
  const merged = [gradePart, armPart].filter(Boolean).join(" ").trim();

  return merged || "Unassigned class";
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const ctx = auth.ctx;

  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
      },
    },
    select: {
      status: true,
      role: { select: { name: true } },
    },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const roleName = roleUpper(membership.role?.name ?? ctx.roleName);
  if (!ALLOWED_ROLES.has(roleName)) {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const { searchParams } = new URL(req.url);

  const suppliedTenantId = cleanStr(searchParams.get("tenantId"));
  const dateRaw = cleanStr(searchParams.get("date"));

  if (suppliedTenantId && suppliedTenantId !== ctx.tenantId) {
    return json(403, { ok: false, error: "FORBIDDEN_TENANT_MISMATCH" });
  }

  if (!dateRaw) {
    return json(400, { ok: false, error: "DATE_REQUIRED" });
  }

  if (!isIsoDateOnly(dateRaw)) {
    return json(400, { ok: false, error: "INVALID_DATE_FORMAT" });
  }

  const targetDate = utcDateOnlyFromIso(dateRaw);

  const [tenant, settings, rows] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, name: true },
    }),
    prisma.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
      select: { feverThreshold: true },
    }),
    prisma.studentHealthDaily.findMany({
      where: {
        tenantId: ctx.tenantId,
        date: targetDate,
      },
      select: {
        id: true,
        classroomId: true,
        temperatureC: true,
        symptoms: true,
        notes: true,
        Student: {
          select: {
            firstName: true,
            lastName: true,
            status: true,
          },
        },
        Classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            arm: true,
            status: true,
          },
        },
      },
      orderBy: [
        { classroomId: "asc" },
        { createdAt: "desc" },
      ],
    }),
  ]);

  if (!tenant) {
    return json(404, { ok: false, error: "TENANT_NOT_FOUND" });
  }

  const feverThresholdC =
    decimalToNumber(settings?.feverThreshold) ?? DEFAULT_FEVER_THRESHOLD_C;

  const normalizedRows = rows.map((row) => {
    const temperatureC = decimalToNumber(row.temperatureC);
    const classroomName = displayClassroomName(
      row.Classroom?.name,
      row.Classroom?.grade,
      row.Classroom?.arm
    );
    const studentName = displayStudentName(
      row.Student?.firstName,
      row.Student?.lastName
    );
    const isFever =
      typeof temperatureC === "number" && temperatureC >= feverThresholdC;

    return {
      classroomId: row.classroomId ?? null,
      classroomName,
      studentName,
      temperatureC,
      symptoms: cleanStr(row.symptoms) || null,
      notes: cleanStr(row.notes) || null,
      isFever,
    };
  });

  const totalRecords = normalizedRows.length;
  const feverCount = normalizedRows.filter((r) => r.isFever).length;

  const classroomMap = new Map<string, ClassroomSummary>();

  for (const row of normalizedRows) {
    const key = row.classroomId ?? `__none__:${row.classroomName}`;
    const existing = classroomMap.get(key);

    if (!existing) {
      classroomMap.set(key, {
        classroomId: row.classroomId,
        classroomName: row.classroomName,
        totalRecords: 1,
        feverCount: row.isFever ? 1 : 0,
        maxTemp: row.temperatureC,
      });
      continue;
    }

    existing.totalRecords += 1;
    if (row.isFever) existing.feverCount += 1;

    if (typeof row.temperatureC === "number") {
      existing.maxTemp =
        typeof existing.maxTemp === "number"
          ? Math.max(existing.maxTemp, row.temperatureC)
          : row.temperatureC;
    }
  }

  const byClassroom = Array.from(classroomMap.values()).sort((a, b) => {
    if (b.feverCount !== a.feverCount) return b.feverCount - a.feverCount;
    if (b.totalRecords !== a.totalRecords) return b.totalRecords - a.totalRecords;
    return a.classroomName.localeCompare(b.classroomName);
  });

  const samples: SampleRow[] = normalizedRows
    .slice()
    .sort((a, b) => {
      if (Number(b.isFever) !== Number(a.isFever)) {
        return Number(b.isFever) - Number(a.isFever);
      }

      const bt = typeof b.temperatureC === "number" ? b.temperatureC : -Infinity;
      const at = typeof a.temperatureC === "number" ? a.temperatureC : -Infinity;
      if (bt !== at) return bt - at;

      const c = a.classroomName.localeCompare(b.classroomName);
      if (c !== 0) return c;

      return a.studentName.localeCompare(b.studentName);
    })
    .slice(0, 40)
    .map((row) => ({
      studentName: row.studentName,
      classroomName: row.classroomName,
      temperatureC: row.temperatureC,
      symptoms: row.symptoms,
      notes: row.notes,
      isFever: row.isFever,
    }));

  return json(200, {
    ok: true,
    tenantId: tenant.id,
    tenantName: tenant.name,
    date: dateRaw,
    feverThresholdC,
    totalRecords,
    feverCount,
    byClassroom,
    samples,
  });
}