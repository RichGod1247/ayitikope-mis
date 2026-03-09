// src/app/api/parent/children/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";
import { StudentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function isValidSuffixForLookup(suffix: string) {
  const s = digitsOnly(suffix);
  return s.length >= 7;
}

export async function GET(req: NextRequest) {
  try {
    const gate = requireParentSession(req as any);
    if (!gate.ok) return gate.res as any;

    const sess = gate.session;

    const tenant = await prisma.tenant.findUnique({
      where: { id: sess.tenantId },
      select: { id: true, name: true, status: true },
    });

    if (!tenant || tenant.status !== "ACTIVE") {
      return noStoreJson(403, { ok: false, error: "TENANT_NOT_ACTIVE" });
    }

    const e164 = String(sess.guardianPhoneE164 ?? "").trim();
    const suffix9 = digitsOnly(sess.guardianSuffix9 ?? "");

    const OR: any[] = [];
    if (e164) OR.push({ guardianPhoneNorm: e164 });

    if (isValidSuffixForLookup(suffix9)) {
      OR.push({ guardianPhoneNorm: { endsWith: suffix9 } });
      OR.push({ guardianPhone: { endsWith: suffix9 } });
      OR.push({ guardianPhoneNorm: { endsWith: `233${suffix9}` } });
      OR.push({ guardianPhone: { endsWith: `233${suffix9}` } });
    }

    if (OR.length === 0) {
      return noStoreJson(200, { ok: true, guardianPhone: e164 || suffix9, students: [], count: 0 });
    }

    const students = await prisma.student.findMany({
      where: {
        tenantId: sess.tenantId,
        status: StudentStatus.ACTIVE,
        OR,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        guardianPhoneNorm: true,
        classroom: { select: { id: true, name: true, grade: true, arm: true } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 200,
    });

    const out = students.map((s) => {
      const name = [s.firstName, s.lastName].filter(Boolean).join(" ").trim();
      return {
        id: s.id,
        name,
        guardianName: s.guardianName ?? null,
        guardianPhone: s.guardianPhoneNorm ?? s.guardianPhone ?? null,
        classroom: s.classroom
          ? {
              id: s.classroom.id,
              name: s.classroom.name ?? "Class",
              grade: s.classroom.grade ?? null,
              arm: s.classroom.arm ?? null,
            }
          : null,
      };
    });

    return noStoreJson(200, {
      ok: true,
      guardianPhone: e164 || suffix9 || null,
      students: out,
      count: out.length,
    });
  } catch (err) {
    console.error("[PARENT_CHILDREN_ERROR]", err);
    return noStoreJson(500, { ok: false, error: "Failed to load learners for this parent." });
  }
}