// src/app/api/headteacher/adviser/suggestions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonPayload = Record<string, unknown>;

type ClassRollupRow = {
  classroomId: string;
  label: string;
  students: number;
  sessions: number;
  presentSum: number;
  open: number;
  closed: number;
  certified: number;
  noMarkSum: number;
};

type StudentRollupRow = {
  studentId: string;
  firstName: string;
  lastName: string;
  classroomId: string;
  classLabel: string;
  sessions: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  noMark: number;
};

type StudentSuggestion = {
  studentId: string;
  fullName: string;
  classroomId: string;
  classLabel: string;
  sessions: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  noMark: number;
  pctPresent: number;
  issues: string[];
  suggestion: string;
};

function jsonNoStore(payload: JsonPayload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function daysBetweenInclusive(start: string, end: string) {
  const s = new Date(`${start}T00:00:00.000Z`).getTime();
  const e = new Date(`${end}T00:00:00.000Z`).getTime();
  const diff = Math.floor((e - s) / (24 * 60 * 60 * 1000));
  return diff + 1;
}

async function requireHeadOrAdmin(tenantId: string, userId: string) {
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    include: { role: true },
  });

  if (!m) return { ok: false as const, status: 403, error: "FORBIDDEN" };

  const roleName = String(m.role?.name ?? "").toUpperCase();
  const ok =
    roleName.includes("HEAD") ||
    roleName.includes("ADMIN") ||
    roleName.includes("OWNER") ||
    roleName.includes("SUPER");

  return ok
    ? ({ ok: true as const } as const)
    : ({ ok: false as const, status: 403, error: "FORBIDDEN" } as const);
}

/**
 * GET /api/headteacher/adviser/suggestions?start=YYYY-MM-DD&end=YYYY-MM-DD
 * (Optional legacy) tenantId=... is allowed ONLY if it matches session tenant.
 */
