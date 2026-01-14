// src/lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { getIpFromHeaders, getUserAgentFromHeaders, rateLimitCheck, rateLimitRecord } from "@/lib/rateLimit";
import type { Prisma } from "@prisma/client";
import { verifyTotpWithEnvelope } from "@/lib/totp";

type TeacherScope = {
  phase: string | null;
  classLevel: string | null;
  jhsAssignments: any;
};

type SafeUser = {
  id: string;
  email: string;
  name: string | null;
  staffId: string | null; // tenant-scoped staff ID (from Membership)
  tenantId?: string | null;
  roleName?: string | null;
  teacherScope?: TeacherScope | null;
};

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}
function cleanEmail(v: unknown) {
  return String(v ?? "").toLowerCase().trim();
}
function isEmailLike(v: string) {
  return v.includes("@");
}
function secondsLeft(until: Date) {
  return Math.max(1, Math.floor((until.getTime() - Date.now()) / 1000));
}

// Normalize staffId for comparisons (store this in Membership.staffIdNorm)
function normalizeStaffIdNorm(v: string) {
  return cleanStr(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function tenantConnect(tenantId: string | null | undefined) {
  return tenantId ? { connect: { id: tenantId } } : undefined;
}
function userConnect(userId: string | null | undefined) {
  return userId ? { connect: { id: userId } } : undefined;
}
async function safeAudit(data: Prisma.AuditLogCreateInput) {
  try {
    await prisma.auditLog.create({ data });
  } catch {
    // swallow
  }
}

async function resolveTenantIdOrNull(raw: string | null | undefined) {
  const v = cleanStr(raw);
  if (!v) return null;

  // Try id first (cuid-ish)
  const byId = await prisma.tenant.findFirst({
    where: { id: v },
    select: { id: true },
  });
  if (byId?.id) return byId.id;

  // Then slug (case-insensitive)
  const bySlug = await prisma.tenant.findFirst({
    where: { slug: { equals: v, mode: "insensitive" } },
    select: { id: true },
  });
  return bySlug?.id ?? null;
}

async function pickMembershipForUser(userId: string, tenantIdHint: string | null) {
  if (tenantIdHint) {
    const m = await prisma.membership.findFirst({
      where: { userId, tenantId: tenantIdHint, status: "ACTIVE" },
      select: { tenantId: true, staffId: true, role: { select: { name: true } } },
    });
    return m ?? null;
  }

  // If no tenant specified, ONLY allow auto-pick when exactly one active membership exists.
  const ms = await prisma.membership.findMany({
    where: { userId, status: "ACTIVE" },
    select: { tenantId: true, staffId: true, role: { select: { name: true } } },
    take: 3,
  });

  if (ms.length === 1) return ms[0];
  if (ms.length === 0) return null;

  // Bank-grade: do not guess tenant when multiple exist.
  throw new Error("TENANT_REQUIRED");
}

// ---------------- Tunables ----------------
const LOGIN_WINDOW_SECONDS = Number(process.env.AUTH_LOGIN_WINDOW_SECONDS || 15 * 60); // 15m
const LOGIN_FAIL_LIMIT_PER_IP = Number(process.env.AUTH_LOGIN_FAIL_LIMIT_PER_IP || 25);
const LOGIN_FAIL_LIMIT_PER_IDENTIFIER = Number(process.env.AUTH_LOGIN_FAIL_LIMIT_PER_IDENTIFIER || 10);

const LOCKOUT_FAIL_THRESHOLD = Number(process.env.AUTH_LOCKOUT_FAIL_THRESHOLD || 8);
const LOCKOUT_MINUTES = Number(process.env.AUTH_LOCKOUT_MINUTES || 10);

// OTP lockout (separate)
const OTP_FAIL_THRESHOLD = Number(process.env.AUTH_OTP_FAIL_THRESHOLD || 6);
const OTP_LOCKOUT_MINUTES = Number(process.env.AUTH_OTP_LOCKOUT_MINUTES || 10);

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/signin" },

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: { label: "Email or Staff ID", type: "text" },
        password: { label: "Password", type: "password" },
        otp: { label: "OTP (optional)", type: "text" },

        // ✅ NEW: required for staffId login, and for users with multiple tenants.
        tenant: { label: "School Code / Tenant", type: "text" },
      },

      async authorize(credentials, req) {
        const headers = req?.headers ? new Headers(req.headers as any) : new Headers();
        const ip = getIpFromHeaders(headers);
        const userAgent = getUserAgentFromHeaders(headers);

        const identifier = cleanStr((credentials as any)?.identifier);
        const password = cleanStr((credentials as any)?.password);
        const otp = cleanStr((credentials as any)?.otp);
        const tenantRaw = cleanStr((credentials as any)?.tenant);

        if (!identifier || !password) return null;

        const tenantIdHint = await resolveTenantIdOrNull(tenantRaw);

        // Rate-limit keys become tenant-aware to avoid cross-tenant DoS
        const ipKey = ip ? `ip:${ip}` : null;
        const idKey = `id:${tenantIdHint ?? "noTenant"}:${identifier.toUpperCase()}`;

        if (ipKey) {
          const ipLimit = await rateLimitCheck({
            action: "AUTH_LOGIN_FAIL",
            key: ipKey,
            limit: LOGIN_FAIL_LIMIT_PER_IP,
            windowSeconds: LOGIN_WINDOW_SECONDS,
          });
          if (!ipLimit.ok) throw new Error(`RATE_LIMIT:${ipLimit.retryAfterSeconds}`);
        }

        const idLimit = await rateLimitCheck({
          action: "AUTH_LOGIN_FAIL",
          key: idKey,
          limit: LOGIN_FAIL_LIMIT_PER_IDENTIFIER,
          windowSeconds: LOGIN_WINDOW_SECONDS,
        });
        if (!idLimit.ok) throw new Error(`RATE_LIMIT:${idLimit.retryAfterSeconds}`);

        // ---------------------------
        // 1) Resolve user + membership
        // ---------------------------
        const emailLogin = isEmailLike(identifier);

        let user: {
          id: string;
          email: string;
          name: string | null;
          passwordHash: string | null;
          failedLoginCount: number | null;
          lockedUntil: Date | null;
          failedOtpCount: number | null;
          otpLockedUntil: Date | null;

          twoFactorEnabled: boolean;
          twoFactorSetupAt: Date | null;
          twoFactorSecretCiphertext: string | null;
          twoFactorSecretKeyCiphertext: string | null;
          twoFactorSecretIv: string | null;
          twoFactorSecretTag: string | null;

          lastActiveTenantId: string | null;
        } | null = null;

        let membership: { tenantId: string; staffId: string | null; role?: { name: string | null } | null } | null =
          null;

        if (emailLogin) {
          user = await prisma.user.findFirst({
            where: { email: cleanEmail(identifier) },
            select: {
              id: true,
              email: true,
              name: true,
              passwordHash: true,
              failedLoginCount: true,
              lockedUntil: true,
              failedOtpCount: true,
              otpLockedUntil: true,

              twoFactorEnabled: true,
              twoFactorSetupAt: true,
              twoFactorSecretCiphertext: true,
              twoFactorSecretKeyCiphertext: true,
              twoFactorSecretIv: true,
              twoFactorSecretTag: true,

              lastActiveTenantId: true,
            },
          });

          if (!user?.id || !user.passwordHash) {
            if (ipKey) {
              await rateLimitRecord({
                action: "AUTH_LOGIN_FAIL",
                key: ipKey,
                ip,
                userAgent,
                metadata: { reason: "NO_USER_OR_NO_PASSWORD_HASH", identifier } as Prisma.InputJsonValue,
              });
            }
            await rateLimitRecord({
              action: "AUTH_LOGIN_FAIL",
              key: idKey,
              ip,
              userAgent,
              metadata: { reason: "NO_USER_OR_NO_PASSWORD_HASH", identifier } as Prisma.InputJsonValue,
            });

            await safeAudit({
              action: "LOGIN_FAIL",
              resource: "User",
              resourceId: identifier,
              ip,
              userAgent,
              metadata: { reason: "NO_USER_OR_NO_PASSWORD_HASH" } as Prisma.InputJsonValue,
            });

            return null;
          }

          // If tenant not supplied, try lastActiveTenantId before forcing TENANT_REQUIRED
          const preferredTenant = tenantIdHint ?? user.lastActiveTenantId ?? null;

          try {
            membership = await pickMembershipForUser(user.id, preferredTenant);
          } catch (e: any) {
            if (String(e?.message || "") === "TENANT_REQUIRED") throw new Error("TENANT_REQUIRED");
            throw e;
          }
        } else {
          // staffId login MUST be tenant-aware
          if (!tenantIdHint) throw new Error("TENANT_REQUIRED");

          const staffIdNorm = normalizeStaffIdNorm(identifier);
          if (!staffIdNorm) return null;

          const m = await prisma.membership.findFirst({
            where: { tenantId: tenantIdHint, status: "ACTIVE", staffIdNorm },
            select: {
              tenantId: true,
              staffId: true,
              role: { select: { name: true } },
              user: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                  passwordHash: true,
                  failedLoginCount: true,
                  lockedUntil: true,
                  failedOtpCount: true,
                  otpLockedUntil: true,

                  twoFactorEnabled: true,
                  twoFactorSetupAt: true,
                  twoFactorSecretCiphertext: true,
                  twoFactorSecretKeyCiphertext: true,
                  twoFactorSecretIv: true,
                  twoFactorSecretTag: true,

                  lastActiveTenantId: true,
                },
              },
            },
          });

          if (!m?.user?.id || !m.user.passwordHash) {
            if (ipKey) {
              await rateLimitRecord({
                action: "AUTH_LOGIN_FAIL",
                key: ipKey,
                ip,
                userAgent,
                metadata: { reason: "NO_MEMBERSHIP_OR_NO_PASSWORD_HASH", identifier, tenantId: tenantIdHint } as Prisma.InputJsonValue,
              });
            }
            await rateLimitRecord({
              action: "AUTH_LOGIN_FAIL",
              key: idKey,
              ip,
              userAgent,
              metadata: { reason: "NO_MEMBERSHIP_OR_NO_PASSWORD_HASH", identifier, tenantId: tenantIdHint } as Prisma.InputJsonValue,
            });

            await safeAudit({
              action: "LOGIN_FAIL",
              resource: "Membership",
              resourceId: identifier,
              ip,
              userAgent,
              metadata: { reason: "NO_MEMBERSHIP_OR_NO_PASSWORD_HASH", tenantId: tenantIdHint } as Prisma.InputJsonValue,
            });

            return null;
          }

          membership = { tenantId: m.tenantId, staffId: m.staffId ?? null, role: m.role ?? null };
          user = {
            id: m.user.id,
            email: m.user.email,
            name: m.user.name,
            passwordHash: m.user.passwordHash,
            failedLoginCount: m.user.failedLoginCount,
            lockedUntil: m.user.lockedUntil,
            failedOtpCount: m.user.failedOtpCount,
            otpLockedUntil: m.user.otpLockedUntil,
            twoFactorEnabled: m.user.twoFactorEnabled,
            twoFactorSetupAt: m.user.twoFactorSetupAt,
            twoFactorSecretCiphertext: m.user.twoFactorSecretCiphertext,
            twoFactorSecretKeyCiphertext: m.user.twoFactorSecretKeyCiphertext,
            twoFactorSecretIv: m.user.twoFactorSecretIv,
            twoFactorSecretTag: m.user.twoFactorSecretTag,
            lastActiveTenantId: m.user.lastActiveTenantId,
          };
        }

        if (!user?.id || !user.passwordHash) return null;

        // ---------------------------
        // 2) Lockouts (password + OTP)
        // ---------------------------
        if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
          const secs = secondsLeft(user.lockedUntil);
          await safeAudit({
            user: userConnect(user.id),
            action: "LOGIN_BLOCKED_LOCKOUT",
            resource: "User",
            resourceId: user.id,
            ip,
            userAgent,
            metadata: { lockedUntil: user.lockedUntil.toISOString() } as Prisma.InputJsonValue,
          });
          throw new Error(`ACCOUNT_LOCKED:${secs}`);
        }

        if (user.otpLockedUntil && user.otpLockedUntil.getTime() > Date.now()) {
          throw new Error(`OTP_LOCKED:${secondsLeft(user.otpLockedUntil)}`);
        }

        // ---------------------------
        // 3) Password verify
        // ---------------------------
        const okPassword = await verifyPassword(password, user.passwordHash);

        if (!okPassword) {
          if (ipKey) {
            await rateLimitRecord({
              action: "AUTH_LOGIN_FAIL",
              key: ipKey,
              ip,
              userAgent,
              userId: user.id,
              metadata: { reason: "BAD_PASSWORD", identifier, userId: user.id } as Prisma.InputJsonValue,
            });
          }
          await rateLimitRecord({
            action: "AUTH_LOGIN_FAIL",
            key: idKey,
            ip,
            userAgent,
            userId: user.id,
            metadata: { reason: "BAD_PASSWORD", identifier, userId: user.id } as Prisma.InputJsonValue,
          });

          const nextCount = (user.failedLoginCount ?? 0) + 1;
          const shouldLock = nextCount >= LOCKOUT_FAIL_THRESHOLD;
          const lockedUntil = shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;

          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginCount: nextCount, lockedUntil: shouldLock ? lockedUntil : null },
          });

          await safeAudit({
            user: userConnect(user.id),
            action: shouldLock ? "LOGIN_LOCKED" : "LOGIN_FAIL",
            resource: "User",
            resourceId: user.id,
            ip,
            userAgent,
            metadata: {
              reason: "BAD_PASSWORD",
              failedLoginCount: nextCount,
              lockedUntil: lockedUntil ? lockedUntil.toISOString() : null,
            } as Prisma.InputJsonValue,
          });

          if (shouldLock && lockedUntil) throw new Error(`ACCOUNT_LOCKED:${secondsLeft(lockedUntil)}`);
          return null;
        }

        // ---------------------------
        // 4) 2FA verify
        // ---------------------------
        if (user.twoFactorEnabled) {
          if (!otp) {
            await safeAudit({
              user: userConnect(user.id),
              action: "LOGIN_BLOCKED_OTP_REQUIRED",
              resource: "User",
              resourceId: user.id,
              ip,
              userAgent,
              metadata: { reason: "OTP_REQUIRED" } as Prisma.InputJsonValue,
            });
            throw new Error("OTP_REQUIRED");
          }

          const hasEnvelope =
            !!user.twoFactorSecretCiphertext &&
            !!user.twoFactorSecretKeyCiphertext &&
            !!user.twoFactorSecretIv &&
            !!user.twoFactorSecretTag;

          if (!hasEnvelope) {
            await safeAudit({
              user: userConnect(user.id),
              action: "LOGIN_BLOCKED_2FA_MISCONFIGURED",
              resource: "User",
              resourceId: user.id,
              ip,
              userAgent,
              metadata: { reason: "2FA_ENABLED_BUT_SECRET_MISSING" } as Prisma.InputJsonValue,
            });
            throw new Error("OTP_MISCONFIGURED");
          }

          const okOtp = verifyTotpWithEnvelope({
            token: otp,
            envelope: {
              twoFactorSecretCiphertext: user.twoFactorSecretCiphertext!,
              twoFactorSecretKeyCiphertext: user.twoFactorSecretKeyCiphertext!,
              twoFactorSecretIv: user.twoFactorSecretIv!,
              twoFactorSecretTag: user.twoFactorSecretTag!,
            },
          });

          if (!okOtp) {
            const nextOtp = (user.failedOtpCount ?? 0) + 1;
            const otpShouldLock = nextOtp >= OTP_FAIL_THRESHOLD;
            const otpLockedUntil = otpShouldLock ? new Date(Date.now() + OTP_LOCKOUT_MINUTES * 60 * 1000) : null;

            await prisma.user.update({
              where: { id: user.id },
              data: { failedOtpCount: nextOtp, otpLockedUntil: otpShouldLock ? otpLockedUntil : null },
            });

            await safeAudit({
              user: userConnect(user.id),
              action: otpShouldLock ? "LOGIN_OTP_LOCKED" : "LOGIN_FAIL_OTP",
              resource: "User",
              resourceId: user.id,
              ip,
              userAgent,
              metadata: { reason: "BAD_OTP", failedOtpCount: nextOtp } as Prisma.InputJsonValue,
            });

            if (otpShouldLock && otpLockedUntil) throw new Error(`OTP_LOCKED:${secondsLeft(otpLockedUntil)}`);
            throw new Error("OTP_INVALID");
          }
        }

        // ---------------------------
        // 5) Reset counters + set lastActiveTenantId
        // ---------------------------
        const resetData: any = {};
        if ((user.failedLoginCount ?? 0) !== 0 || user.lockedUntil) {
          resetData.failedLoginCount = 0;
          resetData.lockedUntil = null;
        }
        if ((user.failedOtpCount ?? 0) !== 0 || user.otpLockedUntil) {
          resetData.failedOtpCount = 0;
          resetData.otpLockedUntil = null;
        }
        if (membership?.tenantId) {
          resetData.lastActiveTenantId = membership.tenantId;
        }
        if (Object.keys(resetData).length) {
          await prisma.user.update({ where: { id: user.id }, data: resetData });
        }

        // ---------------------------
        // 6) Attach teacher scope (3b)
        // ---------------------------
        let teacherScope: TeacherScope | null = null;
        if (membership?.tenantId) {
          const tp = await prisma.teacherProfile.findFirst({
            where: { tenantId: membership.tenantId, userId: user.id },
            select: { phase: true, classLevel: true, jhsAssignments: true },
          });
          teacherScope = {
            phase: tp?.phase ?? null,
            classLevel: tp?.classLevel ?? null,
            jhsAssignments: (tp?.jhsAssignments as any) ?? null,
          };
        }

        const safe: SafeUser = {
          id: user.id,
          email: user.email,
          name: user.name,
          staffId: membership?.staffId ?? null,
          tenantId: membership?.tenantId ?? null,
          roleName: membership?.role?.name ?? null,
          teacherScope,
        };

        await safeAudit({
          tenant: tenantConnect(safe.tenantId ?? null),
          user: userConnect(user.id),
          action: "LOGIN_SUCCESS",
          resource: "User",
          resourceId: user.id,
          ip,
          userAgent,
          metadata: {
            roleName: safe.roleName ?? null,
            twoFactorEnabled: user.twoFactorEnabled ?? false,
          } as Prisma.InputJsonValue,
        });

        return safe as any;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = (user as any).id;
        token.email = (user as any).email;
        token.name = (user as any).name ?? null;
        token.staffId = (user as any).staffId ?? null; // now tenant-scoped
        token.tenantId = (user as any).tenantId ?? null;
        token.roleName = (user as any).roleName ?? null;
        token.teacherScope = (user as any).teacherScope ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as any).id = token.uid as string;
      (session.user as any).staffId = (token.staffId as string) ?? null;
      (session.user as any).tenantId = (token.tenantId as string) ?? null;
      (session.user as any).roleName = (token.roleName as string) ?? null;
      (session.user as any).teacherScope = (token as any).teacherScope ?? null;
      return session;
    },
  },
};
