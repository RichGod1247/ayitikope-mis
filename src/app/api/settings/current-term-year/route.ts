// src/app/api/settings/current-term-year/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/settings/current-term-year
 *
 * Jason rules:
 *  - Always JSON: { ok:boolean, ... }
 *  - 200 + ok:true on success, with term + academicYear
 *  - No Prisma used here (safe placeholder).
 *
 * Later, we can wire this to a TenantSettings table.
 */

export async function GET(_req: NextRequest) {
  try {
    // Optional: allow overriding via environment variables.
    const fallbackTerm = "1st Term";
    const fallbackAcademicYear = "2025/2026";

    const term =
      process.env.EDULIFE_CURRENT_TERM?.trim() || fallbackTerm;
    const academicYear =
      process.env.EDULIFE_CURRENT_ACADEMIC_YEAR?.trim() ||
      fallbackAcademicYear;

    return NextResponse.json(
      {
        ok: true,
        term,
        academicYear,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[CURRENT_TERM_YEAR_SETTINGS_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load current term and academic year settings.",
      },
      { status: 500 }
    );
  }
}
