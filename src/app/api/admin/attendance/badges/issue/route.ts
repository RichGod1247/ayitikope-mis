// src/app/api/admin/attendance/badges/issue/route.ts
import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { StudentStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { requireTenantContext, assertTenantParamMatches, toHttpError } from "@/lib/server/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    tenantId: z.string().optional(), // legacy/back-compat only
    studentId: z.string().trim().min(1, "studentId is required."),
    label: z.string().trim().max(120, "Label is too long.").optional().nullable(),
    revokeExisting: z.boolean().optional().default(true),
  })
  .strict();

function noStoreJson(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

function userAgent(req: Request) {
  return req.headers.get("user-agent") || null;
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function newBadgeSecret() {
  return randomBytes(32).toString("base64url");
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Unnamed learner";
}

function isBadgeIssuerRole(roleName: string | null | undefined) {
  const r = String(roleName ?? "").toUpperCase();
  return r.includes("ADMIN") || r.includes("HEAD") || r.includes("OWNER") || r === "SUPERADMIN";
}

async function requireBadgeIssuer(userId: string, tenantId: string) {
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { role: { select: { name: true } } },
  });

  if (!membership) {
    const err = new Error("FORBIDDEN");
    (err as { status?: number }).status = 403;
    throw err;
  }

  const roleName = membership.role?.name ?? null;
  if (!isBadgeIssuerRole(roleName)) {
    const err = new Error("Only school admins or headteachers can issue attendance badges.");
    (err as { status?: number }).status = 403;
    throw err;
  }

  return roleName;
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const safe = { userId: ctx.userId, tenantId: ctx.tenantId };

    const ct = req.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) {
      return noStoreJson(415, { ok: false, error: "Content-Type must be application/json." });
    }

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return noStoreJson(400, { ok: false, error: parsed.error.issues[0]?.message || "Invalid body." });
    }

    const suppliedTenantId = parsed.data.tenantId?.trim() || null;
    assertTenantParamMatches(safe.tenantId, suppliedTenantId);

    const roleName = await requireBadgeIssuer(safe.userId, safe.tenantId);

    const student = await prisma.student.findFirst({
      where: { id: parsed.data.studentId, tenantId: safe.tenantId, status: StudentStatus.ACTIVE },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        classroomId: true,
        classroom: { select: { name: true, grade: true, arm: true } },
      },
    });

    if (!student) return noStoreJson(404, { ok: false, error: "Active learner not found." });
    if (!student.classroomId) return noStoreJson(409, { ok: false, error: "Learner is not assigned to a classroom." });

    const secret = newBadgeSecret();
    const tokenHash = sha256Hex(secret);
    const tokenHint = secret.slice(-8);
    const qrPayload = `EDULIFEOS-ATT-V1:${secret}`;
    const now = new Date();
    const label = parsed.data.label?.trim() || null;

    const badge = await prisma.$transaction(async (tx) => {
      if (parsed.data.revokeExisting !== false) {
        await tx.studentAttendanceBadge.updateMany({
          where: {
            tenantId: safe.tenantId,
            studentId: student.id,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            revokedByUserId: safe.userId,
            revokeReason: "Replaced by newly issued badge.",
          },
        });
      }

      return tx.studentAttendanceBadge.create({
        data: {
          tenantId: safe.tenantId,
          studentId: student.id,
          tokenHash,
          tokenHint,
          label,
          issuedAt: now,
          issuedByUserId: safe.userId,
        },
        select: {
          id: true,
          tokenHint: true,
          issuedAt: true,
        },
      });
    });

    await writeAuditLog({
      action: "ATTENDANCE_BADGE_ISSUED",
      tenantId: safe.tenantId,
      userId: safe.userId,
      resource: "StudentAttendanceBadge",
      resourceId: badge.id,
      ip: clientIp(req),
      userAgent: userAgent(req),
      metadata: {
        studentId: student.id,
        studentName: fullName(student.firstName, student.lastName),
        classroomId: student.classroomId,
        roleName,
        revokeExisting: parsed.data.revokeExisting !== false,
      },
    });

    return noStoreJson(201, {
      ok: true,
      badge: {
        id: badge.id,
        tokenHint: badge.tokenHint,
        issuedAt: badge.issuedAt.toISOString(),
      },
      student: {
        id: student.id,
        name: fullName(student.firstName, student.lastName),
        classroomId: student.classroomId,
        classroomLabel: [student.classroom?.name, student.classroom?.grade, student.classroom?.arm]
          .filter(Boolean)
          .join(" • "),
      },
      // Show once only. Do not persist this raw secret anywhere.
      qrPayload,
    });
  } catch (e) {
    const { status, msg } = toHttpError(e);
    return noStoreJson(status, { ok: false, error: msg });
  }
}
