// src/lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import {
  getIpFromHeaders,
  getUserAgentFromHeaders,
  rateLimitCheck,
  rateLimitRecord,
} from "@/lib/rateLimit";
import type { Prisma } from "@prisma/client";
import { verifyTotpWithEnvelope } from "@/lib/totp";

type TeacherScope = {
  phase: string | null;
  classLevel: string | null;
  jhsAssignments: Prisma.JsonValue | null;
};

type SafeUser = {
  id: string;
  email: string;
  name: string | null;
  staffId: string | null; // tenant-scoped staff ID (from Membership)
  tenantId?: string | null;
  roleName?: string | null;
  teacherScope?: TeacherScope | null;

  // ✅ Exposed for /api/me
  phone?: string | null;
  phoneNumber?: string | null;
};

type NextAuthUserLike = {
  id: string;
  email: string;
  name: string | null;
  staffId?: string | null;
  tenantId?: string | null;
  roleName?: string | null;
  teacherScope?: TeacherScope | null;
  phone?: string | null;
  phoneNumber?: string | null;
} & Record<string, unknown>;

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

/**
 * ✅ Load phone for session/JWT from your actual schema:
 * TeacherProfile has `phone` and is tenant-scoped.
 *
 * Rules:
 * - Prefer TeacherProfile for the active tenantId
 * - If tenantId not provided or no row found, optionally fall back to any teacherProfile for the user
 * - Fail-closed -> nulls (no guessing)
 */
async function loadUserPhoneForSession(args: {
  userId: string;
  tenantId?: string | null;
}): Promise<{ phone: string | null; phoneNumber: string | null }> {
  const userId = cleanStr(args.userId);
  const tenantId = cleanStr(args.tenantId ?? "");

  if (!userId) return { phone: null, phoneNumber: null };

  try {
    if (tenantId) {
      const tp = await prisma.teacherProfile.findFirst({
        where: { userId, tenantId },
        select: { phone: true },
      });
      const p = cleanStr(tp?.phone ?? "");
      if (p) return { phone: p, phoneNumber: p };
    }

    // Fallback: any teacher profile for the user (if they exist but tenant-scoped row missing)
    const anyTp = await prisma.teacherProfile.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { phone: true },
    });
    const p2 = cleanStr(anyTp?.phone ?? "");
    if (p2) return { phone: p2, phoneNumber: p2 };
  } catch {
    // table/row missing etc. -> fail closed
  }

  return { phone: null, phoneNumber: null };
}

/**
 * Accept tenant identifier in ANY of these forms:
 * - tenant id (cuid)
 * - schoolCode (SCH-XXXXXX)
 * - slug (ayitikope-basic)
 * - emisCode (optional)
 */
async function resolveTenantIdOrNull(raw: string | null | undefined) {
  const v = cleanStr(raw);
  if (!v) return null;

  try {
    const t = await prisma.tenant.findFirst({
      where: {
        OR: [
          { id: v },
          { schoolCode: { equals: v, mode: "insensitive" } },
          { slug: { equals: v, mode: "insensitive" } },
          { emisCode: { equals: v, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });

    return t?.id ?? null;
  } catch {
    // Fail-closed: treat as unavailable backend (do not guess)
    throw new Error("AUTH_BACKEND_UNAVAILABLE");
  }
}

type PickedMembership = {
  tenantId: string;
  staffId: string | null;
  role: { name: string | null } | null;
};

async function pickMembershipForUserStrict(
  userId: string,
  preferredTenantId: string | null
): Promise<PickedMembership | null> {
  // 1) Preferred tenant, if valid and ACTIVE
  if (preferredTenantId) {
    const m = await prisma.membership.findFirst({
      where: { userId, tenantId: preferredTenantId, status: "ACTIVE" },
      select: { tenantId: true, staffId: true, role: { select: { name: true } } },
    });
    if (m) return m as PickedMembership;
  }

  // 2) Fallback: ONLY when exactly one ACTIVE membership exists.
  const ms = await prisma.membership.findMany({
    where: { userId, status: "ACTIVE" },
    select: { tenantId: true, staffId: true, role: { select: { name: true } } },
    take: 2,
  });

  if (ms.length === 1) return ms[0] as PickedMembership;
  if (ms.length === 0) return null;

  // Bank-grade: do not guess tenant when multiple exist.
  throw new Error("TENANT_REQUIRED");
}

type StaffIdGlobalPick =
  | null
  | {
      tenantId: string;
      staffId: string | null;
      role: { name: string | null } | null;
      user: {
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
      };
    };

async function pickByStaffIdGlobally(args: {
  staffIdNorm: string;
  staffIdRaw: string;
}): Promise<StaffIdGlobalPick> {
  const { staffIdNorm, staffIdRaw } = args;

  const hits = await prisma.membership.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { staffIdNorm },
        { staffId: { equals: staffIdRaw, mode: "insensitive" } },
      ],
    },
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
    take: 2,
  });

  if (hits.length === 1) return hits[0] as any;
  if (hits.length === 0) return null;

  throw new Error("TENANT_REQUIRED");
}

