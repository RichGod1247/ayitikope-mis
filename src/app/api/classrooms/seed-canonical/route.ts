// src/app/api/classrooms/seed-canonical/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import { normalizeArmNorm, normalizeNameNorm } from "@/lib/normalize";
import { z } from "zod";
import { ClassroomStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

const BodySchema = z
  .object({
    mode: z.enum(["single", "multi"]),
  })
  .strict();

function isAdminLike(roleName: unknown) {
  const r = effectiveRole(roleName);
  return r === "SUPERADMIN" || r === "SCHOOL_ADMIN" || r === "HEADTEACHER";
}

// Canonical Ghana structure (as your UI says: KG1 → JHS3)
const CANONICAL_BASE = [
  { name: "KG 1", grade: "KG1" },
  { name: "KG 2", grade: "KG2" },

  { name: "B1", grade: "B1" },
  { name: "B2", grade: "B2" },
  { name: "B3", grade: "B3" },
  { name: "B4", grade: "B4" },
  { name: "B5", grade: "B5" },
  { name: "B6", grade: "B6" },

  { name: "JHS 1", grade: "JHS1" },
  { name: "JHS 2", grade: "JHS2" },
  { name: "JHS 3", grade: "JHS3" },
] as const;

const MULTI_ARMS = ["A", "B", "C", "D"] as const;

function buildTokenFromValues(name: string, arm: string | null) {
  const nameNorm = normalizeNameNorm(name, 32);
  const armNorm = normalizeArmNorm(arm ?? "", 8);
  return `${nameNorm}${armNorm}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: auth.ctx.userId, tenantId: auth.ctx.tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE" || !isAdminLike(membership.role?.name ?? auth.ctx.roleName)) {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return json(400, { ok: false, error: parsed.error.issues[0]?.message || "Invalid body" });
  }

  const mode = parsed.data.mode;

  // 1) Build desired list (token-based so we avoid duplicates like "B1A" vs "B1"+"A")
  const desired: Array<{
    token: string;
    name: string;
    grade: string | null;
    arm: string | null;
    nameNorm: string;
    armNorm: string;
  }> = [];

  for (const base of CANONICAL_BASE) {
    if (mode === "single") {
      const nameNorm = normalizeNameNorm(base.name, 32);
      const armNorm = normalizeArmNorm("", 8);
      desired.push({
        token: `${nameNorm}${armNorm}`,
        name: base.name,
        grade: base.grade,
        arm: null,
        nameNorm,
        armNorm,
      });
    } else {
      for (const arm of MULTI_ARMS) {
        const nameNorm = normalizeNameNorm(base.name, 32);
        const armNorm = normalizeArmNorm(arm, 8);
        desired.push({
          token: `${nameNorm}${armNorm}`,
          name: base.name,
          grade: base.grade,
          arm,
          nameNorm,
          armNorm,
        });
      }
    }
  }

  // 2) Fetch existing once and build a token set (fallback to normalizing actual name/arm if norms are empty)
  const existing = await prisma.classroom.findMany({
    where: { tenantId: auth.ctx.tenantId },
    select: { id: true, name: true, arm: true, nameNorm: true, armNorm: true, status: true },
    take: 5000,
  });

  const existingTokens = new Set<string>();
  for (const c of existing) {
    const nameNorm = (c.nameNorm || "").trim() || normalizeNameNorm(c.name ?? "", 32);
    const armNorm = (c.armNorm || "").trim() || normalizeArmNorm(c.arm ?? "", 8);
    existingTokens.add(`${nameNorm}${armNorm}`);
  }

  const missing = desired.filter((d) => !existingTokens.has(d.token));

  // 3) Create missing (idempotent) + audit
  const created = await prisma.$transaction(async (tx) => {
    const res = await tx.classroom.createMany({
      data: missing.map((d) => ({
        tenantId: auth.ctx.tenantId,
        name: d.name,
        grade: d.grade,
        arm: d.arm,
        nameNorm: d.nameNorm,
        armNorm: d.armNorm,
        status: ClassroomStatus.ACTIVE,
        note: `Canonical seed (${mode})`,
      })),
      // protects us from race conditions
      skipDuplicates: true,
    });

    try {
      await tx.auditLog.create({
        data: {
          tenantId: auth.ctx.tenantId,
          userId: auth.ctx.userId,
          action: "CLASSROOM_SEED_CANONICAL",
          resource: "Classroom",
          resourceId: null,
          metadata: {
            mode,
            total: desired.length,
            attempted: missing.length,
            created: res.count,
          } as any,
        },
      });
    } catch {}

    return res.count;
  });

  return json(200, {
    ok: true,
    mode,
    created,
    skipped: desired.length - created,
    total: desired.length,
  });
}