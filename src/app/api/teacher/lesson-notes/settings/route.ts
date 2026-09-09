import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  GHANAIAN_LANGUAGE_REGISTRY_VERSION,
  GHANAIAN_LANGUAGE_SUBJECT_KEY,
  getGhanaianLanguage,
  isGhanaianLanguageSubject,
  listGhanaianLanguageOptions,
} from "@/lib/ghanaianLanguages/registry";
import { readActiveTeacherLessonLanguageSettings } from "@/lib/lessonNotes/teacherLanguage";
import {
  authorizeTeacherTimetableSelection,
  listTeacherTimetableOptions,
  minuteToTimeInput,
  normalizeTimetableSubjectKey,
  readActiveTeacherTimetableEntries,
} from "@/lib/lessonNotes/teacherTimetable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid time.");

const BodySchema = z
  .object({
    classroomId: z.string().min(1).max(160),
    subject: z.string().trim().min(1).max(120),
    languageCode: z.string().trim().min(2).max(40).optional().nullable(),
    periods: z
      .array(
        z
          .object({
            weekday: z.number().int().min(1).max(5),
            startTime: TimeSchema,
            endTime: TimeSchema,
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

type ParsedPeriod = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function parseTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function parsePeriods(input: z.infer<typeof BodySchema>["periods"]): ParsedPeriod[] {
  const periods = input
    .map((row) => ({
      weekday: row.weekday,
      startMinute: parseTime(row.startTime),
      endMinute: parseTime(row.endTime),
    }))
    .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const seen = new Set<string>();

  for (const period of periods) {
    if (period.endMinute <= period.startMinute) {
      throw new Error("END_MUST_BE_AFTER_START");
    }

    const exactKey = `${period.weekday}:${period.startMinute}:${period.endMinute}`;
    if (seen.has(exactKey)) throw new Error("DUPLICATE_PERIOD");
    seen.add(exactKey);
  }

  for (let i = 1; i < periods.length; i += 1) {
    const previous = periods[i - 1]!;
    const current = periods[i]!;
    if (previous.weekday === current.weekday && current.startMinute < previous.endMinute) {
      throw new Error("OVERLAPPING_PERIODS");
    }
  }

  return periods;
}

function errorText(error: unknown) {
  if (error instanceof Error) return `${error.message}\n${error.stack ?? ""}`;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error ?? "");
  }
}

function requestIp(req: Request) {
  const forwarded = String(req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || null;
}

async function loadResponseState(ctx: { tenantId: string; userId: string; roleName: string | null }) {
  const [subjects, rows, languageSettings] = await Promise.all([
    listTeacherTimetableOptions({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      roleName: ctx.roleName,
    }),
    readActiveTeacherTimetableEntries({
      tenantId: ctx.tenantId,
      teacherUserId: ctx.userId,
    }),
    readActiveTeacherLessonLanguageSettings({
      tenantId: ctx.tenantId,
      teacherUserId: ctx.userId,
    }),
  ]);

  return {
    subjects,
    languages: listGhanaianLanguageOptions(),
    languageSettings: languageSettings.map((row) => ({
      id: row.id,
      classroomId: row.classroomId,
      subject: row.subject,
      subjectNorm: row.subjectNorm,
      subjectKey: normalizeTimetableSubjectKey(row.subject),
      languageCode: row.languageCode,
      registryVersion: row.registryVersion,
    })),
    entries: rows.map((row) => ({
      ...row,
      subjectKey: normalizeTimetableSubjectKey(row.subject),
      startTime: minuteToTimeInput(row.startMinute),
      endTime: minuteToTimeInput(row.endMinute),
    })),
  };
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER"],
  });
  if (!auth.ok) return auth.res;

  try {
    const state = await loadResponseState(auth.ctx);
    return jsonNoStore({ ok: true, ...state });
  } catch (error) {
    console.error("[TEACHER_LESSON_TIMETABLE_GET_ERROR]", error);
    return jsonNoStore({ ok: false, error: "Failed to load Lesson Note settings." }, 500);
  }
}

export async function POST(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER"],
  });
  if (!auth.ok) return auth.res;

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonNoStore(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid Lesson Note settings." },
      400,
    );
  }

  let periods: ParsedPeriod[];
  try {
    periods = parsePeriods(parsed.data.periods);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_PERIODS";
    const friendly =
      code === "END_MUST_BE_AFTER_START"
        ? "End time must be later than start time."
        : code === "DUPLICATE_PERIOD"
          ? "The same lesson time was added twice."
          : code === "OVERLAPPING_PERIODS"
            ? "Two lesson times overlap on the same day."
            : "Check the lesson times and try again.";
    return jsonNoStore({ ok: false, error: friendly, code }, 400);
  }

  const authorization = await authorizeTeacherTimetableSelection({
    tenantId: auth.ctx.tenantId,
    userId: auth.ctx.userId,
    roleName: auth.ctx.roleName,
    classroomId: parsed.data.classroomId,
    subject: parsed.data.subject,
  });

  if (!authorization.ok) {
    return jsonNoStore(
      {
        ok: false,
        error:
          authorization.reason === "SUBJECT_OUT_OF_SCOPE"
            ? "That subject is not assigned to you for this class."
            : "That class is not assigned to you.",
        code: authorization.reason,
      },
      authorization.reason === "CLASSROOM_NOT_FOUND" ? 404 : 403,
    );
  }

  const subject = authorization.subject;
  const subjectNorm = authorization.subjectNorm;
  const classroomId = authorization.classroom.id;
  const requiresGhanaianLanguage = isGhanaianLanguageSubject(subject) || subjectNorm === GHANAIAN_LANGUAGE_SUBJECT_KEY;
  const requestedLanguage = getGhanaianLanguage(parsed.data.languageCode);

  if (requiresGhanaianLanguage && !requestedLanguage) {
    return jsonNoStore(
      {
        ok: false,
        code: "GHANAIAN_LANGUAGE_REQUIRED",
        error: "Choose the Ghanaian language you teach.",
      },
      400,
    );
  }

  if (!requiresGhanaianLanguage && parsed.data.languageCode) {
    return jsonNoStore(
      {
        ok: false,
        code: "GHANAIAN_LANGUAGE_NOT_APPLICABLE",
        error: "A Ghanaian language can only be selected for the Ghanaian Language subject.",
      },
      400,
    );
  }

  const auditAction = periods.length
    ? "TEACHER_LESSON_TIMETABLE_REPLACED"
    : "TEACHER_LESSON_TIMETABLE_CLEARED";

  try {
    await prisma.$transaction(
      async (tx) => {
        const lockKey = `teacher-lesson-timetable:${auth.ctx.tenantId}:${auth.ctx.userId}`;
        const lockRows = await tx.$queryRaw<Array<{ locked: number }>>(Prisma.sql`
          WITH lock_row AS MATERIALIZED (
            SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS ignored
          )
          SELECT 1::int AS "locked"
          FROM lock_row
        `);

        if (lockRows.length !== 1 || lockRows[0]?.locked !== 1) {
          throw new Error("LESSON_TIMETABLE_LOCK_NOT_ACQUIRED");
        }

        const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id"::text AS "id"
          FROM edulife_os."TeacherLessonTimetableEntry"
          WHERE "tenantId" = ${auth.ctx.tenantId}
            AND "teacherUserId" = ${auth.ctx.userId}
            AND "classroomId" = ${classroomId}
            AND "subjectNorm" = ${subjectNorm}
            AND "isActive" = true
          FOR UPDATE
        `);

        const existingLanguageSettings = requiresGhanaianLanguage
          ? await tx.$queryRaw<Array<{ id: string; languageCode: string; registryVersion: string }>>(Prisma.sql`
              SELECT
                "id"::text AS "id",
                "languageCode" AS "languageCode",
                "registryVersion" AS "registryVersion"
              FROM edulife_os."TeacherLessonLanguageSetting"
              WHERE "tenantId" = ${auth.ctx.tenantId}
                AND "teacherUserId" = ${auth.ctx.userId}
                AND "classroomId" = ${classroomId}
                AND "subjectNorm" = ${GHANAIAN_LANGUAGE_SUBJECT_KEY}
                AND "isActive" = true
              FOR UPDATE
            `)
          : [];

        if (existingLanguageSettings.length > 1) {
          throw new Error("GL_LANGUAGE_MULTIPLE_ACTIVE_SETTINGS");
        }

        const activeLanguageSetting = existingLanguageSettings[0] ?? null;
        const languageChanged = Boolean(
          requiresGhanaianLanguage &&
            requestedLanguage &&
            (!activeLanguageSetting ||
              activeLanguageSetting.languageCode !== requestedLanguage.code ||
              activeLanguageSetting.registryVersion !== GHANAIAN_LANGUAGE_REGISTRY_VERSION),
        );

        if (languageChanged && activeLanguageSetting) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE edulife_os."TeacherLessonLanguageSetting"
            SET
              "isActive" = false,
              "retiredAt" = now(),
              "updatedAt" = now()
            WHERE "id" = ${activeLanguageSetting.id}::uuid
              AND "isActive" = true
          `);
        }

        if (languageChanged && requestedLanguage) {
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO edulife_os."TeacherLessonLanguageSetting" (
              "tenantId",
              "teacherUserId",
              "classroomId",
              "subject",
              "subjectNorm",
              "languageCode",
              "registryVersion"
            ) VALUES (
              ${auth.ctx.tenantId},
              ${auth.ctx.userId},
              ${classroomId},
              ${subject},
              ${GHANAIAN_LANGUAGE_SUBJECT_KEY},
              ${requestedLanguage.code},
              ${GHANAIAN_LANGUAGE_REGISTRY_VERSION}
            )
          `);
        }

        if (existing.length) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE edulife_os."TeacherLessonTimetableEntry"
            SET
              "isActive" = false,
              "retiredAt" = now(),
              "updatedAt" = now()
            WHERE "tenantId" = ${auth.ctx.tenantId}
              AND "teacherUserId" = ${auth.ctx.userId}
              AND "classroomId" = ${classroomId}
              AND "subjectNorm" = ${subjectNorm}
              AND "isActive" = true
          `);
        }

        for (const period of periods) {
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO edulife_os."TeacherLessonTimetableEntry" (
              "tenantId",
              "teacherUserId",
              "classroomId",
              "subject",
              "subjectNorm",
              "weekday",
              "startMinute",
              "endMinute"
            ) VALUES (
              ${auth.ctx.tenantId},
              ${auth.ctx.userId},
              ${classroomId},
              ${subject},
              ${subjectNorm},
              ${period.weekday},
              ${period.startMinute},
              ${period.endMinute}
            )
          `);
        }

        await tx.auditLog.create({
          data: {
            action: auditAction,
            tenantId: auth.ctx.tenantId,
            userId: auth.ctx.userId,
            resource: "TeacherLessonTimetable",
            resourceId: classroomId,
            ip: requestIp(req) ?? undefined,
            userAgent: req.headers.get("user-agent") ?? undefined,
            metadata: {
              subject,
              subjectNorm,
              classroomId,
              retiredCount: existing.length,
              activePeriodCount: periods.length,
              periods,
              lessonLanguageCode: requestedLanguage?.code ?? null,
              languageRegistryVersion: requestedLanguage ? GHANAIAN_LANGUAGE_REGISTRY_VERSION : null,
              languageSettingChanged: languageChanged,
            },
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );

    const state = await loadResponseState(auth.ctx);
    return jsonNoStore({
      ok: true,
      message: periods.length ? "Lesson Note settings saved." : "Saved lesson times cleared.",
      ...state,
    });
  } catch (error) {
    const text = errorText(error);

    if (text.includes("LESSON_TIMETABLE_TEACHER_OVERLAP")) {
      return jsonNoStore(
        { ok: false, code: "TEACHER_OVERLAP", error: "You already have another class during that time." },
        409,
      );
    }

    if (text.includes("LESSON_TIMETABLE_CLASSROOM_OVERLAP")) {
      return jsonNoStore(
        { ok: false, code: "CLASSROOM_OVERLAP", error: "That class already has another lesson during that time." },
        409,
      );
    }

    if (
      text.includes("LESSON_TIMETABLE_CLASSROOM_TENANT_SCOPE_INVALID") ||
      text.includes("LESSON_TIMETABLE_TEACHER_MEMBERSHIP_INACTIVE")
    ) {
      return jsonNoStore({ ok: false, error: "Your current school assignment changed. Refresh and try again." }, 409);
    }

    if (
      text.includes("GL_LANGUAGE_CLASSROOM_TENANT_SCOPE_INVALID") ||
      text.includes("GL_LANGUAGE_TEACHER_MEMBERSHIP_INACTIVE")
    ) {
      return jsonNoStore({ ok: false, error: "Your current school assignment changed. Refresh and try again." }, 409);
    }

    if (text.includes("GL_LANGUAGE_MULTIPLE_ACTIVE_SETTINGS")) {
      return jsonNoStore(
        { ok: false, error: "Your Ghanaian Language setting needs review. Please contact support before saving again." },
        409,
      );
    }

    console.error("[TEACHER_LESSON_TIMETABLE_POST_ERROR]", error);
    return jsonNoStore({ ok: false, error: "Failed to save Lesson Note settings." }, 500);
  }
}
