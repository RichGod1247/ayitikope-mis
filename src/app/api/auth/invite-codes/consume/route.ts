// src/app/api/auth/invite-codes/consume/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashInviteCode } from "@/lib/inviteCodes";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  getIpFromHeaders,
  getUserAgentFromHeaders,
  rateLimitCheck,
  rateLimitRecord,
} from "@/lib/rateLimit";
import bcrypt from "bcryptjs"; // legacy fallback

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  code?: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  callbackUrl?: string;
};

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function safeInternalPath(raw: unknown) {
  const fallback = "/app";
  const v = cleanStr(raw);
  if (!v) return fallback;

  if (v.startsWith("//") || v.startsWith("\\") || v.startsWith("\\\\")) return fallback;
  if (v.startsWith("/")) return v;

  try {
    const u = new URL(v);
    const path = `${u.pathname}${u.search}${u.hash}`.trim();
    if (!path.startsWith("/") || path.startsWith("//")) return fallback;
    return path || fallback;
  } catch {
    return fallback;
  }
}

function cleanPhone(v: unknown) {
  const raw = cleanStr(v).replace(/\s+/g, "");
  let p = raw.replace(/[^\d+]/g, "");
  if (!p) return "";
  if (p.startsWith("0") && p.length === 10) p = `+233${p.slice(1)}`;
  if (p.startsWith("233") && !p.startsWith("+233")) p = `+${p}`;
  return p;
}

function isPhoneE164ish(p: string) {
  return /^\+\d{9,15}$/.test(p);
}

function phoneRawProvided(v: unknown) {
  return !!cleanStr(v);
}

const WINDOW_SECONDS = Number(process.env.AUTH_INVITE_CONSUME_WINDOW_SECONDS || 60 * 30); // 30m
const LIMIT_PER_IP = Number(process.env.AUTH_INVITE_CONSUME_LIMIT_PER_IP || 25);
const LIMIT_PER_CODE = Number(process.env.AUTH_INVITE_CONSUME_LIMIT_PER_CODE || 40);

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function prismaTargetIncludes(err: any, needle: string) {
  const t = err?.meta?.target;
  if (Array.isArray(t)) return t.includes(needle);
  if (typeof t === "string") return t.includes(needle);
  return false;
}