export async function GET(req: NextRequest) {
  let ctx: { tenantId: string; userId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { tenantId: c.tenantId, userId: c.userId };
  } catch {
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const { searchParams } = new URL(req.url);

  const guard = assertNoTenantOverride(searchParams.get("tenantId"), ctx.tenantId);
  if (!guard.ok) return jsonNoStore({ ok: false, error: guard.error }, guard.status);

  const start = toISODateOnly(searchParams.get("start"));
  const end = toISODateOnly(searchParams.get("end"));

  if (!start || !end) {
    return jsonNoStore({ ok: false, error: "start and end are required (YYYY-MM-DD)" }, 400);
  }
  if (start > end) return jsonNoStore({ ok: false, error: "start must be <= end" }, 400);

  const rangeDays = daysBetweenInclusive(start, end);
  if (rangeDays > 31) {
    return jsonNoStore({ ok: false, error: "Date range too large. Use 31 days or less." }, 400);
  }

  const roleOk = await requireHeadOrAdmin(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  try {
    const classRows = await prisma.$queryRaw<ClassRollupRow[]>`
      WITH cls AS (
        SELECT
          c."id" AS "classroomId",
          CASE
            WHEN c."grade" IS NOT NULL AND c."arm" IS NOT NULL THEN (c."grade" || c."arm")
            WHEN c."grade" IS NOT NULL THEN c."grade"
            ELSE COALESCE(c."arm",'')
          END AS "label",
          (SELECT COUNT(*) FROM "edulife_os"."Student" s WHERE s."tenantId" = c."tenantId" AND s."classroomId" = c."id")::int AS "students"
        FROM "edulife_os"."Classroom" c
        WHERE c."tenantId" = ${ctx.tenantId}
      ),
      week_sessions AS (
        SELECT s."id" AS "sessionId", s."classroomId", s."isClosed", s."certifiedAt"
        FROM "edulife_os"."AttendanceSession" s
        WHERE s."tenantId" = ${ctx.tenantId}
          AND s."date"::date BETWEEN ${start}::date AND ${end}::date
      ),
      marks AS (
        SELECT
          ws."classroomId",
          COUNT(CASE WHEN m."status" = 'PRESENT' THEN 1 END)::int AS "presentSum",
          COUNT(CASE WHEN m."status" IS NULL THEN 1 END)::int AS "noMarkSum"
        FROM week_sessions ws
        LEFT JOIN "edulife_os"."AttendanceMark" m ON m."sessionId" = ws."sessionId"
        GROUP BY ws."classroomId"
      ),
      states AS (
        SELECT
          ws."classroomId",
          COUNT(*)::int AS "sessions",
          COUNT(CASE WHEN ws."isClosed" = false OR ws."isClosed" IS NULL THEN 1 END)::int AS "open",
          COUNT(CASE WHEN ws."isClosed" = true  AND ws."certifiedAt" IS NULL THEN 1 END)::int AS "closed",
          COUNT(CASE WHEN ws."certifiedAt" IS NOT NULL THEN 1 END)::int AS "certified"
        FROM week_sessions ws
        GROUP BY ws."classroomId"
      )
      SELECT
        c."classroomId",
        c."label",
        c."students",
        COALESCE(s."sessions",0) AS "sessions",
        COALESCE(m."presentSum",0) AS "presentSum",
        COALESCE(s."open",0) AS "open",
        COALESCE(s."closed",0) AS "closed",
        COALESCE(s."certified",0) AS "certified",
        COALESCE(m."noMarkSum",0) AS "noMarkSum"
      FROM cls c
      LEFT JOIN states s ON s."classroomId" = c."classroomId"
      LEFT JOIN marks  m ON m."classroomId" = c."classroomId"
      ORDER BY c."label" ASC
    `;

    const classSuggestions = classRows.map((r: ClassRollupRow) => {
      const denom = Math.max(1, r.sessions * r.students);
      const avgPctPresent =
        r.sessions > 0 && r.students > 0 ? Math.round((r.presentSum / denom) * 100) : 0;

      const issues: string[] = [];
      if (r.sessions === 0) issues.push("No sessions this period");
      if (avgPctPresent < 80 && r.sessions > 0) issues.push("Low average attendance (<80%)");
      if (r.open > 0) issues.push(`Open sessions pending (${r.open})`);
      if (r.closed > 0 && r.certified === 0) issues.push("Closed but not certified");

      const noMarkThreshold = Math.max(2, Math.ceil(0.2 * denom));
      if (r.noMarkSum > noMarkThreshold) issues.push("Missing marks indicated (NO_MARK high)");

      let suggestion = "Healthy — maintain routines and recognition.";
      if (issues.length) {
        if (issues.includes("No sessions this period")) {
          suggestion =
            "Ensure daily register is opened; brief teachers on opening a session before marking.";
        } else if (r.open > 0) {
          suggestion =
            "Close today’s register and ensure marks are saved; verify each class submits by end-of-day.";
        } else if (issues.includes("Closed but not certified")) {
          suggestion =
            "Headteacher: review and certify closed sessions to lock records and trigger analytics.";
        } else if (issues.includes("Low average attendance (<80%)")) {
          suggestion =
            "Run quick check-ins: identify patterns, contact guardians of chronic absentees, and set class target ≥ 90%.";
        } else if (issues.includes("Missing marks indicated (NO_MARK high)")) {
          suggestion =
            "Retrain class teacher on marking flow; spot-check devices/network; use Reopen to correct gaps.";
        }
      }

      return {
        classroomId: r.classroomId,
        label: r.label,
        sessions: r.sessions,
        students: r.students,
        presentSum: r.presentSum,
        avgPctPresent,
        open: r.open,
        closed: r.closed,
        certified: r.certified,
        issues,
        suggestion,
      };
    });

    const studentRows = await prisma.$queryRaw<StudentRollupRow[]>`
      WITH roster AS (
        SELECT
          st."id" AS "studentId",
          st."firstName",
          st."lastName",
          st."classroomId"
        FROM "edulife_os"."Student" st
        WHERE st."tenantId" = ${ctx.tenantId}
      ),
      labels AS (
        SELECT
          c."id" AS "classroomId",
          CASE
            WHEN c."grade" IS NOT NULL AND c."arm" IS NOT NULL THEN (c."grade" || c."arm")
            WHEN c."grade" IS NOT NULL THEN c."grade"
            ELSE COALESCE(c."arm",'')
          END AS "classLabel"
        FROM "edulife_os"."Classroom" c
        WHERE c."tenantId" = ${ctx.tenantId}
      ),
      sessions AS (
        SELECT s."id" AS "sessionId", s."classroomId"
        FROM "edulife_os"."AttendanceSession" s
        WHERE s."tenantId" = ${ctx.tenantId}
          AND s."date"::date BETWEEN ${start}::date AND ${end}::date
      ),
      joined AS (
        SELECT
          r."studentId",
          r."firstName",
          r."lastName",
          r."classroomId",
          se."sessionId"
        FROM roster r
        JOIN sessions se ON se."classroomId" = r."classroomId"
      )
      SELECT
        j."studentId",
        j."firstName",
        j."lastName",
        j."classroomId",
        (SELECT l."classLabel" FROM labels l WHERE l."classroomId" = j."classroomId") AS "classLabel",
        COUNT(j."sessionId")::int AS "sessions",
        COUNT(CASE WHEN m."status" = 'PRESENT' THEN 1 END)::int AS "present",
        COUNT(CASE WHEN m."status" = 'ABSENT' THEN 1 END)::int AS "absent",
        COUNT(CASE WHEN m."status" = 'LATE' THEN 1 END)::int AS "late",
        COUNT(CASE WHEN m."status" = 'EXCUSED' THEN 1 END)::int AS "excused",
        COUNT(CASE WHEN m."status" IS NULL THEN 1 END)::int AS "noMark"
      FROM joined j
      LEFT JOIN "edulife_os"."AttendanceMark" m
        ON m."sessionId" = j."sessionId" AND m."studentId" = j."studentId"
      GROUP BY j."studentId", j."firstName", j."lastName", j."classroomId"
      ORDER BY j."lastName", j."firstName"
    `;

    const studentSuggestionsRaw: StudentSuggestion[] = studentRows.map((r: StudentRollupRow) => {
      const fullName = [r.firstName, r.lastName].filter(Boolean).join(" ").trim();
      const pctPresent = r.sessions > 0 ? Math.round((r.present / r.sessions) * 100) : 0;

      const issues: string[] = [];
      if (r.sessions === 0) issues.push("No sessions for class this period");
      if (pctPresent < 60 && r.sessions > 0) issues.push("Very low attendance (<60%)");
      if (r.absent >= 2) issues.push("Frequent absences (≥2)");
      if (r.late + r.excused >= 3) issues.push("Repeated lateness/excused (≥3)");
      if (r.noMark >= 2) issues.push("Missing marks (≥2)");

      let suggestion = "Healthy — acknowledge consistency; keep family in the loop.";
      if (issues.length) {
        if (issues.includes("Very low attendance (<60%)")) {
          suggestion = "Escalate: call guardian today, explore causes, agree on attendance plan.";
        } else if (issues.includes("Frequent absences (≥2)")) {
          suggestion =
            "Contact guardian; set target for next period; consider mentor/peer buddy support.";
        } else if (issues.includes("Repeated lateness/excused (≥3)")) {
          suggestion = "Coach morning routine; track on-time streak; reward improvement.";
        } else if (issues.includes("Missing marks (≥2)")) {
          suggestion =
            "Verify teacher marks; if missing, correct; if present, fix device/network/marking flow.";
        } else if (issues.includes("No sessions for class this period")) {
          suggestion = "Ensure class sessions are opened daily; verify timetable execution.";
        }
      }

      return {
        studentId: r.studentId,
        fullName: fullName || "Unnamed learner",
        classroomId: r.classroomId,
        classLabel: r.classLabel || "",
        sessions: r.sessions,
        present: r.present,
        absent: r.absent,
        late: r.late,
        excused: r.excused,
        noMark: r.noMark,
        pctPresent,
        issues,
        suggestion,
      };
    });

    studentSuggestionsRaw.sort((a: StudentSuggestion, b: StudentSuggestion) => {
      const riskA =
        (a.pctPresent < 60 ? 1 : 0) +
        (a.absent >= 2 ? 1 : 0) +
        (a.late + a.excused >= 3 ? 1 : 0) +
        (a.noMark >= 2 ? 1 : 0);

      const riskB =
        (b.pctPresent < 60 ? 1 : 0) +
        (b.absent >= 2 ? 1 : 0) +
        (b.late + b.excused >= 3 ? 1 : 0) +
        (b.noMark >= 2 ? 1 : 0);

      if (riskA !== riskB) return riskB - riskA;
      return a.fullName.localeCompare(b.fullName);
    });

    const studentSuggestions = studentSuggestionsRaw.slice(0, 50);

    return jsonNoStore(
      {
        ok: true,
        meta: { tenantId: ctx.tenantId, start, end },
        classSuggestions,
        studentSuggestions,
      },
      200
    );
  } catch (err: unknown) {
    console.error("[HEADTEACHER_ADVISER_SUGGESTIONS_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load adviser suggestions" }, 500);
  }
}