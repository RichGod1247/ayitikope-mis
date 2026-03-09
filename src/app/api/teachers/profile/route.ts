// src/app/api/teachers/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma, TeacherPhase } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerUserContextOrNull } from "@/lib/serverAuth";
import {
  normalizeJhsAssignmentsLoose,
  normalizeTeacherClassLevel,
  normalizeTeacherScopeForRead,
  sameNormalizedJhsAssignments,
} from "@/lib/teacherScope";

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

  return jsonNoStore(
    { ok: true, profile: normalizeTeacherScopeForRead(profile) },
    { status: 200 }
  );
}

type PostBody = {
  phone: string;
  phase: "KG" | "PRIMARY" | "JHS" | TeacherPhase;
  classLevel?: string | null;
  jhsAssignments?: unknown;
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

  const classLevel =
    phase === "KG" || phase === "PRIMARY"
      ? normalizeTeacherClassLevel(phase, body.classLevel)
      : null;

  if ((phase === "KG" || phase === "PRIMARY") && !classLevel) {
    return jsonNoStore(
      { ok: false, error: "Invalid class level for the selected phase." },
      { status: 400 }
    );
  }

  const normalizedJhsAssignments =
    phase === "JHS" ? normalizeJhsAssignmentsLoose(body.jhsAssignments) : [];

  if (phase === "JHS" && normalizedJhsAssignments.length === 0) {
    return jsonNoStore(
      { ok: false, error: "Add at least one valid JHS subject assignment." },
      { status: 400 }
    );
  }

  const additionalDuties = Array.isArray(body.additionalDuties)
    ? body.additionalDuties.map((x) => cleanStr(x)).filter(Boolean)
    : [];

  const existingProfile = await prisma.teacherProfile.findUnique({
    where: {
      teacherProfile_tenant_user_unique: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
      },
    },
    select: {
      id: true,
      phase: true,
      classLevel: true,
      jhsAssignments: true,
    },
  });

  if (existingProfile) {
    if (existingProfile.phase !== phase) {
      return jsonNoStore({ ok: false, error: "SCOPE_ALREADY_LOCKED" }, { status: 409 });
    }

    if (
      (phase === "KG" || phase === "PRIMARY") &&
      normalizeTeacherClassLevel(phase, existingProfile.classLevel) !== classLevel
    ) {
      return jsonNoStore({ ok: false, error: "SCOPE_ALREADY_LOCKED" }, { status: 409 });
    }

    if (
      phase === "JHS" &&
      !sameNormalizedJhsAssignments(existingProfile.jhsAssignments, normalizedJhsAssignments)
    ) {
      return jsonNoStore({ ok: false, error: "SCOPE_ALREADY_LOCKED" }, { status: 409 });
    }
  }

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
        classLevel: phase === "KG" || phase === "PRIMARY" ? classLevel : null,
        jhsAssignments:
          phase === "JHS"
            ? (normalizedJhsAssignments as Prisma.InputJsonValue)
            : Prisma.DbNull,
        additionalDuties,
      },
      update: {
        phone,
        phase,
        classLevel: phase === "KG" || phase === "PRIMARY" ? classLevel : null,
        jhsAssignments:
          phase === "JHS"
            ? (normalizedJhsAssignments as Prisma.InputJsonValue)
            : Prisma.DbNull,
        additionalDuties,
      },
    });

    return jsonNoStore(
      { ok: true, profile: normalizeTeacherScopeForRead(profile) },
      { status: 200 }
    );
  } catch (err) {
    console.error("TEACHER_PROFILE_SAVE_ERROR", err);
    return jsonNoStore(
      { ok: false, error: "Failed to save teacher profile." },
      { status: 500 }
    );
  }
}