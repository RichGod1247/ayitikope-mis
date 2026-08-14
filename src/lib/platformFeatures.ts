import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PLATFORM_FEATURE_KEYS = {
  TEACHER_ATTENDANCE: "TEACHER_ATTENDANCE",
} as const;

export const TEACHER_ATTENDANCE_DISABLED_CODE =
  "TEACHER_ATTENDANCE_DISABLED" as const;

export const TEACHER_ATTENDANCE_DISABLED_MESSAGE =
  "Teacher Attendance is temporarily unavailable while institutional safeguards for fair use are being finalized.";

export type TeacherAttendanceFeatureState = {
  key: typeof PLATFORM_FEATURE_KEYS.TEACHER_ATTENDANCE;
  enabled: boolean;
  configured: boolean;
  storageAvailable: boolean;
  reason: string | null;
  updatedAt: string | null;
  cacheToken: string;
};

export class PlatformFeatureControlError extends Error {
  status: number;
  code: string;

  constructor(code: string, status: number) {
    super(code);
    this.name = "PlatformFeatureControlError";
    this.code = code;
    this.status = status;
  }
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function activeSuperadminWhere(userId: string) {
  return {
    userId,
    status: "ACTIVE",
    role: {
      name: {
        equals: "SUPERADMIN",
        mode: "insensitive" as const,
      },
    },
  };
}

export function teacherAttendanceDisabledPayload() {
  return {
    ok: false as const,
    error: TEACHER_ATTENDANCE_DISABLED_CODE,
    message: TEACHER_ATTENDANCE_DISABLED_MESSAGE,
  };
}

export async function readTeacherAttendanceFeatureState(): Promise<TeacherAttendanceFeatureState> {
  try {
    const row = await prisma.platformFeatureFlag.findUnique({
      where: { key: PLATFORM_FEATURE_KEYS.TEACHER_ATTENDANCE },
      select: {
        enabled: true,
        reason: true,
        updatedAt: true,
      },
    });

    if (!row) {
      return {
        key: PLATFORM_FEATURE_KEYS.TEACHER_ATTENDANCE,
        enabled: false,
        configured: false,
        storageAvailable: true,
        reason: null,
        updatedAt: null,
        cacheToken: "TEACHER_ATTENDANCE:MISSING:OFF",
      };
    }

    const updatedAt = row.updatedAt.toISOString();

    return {
      key: PLATFORM_FEATURE_KEYS.TEACHER_ATTENDANCE,
      enabled: row.enabled === true,
      configured: true,
      storageAvailable: true,
      reason: row.reason ?? null,
      updatedAt,
      cacheToken: `TEACHER_ATTENDANCE:${row.enabled ? "ON" : "OFF"}:${updatedAt}`,
    };
  } catch (error) {
    console.error("[PLATFORM_FEATURE_TEACHER_ATTENDANCE_READ_ERROR]", error);

    // Safety policy: inability to prove that the feature is enabled means OFF.
    return {
      key: PLATFORM_FEATURE_KEYS.TEACHER_ATTENDANCE,
      enabled: false,
      configured: false,
      storageAvailable: false,
      reason: null,
      updatedAt: null,
      cacheToken: "TEACHER_ATTENDANCE:STORAGE_ERROR:OFF",
    };
  }
}

export async function isActiveSuperadminUser(userId: string) {
  const actorUserId = clean(userId);
  if (!actorUserId) return false;

  const count = await prisma.membership.count({
    where: activeSuperadminWhere(actorUserId),
  });

  return count > 0;
}

export async function setTeacherAttendanceFeatureState(input: {
  actorUserId: string;
  enabled: boolean;
  reason: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const actorUserId = clean(input.actorUserId);
  const reason = clean(input.reason);

  if (!actorUserId) {
    throw new PlatformFeatureControlError("UNAUTHORIZED", 401);
  }

  if (reason.length < 12 || reason.length > 500) {
    throw new PlatformFeatureControlError(
      "PLATFORM_FEATURE_REASON_INVALID",
      400,
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const superadminCount = await tx.membership.count({
        where: activeSuperadminWhere(actorUserId),
      });

      if (superadminCount < 1) {
        throw new PlatformFeatureControlError("FORBIDDEN", 403);
      }

      const current = await tx.platformFeatureFlag.findUnique({
        where: { key: PLATFORM_FEATURE_KEYS.TEACHER_ATTENDANCE },
        select: {
          key: true,
          enabled: true,
          reason: true,
          updatedAt: true,
        },
      });

      if (current && current.enabled === input.enabled) {
        return {
          outcome: "UNCHANGED" as const,
          state: {
            key: PLATFORM_FEATURE_KEYS.TEACHER_ATTENDANCE,
            enabled: current.enabled,
            configured: true,
            storageAvailable: true,
            reason: current.reason ?? null,
            updatedAt: current.updatedAt.toISOString(),
          },
        };
      }

      const saved = await tx.platformFeatureFlag.upsert({
        where: { key: PLATFORM_FEATURE_KEYS.TEACHER_ATTENDANCE },
        create: {
          key: PLATFORM_FEATURE_KEYS.TEACHER_ATTENDANCE,
          enabled: input.enabled,
          updatedByUserId: actorUserId,
          reason,
        },
        update: {
          enabled: input.enabled,
          updatedByUserId: actorUserId,
          reason,
        },
        select: {
          key: true,
          enabled: true,
          reason: true,
          updatedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          action: "PLATFORM_FEATURE_FLAG_CHANGED",
          resource: "PlatformFeatureFlag",
          resourceId: PLATFORM_FEATURE_KEYS.TEACHER_ATTENDANCE,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            key: PLATFORM_FEATURE_KEYS.TEACHER_ATTENDANCE,
            priorEnabled: current?.enabled ?? false,
            nextEnabled: saved.enabled,
            reason,
            actorRole: "SUPERADMIN",
            policy: "TEACHER_ATTENDANCE_SAFETY_SWITCH",
            historicalRecordsPreserved: true,
            studentAttendanceUnaffected: true,
          },
        },
      });

      return {
        outcome: "UPDATED" as const,
        state: {
          key: PLATFORM_FEATURE_KEYS.TEACHER_ATTENDANCE,
          enabled: saved.enabled,
          configured: true,
          storageAvailable: true,
          reason: saved.reason ?? null,
          updatedAt: saved.updatedAt.toISOString(),
        },
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 15_000,
    },
  );
}
