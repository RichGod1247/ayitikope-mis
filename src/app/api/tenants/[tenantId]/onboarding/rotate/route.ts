// src/app/api/tennants/[tenantId]/onboarding/rotate/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOnboardingCode, hashOnboardingCode } from "@/lib/onboardingCode";
import { writeAuditLog } from "@/lib/audit";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(req: Request, { params }: { params: { tenantId: string } }) {
  const tenantId = String(params?.tenantId ?? "").trim();
  if (!tenantId) return json({ ok: false, error: "Missing tenantId." }, 400);

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return json({ ok: false, error: "Unauthorized." }, 401);

  // ✅ Verify membership for THIS tenant (never trust session roleName alone)
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      tenantId,
      status: "ACTIVE",
      role: { name: { in: ["ADMIN", "HEADTEACHER"] } },
    },
    select: { id: true, role: { select: { name: true } } },
  });

  if (!membership) return json({ ok: false, error: "Forbidden." }, 403);

  const code = generateOnboardingCode("EDU");
  const codeHash = await hashOnboardingCode(code);

  const ttlMinutes = 15;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.tenantOnboardingCode.updateMany({
      where: { tenantId, active: true },
      data: { active: false },
    });

    const row = await tx.tenantOnboardingCode.create({
      data: {
        tenantId,
        codeHash,
        active: true,
        rotatedAt: new Date(),
        expiresAt,
      },
    });

    await writeAuditLog({
      action: "ONBOARDING_CODE_ROTATED",
      tenantId,
      userId,
      resource: "TenantOnboardingCode",
      resourceId: row.id,
      metadata: { ttlMinutes },
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    });
  });

  return json({ ok: true, tenantId, code, expiresAt, ttlMinutes }, 200);
}
