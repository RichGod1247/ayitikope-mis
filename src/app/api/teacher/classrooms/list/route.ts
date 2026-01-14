import { NextResponse } from "next/server";
import { requireServerUserContext } from "@/lib/serverAuth";
import { listAccessibleClassrooms } from "@/lib/teacherClassroomAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonErr(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  let safe: { userId: string; tenantId: string };
  try {
    safe = await requireServerUserContext({ requireTenant: true });
  } catch {
    return jsonErr(401, "Unauthorized.");
  }

  // Back-compat: allow tenantId query but enforce match if present
  const url = new URL(req.url);
  const tenantIdParam = (url.searchParams.get("tenantId") || "").trim();
  if (tenantIdParam && tenantIdParam !== safe.tenantId) {
    return jsonErr(403, "Forbidden (tenant mismatch).");
  }

  try {
    const classrooms = await listAccessibleClassrooms(safe);
    return NextResponse.json({ ok: true, classrooms });
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    return jsonErr(status, String(e?.message || "Failed to load classrooms."));
  }
}
