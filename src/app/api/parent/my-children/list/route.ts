// src/app/api/parent/my-children/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession } from "@/lib/parentSession";
import { StudentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function GET(req: NextRequest) {
  const auth = requireParentSession(req);
  if (!auth.ok) return auth.res;

  const { tenantId, guardianPhoneE164, guardianSuffix9 } = auth.session;

  const students = await prisma.student.findMany({
    where: {
      tenantId,
      status: StudentStatus.ACTIVE,
      OR: [
        guardianPhoneE164 ? { guardianPhoneNorm: guardianPhoneE164 } : undefined,
        guardianSuffix9 ? { guardianPhoneNorm: { endsWith: guardianSuffix9 } } : undefined,
        guardianSuffix9 ? { guardianPhone: { endsWith: guardianSuffix9 } } : undefined,
      ].filter(Boolean) as any,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      classroom: { select: { name: true, arm: true, grade: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 200,
  });

  const items = students.map((s) => {
    const studentName = [s.firstName, s.lastName].filter(Boolean).join(" ").trim() || "Unnamed learner";
    const classLabel = s.classroom ? `${s.classroom.name}${s.classroom.arm ? ` ${s.classroom.arm}` : ""}` : null;

    return {
      studentId: s.id,
      studentName,
      classLabel,
      guardianName: s.guardianName ?? null,
    };
  });

  return noStoreJson(200, { ok: true, items, count: items.length });
}