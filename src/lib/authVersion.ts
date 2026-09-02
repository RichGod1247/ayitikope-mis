import { prisma } from "@/lib/prisma";

const STAFF_AUTH_CLAIM_KEYS = [
  "uid",
  "userId",
  "sub",
  "email",
  "name",
  "staffId",
  "tenantId",
  "roleName",
  "teacherScope",
  "phone",
  "phoneNumber",
  "authVersion",
] as const;

export function parseAuthVersion(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

export async function isCurrentStaffAuthVersion(
  userId: string,
  claimedAuthVersion: unknown
) {
  const id = String(userId ?? "").trim();
  const version = parseAuthVersion(claimedAuthVersion);

  if (!id || version === null) return false;

  try {
    const row = await prisma.user.findUnique({
      where: { id },
      select: { authVersion: true },
    });

    return Boolean(row && row.authVersion === version);
  } catch {
    // Authentication authority fails closed when DB truth cannot be verified.
    return false;
  }
}

export function clearStaffAuthClaims(token: Record<string, unknown>) {
  for (const key of STAFF_AUTH_CLAIM_KEYS) {
    delete token[key];
  }

  return token;
}
