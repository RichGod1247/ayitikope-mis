// src/app/api/teachers/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma, TeacherPhase } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerUserContextOrNull } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function validatePhone(raw: unknown) {
  const v = cleanStr(raw).replace(/\s+/g, "");
  if (!v) return null;
  if (/^\+?\d{9,15}$/.test(v)) return v;
  return null;
}

function validatePhase(raw: unknown): TeacherPhase | null {
  const v = cleanStr(raw).toUpperCase();
  if (v === "KG") return "KG";
  if (v === "PRIMARY") return "PRIMARY";
  if (v === "JHS") return "JHS";
  return null;
}

async function getCtxOrNull() {
  const ctx = await getServerUserContextOrNull({ requireTenant: true });
  if (!ctx?.userId || !ctx?.tenantId) return null;

  // Bank-grade: require ACTIVE membership in tenant
  const m = await prisma.membership.findFirst({
    where: { userId: ctx.userId, tenantId: ctx.tenantId, status: "ACTIVE" },
    select: { id: true },
  });

  if (!m) return null;
  return { userId: ctx.userId, tenantId: ctx.tenantId };
}

export async function GET(_req: NextRequest) {
  const ctx = await getCtxOrNull();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });

  // ✅ Must use compound unique: (tenantId, userId)
  const profile = await prisma.teacherProfile.findUnique({
    where: {
      teacherProfile_tenant_user_unique: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
      },
    },
  });

  if (!profile) {
    return jsonNoStore(
      { ok: false, error: "Teacher profile not found for this tenant." },
      { status: 404 }
    );
  }

  return jsonNoStore({ ok: true, profile }, { status: 200 });
}

type PostBody = {
  phone: string;
  phase: "KG" | "PRIMARY" | "JHS" | TeacherPhase;
  classLevel?: string | null;
  jhsAssignments?: unknown; // JSON
  additionalDuties?: unknown;
};

export async function POST(req: NextRequest) {
  const ctx = await getCtxOrNull();
  if (!ctx) return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as PostBody | null;
  if (!body) return jsonNoStore({ ok: false, error: "Invalid JSON body." }, { status: 400 });

  const phone = validatePhone(body.phone);
  if (!phone) return jsonNoStore({ ok: false, error: "Invalid phone." }, { status: 400 });

  const phase = validatePhase(body.phase);
  if (!phase) return jsonNoStore({ ok: false, error: "Invalid phase." }, { status: 400 });

  const classLevel = cleanStr(body.classLevel) || null;

  const additionalDuties = Array.isArray(body.additionalDuties)
    ? body.additionalDuties.map((x) => cleanStr(x)).filter(Boolean)
    : [];

  // Normalize JHS assignments
  const jhsAssignmentsJson: Prisma.InputJsonValue =
    body.jhsAssignments === undefined || body.jhsAssignments === null
      ? []
      : (body.jhsAssignments as Prisma.InputJsonValue);

  // ✅ IMPORTANT: for Json? fields, do NOT use `null` — use Prisma.DbNull (DB NULL)
  const jhsAssignmentsValue =
    phase === "JHS" ? jhsAssignmentsJson : Prisma.DbNull;

  try {
    const profile = await prisma.teacherProfile.upsert({
      where: {
        teacherProfile_tenant_user_unique: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        phone,
        phase,
        classLevel,
        jhsAssignments: jhsAssignmentsValue,
        additionalDuties,
      },
      update: {
        phone,
        phase,
        classLevel,
        jhsAssignments: jhsAssignmentsValue,
        additionalDuties,
      },
    });

    return jsonNoStore({ ok: true, profile }, { status: 200 });
  } catch (err) {
    console.error("TEACHER_PROFILE_SAVE_ERROR", err);
    return jsonNoStore({ ok: false, error: "Failed to save teacher profile." }, { status: 500 });
  }
}
