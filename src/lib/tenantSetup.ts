// src/lib/tenantSetup.ts
import { prisma } from "@/lib/prisma";

export type TenantSetupState = {
  tenantId: string;
  currentAcademicYear: string | null;
  currentTerm: string | null;
  attendanceStartTime: string | null;
  attendanceEndTime: string | null;
  lateCutoffMinutes: number | null;
  feverThreshold: number | null;
};

function cleanStr(v: unknown) {
  const s = String(v ?? "").trim();
  return s.length ? s : "";
}

function cleanTimeHHMM(v: unknown) {
  const s = cleanStr(v);
  // very light validation; server endpoints should validate more strictly
  if (!s) return null;
  if (!/^\d{2}:\d{2}$/.test(s)) return null;
  return s;
}

function numOrNull(v: unknown) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = cleanStr(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function loadTenantSetupState(tenantId: string): Promise<TenantSetupState> {
  const tId = cleanStr(tenantId);
  if (!tId) {
    return {
      tenantId: "",
      currentAcademicYear: null,
      currentTerm: null,
      attendanceStartTime: null,
      attendanceEndTime: null,
      lateCutoffMinutes: null,
      feverThreshold: null,
    };
  }

  // Use `any` so we don't hard-crash if the model name changes.
  const p: any = prisma;

  try {
    const row =
      (await p.tenantSettings?.findUnique?.({
        where: { tenantId: tId },
        select: {
          tenantId: true,
          currentAcademicYear: true,
          currentTerm: true,
          attendanceStartTime: true,
          attendanceEndTime: true,
          lateCutoffMinutes: true,
          feverThreshold: true,
        },
      })) ?? null;

    if (row) {
      return {
        tenantId: tId,
        currentAcademicYear: cleanStr(row.currentAcademicYear) || null,
        currentTerm: cleanStr(row.currentTerm) || null,
        attendanceStartTime: cleanTimeHHMM(row.attendanceStartTime),
        attendanceEndTime: cleanTimeHHMM(row.attendanceEndTime),
        lateCutoffMinutes: numOrNull(row.lateCutoffMinutes),
        feverThreshold: numOrNull(row.feverThreshold),
      };
    }
  } catch {
    // fall through
  }

  // Fallback: if settings table is missing, you still get a stable shape.
  return {
    tenantId: tId,
    currentAcademicYear: null,
    currentTerm: null,
    attendanceStartTime: null,
    attendanceEndTime: null,
    lateCutoffMinutes: null,
    feverThreshold: null,
  };
}

export function isTenantSetupComplete(s: TenantSetupState) {
  if (!cleanStr(s.tenantId)) return false;

  const yearOk = !!cleanStr(s.currentAcademicYear);
  const termOk = !!cleanStr(s.currentTerm);

  const startOk = !!cleanTimeHHMM(s.attendanceStartTime);
  const endOk = !!cleanTimeHHMM(s.attendanceEndTime);

  const lateOk = typeof s.lateCutoffMinutes === "number" && Number.isFinite(s.lateCutoffMinutes);
  const feverOk = typeof s.feverThreshold === "number" && Number.isFinite(s.feverThreshold);

  return yearOk && termOk && startOk && endOk && lateOk && feverOk;
}