export async function POST(req: NextRequest) {
  const ip = getIpFromHeaders(req.headers);
  const userAgent = getUserAgentFromHeaders(req.headers);

  const body = (await req.json().catch(() => ({}))) as Body;

  const codeRaw = cleanStr(body.code);
  const emailRaw = cleanStr(body.email);
  const password = cleanStr(body.password);
  const firstName = cleanStr(body.firstName) || null;
  const lastName = cleanStr(body.lastName) || null;

  const phone = cleanPhone(body.phone);
  const phoneNorm = phone || null;

  const callbackUrl = safeInternalPath(body.callbackUrl);

  if (!codeRaw || !emailRaw || !password) return json(400, { ok: false, error: "MISSING_FIELDS" });
  if (password.length < 8) return json(400, { ok: false, error: "WEAK_PASSWORD_MIN_8" });
  if (phoneRawProvided(body.phone) && (!phoneNorm || !isPhoneE164ish(phoneNorm))) {
    return json(400, { ok: false, error: "BAD_PHONE" });
  }

  const email = normalizeEmail(emailRaw);
  const codeHash = hashInviteCode(codeRaw);
  const now = new Date();

  // Rate limit per IP
  const ipKey = ip ? `inviteConsume:ip:${ip}` : null;
  if (ipKey) {
    const lim = await rateLimitCheck({
      action: "AUTH_INVITE_CONSUME_FAIL",
      key: ipKey,
      limit: LIMIT_PER_IP,
      windowSeconds: WINDOW_SECONDS,
    });
    if (!lim.ok) return json(429, { ok: false, error: "RATE_LIMITED", retryAfterSeconds: lim.retryAfterSeconds });
  }

  // Rate limit per code hash
  const codeKey = `inviteConsume:code:${codeHash}`;
  {
    const lim = await rateLimitCheck({
      action: "AUTH_INVITE_CONSUME_FAIL",
      key: codeKey,
      limit: LIMIT_PER_CODE,
      windowSeconds: WINDOW_SECONDS,
    });
    if (!lim.ok) return json(429, { ok: false, error: "RATE_LIMITED", retryAfterSeconds: lim.retryAfterSeconds });
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      const invite = await tx.inviteCode.findUnique({
        where: { codeHash },
        select: {
          id: true,
          tenantId: true,
          roleId: true,
          maxUses: true,
          usedCount: true,
          expiresAt: true,
          revokedAt: true,
          role: { select: { name: true } },
          tenant: { select: { status: true } },
        },
      });

      if (!invite) throw new Error("INVALID_CODE");
      if (invite.revokedAt) throw new Error("INVALID_CODE");
      if (invite.expiresAt.getTime() <= now.getTime()) throw new Error("INVALID_CODE");
      if (invite.usedCount >= invite.maxUses) throw new Error("INVALID_CODE");
      if (!invite.tenant || invite.tenant.status !== "ACTIVE") throw new Error("TENANT_NOT_ACTIVE");

      // PARENT-only endpoint
      const roleName = String(invite.role?.name ?? "").toUpperCase();
      if (roleName !== "PARENT") throw new Error("CODE_REQUIRES_SIGNUP_PAGE");

      const existingUser = await tx.user.findUnique({
        where: { email },
        select: { id: true, passwordHash: true },
      });

      let userId: string;

      if (existingUser?.id) {
        if (!existingUser.passwordHash) throw new Error("ACCOUNT_EXISTS_NO_PASSWORD");

        let ok = await verifyPassword(password, existingUser.passwordHash);

        if (!ok) {
          const legacyOk = await bcrypt.compare(password, existingUser.passwordHash).catch(() => false);
          if (legacyOk) {
            const upgraded = await hashPassword(password);
            await tx.user.update({ where: { id: existingUser.id }, data: { passwordHash: upgraded } });
            ok = true;
          }
        }

        if (!ok) throw new Error("ACCOUNT_EXISTS_BAD_PASSWORD");

        userId = existingUser.id;

        await tx.user.update({
          where: { id: userId },
          data: {
            ...(firstName ? { firstName } : {}),
            ...(lastName ? { lastName } : {}),
            ...(phoneNorm ? { phone: phoneNorm, phoneNorm } : {}),
            lastActiveTenantId: invite.tenantId,
          },
        });
      } else {
        const passwordHash = await hashPassword(password);
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            firstName,
            lastName,
            name: [firstName, lastName].filter(Boolean).join(" ") || null,
            phone: phoneNorm,
            phoneNorm,
            lastActiveTenantId: invite.tenantId,
          },
          select: { id: true },
        });
        userId = user.id;
      }

      const claimed = await tx.inviteCode.updateMany({
        where: {
          id: invite.id,
          revokedAt: null,
          expiresAt: { gt: now },
          usedCount: { lt: invite.maxUses },
        },
        data: { usedCount: { increment: 1 }, lastUsedAt: now },
      });
      if (claimed.count !== 1) throw new Error("INVALID_CODE");

      const existsMembership = await tx.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId: invite.tenantId } },
        select: { id: true },
      });

      if (!existsMembership) {
        await tx.membership.create({
          data: { userId, tenantId: invite.tenantId, roleId: invite.roleId, status: "ACTIVE" },
        });
      }

      await tx.inviteCodeUse.create({
        data: { inviteCodeId: invite.id, tenantId: invite.tenantId, userId, ip, userAgent },
      });

      await tx.auditLog.create({
        data: {
          tenantId: invite.tenantId,
          userId,
          action: "INVITE_CODE_CONSUMED",
          resource: "InviteCode",
          resourceId: invite.id,
          ip,
          userAgent,
          metadata: { roleName: invite.role.name } as unknown as Prisma.InputJsonValue,
        },
      });

      return { tenantId: invite.tenantId, roleName: invite.role.name, userId };
    });

    return json(200, { ok: true, tenantId: out.tenantId, roleName: out.roleName, userId: out.userId, callbackUrl });
  } catch (err: any) {
    const msg = String(err?.message || "");

    const ipKey = ip ? `inviteConsume:ip:${ip}` : null;
    if (ipKey) {
      await rateLimitRecord({
        action: "AUTH_INVITE_CONSUME_FAIL",
        key: ipKey,
        ip,
        userAgent,
        metadata: { reason: msg || "ERR", email: normalizeEmail(emailRaw || "") },
      });
    }
    await rateLimitRecord({
      action: "AUTH_INVITE_CONSUME_FAIL",
      key: `inviteConsume:code:${hashInviteCode(codeRaw || "")}`,
      ip,
      userAgent,
      metadata: { reason: msg || "ERR", email: normalizeEmail(emailRaw || "") },
    });

    if (msg === "CODE_REQUIRES_SIGNUP_PAGE") {
      return json(400, {
        ok: false,
        error: "CODE_REQUIRES_SIGNUP_PAGE",
        hint: "Teacher/Headteacher codes must use /auth/signup (teacher scope required).",
      });
    }
    if (msg === "ACCOUNT_EXISTS_NO_PASSWORD") return json(409, { ok: false, error: "ACCOUNT_EXISTS_NO_PASSWORD" });
    if (msg === "ACCOUNT_EXISTS_BAD_PASSWORD") return json(401, { ok: false, error: "ACCOUNT_EXISTS_BAD_PASSWORD" });
    if (msg === "TENANT_NOT_ACTIVE") return json(403, { ok: false, error: "TENANT_NOT_ACTIVE" });
    if (msg === "BAD_PHONE") return json(400, { ok: false, error: "BAD_PHONE" });
    if (msg === "INVALID_CODE") return json(400, { ok: false, error: "INVALID_OR_EXPIRED_CODE" });

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      if (prismaTargetIncludes(err, "phoneNorm")) {
        return json(409, { ok: false, error: "PHONE_ALREADY_USED" });
      }
      return json(409, { ok: false, error: "DUPLICATE_CONSTRAINT" });
    }

    console.error("auth/invite-codes/consume error:", err);
    return json(500, { ok: false, error: "FAILED" });
  }
}