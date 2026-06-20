// src/app/api/headteacher/results/release/route.ts
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma, ResultsReleaseReadinessStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { GET as getHeadteacherAssessmentOverview } from "@/app/api/headteacher/assessment/overview/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReleaseScope = "SCHOOL" | "CLASSROOM";
type ReadinessStatus = "READY" | "BLOCKED";

type Body = {
  scope?: ReleaseScope;
  term?: string;
  academicYear?: string;
  classroomId?: string | null;

  /**
   * Future-safe override support.
   * The current UI does not send these yet, so normal release remains strict.
   */
  releaseMode?: "NORMAL" | "OVERRIDE";
  overrideReason?: string | null;
};

type OverviewClass = {
  classroomId: string;
  classroomName: string;
  grade: string | null;
  arm: string | null;
  releaseApplicable?: boolean;
  setupOnly?: boolean;
  setupReason?: string | null;
  learnersCount: number;
  itemsCount: number;
  readinessStatus: ReadinessStatus;
  readinessScore: number;
  subjectsCount: number;
  readySubjectsCount: number;
  blockedSubjectsCount: number;
  totalRequiredCells: number;
  missingRequiredCells: number;
  missingOptionalCells: number;
  blockedReasons: string[];
  subjectReadiness?: unknown[];
};

type AssessmentOverviewOk = {
  ok: true;
  context: {
    tenantId: string;
    term: string;
    academicYear: string;
  };
  readiness: {
    status: ReadinessStatus;
    score: number;
    classesCount: number;
    releaseApplicableClassesCount?: number;
    setupOnlyClassesCount?: number;
    readyClassesCount: number;
    blockedClassesCount: number;
    learnersCount: number;
    subjectsCount: number;
    totalRequiredCells: number;
    missingRequiredCells: number;
    blockedReasons: string[];
  };
  classes: OverviewClass[];
  setupOnlyClasses?: OverviewClass[];
};

type AssessmentOverviewErr = {
  ok: false;
  error: string;
  details?: unknown;
};

type AssessmentOverviewResponse = AssessmentOverviewOk | AssessmentOverviewErr;

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

function canOverrideRelease(role: string) {
  // Headteacher must see the truth; override is reserved for stronger admin roles.
  return role === "SCHOOL_ADMIN" || role === "ADMIN" || role === "SUPERADMIN";
}

function safeStr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeScope(raw: unknown): ReleaseScope | null {
  const s = safeStr(raw).toUpperCase();
  if (s === "SCHOOL" || s === "CLASSROOM") return s;
  return null;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const key of Object.keys(obj).sort()) {
      out[key] = sortJson(obj[key]);
    }

    return out;
  }

  return value;
}

function sha256Hex(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(stableJson(value)) as Prisma.InputJsonValue;
}

async function readBody(req: NextRequest): Promise<Body> {
  const body = (await req.json().catch(() => null)) as Body | null;
  return body ?? {};
}

async function loadAssessmentOverviewSnapshot(args: {
  req: NextRequest;
  term: string;
  academicYear: string;
}) {
  const url = new URL(args.req.url);
  url.pathname = "/api/headteacher/assessment/overview";
  url.search = new URLSearchParams({
    term: args.term,
    academicYear: args.academicYear,
  }).toString();

  // Direct route invocation avoids an HTTP self-call while reusing the locked readiness engine.
  const res = await getHeadteacherAssessmentOverview(
    new Request(url.toString(), {
      headers: args.req.headers,
    })
  );

  const json = (await res.json().catch(() => null)) as AssessmentOverviewResponse | null;

  if (!res.ok || !json || json.ok !== true) {
    return {
      ok: false as const,
      status: res.status || 500,
      error:
        json && "error" in json
          ? json.error
          : "ASSESSMENT_READINESS_UNAVAILABLE",
    };
  }

  return { ok: true as const, overview: json };
}

