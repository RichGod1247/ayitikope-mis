// src/app/api/headteacher/assessment/mock/release/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function roleUpper(role: string | null | undefined) {
  return String(role ?? "").trim().toUpperCase();
}

function isHeadOrAdmin(role: string) {
  return (
    role === "HEADTEACHER" ||
    role === "SCHOOL_ADMIN" ||
    role === "ADMIN" ||
    role === "SUPERADMIN"
  );
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeLevelToken(raw: unknown): string | null {
  const s = cleanStr(raw).toUpperCase().replace(/\s+/g, " ");
  if (!s) return null;

  let m =
    s.match(/^JHS\s*([1-3])$/) ||
    s.match(/^JHS([1-3])$/) ||
    s.match(/^J\.?H\.?S\.?\s*([1-3])$/);

  if (m) return `JHS${m[1]}`;

  m =
    s.match(/^BASIC\s*([7-9])$/) ||
    s.match(/^BASIC([7-9])$/) ||
    s.match(/^B\s*([7-9])$/) ||
    s.match(/^B([7-9])$/);

  if (m) return `JHS${Number(m[1]) - 6}`;

  return null;
}

function isJhs3Classroom(c: { name: string | null; grade: string | null }) {
  return normalizeLevelToken(c.grade) === "JHS3" || normalizeLevelToken(c.name) === "JHS3";
}

export async function GET(req: NextRequest) {
  const gate = await requireApiUserContext(req as any, { requireTenant: true });
  if (!gate.ok) return gate.res as any;

  const ctx = gate.ctx;
  const role = roleUpper(ctx.roleName);

  if (!isHeadOrAdmin(role)) {
    return noStoreJson(403, { ok: false, error: "FORBIDDEN", role });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = cleanStr(searchParams.get("sessionId"));

  if (!sessionId) {
    return noStoreJson(400, { ok: false, error: "MISSING_SESSION_ID" });
  }

  const session = await prisma.mockExamSession.findFirst({
    where: {
      id: sessionId,
      tenantId: ctx.tenantId,
    },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      academicYear: true,
      term: true,
      mockNumber: true,
      mockLabel: true,
      title: true,
      status: true,
      classroom: {
        select: {
          id: true,
          name: true,
          grade: true,
          arm: true,
          status: true,
        },
      },
    },
  });

  if (!session) {
    return noStoreJson(404, { ok: false, error: "MOCK_SESSION_NOT_FOUND" });
  }

  const blockers: string[] = [];

  const sealed = cleanStr(session.status).toUpperCase() === "LOCKED";

  if (!sealed) {
    blockers.push("Mock session must be finalized and sealed before parent release.");
  }

  if (!session.classroom || !isJhs3Classroom(session.classroom)) {
    blockers.push("Only JHS3 Mock sessions can be released in this sprint.");
  }

  if (session.classroom?.status && cleanStr(session.classroom.status).toUpperCase() !== "ACTIVE") {
    blockers.push("Classroom is not active.");
  }

  const release = await prisma.mockResultsRelease.findFirst({
    where: {
      tenantId: ctx.tenantId,
      mockExamSessionId: session.id,
      scopeKey: session.classroomId,
    },
    select: {
      id: true,
      tenantId: true,
      mockExamSessionId: true,
      classroomId: true,
      academicYear: true,
      term: true,
      mockNumber: true,
      mockLabel: true,
      title: true,
      scope: true,
      scopeKey: true,
      readinessStatus: true,
      readinessScore: true,
      releaseSnapshotHash: true,
      releaseMode: true,
      overrideReason: true,
      parentVisible: true,
      smsNotifiedAt: true,
      releasedAt: true,
      releasedByUserId: true,
      createdAt: true,
      updatedAt: true,
      releasedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return noStoreJson(200, {
    ok: true,
    session: {
      id: session.id,
      classroomId: session.classroomId,
      academicYear: session.academicYear,
      term: session.term,
      mockNumber: session.mockNumber,
      mockLabel: session.mockLabel,
      title: session.title,
      status: session.status,
      sealed,
    },
    classroom: session.classroom,
    release: release
      ? {
          ...release,
          readinessStatus: String(release.readinessStatus),
          releasedAt: release.releasedAt.toISOString(),
          createdAt: release.createdAt.toISOString(),
          updatedAt: release.updatedAt.toISOString(),
          smsNotifiedAt: release.smsNotifiedAt ? release.smsNotifiedAt.toISOString() : null,
        }
      : null,
    canRelease: sealed && blockers.length === 0 && !release,
    alreadyReleased: !!release,
    blockers,
  });
}