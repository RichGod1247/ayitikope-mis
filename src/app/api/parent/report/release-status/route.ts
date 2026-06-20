//src/app/api/parent/report/release-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";
import { StudentStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function normDigits(v: unknown) {
  return digitsOnly(String(v ?? ""));
}

function phoneMatchesBySuffix(a: string, b: string) {
  const A = normDigits(a);
  const B = normDigits(b);
  if (!A || !B) return false;
  return A.endsWith(B) || B.endsWith(A);
}

function isValidSuffixForLookup(suffix: string) {
  return normDigits(suffix).length >= 7;
}

export async function GET(req: NextRequest) {
  const gate = requireParentSession(req as any);
  if (!gate.ok) return gate.res as any;

  const sess = gate.session;

  const { searchParams } = new URL(req.url);
  const studentId = String(searchParams.get("studentId") || "").trim();
  const term = String(searchParams.get("term") || "1st Term").trim();
  const academicYear = String(searchParams.get("academicYear") || "2025/2026").trim();

  if (!studentId) return noStore({ ok: false, error: "MISSING_STUDENT_ID" }, 400);

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: sess.tenantId, status: StudentStatus.ACTIVE },
    select: {
      id: true,
      classroomId: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
    },
  });

  if (!student) return noStore({ ok: false, error: "STUDENT_NOT_FOUND" }, 404);

  // ✅ Guardian authorization (same rules as /api/parent/report/term)
  const sessE164 = String(sess.guardianPhoneE164 ?? "").trim();
  const sessSuffix9 = normDigits(sess.guardianSuffix9 ?? "");

  const studentGuardianNorm = String(student.guardianPhoneNorm ?? "").trim();
  const studentGuardianRaw = String(student.guardianPhone ?? "").trim();

  const okByE164 =
    !!sessE164 &&
    !!studentGuardianNorm &&
    normDigits(sessE164) === normDigits(studentGuardianNorm);

  const okBySuffix =
    isValidSuffixForLookup(sessSuffix9) &&
    (phoneMatchesBySuffix(sessSuffix9, studentGuardianNorm) ||
      phoneMatchesBySuffix(sessSuffix9, studentGuardianRaw));

  if (!okByE164 && !okBySuffix) {
    return noStore({ ok: false, error: "GUARDIAN_MISMATCH" }, 403);
  }

  const classroomId = student.classroomId ? String(student.classroomId) : "";
  const scopeKeys = ["SCHOOL", ...(classroomId ? [classroomId] : [])];

  const rel = await prisma.resultsRelease.findFirst({
    where: {
      tenantId: sess.tenantId,
      term,
      academicYear,
      scopeKey: { in: scopeKeys },
      readinessStatus: { in: ["READY", "OVERRIDE"] },
      releaseSnapshotHash: { not: null },
    },
    select: {
      scope: true,
      scopeKey: true,
      releasedAt: true,
      readinessStatus: true,
      readinessScore: true,
      releaseMode: true,
      releaseSnapshotHash: true,
    },
  });

  return noStore({
    ok: true,
    studentId,
    term,
    academicYear,
    released: !!rel,
    release: rel
      ? {
          scope: rel.scope,
          scopeKey: rel.scopeKey,
          releasedAt: rel.releasedAt.toISOString(),
          readinessStatus: String(rel.readinessStatus),
          readinessScore: Number(rel.readinessScore ?? 0),
          releaseMode: rel.releaseMode ?? null,
          releaseSnapshotHash: rel.releaseSnapshotHash ?? null,
        }
      : null,
  });
}