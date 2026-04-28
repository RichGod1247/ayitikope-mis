// src/app/api/admin/scholarships/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/apiAuth";
import { ScholarshipApplicationStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

const ALLOWED_STATUSES = new Set<ScholarshipApplicationStatus>([
  "PENDING",
  "REVIEWED",
  "APPROVED",
  "REJECTED",
]);

export async function PATCH(req: NextRequest) {
  const gate = await requireApiUserContext({
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER"],
  });
  if (!gate.ok) return gate.res;

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  let body: { id?: string; status?: string; reviewNote?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const id = String(body.id ?? "").trim();
  const statusRaw = String(body.status ?? "").trim().toUpperCase();
  const reviewNote = String(body.reviewNote ?? "").trim() || null;

  if (!id) return json(400, { ok: false, error: "Missing application id" });
  if (!ALLOWED_STATUSES.has(statusRaw as ScholarshipApplicationStatus)) {
    return json(400, { ok: false, error: `Invalid status. Must be one of: ${[...ALLOWED_STATUSES].join(", ")}` });
  }

  const newStatus = statusRaw as ScholarshipApplicationStatus;
  const { tenantId, userId } = gate.ctx;

  const existing = await prisma.scholarshipApplication.findUnique({
    where: { id },
    select: { id: true, tenantId: true },
  });

  if (!existing) return json(404, { ok: false, error: "Application not found" });
  if (existing.tenantId !== tenantId) return json(403, { ok: false, error: "FORBIDDEN" });

  const updated = await prisma.scholarshipApplication.update({
    where: { id },
    data: {
      status: newStatus,
      reviewNote,
      reviewedAt: new Date(),
      reviewedByUserId: userId,
    },
    select: {
      id: true,
      status: true,
      reviewNote: true,
      reviewedAt: true,
      reviewedByUserId: true,
    },
  });

  return json(200, { ok: true, application: updated });
}
