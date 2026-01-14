import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

function getIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip") || null;
}

function getUa(req: Request) {
  return req.headers.get("user-agent") || null;
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function cleanEmail(v: unknown) {
  return String(v ?? "").toLowerCase().trim();
}

export async function POST(
  req: Request,
  { params }: { params: { tenantId: string } }
) {
  const tenantId = params.tenantId;
  if (!tenantId) return bad("Missing tenantId.");

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) return bad("Unauthorized.", 401);

  // ✅ RBAC: ACTIVE ADMIN/HEADTEACHER only
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      tenantId,
      status: "ACTIVE",
      role: { name: { in: ["ADMIN", "HEADTEACHER"] } },
    },
    select: { id: true, role: { select: { name: true } } },
  });

  if (!membership) return bad("Forbidden. Admin access required.", 403);

  const body = await req.json().catch(() => null);
  if (!body) return bad("Invalid payload.");

  const email = cleanEmail(body.email);
  if (!email) return bad("Email is required.");

  const targetRoleName = cleanStr(body.roleName || "TEACHER").toUpperCase();

  const role = await prisma.role.findFirst({
    where: { tenantId, name: targetRoleName },
    select: { id: true, name: true },
  });

  if (!role) return bad(`Role "${targetRoleName}" not configured for this tenant.`, 500);

  const token = randomBytes(24).toString("hex");
  const ttlHours = Number(process.env.INVITE_TTL_HOURS || 72);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  const ip = getIp(req);
  const userAgent = getUa(req);

  /**
   * IMPORTANT:
   * Your schema says Invite.invitedBy is a STRING (user id),
   * not a relation object — so we set invitedBy: userId.
   */
  const invite = await prisma.invite.create({
    data: {
      tenantId,
      email,
      token,
      roleId: role.id,
      expiresAt,
      invitedBy: userId, // ✅ FIX
    },
    select: { id: true, token: true, expiresAt: true },
  });

  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const inviteUrl = `${base}/auth/signup?invite=${encodeURIComponent(invite.token)}`;

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: "INVITE_CREATED",
      resource: "Invite",
      resourceId: invite.id,
      ip,
      userAgent,
      metadata: {
        email,
        roleName: role.name,
        ttlHours,
        expiresAt: invite.expiresAt.toISOString(),
      },
    },
  });

  return NextResponse.json({
    ok: true,
    tenantId,
    inviteUrl,
    expiresAt: invite.expiresAt.toISOString(),
  });
}
