// src/lib/teacherClassroomAccess.ts
import { prisma } from "@/lib/prisma";

type SafeCtx = { userId: string; tenantId: string };

type ClassroomAccessRow = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
};

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeLevel(v: unknown) {
  return cleanStr(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function levelToken(raw: unknown): string | null {
  const s = normalizeLevel(raw);

  let m = s.match(/^KG([12])$/);
  if (m) return `KG${m[1]}`;

  m = s.match(/^JHS([1-3])$/);
  if (m) return `JHS${m[1]}`;

  m = s.match(/^(BASIC|B|BS)([7-9])$/);
  if (m) return `JHS${Number(m[2]) - 6}`;

  m = s.match(/^(BASIC|B|PRIMARY|P)([1-6])$/);
  if (m) return `B${m[2]}`;

  return null;
}

function classroomMatchesLevel(classroom: ClassroomAccessRow, rawLevel: unknown) {
  const expectedToken = levelToken(rawLevel);
  if (expectedToken) {
    return levelToken(classroom.grade) === expectedToken || levelToken(classroom.name) === expectedToken;
  }

  const expected = normalizeLevel(rawLevel);
  if (!expected) return false;

  return normalizeLevel(classroom.grade) === expected || normalizeLevel(classroom.name) === expected;
}

function isAdminLike(roleName: string | null | undefined) {
  const r = cleanStr(roleName).toUpperCase();
  return r.includes("ADMIN") || r.includes("HEAD") || r.includes("OWNER");
}

async function getActiveMembershipRole({ userId, tenantId }: SafeCtx) {
  const membership = await prisma.membership.findFirst({
    where: { userId, tenantId, status: "ACTIVE" },
    select: { role: { select: { name: true } } },
  });

  if (!membership) throw Object.assign(new Error("Forbidden."), { status: 403 });
  return membership.role?.name ?? null;
}

async function loadTeacherProfile(ctx: SafeCtx) {
  return prisma.teacherProfile.findUnique({
    where: {
      teacherProfile_tenant_user_unique: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
      },
    },
    select: {
      phase: true,
      classLevel: true,
      primaryClassroomId: true,
    },
  });
}

async function loadActiveTenantClassrooms(tenantId: string) {
  return prisma.classroom.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { id: true, name: true, grade: true, arm: true },
    orderBy: [{ name: "asc" }, { arm: "asc" }],
  });
}

async function resolveOrdinaryTeacherAttendanceClassroom(ctx: SafeCtx): Promise<ClassroomAccessRow | null> {
  const profile = await loadTeacherProfile(ctx);
  if (!profile) return null;

  if (profile.primaryClassroomId) {
    return prisma.classroom.findFirst({
      where: {
        id: profile.primaryClassroomId,
        tenantId: ctx.tenantId,
        status: "ACTIVE",
      },
      select: { id: true, name: true, grade: true, arm: true },
    });
  }

  // JHS subject assignments are teaching authority, not register authority.
  // JHS attendance therefore requires an explicit Class Adviser / Class Monitor
  // assignment through TeacherProfile.primaryClassroomId.
  if (profile.phase === "JHS") return null;

  // Backward-compatible KG/Primary fallback for legacy profiles that predate
  // primaryClassroomId. It is allowed only when the class level resolves to
  // exactly one ACTIVE classroom. Multiple arms fail closed until an admin
  // explicitly chooses the teacher's primary classroom.
  const classLevel = cleanStr(profile.classLevel);
  if (!classLevel) return null;

  const classrooms = await loadActiveTenantClassrooms(ctx.tenantId);
  const matches = classrooms.filter((classroom) => classroomMatchesLevel(classroom, classLevel));

  return matches.length === 1 ? matches[0] : null;
}

export async function listAccessibleClassrooms(ctx: SafeCtx) {
  const roleName = await getActiveMembershipRole(ctx);

  if (isAdminLike(roleName)) {
    return loadActiveTenantClassrooms(ctx.tenantId);
  }

  const classroom = await resolveOrdinaryTeacherAttendanceClassroom(ctx);
  return classroom ? [classroom] : [];
}

export async function assertCanAccessClassroom(ctx: SafeCtx & { classroomId: string }) {
  const classroom = await prisma.classroom.findFirst({
    where: { id: ctx.classroomId, tenantId: ctx.tenantId },
    select: { id: true, name: true, grade: true, arm: true },
  });
  if (!classroom) throw Object.assign(new Error("Classroom not found."), { status: 404 });

  const roleName = await getActiveMembershipRole(ctx);
  if (isAdminLike(roleName)) return classroom;

  const assignedClassroom = await resolveOrdinaryTeacherAttendanceClassroom(ctx);
  if (!assignedClassroom || assignedClassroom.id !== classroom.id) {
    throw Object.assign(new Error("Forbidden."), { status: 403 });
  }

  return classroom;
}