function buildScopedReadiness(args: {
  overview: AssessmentOverviewOk;
  scope: ReleaseScope;
  classroomId: string | null;
}) {
  const { overview, scope, classroomId } = args;

  if (scope === "SCHOOL") {
    return {
      ok: true as const,
      scopeSnapshot: {
        scope: "SCHOOL",
        term: overview.context.term,
        academicYear: overview.context.academicYear,
        readiness: overview.readiness,
        classes: overview.classes.map((c) => ({
          classroomId: c.classroomId,
          classroomName: c.classroomName,
          grade: c.grade,
          arm: c.arm,
          learnersCount: c.learnersCount,
          itemsCount: c.itemsCount,
          readinessStatus: c.readinessStatus,
          readinessScore: c.readinessScore,
          subjectsCount: c.subjectsCount,
          blockedSubjectsCount: c.blockedSubjectsCount,
          missingRequiredCells: c.missingRequiredCells,
          blockedReasons: c.blockedReasons.slice(0, 10),
        })),
      },
      readinessStatus: overview.readiness.status,
      readinessScore: overview.readiness.score,
      blockedReasons: overview.readiness.blockedReasons ?? [],
    };
  }

  if (!classroomId) {
    return {
      ok: false as const,
      status: 400,
      error: "MISSING_CLASSROOM_ID",
    };
  }

  const classroom = overview.classes.find((c) => c.classroomId === classroomId) ?? null;

  if (!classroom) {
    const setupOnly =
      overview.setupOnlyClasses?.find((c) => c.classroomId === classroomId) ?? null;

    if (setupOnly) {
      return {
        ok: false as const,
        status: 409,
        error: "CLASSROOM_NOT_RELEASE_APPLICABLE",
        readinessStatus: "BLOCKED" as ReadinessStatus,
        readinessScore: 0,
        blockedReasons: [
          setupOnly.setupReason ||
            "This classroom has no active learners or assessment activity and cannot be released.",
        ],
        scopeSnapshot: {
          scope: "CLASSROOM",
          classroomId,
          setupOnly: true,
          setupReason: setupOnly.setupReason,
        },
      };
    }

    return {
      ok: false as const,
      status: 404,
      error: "CLASSROOM_NOT_FOUND_IN_READINESS_SCOPE",
    };
  }

  return {
    ok: true as const,
    scopeSnapshot: {
      scope: "CLASSROOM",
      term: overview.context.term,
      academicYear: overview.context.academicYear,
      classroom,
    },
    readinessStatus: classroom.readinessStatus,
    readinessScore: classroom.readinessScore,
    blockedReasons: classroom.blockedReasons ?? [],
  };
}