// ---------------- Tunables ----------------
const LOGIN_WINDOW_SECONDS = Number(process.env.AUTH_LOGIN_WINDOW_SECONDS || 15 * 60);
const LOGIN_FAIL_LIMIT_PER_IP = Number(process.env.AUTH_LOGIN_FAIL_LIMIT_PER_IP || 25);
const LOGIN_FAIL_LIMIT_PER_IDENTIFIER = Number(
  process.env.AUTH_LOGIN_FAIL_LIMIT_PER_IDENTIFIER || 10
);

const LOCKOUT_FAIL_THRESHOLD = Number(process.env.AUTH_LOCKOUT_FAIL_THRESHOLD || 8);
const LOCKOUT_MINUTES = Number(process.env.AUTH_LOCKOUT_MINUTES || 10);

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
        tenant: { label: "School Code / Tenant", type: "text" },
      },

      async authorize(credentials, req) {
        const headers = new Headers((req as { headers?: HeadersInit } | undefined)?.headers ?? {});
        const ip = getIpFromHeaders(headers);
        const userAgent = getUserAgentFromHeaders(headers);

        const c = (credentials ?? {}) as Partial<{
          identifier: string;
          password: string;
          otp: string;
          tenant: string;
        }>;

        const identifier = cleanStr(c.identifier);
        const password = cleanStr(c.password);
        const otp = cleanStr(c.otp);
        const tenantRaw = cleanStr(c.tenant);

        if (!identifier || !password) return null;

        const emailLogin = isEmailLike(identifier);

        const tenantIdHint = await resolveTenantIdOrNull(tenantRaw);
        const tenantInputProvided = !!tenantRaw;
        const tenantInputInvalid = tenantInputProvided && !tenantIdHint;

        const identifierKey = emailLogin
          ? cleanEmail(identifier)
          : normalizeStaffIdNorm(identifier) || identifier.toUpperCase();

        const ipKey = ip ? `ip:${ip}` : null;
        const idKey = `id:${tenantIdHint ?? "noTenant"}:${identifierKey}`;

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

        async function recordFail(
          reason: string,
          userId?: string | null,
          extra?: Record<string, unknown>
        ) {
          const meta = {
            reason,
            identifier,
            tenantId: tenantIdHint ?? null,
            tenantRaw: tenantRaw || null,
            ...(extra ?? {}),
          } as Prisma.InputJsonValue;

          if (ipKey) {
            await rateLimitRecord({
              action: "AUTH_LOGIN_FAIL",
              key: ipKey,
              ip,
              userAgent,
              userId: userId ?? undefined,
              metadata: meta,
            });
          }
          await rateLimitRecord({
            action: "AUTH_LOGIN_FAIL",
            key: idKey,
            ip,
            userAgent,
            userId: userId ?? undefined,
            metadata: meta,
          });

          await safeAudit({
            tenant: tenantConnect(tenantIdHint ?? null),
            user: userId ? userConnect(userId) : undefined,
            action: "LOGIN_FAIL",
            resource: "User",
            resourceId: userId ?? identifier,
            ip,
            userAgent,
            metadata: meta,
          });
        }

        // ---------------------------
        // 1) Resolve user + membership
        // ---------------------------
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

        let membership: PickedMembership | null = null;

        if (emailLogin) {
          user = await prisma.user.findFirst({
            where: { email: { equals: cleanEmail(identifier), mode: "insensitive" } },
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
            await recordFail("NO_USER_OR_NO_PASSWORD_HASH");
            return null;
          }

          if (tenantInputInvalid) {
            try {
              const m = await pickMembershipForUserStrict(user.id, null);
              if (!m) {
                await recordFail("INVALID_TENANT_NO_MEMBERSHIP", user.id);
                throw new Error("INVALID_TENANT");
              }
              membership = m;

              await safeAudit({
                user: userConnect(user.id),
                tenant: tenantConnect(m.tenantId),
                action: "LOGIN_TENANT_INPUT_INVALID_BYPASSED",
                resource: "Tenant",
                resourceId: tenantRaw,
                ip,
                userAgent,
                metadata: {
                  reason: "INVALID_TENANT_BYPASSED_SINGLE_MEMBERSHIP",
                  tenantRaw,
                  chosenTenantId: m.tenantId,
                } as Prisma.InputJsonValue,
              });
            } catch (e: any) {
              const msg = e?.message || "";
              if (msg === "TENANT_REQUIRED") {
                await recordFail("INVALID_TENANT_MULTI_MEMBERSHIP", user.id);
                throw new Error("INVALID_TENANT");
              }
              throw e;
            }
          } else {
            try {
              membership = await pickMembershipForUserStrict(user.id, tenantIdHint ?? null);
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : "";
              if (msg === "TENANT_REQUIRED") {
                await recordFail("TENANT_REQUIRED", user.id);
                throw new Error("TENANT_REQUIRED");
              }
              throw e;
            }
          }

          if (!membership?.tenantId) {
            await recordFail("NO_ACTIVE_MEMBERSHIP", user.id);
            return null;
          }
        } else {
          // Staff ID login
          const staffIdRaw = cleanStr(identifier);
          const staffIdNorm = normalizeStaffIdNorm(staffIdRaw);
          if (!staffIdNorm) return null;

          if (tenantIdHint) {
            const m = await prisma.membership.findFirst({
              where: {
                tenantId: tenantIdHint,
                status: "ACTIVE",
                OR: [{ staffIdNorm }, { staffId: { equals: staffIdRaw, mode: "insensitive" } }],
              },
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
              await recordFail("NO_MEMBERSHIP_OR_NO_PASSWORD_HASH", null, {
                staffIdNorm,
                staffIdRaw,
              });
              return null;
            }

            membership = { tenantId: m.tenantId, staffId: m.staffId ?? null, role: m.role ?? null };
            user = { ...m.user };
          } else {
            try {
              const picked = await pickByStaffIdGlobally({ staffIdNorm, staffIdRaw });

              if (!picked?.user?.id || !picked.user.passwordHash) {
                await recordFail("NO_MEMBERSHIP_OR_NO_PASSWORD_HASH", null, {
                  staffIdNorm,
                  staffIdRaw,
                });
                return null;
              }

              membership = {
                tenantId: picked.tenantId,
                staffId: picked.staffId ?? null,
                role: picked.role ?? null,
              };
              user = { ...picked.user };

              if (tenantInputInvalid) {
                await safeAudit({
                  user: userConnect(user.id),
                  tenant: tenantConnect(membership.tenantId),
                  action: "LOGIN_TENANT_INPUT_INVALID_BYPASSED",
                  resource: "Tenant",
                  resourceId: tenantRaw,
                  ip,
                  userAgent,
                  metadata: {
                    reason: "INVALID_TENANT_BYPASSED_UNAMBIGUOUS_STAFFID",
                    tenantRaw,
                    chosenTenantId: membership.tenantId,
                    staffIdNorm,
                  } as Prisma.InputJsonValue,
                });
              }
            } catch (e: any) {
              const msg = e?.message || "";

              if (tenantInputInvalid) {
                await recordFail("INVALID_TENANT_STAFFID_UNRESOLVED", null, {
                  staffIdNorm,
                  staffIdRaw,
                });
                throw new Error("INVALID_TENANT");
              }

              if (msg === "TENANT_REQUIRED") {
                await recordFail("TENANT_REQUIRED_FOR_STAFFID", null, {
                  staffIdNorm,
                  staffIdRaw,
                });
                throw new Error("TENANT_REQUIRED");
              }

              throw e;
            }
          }
        }

        if (!user?.id || !user.passwordHash || !membership?.tenantId) return null;

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
          const nextCount = (user.failedLoginCount ?? 0) + 1;
          const shouldLock = nextCount >= LOCKOUT_FAIL_THRESHOLD;
          const lockedUntil = shouldLock
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
            : null;

          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginCount: nextCount, lockedUntil: shouldLock ? lockedUntil : null },
          });

          await recordFail(shouldLock ? "BAD_PASSWORD_LOCKED" : "BAD_PASSWORD", user.id, {
            failedLoginCount: nextCount,
            lockedUntil: lockedUntil ? lockedUntil.toISOString() : null,
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
            const otpLockedUntil = otpShouldLock
              ? new Date(Date.now() + OTP_LOCKOUT_MINUTES * 60 * 1000)
              : null;

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
              metadata: {
                reason: "BAD_OTP",
                failedOtpCount: nextOtp,
                otpLockedUntil: otpLockedUntil ? otpLockedUntil.toISOString() : null,
              } as Prisma.InputJsonValue,
            });

            if (otpShouldLock && otpLockedUntil) {
              throw new Error(`OTP_LOCKED:${secondsLeft(otpLockedUntil)}`);
            }
            throw new Error("OTP_INVALID");
          }
        }

        // ---------------------------
        // 5) Reset counters + set lastActiveTenant
        // ---------------------------
        const resetData: Prisma.UserUpdateInput = {};

        if ((user.failedLoginCount ?? 0) !== 0 || user.lockedUntil) {
          resetData.failedLoginCount = 0;
          resetData.lockedUntil = null;
        }
        if ((user.failedOtpCount ?? 0) !== 0 || user.otpLockedUntil) {
          resetData.failedOtpCount = 0;
          resetData.otpLockedUntil = null;
        }
        if (membership?.tenantId) {
          resetData.lastActiveTenant = { connect: { id: membership.tenantId } };
        }

        if (Object.keys(resetData).length) {
          await prisma.user.update({ where: { id: user.id }, data: resetData });
        }

        // ---------------------------
        // 6) Attach teacher scope
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
            jhsAssignments: (tp?.jhsAssignments ?? null) as Prisma.JsonValue | null,
          };
        }

        // ---------------------------
        // 7) ✅ Load phone (tenant-scoped TeacherProfile.phone)
        // ---------------------------
        const phoneBundle = await loadUserPhoneForSession({
          userId: user.id,
          tenantId: membership?.tenantId ?? null,
        });

        const safe: SafeUser = {
          id: user.id,
          email: user.email,
          name: user.name,
          staffId: membership?.staffId ?? null,
          tenantId: membership?.tenantId ?? null,
          roleName: membership?.role?.name ?? null,
          teacherScope,
          phone: phoneBundle.phone,
          phoneNumber: phoneBundle.phoneNumber,
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

        return safe as NextAuthUserLike;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      const t = token as Record<string, unknown>;

      if (user) {
        const u = user as unknown as SafeUser;
        t.uid = u.id;
        t.email = u.email;
        t.name = u.name ?? null;
        t.staffId = u.staffId ?? null;
        t.tenantId = u.tenantId ?? null;
        t.roleName = u.roleName ?? null;
        t.teacherScope = u.teacherScope ?? null;

        // ✅ NEW
        t.phone = u.phone ?? null;
        t.phoneNumber = u.phoneNumber ?? null;

        return token;
      }

      if (trigger === "update") {
        const uid = typeof t.uid === "string" ? t.uid : null;
        const desiredTenantIdRaw =
          session && (session as any).tenantId ? String((session as any).tenantId) : null;

        if (uid && desiredTenantIdRaw) {
          const m = await prisma.membership.findUnique({
            where: { userId_tenantId: { userId: uid, tenantId: desiredTenantIdRaw } },
            select: {
              status: true,
              staffId: true,
              role: { select: { name: true } },
            },
          });

          if (m && m.status === "ACTIVE") {
            t.tenantId = desiredTenantIdRaw;
            t.staffId = m.staffId ?? null;
            t.roleName = m.role?.name ?? null;

            const tp = await prisma.teacherProfile.findFirst({
              where: { tenantId: desiredTenantIdRaw, userId: uid },
              select: { phase: true, classLevel: true, jhsAssignments: true },
            });

            t.teacherScope = {
              phase: tp?.phase ?? null,
              classLevel: tp?.classLevel ?? null,
              jhsAssignments: (tp?.jhsAssignments ?? null) as Prisma.JsonValue | null,
            };

            // ✅ Refresh phone on tenant switch
            try {
              const phoneBundle = await loadUserPhoneForSession({
                userId: uid,
                tenantId: desiredTenantIdRaw,
              });
              t.phone = phoneBundle.phone ?? null;
              t.phoneNumber = phoneBundle.phoneNumber ?? null;
            } catch {
              // ignore
            }

            try {
              await prisma.user.update({
                where: { id: uid },
                data: { lastActiveTenant: { connect: { id: desiredTenantIdRaw } } },
              });
            } catch {
              // ignore
            }
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      const t = token as Record<string, unknown>;
      const su = session.user as typeof session.user & {
        id?: string;
        staffId?: string | null;
        tenantId?: string | null;
        roleName?: string | null;
        teacherScope?: TeacherScope | null;

        // ✅ NEW
        phone?: string | null;
        phoneNumber?: string | null;
      };

      if (typeof t.uid === "string") su.id = t.uid;

      su.staffId = typeof t.staffId === "string" ? t.staffId : null;
      su.tenantId = typeof t.tenantId === "string" ? t.tenantId : null;
      su.roleName = typeof t.roleName === "string" ? t.roleName : null;
      su.teacherScope = (t.teacherScope as TeacherScope) ?? null;

      // ✅ NEW
      su.phone = typeof t.phone === "string" ? t.phone : null;
      su.phoneNumber = typeof t.phoneNumber === "string" ? t.phoneNumber : null;

      return session;
    },
  },
};
