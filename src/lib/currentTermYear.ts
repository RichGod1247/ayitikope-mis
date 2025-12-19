// src/lib/currentTermYear.ts
import { prisma } from "@/lib/prisma";

export type CurrentTermYear = {
  term: string;
  academicYear: string;
};

// Safe defaults if we cannot read from DB yet
const FALLBACK_TERM = "1st Term";
const FALLBACK_ACADEMIC_YEAR = "2025/2026";

/**
 * Returns the current term and academic year for a given tenant.
 *
 * Priority (once TenantSettings exists in Prisma):
 *  1) TenantSettings row for that tenant (currentTerm, currentAcademicYear)
 *  2) Fallback to "1st Term" and "2025/2026" if nothing is set or
 *     if the model doesn't exist yet.
 *
 * Right now, your Prisma client does NOT have tenantSettings,
 * so we must guard against that and safely fall back.
 */
export async function getCurrentTermYearForTenant(
  tenantId: string
): Promise<CurrentTermYear> {
  const client = prisma as any;

  // Check if the Prisma client actually has a tenantSettings model
  const hasTenantSettings =
    client &&
    client.tenantSettings &&
    typeof client.tenantSettings.findFirst === "function";

  // If the model doesn't exist yet, just use the defaults
  if (!hasTenantSettings) {
    return {
      term: FALLBACK_TERM,
      academicYear: FALLBACK_ACADEMIC_YEAR,
    };
  }

  try {
    // Try to read from TenantSettings (once you add it to Prisma)
    const settings = await client.tenantSettings.findFirst({
      where: { tenantId },
      select: {
        currentTerm: true,
        currentAcademicYear: true,
      },
    });

    const term =
      settings?.currentTerm && settings.currentTerm.trim().length > 0
        ? settings.currentTerm
        : FALLBACK_TERM;

    const academicYear =
      settings?.currentAcademicYear &&
      settings.currentAcademicYear.trim().length > 0
        ? settings.currentAcademicYear
        : FALLBACK_ACADEMIC_YEAR;

    return { term, academicYear };
  } catch (err) {
    console.error(
      "[getCurrentTermYearForTenant] error while reading TenantSettings – using fallback",
      err
    );
    return {
      term: FALLBACK_TERM,
      academicYear: FALLBACK_ACADEMIC_YEAR,
    };
  }
}
