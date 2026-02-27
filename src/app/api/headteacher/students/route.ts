// src/app/api/headteacher/students/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function isNextRedirectError(err: any) {
  return typeof err?.digest === "string" && err.digest.startsWith("NEXT_REDIRECT");
}

function normRole(name: any) {
  return String(name ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function looksLikeHeadOrAdmin(roleName: string) {
  if (!roleName) return false;
  if (roleName.includes("ADMIN")) return true;
  if (roleName.includes("HEAD")) return true;
  if (roleName === "HT") return true;
  if (roleName === "HEADTEACHER") return true;
  if (roleName === "SCHOOL_ADMIN") return true;
  return false;
}

async function requireHeadOrAdmin(tenantId: string, userId: string) {
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { role: { select: { name: true } } },
  });
  if (!m) return { ok: false as const, status: 403, error: "FORBIDDEN" };
  const roleName = normRole(m.role?.name);
  return looksLikeHeadOrAdmin(roleName)
    ? ({ ok: true as const } as const)
    : ({ ok: false as const, status: 403, error: "FORBIDDEN" } as const);
}

function toISODateOnly(d?: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}

export async function GET(req: NextRequest) {
  let tenantId = "";
  let userId = "";
  try {
    const r: any = await requireServerUserContext({ requireTenant: true } as any);
    const ctx = r?.ctx ?? r;
    tenantId = String(ctx.tenantId ?? ctx.activeTenantId ?? "").trim();
    userId = String(ctx.userId ?? ctx.user?.id ?? "").trim();
  } catch (err: any) {
    if (isNextRedirectError(err)) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  if (!tenantId || !userId) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);

  const roleOk = await requireHeadOrAdmin(tenantId, userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  try {
    const students = await prisma.student.findMany({
      where: { tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        sex: true,
        dob: true,
        guardianName: true,
        guardianPhone: true,
        guardianSmsOptIn: true,
        note: true,
        classroomId: true,
        classroom: { select: { id: true, name: true, grade: true, arm: true } },
      },
      orderBy: [{ classroomId: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
      take: 500,
    });

    const rows = students.map((s) => ({
      id: s.id,
      firstName: s.firstName ?? "",
      lastName: s.lastName ?? "",
      sex: s.sex ?? "",
      dob: toISODateOnly(s.dob),
      guardianName: s.guardianName ?? "",
      guardianPhone: s.guardianPhone ?? "",
      guardianSmsOptIn: !!s.guardianSmsOptIn,
      note: s.note ?? "",
      classroomName: s.classroom?.name ?? "",
      classroomId: s.classroom?.id ?? s.classroomId ?? "",
    }));

    return jsonNoStore({ ok: true, tenantId, count: rows.length, students: rows }, 200);
  } catch (err) {
    console.error("[HEAD_STUDENTS_GET_ERROR]", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_LOAD_STUDENTS" }, 500);
  }
}

export async function PATCH(req: NextRequest) {
  let tenantId = "";
  let userId = "";
  try {
    const r: any = await requireServerUserContext({ requireTenant: true } as any);
    const ctx = r?.ctx ?? r;
    tenantId = String(ctx.tenantId ?? ctx.activeTenantId ?? "").trim();
    userId = String(ctx.userId ?? ctx.user?.id ?? "").trim();
  } catch (err: any) {
    if (isNextRedirectError(err)) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  if (!tenantId || !userId) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);

  const roleOk = await requireHeadOrAdmin(tenantId, userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  try {
    const body = (await req.json().catch(() => null)) as
      | {
          id?: string;
          firstName?: string;
          lastName?: string;
          sex?: string;
          dob?: string;
          guardianName?: string;
          guardianPhone?: string;
          guardianSmsOptIn?: boolean;
          note?: string;
          classroomId?: string;
        }
      | null;

    if (!body || typeof body !== "object") return jsonNoStore({ ok: false, error: "INVALID_JSON" }, 400);

    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return jsonNoStore({ ok: false, error: "Student id is required." }, 400);

    const existing = await prisma.student.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) return jsonNoStore({ ok: false, error: "Student not found for this tenant." }, 404);

    const data: any = {};
    if (typeof body.firstName === "string") data.firstName = body.firstName.trim();
    if (typeof body.lastName === "string") data.lastName = body.lastName.trim();
    if (typeof body.sex === "string") data.sex = body.sex.trim() || "";
    if (typeof body.guardianName === "string") data.guardianName = body.guardianName.trim() || "";
    if (typeof body.guardianPhone === "string") data.guardianPhone = body.guardianPhone.trim() || "";
    if (typeof body.guardianSmsOptIn === "boolean") data.guardianSmsOptIn = body.guardianSmsOptIn;
    if (typeof body.note === "string") data.note = body.note.trim() || "";

    if (typeof body.classroomId === "string") {
      const cid = body.classroomId.trim();
      if (cid) {
        const cls = await prisma.classroom.findFirst({ where: { id: cid, tenantId }, select: { id: true } });
        if (!cls) return jsonNoStore({ ok: false, error: "Invalid classroomId for this tenant." }, 400);
        data.classroomId = cid;
      } else {
        data.classroomId = null;
      }
    }

    if (typeof body.dob === "string" && body.dob.trim()) {
      const parsed = new Date(body.dob.trim());
      if (!Number.isNaN(parsed.getTime())) data.dob = parsed;
    }

    if (Object.keys(data).length === 0) return jsonNoStore({ ok: false, error: "No valid fields to update." }, 400);

    const updated = await prisma.student.update({
      where: { id },
      data,
      select: { id: true, firstName: true, lastName: true, sex: true, dob: true, guardianName: true, guardianPhone: true, guardianSmsOptIn: true, note: true, classroomId: true },
    });

    return jsonNoStore(
      {
        ok: true,
        student: {
          ...updated,
          dob: updated.dob ? updated.dob.toISOString().slice(0, 10) : "",
          guardianSmsOptIn: !!updated.guardianSmsOptIn,
        },
      },
      200
    );
  } catch (err) {
    console.error("[HEAD_STUDENTS_PATCH_ERROR]", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_UPDATE_STUDENT" }, 500);
  }
}
