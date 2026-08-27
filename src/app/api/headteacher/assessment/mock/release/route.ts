// src/app/api/headteacher/assessment/mock/release/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(status: number, payload: unknown) {
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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",")}}`;
}

function sha256Hex(value: unknown) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function getRequestMeta(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  const userAgent = req.headers.get("user-agent") || null;

  return { ip, userAgent };
}

type Body = {
  sessionId?: string;
};

export async function POST(req: NextRequest) {
  const gate = await requireApiUserContext(req, { requireTenant: true });
  if (!gate.ok) return gate.res;

  const ctx = gate.ctx;
  const role = roleUpper(ctx.roleName);

  if (!isHeadOrAdmin(role)) {
    return noStoreJson(403, { ok: false, error: "FORBIDDEN", role });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const sessionId = cleanStr(body?.sessionId);

  if (!sessionId) {
    return noStoreJson(400, { ok: false, error: "MISSING_SESSION_ID" });
  }

  const now = new Date();

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
      date: true,
      createdAt: true,
      updatedAt: true,
      classroom: {
        select: {
          id: true,
          name: true,
          grade: true,
          arm: true,
          status: true,
        },
      },
      items: {
        orderBy: [{ subject: "asc" }, { id: "asc" }],
        select: {
          id: true,
          subject: true,
          title: true,
          type: true,
          maxScore: true,
          status: true,
          lockedAt: true,
          updatedAt: true,
          scores: {
            select: {
              studentId: true,
              score: true,
              updatedAt: true,
            },
          },
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

  if (!session.items.length) {
    blockers.push("Mock session has no subject evidence columns.");
  }

  const activeStudents = await prisma.student.findMany({
    where: {
      tenantId: ctx.tenantId,
      classroomId: session.classroomId,
      status: "ACTIVE",
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!activeStudents.length) {
    blockers.push("No active learners found for this Mock classroom.");
  }

  if (blockers.length) {
    return noStoreJson(400, {
      ok: false,
      error: "MOCK_SESSION_NOT_RELEASABLE",
      blockers,
    });
  }

  const activeStudentIds = new Set(activeStudents.map((s) => s.id));
  const subjectSummaries = session.items.map((item) => {
    const validScores = item.scores.filter((score) => activeStudentIds.has(score.studentId));
    const scoredCount = validScores.length;
    const missingCount = Math.max(0, activeStudents.length - scoredCount);
    const averageScore =
      scoredCount > 0
        ? Number(
            (
              validScores.reduce((sum, score) => sum + Number(score.score ?? 0), 0) /
              scoredCount
            ).toFixed(2),
          )
        : null;

    return {
      itemId: item.id,
      subject: item.subject,
      title: item.title,
      type: item.type,
      maxScore: item.maxScore,
      status: item.status,
      locked: cleanStr(item.status).toUpperCase() === "LOCKED",
      lockedAt: item.lockedAt ? item.lockedAt.toISOString() : null,
      scoredCount,
      missingCount,
      averageScore,
    };
  });

  const possibleCells = activeStudents.length * session.items.length;
  const scoredCells = subjectSummaries.reduce((sum, s) => sum + s.scoredCount, 0);
  const missingCells = Math.max(0, possibleCells - scoredCells);
  const completionPercent =
    possibleCells > 0 ? Number(((scoredCells / possibleCells) * 100).toFixed(2)) : 0;

  const lockedItemCount = subjectSummaries.filter((s) => s.locked).length;
  const nonLockedItems = subjectSummaries.filter((s) => !s.locked).map((s) => s.subject);

  const snapshot = {
    snapshotVersion: "A14.6_MOCK_RESULTS_RELEASE_V1",
    generatedAt: now.toISOString(),
    releaseRule: {
      requiresMockSessionStatus: "LOCKED",
      parentVisible: true,
      scope: "CLASSROOM",
      scopeKey: session.classroomId,
    },
    session: {
      id: session.id,
      academicYear: session.academicYear,
      term: session.term,
      mockNumber: session.mockNumber,
      mockLabel: session.mockLabel,
      title: session.title,
      status: session.status,
      date: session.date ? session.date.toISOString() : null,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    },
    classroom: {
      id: session.classroom?.id ?? session.classroomId,
      name: session.classroom?.name ?? null,
      grade: session.classroom?.grade ?? null,
      arm: session.classroom?.arm ?? null,
      status: session.classroom?.status ?? null,
    },
    evidence: {
      activeStudentCount: activeStudents.length,
      subjectCount: session.items.length,
      possibleCells,
      scoredCells,
      missingCells,
      completionPercent,
      lockedItemCount,
      nonLockedItems,
      subjects: subjectSummaries,
    },
    releasedBy: {
      userId: ctx.userId,
      role,
    },
  };

  const releaseSnapshotHash = sha256Hex(snapshot);
  const scope = "CLASSROOM";
  const scopeKey = session.classroomId;

  const existing = await prisma.mockResultsRelease.findFirst({
    where: {
      tenantId: ctx.tenantId,
      mockExamSessionId: session.id,
      scopeKey,
    },
    select: {
      id: true,
      releaseSnapshotHash: true,
      releasedAt: true,
      parentVisible: true,
    },
  });

  if (existing && existing.releaseSnapshotHash !== releaseSnapshotHash) {
    return noStoreJson(409, {
      ok: false,
      error: "MOCK_RELEASE_SNAPSHOT_CONFLICT",
      message:
        "This Mock session already has a release record, but the current evidence snapshot differs. Use the future audited reopen/reseal workflow instead of silently overwriting released truth.",
      releaseId: existing.id,
      existingSnapshotHash: existing.releaseSnapshotHash,
      currentSnapshotHash: releaseSnapshotHash,
    });
  }

  const { ip, userAgent } = getRequestMeta(req);

  const release = existing
    ? await prisma.mockResultsRelease.findUnique({
        where: { id: existing.id },
        select: {
          id: true,
          mockExamSessionId: true,
          classroomId: true,
          academicYear: true,
          term: true,
          mockNumber: true,
          mockLabel: true,
          title: true,
          readinessStatus: true,
          readinessScore: true,
          releaseSnapshotHash: true,
          releaseMode: true,
          parentVisible: true,
          smsNotifiedAt: true,
          releasedAt: true,
          releasedByUser: {
            select: { id: true, name: true, email: true },
          },
        },
      })
    : await prisma.$transaction(async (tx) => {
        const created = await tx.mockResultsRelease.create({
          data: {
            tenantId: ctx.tenantId,
            mockExamSessionId: session.id,
            classroomId: session.classroomId,
            academicYear: session.academicYear,
            term: session.term,
            mockNumber: session.mockNumber,
            mockLabel: session.mockLabel,
            title: session.title,
            scope,
            scopeKey,
            readinessStatus: "READY",
            readinessScore: Math.round(completionPercent),
            readinessSnapshotJson: snapshot,
            releaseSnapshotHash,
            releaseMode: "NORMAL",
            parentVisible: true,
            releasedByUserId: ctx.userId,
          },
          select: {
            id: true,
            mockExamSessionId: true,
            classroomId: true,
            academicYear: true,
            term: true,
            mockNumber: true,
            mockLabel: true,
            title: true,
            readinessStatus: true,
            readinessScore: true,
            releaseSnapshotHash: true,
            releaseMode: true,
            parentVisible: true,
            smsNotifiedAt: true,
            releasedAt: true,
            releasedByUser: {
              select: { id: true, name: true, email: true },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            action: "MOCK_RESULTS_RELEASED",
            resource: "MockResultsRelease",
            resourceId: created.id,
            ip,
            userAgent,
            metadata: {
              sessionId: session.id,
              classroomId: session.classroomId,
              academicYear: session.academicYear,
              term: session.term,
              mockNumber: session.mockNumber,
              mockLabel: session.mockLabel,
              releaseSnapshotHash,
              readinessScore: Math.round(completionPercent),
              scope,
              scopeKey,
            },
          },
        });

        return created;
      });

  return noStoreJson(200, {
    ok: true,
    alreadyReleased: !!existing,
    release: release
      ? {
          ...release,
          readinessStatus: String(release.readinessStatus),
          releasedAt: release.releasedAt.toISOString(),
          smsNotifiedAt: release.smsNotifiedAt ? release.smsNotifiedAt.toISOString() : null,
        }
      : null,
    snapshotHash: releaseSnapshotHash,
  });
}