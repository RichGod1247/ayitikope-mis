// src/app/api/admissions/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function applyLinks(req: NextRequest) {
  const origin = new URL(req.url).origin;

  return {
    school: `${origin}/apply/school`,
    governance: `${origin}/apply/governance`,
  };
}

export async function GET(req: NextRequest) {
  return json(410, {
    ok: false,
    error: "LEGACY_ADMISSIONS_PIPELINE_RETIRED",
    message:
      "The legacy admissions API has been retired. Use the EduLife OS onboarding application links instead.",
    links: applyLinks(req),
  });
}

export async function POST(req: NextRequest) {
  // Intentionally consume body so old clients do not crash the route parser.
  await req.json().catch(() => null);

  return json(410, {
    ok: false,
    error: "LEGACY_ADMISSIONS_PIPELINE_RETIRED",
    message:
      "The legacy Google Apps Script admissions pipeline has been retired. Use the DB-backed EduLife OS onboarding application pipeline instead.",
    links: applyLinks(req),
  });
}
