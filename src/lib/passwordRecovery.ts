import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { sendEmail } from "@/lib/email/sendEmail";
import { buildPublicUrl } from "@/lib/publicUrl";
import { writeAuditLog } from "@/lib/audit";

export const PASSWORD_RECOVERY_TTL_MINUTES = 15;
export const RECOVERY_PASSWORD_MIN_LENGTH = 12;
export const RECOVERY_PASSWORD_MAX_LENGTH = 128;

export const GENERIC_PASSWORD_RECOVERY_MESSAGE =
  "If an account can use this recovery method, we sent password reset instructions.";

const RAW_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 10_000,
} as const;

type RequestAuditContext = {
  ip?: string | null;
  userAgent?: string | null;
};

type ResetResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "INVALID_OR_EXPIRED_RECOVERY"
        | "PASSWORD_POLICY"
        | "RECOVERY_TEMPORARILY_UNAVAILABLE";
      message?: string;
    };

class InvalidRecoveryStateError extends Error {
  constructor() {
    super("INVALID_OR_EXPIRED_RECOVERY");
  }
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeRecoveryEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isRecoveryEmailAddress(value: string) {
  if (!value || value.length > 254) return false;
  if (/\s/.test(value)) return false;

  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;

  const domain = value.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

export function isRawPasswordRecoveryToken(value: unknown) {
  return RAW_TOKEN_RE.test(String(value ?? "").trim());
}

export function validateRecoveryPassword(value: unknown): string | null {
  const raw = String(value ?? "");

  if (raw !== raw.trim()) {
    return "Password cannot start or end with spaces.";
  }

  if (raw.length < RECOVERY_PASSWORD_MIN_LENGTH) {
    return `Use at least ${RECOVERY_PASSWORD_MIN_LENGTH} characters.`;
  }

  if (raw.length > RECOVERY_PASSWORD_MAX_LENGTH) {
    return `Use no more than ${RECOVERY_PASSWORD_MAX_LENGTH} characters.`;
  }

  return null;
}

export async function issuePasswordRecovery(
  args: {
    email: string;
  } & RequestAuditContext
): Promise<void> {
  const email = normalizeRecoveryEmail(args.email);

  if (!isRecoveryEmailAddress(email)) return;

  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      authVersion: true,
    },
  });

  // Public callers receive the same response whether the account exists or not.
  if (!user?.id || !user.passwordHash) return;

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256Hex(rawToken);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + PASSWORD_RECOVERY_TTL_MINUTES * 60 * 1000
  );

  let issued:
    | {
        id: string;
        expiresAt: Date;
      }
    | null = null;

  try {
    issued = await prisma.$transaction(async (tx) => {
      // Only the newest issued recovery credential remains usable.
      await tx.passwordRecoveryToken.updateMany({
        where: {
          userId: user.id,
          consumedAt: null,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      const row = await tx.passwordRecoveryToken.create({
        data: {
          userId: user.id,
          tokenHash,
          authVersionAtIssue: user.authVersion,
          expiresAt,
        },
        select: {
          id: true,
          expiresAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "PASSWORD_RECOVERY_ISSUED",
          resource: "PasswordRecoveryToken",
          resourceId: row.id,
          ip: args.ip ?? null,
          userAgent: args.userAgent ?? null,
          metadata: {
            expiresAt: row.expiresAt.toISOString(),
            authVersionAtIssue: user.authVersion,
            plaintextTokenStored: false,
            tenantAuthorityChanged: false,
          },
        },
      });

      return row;
    }, TX_OPTIONS);
  } catch {
    // Do not leak account existence or infrastructure state through the public response.
    return;
  }

  if (!issued) return;

  const resetPage = buildPublicUrl("/auth/reset-password");
  const resetUrl = `${resetPage}#token=${encodeURIComponent(rawToken)}`;
  const safeResetUrl = escapeHtml(resetUrl);

  const delivery = await sendEmail({
    to: user.email,
    subject: "Reset your EduLife OS staff password",
    text:
      `A password reset was requested for your EduLife OS staff account.\n\n` +
      `Open this secure one-time link:\n${resetUrl}\n\n` +
      `The link expires in ${PASSWORD_RECOVERY_TTL_MINUTES} minutes and can be used once.\n` +
      `If you did not request this, you can ignore this message.`,
    html:
      `<p>A password reset was requested for your EduLife OS staff account.</p>` +
      `<p><a href="${safeResetUrl}">Reset your password</a></p>` +
      `<p>This one-time link expires in ${PASSWORD_RECOVERY_TTL_MINUTES} minutes.</p>` +
      `<p>If you did not request this, you can ignore this message.</p>`,
    idempotencyKey: `password-recovery:${issued.id}`,
  });

  if (!delivery.ok) {
    try {
      await prisma.passwordRecoveryToken.updateMany({
        where: {
          id: issued.id,
          consumedAt: null,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } catch {
      // The raw credential is never logged or returned to the requester.
    }

    await writeAuditLog({
      action: "PASSWORD_RECOVERY_DELIVERY_FAILED",
      userId: user.id,
      resource: "PasswordRecoveryToken",
      resourceId: issued.id,
      ip: args.ip ?? undefined,
      userAgent: args.userAgent ?? undefined,
      metadata: {
        provider: delivery.provider,
        testMode: delivery.testMode,
        recoveryCredentialRevocationRequested: true,
      },
    });

    return;
  }

  await writeAuditLog({
    action: "PASSWORD_RECOVERY_DELIVERY_SENT",
    userId: user.id,
    resource: "PasswordRecoveryToken",
    resourceId: issued.id,
    ip: args.ip ?? undefined,
    userAgent: args.userAgent ?? undefined,
    metadata: {
      provider: delivery.provider,
      testMode: delivery.testMode,
      expiresAt: issued.expiresAt.toISOString(),
    },
  });
}

function activeRecoveryRow(
  row:
    | {
        authVersionAtIssue: number;
        expiresAt: Date;
        consumedAt: Date | null;
        revokedAt: Date | null;
        user: { authVersion: number };
      }
    | null,
  now: Date
) {
  return Boolean(
    row &&
      !row.consumedAt &&
      !row.revokedAt &&
      row.expiresAt.getTime() > now.getTime() &&
      row.authVersionAtIssue === row.user.authVersion
  );
}

export async function resetPasswordWithRecoveryToken(
  args: {
    token: string;
    newPassword: string;
  } & RequestAuditContext
): Promise<ResetResult> {
  const token = String(args.token ?? "").trim();

  if (!isRawPasswordRecoveryToken(token)) {
    return { ok: false, code: "INVALID_OR_EXPIRED_RECOVERY" };
  }

  const policyError = validateRecoveryPassword(args.newPassword);
  if (policyError) {
    return {
      ok: false,
      code: "PASSWORD_POLICY",
      message: policyError,
    };
  }

  const tokenHash = sha256Hex(token);
  const now = new Date();

  let preflight:
    | {
        id: string;
        authVersionAtIssue: number;
        expiresAt: Date;
        consumedAt: Date | null;
        revokedAt: Date | null;
        user: { authVersion: number };
      }
    | null;

  try {
    preflight = await prisma.passwordRecoveryToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        authVersionAtIssue: true,
        expiresAt: true,
        consumedAt: true,
        revokedAt: true,
        user: {
          select: {
            authVersion: true,
          },
        },
      },
    });
  } catch {
    return {
      ok: false,
      code: "RECOVERY_TEMPORARILY_UNAVAILABLE",
    };
  }

  if (!activeRecoveryRow(preflight, now)) {
    return { ok: false, code: "INVALID_OR_EXPIRED_RECOVERY" };
  }

  // Argon2 work happens only after the token passes a cheap DB validity preflight.
  const newPasswordHash = await hashPassword(args.newPassword);

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.passwordRecoveryToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          authVersionAtIssue: true,
          expiresAt: true,
          consumedAt: true,
          revokedAt: true,
          user: {
            select: {
              authVersion: true,
            },
          },
        },
      });

      if (!activeRecoveryRow(current, now) || !current) {
        throw new InvalidRecoveryStateError();
      }

      const claim = await tx.passwordRecoveryToken.updateMany({
        where: {
          id: current.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          consumedAt: now,
        },
      });

      if (claim.count !== 1) {
        throw new InvalidRecoveryStateError();
      }

      const passwordUpdate = await tx.user.updateMany({
        where: {
          id: current.userId,
          authVersion: current.authVersionAtIssue,
        },
        data: {
          passwordHash: newPasswordHash,
          authVersion: { increment: 1 },
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });

      if (passwordUpdate.count !== 1) {
        throw new InvalidRecoveryStateError();
      }

      await tx.passwordRecoveryToken.updateMany({
        where: {
          userId: current.userId,
          id: { not: current.id },
          consumedAt: null,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: current.userId,
          action: "PASSWORD_RECOVERY_COMPLETED",
          resource: "PasswordRecoveryToken",
          resourceId: current.id,
          ip: args.ip ?? null,
          userAgent: args.userAgent ?? null,
          metadata: {
            previousAuthVersion: current.authVersionAtIssue,
            nextAuthVersion: current.authVersionAtIssue + 1,
            passwordLoginLockoutCleared: true,
            staffTotpStateChanged: false,
            tenantAuthorityChanged: false,
            recoveryTokenReplayAllowed: false,
          },
        },
      });
    }, TX_OPTIONS);
  } catch (error) {
    if (error instanceof InvalidRecoveryStateError) {
      return { ok: false, code: "INVALID_OR_EXPIRED_RECOVERY" };
    }

    return {
      ok: false,
      code: "RECOVERY_TEMPORARILY_UNAVAILABLE",
    };
  }

  return { ok: true };
}
