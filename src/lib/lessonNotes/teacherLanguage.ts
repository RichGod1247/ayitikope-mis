import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  GHANAIAN_LANGUAGE_REGISTRY_VERSION,
  GHANAIAN_LANGUAGE_SUBJECT_KEY,
  getGhanaianLanguage,
  isGhanaianLanguageSubject,
  type GhanaianLanguageCode,
} from "@/lib/ghanaianLanguages/registry";

export type TeacherLessonLanguageSettingRow = {
  id: string;
  classroomId: string;
  subject: string;
  subjectNorm: string;
  languageCode: GhanaianLanguageCode;
  registryVersion: string;
  createdAt: Date;
};

export type ResolvedLessonLanguage = {
  lessonLanguageCode: GhanaianLanguageCode | null;
  languageRegistryVersion: string | null;
};

export type ResolveLessonLanguageResult =
  | ({ ok: true } & ResolvedLessonLanguage)
  | {
      ok: false;
      code: "GHANAIAN_LANGUAGE_CLASSROOM_REQUIRED" | "GHANAIAN_LANGUAGE_SETTING_REQUIRED" | "GHANAIAN_LANGUAGE_SETTING_INVALID";
      error: string;
    };

export async function readActiveTeacherLessonLanguageSettings(args: {
  tenantId: string;
  teacherUserId: string;
  classroomId?: string | null;
}) {
  const classroomClause = args.classroomId
    ? Prisma.sql`AND "classroomId" = ${args.classroomId}`
    : Prisma.empty;

  return prisma.$queryRaw<TeacherLessonLanguageSettingRow[]>(Prisma.sql`
    SELECT
      "id"::text AS "id",
      "classroomId" AS "classroomId",
      "subject" AS "subject",
      "subjectNorm" AS "subjectNorm",
      "languageCode" AS "languageCode",
      "registryVersion" AS "registryVersion",
      "createdAt" AS "createdAt"
    FROM edulife_os."TeacherLessonLanguageSetting"
    WHERE "tenantId" = ${args.tenantId}
      AND "teacherUserId" = ${args.teacherUserId}
      AND "isActive" = true
      ${classroomClause}
    ORDER BY "subject" ASC, "createdAt" DESC
  `);
}

export async function resolveTeacherLessonLanguageForNote(args: {
  tenantId: string;
  teacherUserId: string;
  classroomId: string | null | undefined;
  subject: string;
}): Promise<ResolveLessonLanguageResult> {
  if (!isGhanaianLanguageSubject(args.subject)) {
    return { ok: true, lessonLanguageCode: null, languageRegistryVersion: null };
  }

  const classroomId = String(args.classroomId ?? "").trim();
  if (!classroomId) {
    return {
      ok: false,
      code: "GHANAIAN_LANGUAGE_CLASSROOM_REQUIRED",
      error: "Choose the class before preparing a Ghanaian Language lesson note.",
    };
  }

  const rows = await prisma.$queryRaw<
    Array<{ languageCode: string; registryVersion: string }>
  >(Prisma.sql`
    SELECT
      "languageCode" AS "languageCode",
      "registryVersion" AS "registryVersion"
    FROM edulife_os."TeacherLessonLanguageSetting"
    WHERE "tenantId" = ${args.tenantId}
      AND "teacherUserId" = ${args.teacherUserId}
      AND "classroomId" = ${classroomId}
      AND "subjectNorm" = ${GHANAIAN_LANGUAGE_SUBJECT_KEY}
      AND "isActive" = true
    ORDER BY "createdAt" DESC
    LIMIT 2
  `);

  if (rows.length !== 1) {
    return {
      ok: false,
      code: "GHANAIAN_LANGUAGE_SETTING_REQUIRED",
      error: "Choose the Ghanaian language you teach in Lesson Note Settings first.",
    };
  }

  const language = getGhanaianLanguage(rows[0]?.languageCode);
  if (!language || rows[0]?.registryVersion !== GHANAIAN_LANGUAGE_REGISTRY_VERSION) {
    return {
      ok: false,
      code: "GHANAIAN_LANGUAGE_SETTING_INVALID",
      error: "Your Ghanaian Language setting needs to be refreshed before preparing this lesson note.",
    };
  }

  return {
    ok: true,
    lessonLanguageCode: language.code,
    languageRegistryVersion: GHANAIAN_LANGUAGE_REGISTRY_VERSION,
  };
}
