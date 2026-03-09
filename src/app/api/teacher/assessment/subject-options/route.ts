// src/app/api/teacher/assessment/subject-options/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  isAdminLikeRole,
  resolveUserClassroomAccess,
} from "@/lib/teacherAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeSubjectKey(v: unknown) {
  return cleanStr(v)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeSubjects(list: unknown[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of list) {
    const label = cleanStr(raw);
    if (!label) continue;

    const key = normalizeSubjectKey(label);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    out.push(label);
  }

  return out.sort((a, b) => a.localeCompare(b));
}

function normalizeLevelToken(raw: unknown): string | null {
  const s = cleanStr(raw).toUpperCase().replace(/\s+/g, " ");
  if (!s) return null;

  let m =
    s.match(/^KG\s*([12])$/) ||
    s.match(/^KG([12])$/) ||
    s.match(/^K\.?G\.?\s*([12])$/);
  if (m) return `KG${m[1]}`;

  m =
    s.match(/^JHS\s*([1-3])$/) ||
    s.match(/^JHS([1-3])$/) ||
    s.match(/^J\.?H\.?S\.?\s*([1-3])$/);
  if (m) return `JHS${m[1]}`;

  m =
    s.match(/^BASIC\s*([7-9])$/) ||
    s.match(/^BASIC([7-9])$/) ||
    s.match(/^B\s*([7-9])$/) ||
    s.match(/^B([7-9])$/) ||
    s.match(/^BS\s*([7-9])$/) ||
    s.match(/^BS([7-9])$/);
  if (m) {
    const n = Number(m[1]);
    return `JHS${n - 6}`;
  }

  m =
    s.match(/^BASIC\s*([1-6])$/) ||
    s.match(/^BASIC([1-6])$/) ||
    s.match(/^B\s*([1-6])$/) ||
    s.match(/^B([1-6])$/) ||
    s.match(/^PRIMARY\s*([1-6])$/) ||
    s.match(/^PRIMARY([1-6])$/) ||
    s.match(/^P\s*([1-6])$/) ||
    s.match(/^P([1-6])$/);
  if (m) return `B${m[1]}`;

  return null;
}

function levelCandidatesFromToken(token: string | null) {
  if (!token) return [];

  if (/^KG[12]$/.test(token)) {
    const n = token.slice(2);
    return [`KG ${n}`, `KG${n}`];
  }

  if (/^B[1-6]$/.test(token)) {
    const n = token.slice(1);
    return [`Basic ${n}`, `B${n}`, `Primary ${n}`, `P${n}`];
  }

  if (/^JHS[1-3]$/.test(token)) {
    const n = Number(token.slice(3));
    return [`JHS ${n}`, `JHS${n}`, `Basic ${n + 6}`, `B${n + 6}`, `BS${n + 6}`];
  }

  return [];
}

function isForbiddenReason(reason: string) {
  return reason === "OUT_OF_SCOPE" || reason === "SUBJECT_OUT_OF_SCOPE";
}

function coerceJhsAssignments(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.jhsAssignments)) return obj.jhsAssignments as any[];
    if (Array.isArray(obj.assignments)) return obj.assignments as any[];
  }

  return [];
}

function extractTeacherJhsSubjectsForLevel(rawAssignments: unknown, levelToken: string | null) {
  if (!levelToken || !/^JHS[1-3]$/.test(levelToken)) return [];

  const out: string[] = [];
  const rows = coerceJhsAssignments(rawAssignments);

  for (const row of rows) {
    const subject = cleanStr((row as any)?.subject);
    const classes = Array.isArray((row as any)?.classes) ? (row as any).classes : [];
    if (!subject || classes.length === 0) continue;

    const match = classes.some((c: unknown) => normalizeLevelToken(c) === levelToken);
    if (match) out.push(subject);
  }

  return dedupeSubjects(out);
}

async function curriculumSubjectsForLevel(token: string | null) {
  const candidates = levelCandidatesFromToken(token);
  if (!candidates.length) return [];

  const byLevel = await prisma.curriculumSubject.findMany({
    where: {
      isActive: true,
      level: { in: candidates },
    },
    select: { name: true, orderIndex: true },
    orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
  });

  let items = byLevel.map((r) => cleanStr(r.name)).filter(Boolean);

  if (items.length === 0) {
    let phaseLabel: string | null = null;

    if (/^KG[12]$/.test(token || "")) phaseLabel = "KG";
    else if (/^B[1-6]$/.test(token || "")) phaseLabel = "PRIMARY";
    else if (/^JHS[1-3]$/.test(token || "")) phaseLabel = "JHS";

    if (phaseLabel) {
      const byPhase = await prisma.curriculumSubject.findMany({
        where: {
          isActive: true,
          OR: [
            { phase: phaseLabel },
            { phase: phaseLabel === "JHS" ? "Junior High School" : phaseLabel },
          ],
        },
        select: { name: true, orderIndex: true },
        orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
      });

      items = byPhase.map((r) => cleanStr(r.name)).filter(Boolean);
    }
  }

  return dedupeSubjects(items);
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res as any;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);
  const classroomId = cleanStr(searchParams.get("classroomId"));

  if (!classroomId) {
    return noStore(400, { ok: false, error: "MISSING_CLASSROOM_ID" });
  }

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId,
  });

  if (!access.ok) {
    return noStore(isForbiddenReason(access.reason) ? 403 : 404, {
      ok: false,
      error: access.reason,
    });
  }

  const classroom = await prisma.classroom.findFirst({
    where: {
      id: classroomId,
      tenantId: ctx.tenantId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      grade: true,
      arm: true,
    },
  });

  if (!classroom) {
    return noStore(404, { ok: false, error: "CLASSROOM_NOT_FOUND" });
  }

  const levelToken =
    normalizeLevelToken(classroom.grade) ?? normalizeLevelToken(classroom.name);

  let subjects: string[] = [];

  if (!isAdminLikeRole(ctx.roleName) && Array.isArray(access.allowedSubjects) && access.allowedSubjects.length > 0) {
    subjects = dedupeSubjects(access.allowedSubjects);
  }

  if (!subjects.length && !isAdminLikeRole(ctx.roleName) && /^JHS[1-3]$/.test(levelToken || "")) {
    const profile = await prisma.teacherProfile.findUnique({
      where: {
        teacherProfile_tenant_user_unique: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
        },
      },
      select: {
        jhsAssignments: true,
      },
    });

    subjects = extractTeacherJhsSubjectsForLevel(profile?.jhsAssignments, levelToken);
  }

  if (!subjects.length) {
    subjects = await curriculumSubjectsForLevel(levelToken);
  }

  return noStore(200, {
    ok: true,
    classroom,
    levelToken,
    subjects,
  });
}