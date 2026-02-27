// src/app/api/admin/students/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { StudentStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["ADMIN", "SCHOOL_ADMIN", "SCHOOLADMIN", "HEADTEACHER", "SUPERADMIN"];

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function digitsOnly(v: string) {
  return v.replace(/\D/g, "");
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ADMIN_ROLES,
  });
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const q = clean(url.searchParams.get("q") || "");
  const classroomId = clean(url.searchParams.get("classroomId") || "");
  const show = clean(url.searchParams.get("show") || "active"); // active | archived | all
  const take = clampInt(url.searchParams.get("take"), 1, 200, 50);
  const cursor = clean(url.searchParams.get("cursor") || "");

  const statusFilter =
    show === "archived" ? StudentStatus.ARCHIVED : show === "all" ? undefined : StudentStatus.ACTIVE;

  const where: any = {
    tenantId: auth.ctx.tenantId,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(classroomId ? { classroomId } : {}),
  };

  if (q) {
    const qDigits = digitsOnly(q);
    const phoneSuffix = qDigits.length >= 7 ? qDigits.slice(-7) : "";

    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { guardianName: { contains: q, mode: "insensitive" } },
      { id: q }, // exact
      ...(phoneSuffix
        ? [
            { guardianPhone: { endsWith: phoneSuffix } },
            { guardianPhoneNorm: { endsWith: phoneSuffix } },
          ]
        : []),
    ];
  }

  const rows = await prisma.student.findMany({
    where,
    orderBy: [{ id: "desc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take,
    select: {
      id: true,
      status: true,
      firstName: true,
      lastName: true,
      gender: true,
      sex: true,
      dob: true,
      guardianName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
      guardianSmsOptIn: true,
      healthConsentAt: true,
      classroomId: true,
      classroom: { select: { id: true, name: true, grade: true, arm: true } },
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const nextCursor = rows.length === take ? rows[rows.length - 1]?.id ?? null : null;

  return noStoreJson(200, { ok: true, items: rows, nextCursor });
}