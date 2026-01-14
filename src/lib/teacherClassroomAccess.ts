// src/lib/teacherClassroomAccess.ts
import { prisma } from "@/lib/prisma";

type SafeCtx = { userId: string; tenantId: string };

function normalizeLevel(v: string) {
  return String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function uniq(xs: string[]) {
  return Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));
}

function isAdminLike(roleName: string | null | undefined) {
  const r = String(roleName ?? "").toUpperCase();
  return r.includes("ADMIN") || r.includes("HEAD") || r.includes("OWNER");
}

function extractAssignedLevels(classes: unknown): string[] {
  if (Array.isArray(classes)) return classes.filter((c) => typeof c === "string") as string[];
  if (classes && typeof classes === "object") {
    const out: string[] = [];
    for (const [k, v] of Object.entries(classes as Record<string, unknown>)) {
      if (v) out.push(k);
    }
    return out;
  }
  return [];
}

function parseJhsAssignments(j: unknown): string[] {
  if (!Array.isArray(j)) return [];
  const levels: string[] = [];
  for (const row of j as any[]) {
    const levelsRaw = extractAssignedLevels(row?.classes);
    for (const c of levelsRaw) levels.push(String(c));
  }
  return uniq(levels);
}

async function getRoleName({ userId, tenantId }: SafeCtx) {
  const m = await prisma.membership.findFirst({
    where: { userId, tenantId, status: "ACTIVE" },
    select: { role: { select: { name: true } } },
  });
  return m?.role?.name ?? null;
}

async function requireActiveMembership({ userId, tenantId }: SafeCtx) {
  const m = await prisma.membership.findFirst({
    where: { userId, tenantId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!m) throw Object.assign(new Error("Forbidden."), { status: 403 });
}

export async function listAccessibleClassrooms(ctx: SafeCtx) {
  await requireActiveMembership(ctx);

  const roleName = await getRoleName(ctx);
  if (isAdminLike(roleName)) {
    return prisma.classroom.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, grade: true, arm: true },
      orderBy: [{ name: "asc" }],
    });
  }

  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { teacherProfile_tenant_user_unique: { tenantId: ctx.tenantId, userId: ctx.userId } },
    select: { phase: true, classLevel: true, jhsAssignments: true },
  });

  if (!teacherProfile) return [];

  if (teacherProfile.phase === "JHS") {
    const levels = parseJhsAssignments(teacherProfile.jhsAssignments);
    if (levels.length === 0) return [];
    const normalized = new Set(levels.map(normalizeLevel));

    return prisma.classroom.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [
          { grade: { in: levels } },
          { name: { in: levels } },
          { grade: { in: Array.from(normalized) } },
          { name: { in: Array.from(normalized) } },
        ],
      },
      select: { id: true, name: true, grade: true, arm: true },
      orderBy: [{ name: "asc" }],
    });
  }

  const lvl = teacherProfile.classLevel?.trim();
  if (!lvl) return [];

  return prisma.classroom.findMany({
    where: {
      tenantId: ctx.tenantId,
      OR: [{ grade: lvl }, { name: lvl }, { name: { contains: lvl, mode: "insensitive" } }],
    },
    select: { id: true, name: true, grade: true, arm: true },
    orderBy: [{ name: "asc" }],
  });
}

export async function assertCanAccessClassroom(ctx: SafeCtx & { classroomId: string }) {
  await requireActiveMembership(ctx);

  const classroom = await prisma.classroom.findFirst({
    where: { id: ctx.classroomId, tenantId: ctx.tenantId },
    select: { id: true, name: true, grade: true, arm: true },
  });
  if (!classroom) throw Object.assign(new Error("Classroom not found."), { status: 404 });

  const roleName = await getRoleName(ctx);
  if (isAdminLike(roleName)) return classroom;

  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { teacherProfile_tenant_user_unique: { tenantId: ctx.tenantId, userId: ctx.userId } },
    select: { phase: true, classLevel: true, jhsAssignments: true },
  });
  if (!teacherProfile) throw Object.assign(new Error("Forbidden."), { status: 403 });

  if (teacherProfile.phase === "JHS") {
    const levels = parseJhsAssignments(teacherProfile.jhsAssignments);
    const cA = normalizeLevel(classroom.grade ?? classroom.name);
    const ok = levels.some((lvl) => normalizeLevel(lvl) === cA);
    if (!ok) throw Object.assign(new Error("Forbidden."), { status: 403 });
    return classroom;
  }

  const lvl = (teacherProfile.classLevel ?? "").trim();
  if (!lvl) throw Object.assign(new Error("Forbidden."), { status: 403 });

  const ok =
    normalizeLevel(classroom.grade ?? "") === normalizeLevel(lvl) ||
    normalizeLevel(classroom.name ?? "") === normalizeLevel(lvl) ||
    normalizeLevel(classroom.name ?? "").includes(normalizeLevel(lvl));

  if (!ok) throw Object.assign(new Error("Forbidden."), { status: 403 });

  return classroom;
}
