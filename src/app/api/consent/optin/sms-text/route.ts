import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { prisma } from "@/lib/prisma";
import { effectiveRole } from "@/lib/roleRouting";
import { buildGuardianEssentialAlertInvitation } from "@/lib/essentialAlerts/enrollment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"]);

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function baseUrl(req: NextRequest) {
  const env =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL;
  if (env) return env.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) throw new Error("ESSENTIAL_ALERT_BASE_URL_UNAVAILABLE");
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId: auth.ctx.userId,
        tenantId: auth.ctx.tenantId,
      },
    },
    select: { status: true, role: { select: { name: true } } },
  });
  const role = effectiveRole(membership?.role?.name ?? auth.ctx.roleName)
    .trim()
    .toUpperCase();
  if (!membership || membership.status !== "ACTIVE" || !ALLOWED_ROLES.has(role)) {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const studentId = String(new URL(req.url).searchParams.get("studentId") ?? "").trim();
  if (!studentId) return json(400, { ok: false, error: "studentId is required" });

  try {
    const invite = await buildGuardianEssentialAlertInvitation({
      tenantId: auth.ctx.tenantId,
      studentId,
    });
    const link = `${baseUrl(req)}/api/consent/optin/student/link?token=${encodeURIComponent(invite.token)}`;
    const text = `${invite.schoolName}: Free first-term EduLife alerts for ${invite.childName}: attendance, fees/payments & released results. No ads. Enable: ${link}`;

    return json(200, {
      ok: true,
      text,
      link,
      policy: "EDULIFE_ESSENTIAL_SCHOOL_ALERTS_V1",
      databaseWrites: 0,
      healthConsentChanged: false,
    });
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: unknown }).status) || 500
        : 500;
    return json(status, {
      ok: false,
      error: error instanceof Error ? error.message : "INVITATION_PREVIEW_FAILED",
    });
  }
}
