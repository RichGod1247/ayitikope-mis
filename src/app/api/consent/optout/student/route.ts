import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "LEGACY_PUBLIC_STUDENT_OPTOUT_RETIRED",
      message:
        "Use the secure Essential School Alerts link sent by the school. Raw tenantId + studentId public mutations are no longer accepted.",
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