export async function POST(req: NextRequest) {
  const gate = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });
  if (!gate.ok) return gate.res;

  const ctx = gate.ctx;
  const role = roleUpper(ctx.roleName);

  if (!isHeadOrAdmin(role)) {
    return noStoreJson(403, { ok: false, error: "FORBIDDEN", role });
  }

  const body = await readBody(req);

  const scope = normalizeScope(body.scope ?? "SCHOOL");
  const term = safeStr(body.term) || "1st Term";
  const academicYear = safeStr(body.academicYear) || "2025/2026";
  const classroomId = safeStr(body.classroomId) || null;

  const requestedMode = safeStr(body.releaseMode).toUpperCase();
  const overrideReason = safeStr(body.overrideReason);
  const wantsOverride = requestedMode === "OVERRIDE" || !!overrideReason;

  if (!scope) {
    return noStoreJson(400, { ok: false, error: "INVALID_SCOPE" });
  }

  if (!term || !academicYear) {
    return noStoreJson(400, { ok: false, error: "MISSING_TERM_OR_YEAR" });
  }

  let scopeKey = "SCHOOL";
  let classroomIdToStore: string | null = null;

  if (scope === "CLASSROOM") {
    if (!classroomId) {
      return noStoreJson(400, { ok: false, error: "MISSING_CLASSROOM_ID" });
    }

    const classroom = await prisma.classroom.findFirst({
      where: { id: classroomId, tenantId: ctx.tenantId },
      select: { id: true },
    });

    if (!classroom) {
      return noStoreJson(404, { ok: false, error: "CLASSROOM_NOT_FOUND" });
    }

    scopeKey = classroomId;
    classroomIdToStore = classroomId;
  }

  const overviewResult = await loadAssessmentOverviewSnapshot({
    req,
    term,
    academicYear,
  });

  if (!overviewResult.ok) {
    return noStoreJson(overviewResult.status, {
      ok: false,
      error: overviewResult.error,
    });
  }

  const scoped = buildScopedReadiness({
    overview: overviewResult.overview,
    scope,
    classroomId,
  });

  if (!scoped.ok) {
    return noStoreJson(scoped.status, {
      ok: false,
      error: scoped.error,
      readinessStatus: scoped.readinessStatus ?? "BLOCKED",
      readinessScore: scoped.readinessScore ?? 0,
      blockedReasons: scoped.blockedReasons ?? [],
      readinessSnapshot: scoped.scopeSnapshot ?? null,
    });
  }

  const isReady = scoped.readinessStatus === "READY";

  if (!isReady && !wantsOverride) {
    return noStoreJson(409, {
      ok: false,
      error: "RELEASE_BLOCKED_BY_READINESS",
      message:
        "Results cannot be released because assessment readiness is blocked.",
      readinessStatus: scoped.readinessStatus,
      readinessScore: scoped.readinessScore,
      blockedReasons: scoped.blockedReasons.slice(0, 20),
      readinessSnapshot: scoped.scopeSnapshot,
    });
  }

  if (!isReady && wantsOverride) {
    if (!canOverrideRelease(role)) {
      return noStoreJson(403, {
        ok: false,
        error: "OVERRIDE_NOT_ALLOWED_FOR_ROLE",
        role,
      });
    }

    if (overrideReason.length < 12) {
      return noStoreJson(400, {
        ok: false,
        error: "OVERRIDE_REASON_REQUIRED",
        message: "Provide a clear override reason of at least 12 characters.",
      });
    }
  }

  const releaseMode = !isReady && wantsOverride ? "OVERRIDE" : "NORMAL";
  const readinessStatus =
    releaseMode === "OVERRIDE"
      ? ResultsReleaseReadinessStatus.OVERRIDE
      : ResultsReleaseReadinessStatus.READY;

  const readinessSnapshotJson = toPrismaJson({
    releasedScope: scope,
    releasedScopeKey: scopeKey,
    releasedAt: new Date().toISOString(),
    releasedByUserId: ctx.userId,
    releaseMode,
    readinessStatus: scoped.readinessStatus,
    readinessScore: scoped.readinessScore,
    blockedReasons: scoped.blockedReasons.slice(0, 100),
    snapshot: scoped.scopeSnapshot,
   });

  const releaseSnapshotHash = sha256Hex(readinessSnapshotJson);

  const existing = await prisma.resultsRelease.findFirst({
    where: { tenantId: ctx.tenantId, term, academicYear, scopeKey },
    select: { id: true },
  });

  const now = new Date();

  const row = existing
    ? await prisma.resultsRelease.update({
        where: { id: existing.id },
        data: {
          scope,
          classroomId: classroomIdToStore,
          readinessStatus,
          readinessScore: Math.round(scoped.readinessScore),
          readinessSnapshotJson,
          releaseSnapshotHash,
          releaseMode,
          overrideReason: releaseMode === "OVERRIDE" ? overrideReason : null,
          releasedAt: now,
          releasedByUserId: ctx.userId,
        },
      })
    : await prisma.resultsRelease.create({
        data: {
          tenantId: ctx.tenantId,
          term,
          academicYear,
          scope,
          scopeKey,
          classroomId: classroomIdToStore,
          readinessStatus,
          readinessScore: Math.round(scoped.readinessScore),
          readinessSnapshotJson,
          releaseSnapshotHash,
          releaseMode,
          overrideReason: releaseMode === "OVERRIDE" ? overrideReason : null,
          releasedAt: now,
          releasedByUserId: ctx.userId,
        },
      });

  return noStoreJson(200, {
    ok: true,
    release: row,
    readinessStatus,
    readinessScore: scoped.readinessScore,
    releaseSnapshotHash,
  });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });
    if (!gate.ok) return gate.res;

  const ctx = gate.ctx;
  const role = roleUpper(ctx.roleName);

  if (!isHeadOrAdmin(role)) {
    return noStoreJson(403, { ok: false, error: "FORBIDDEN", role });
  }

  const body = await readBody(req);

  const scope = normalizeScope(body.scope ?? "SCHOOL");
  const term = safeStr(body.term) || "1st Term";
  const academicYear = safeStr(body.academicYear) || "2025/2026";
  const classroomId = safeStr(body.classroomId) || null;

  if (!scope) {
    return noStoreJson(400, { ok: false, error: "INVALID_SCOPE" });
  }

  const scopeKey = scope === "SCHOOL" ? "SCHOOL" : classroomId || "";

  if (!scopeKey) {
    return noStoreJson(400, { ok: false, error: "MISSING_SCOPE_KEY" });
  }

  const existing = await prisma.resultsRelease.findFirst({
    where: { tenantId: ctx.tenantId, term, academicYear, scopeKey },
    select: { id: true },
  });

  if (!existing) {
    return noStoreJson(200, { ok: true, deleted: false });
  }

  await prisma.resultsRelease.delete({ where: { id: existing.id } });

  return noStoreJson(200, { ok: true, deleted: true });
}