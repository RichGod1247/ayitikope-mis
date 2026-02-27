// src/lib/adminSetupEnforcement.ts
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getServerUserContextOrNull } from "@/lib/serverAuth";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function looksLikeISODateOnly(v: unknown): boolean {
  if (!isNonEmptyString(v)) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}

function looksLikeHHMM(v: unknown): boolean {
  if (!isNonEmptyString(v)) return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim());
}

function inferSetupCompleteFromDb(s: any): boolean {
  if (!s) return false;

  return (
    isNonEmptyString(s.currentAcademicYear) &&
    isNonEmptyString(s.currentTerm) &&
    looksLikeISODateOnly(s.term1Start ? new Date(s.term1Start).toISOString().slice(0, 10) : "") &&
    looksLikeISODateOnly(s.term1End ? new Date(s.term1End).toISOString().slice(0, 10) : "") &&
    looksLikeISODateOnly(s.term2Start ? new Date(s.term2Start).toISOString().slice(0, 10) : "") &&
    looksLikeISODateOnly(s.term2End ? new Date(s.term2End).toISOString().slice(0, 10) : "") &&
    looksLikeISODateOnly(s.term3Start ? new Date(s.term3Start).toISOString().slice(0, 10) : "") &&
    looksLikeISODateOnly(s.term3End ? new Date(s.term3End).toISOString().slice(0, 10) : "") &&
    looksLikeHHMM(s.attendanceStartTime) &&
    looksLikeHHMM(s.attendanceEndTime) &&
    isFiniteNumber(s.lateCutoffMinutes) &&
    s.lateCutoffMinutes >= 0 &&
    isFiniteNumber(Number(s.feverThreshold)) &&
    Number(s.feverThreshold) > 0
  );
}

// Cached per-request to avoid double-hitting DB
export const fetchAdminSetupComplete = cache(async (): Promise<boolean> => {
  const ctx = await getServerUserContextOrNull({ requireTenant: true });
  if (!ctx?.tenantId) return false;

  const s = await prisma.tenantSettings.findUnique({
    where: { tenantId: ctx.tenantId },
    select: {
      setupCompletedAt: true,

      // legacy fallback fields
      currentAcademicYear: true,
      currentTerm: true,
      term1Start: true,
      term1End: true,
      term2Start: true,
      term2End: true,
      term3Start: true,
      term3End: true,
      attendanceStartTime: true,
      attendanceEndTime: true,
      lateCutoffMinutes: true,
      feverThreshold: true,
    },
  });

  // ✅ Best-solution: explicit completion marker
  if (s?.setupCompletedAt) return true;

  // ✅ Legacy fallback (only until all tenants pass through setup once)
  return inferSetupCompleteFromDb(s);
});