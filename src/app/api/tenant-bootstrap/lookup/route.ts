//src/app/api/tenant-bootstrap/lookup/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function sha256Hex(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function GET(req: NextRequest) {
  // ✅ support both: ?token=... and legacy ?invite=...
  const token =
    String(req.nextUrl.searchParams.get("token") || "").trim() ||
    String(req.nextUrl.searchParams.get("invite") || "").trim();

  if (!token) return json({ ok: false, error: "TOKEN_REQUIRED" }, 400);

  const tokenHash = sha256Hex(token);
  const now = new Date();

  const row = await prisma.tenantBootstrapInvite.findFirst({
    where: { tokenHash, expiresAt: { gt: now }, usedAt: null },
    select: {
      schoolName: true,
      contactEmail: true,
      contactPhoneNorm: true,
      reservedSlug: true,
      reservedSchoolCode: true,
      schoolSector: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (!row) return json({ ok: false, error: "INVALID_OR_EXPIRED" }, 404);

  const remainingSeconds = Math.max(0, Math.floor((row.expiresAt.getTime() - now.getTime()) / 1000));

  return json({
    ok: true,
    schoolName: row.schoolName,
    reservedSchoolCode: row.reservedSchoolCode,
    reservedSlug: row.reservedSlug,
    schoolSector: row.schoolSector,
    contactEmail: row.contactEmail,
    contactPhoneNorm: row.contactPhoneNorm,
    expiresAt: row.expiresAt.toISOString(),
    remainingSeconds,
  });
}