// src/app/api/me/profile/teacher/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TeacherPhase = "KG" | "PRIMARY" | "JHS";
type FieldErrors = Record<string, string>;

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function jsonFail(msg: string, status = 400, fieldErrors?: FieldErrors) {
  return NextResponse.json(
    { ok: false, error: msg, fieldErrors: fieldErrors ?? null },
    { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

function jsonOk(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

// E.164-ish normalization for Ghana (+233…)
function normalizePhone(raw: unknown): string | null {
  const s = cleanStr(raw).replace(/\s+/g, "");
  if (!s) return null;

  let p = s.replace(/[^\d+]/g, "");
  if (!p) return null;

  if (p.startsWith("0") && p.length === 10) p = `+233${p.slice(1)}`;
  if (p.startsWith("233") && !p.startsWith("+233")) p = `+${p}`;

  if (!/^\+\d{9,15}$/.test(p)) return null;
  return p;
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, { requireTenant: true, requireRoleNames: ["TEACHER", "HEADTEACHER"] });
  if (!auth.ok) return auth.res;

  const { userId, tenantId, roleName } = auth.ctx;

  const [user, tp] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, phone: true, phoneNorm: true },
    }),
    prisma.teacherProfile.findUnique({
      where: { teacherProfile_tenant_user_unique: { tenantId, userId } },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        phone: true,
        phase: true,
        classLevel: true,
        jhsAssignments: true,
        additionalDuties: true,
        primaryClassroomId: true,
      },
    }),
  ]);

  return jsonOk({
    ok: true,
    tenantId,
    roleName,
    user: {
      id: user?.id ?? userId,
      email: user?.email ?? null,
      name: user?.name ?? null,
      phone: user?.phone ?? null,
      phoneNorm: user?.phoneNorm ?? null,
    },
    teacherProfile: tp
      ? {
          ...tp,
          additionalDuties: Array.isArray(tp.additionalDuties) ? tp.additionalDuties : [],
        }
      : null,
  });
}

export async function POST(req: Request) {
  const auth = await requireApiUserContext(req, { requireTenant: true, requireRoleNames: ["TEACHER", "HEADTEACHER"] });
  if (!auth.ok) return auth.res;

  const { userId, tenantId } = auth.ctx;

  const body = (await req.json().catch(() => null)) as any;
  if (!body) return jsonFail("INVALID_PAYLOAD", 400);

  const fieldErrors: FieldErrors = {};

  const phoneNorm = normalizePhone(body.phone);
  if (!phoneNorm) fieldErrors.phone = "Invalid phone. Use 024xxxxxxx or +233xxxxxxxxx.";

  const phaseRaw = cleanStr(body.phase) as TeacherPhase;
  const phase: TeacherPhase | null = phaseRaw === "KG" || phaseRaw === "PRIMARY" || phaseRaw === "JHS" ? phaseRaw : null;
  if (!phase) fieldErrors.phase = "Phase must be KG, PRIMARY, or JHS.";

  const classLevel = cleanStr(body.classLevel) || null;
  if ((phase === "KG" || phase === "PRIMARY") && !classLevel) {
    fieldErrors.classLevel = "Class level is required for KG/PRIMARY.";
  }

  const jhsIn = body.jhsAssignments;
  const jhsAssignments =
    jhsIn === undefined ? undefined : jhsIn === null ? Prisma.DbNull : (jhsIn as Prisma.InputJsonValue);

  if (Object.keys(fieldErrors).length) return jsonFail("VALIDATION_FAILED", 400, fieldErrors);

  // Global phone identity uniqueness
  const clash = await prisma.user.findFirst({
    where: { phoneNorm: phoneNorm!, NOT: { id: userId } },
    select: { id: true },
  });
  if (clash?.id) return jsonFail("PHONE_IN_USE", 409, { phone: "This phone number is already used by another account." });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { phone: phoneNorm!, phoneNorm: phoneNorm! },
      });

      await tx.teacherProfile.upsert({
        where: { teacherProfile_tenant_user_unique: { tenantId, userId } },
        create: {
          tenantId,
          userId,
          phone: phoneNorm!,
          phase: phase!,
          classLevel: phase === "KG" || phase === "PRIMARY" ? classLevel : null,
          ...(phase === "JHS" ? { jhsAssignments: jhsAssignments ?? Prisma.DbNull } : {}),
        },
        update: {
          phone: phoneNorm!,
          phase: phase!,
          classLevel: phase === "KG" || phase === "PRIMARY" ? classLevel : null,
          ...(phase === "JHS" ? { jhsAssignments: jhsAssignments ?? Prisma.DbNull } : { jhsAssignments: Prisma.DbNull }),
        },
      });
    });

    return await GET(req);
  } catch {
    return jsonFail("SAVE_FAILED", 500);
  }
}
