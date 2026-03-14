// src/app/teacher/lesson-notes/studio/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import LessonNotesStudioClient from "./ui/LessonNotesStudioClient";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type JhsAssignment = { subject: string; classes: string[] };

async function resolveSearchParams(
  sp: SearchParams | Promise<SearchParams> | undefined | null
): Promise<SearchParams> {
  try {
    const v = await Promise.resolve(sp as any);
    if (v && typeof v === "object") return v as SearchParams;
    return {};
  } catch {
    return {};
  }
}

function spGet(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function uniqStrings(list: string[]) {
  return Array.from(new Set(list.map((x) => cleanStr(x)).filter(Boolean)));
}

function coerceJhsAssignments(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw as any[];

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      return coerceJhsAssignments(parsed);
    } catch {
      return [];
    }
  }

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray((obj as any).jhsAssignments)) return (obj as any).jhsAssignments as any[];
    if (Array.isArray((obj as any).assignments)) return (obj as any).assignments as any[];
  }

  return [];
}

function parseJhsAssignments(v: unknown): JhsAssignment[] {
  const arr = coerceJhsAssignments(v);
  if (!arr.length) return [];

  const out: JhsAssignment[] = [];

  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const r = row as any;

    const subject = cleanStr(r.subject);
    const classes = Array.isArray(r.classes)
      ? r.classes.map((c: any) => cleanStr(c).toUpperCase()).filter(Boolean)
      : [];

    if (subject && classes.length) out.push({ subject, classes: uniqStrings(classes) });
  }

  const by = new Map<string, Set<string>>();
  for (const a of out) {
    const key = a.subject.toLowerCase();
    const set = by.get(key) ?? new Set<string>();
    a.classes.forEach((c) => set.add(c));
    by.set(key, set);
  }

  return Array.from(by.entries()).map(([k, set]) => ({
    subject: out.find((x) => x.subject.toLowerCase() === k)?.subject ?? k,
    classes: Array.from(set.values()).sort(),
  }));
}

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Bank-grade: CurriculumSubject.level must match teacher classLevel.
 * KG is the offender ("KG 1" vs "KG1"), but we support other variants safely.
 */
function levelLookupVariants(raw: unknown): string[] {
  const s0 = normalizeSpaces(cleanStr(raw));
  if (!s0) return [];

  const out = new Set<string>();
  out.add(s0);

  let m = s0.match(/^KG\s*([12])$/i) || s0.match(/^KG([12])$/i);
  if (m) {
    const n = m[1];
    [`KG${n}`, `KG ${n}`].forEach((x) => out.add(x));
    return Array.from(out.values());
  }

  m =
    s0.match(/^Basic\s*([1-9])$/i) ||
    s0.match(/^Basic([1-9])$/i) ||
    s0.match(/^B\s*([1-9])$/i) ||
    s0.match(/^B([1-9])$/i) ||
    s0.match(/^P\s*([1-6])$/i) ||
    s0.match(/^P([1-6])$/i);

  if (m) {
    const n = Number(m[1]);
    [`B${n}`, `B ${n}`, `Basic ${n}`, `Basic${n}`, `P${n}`, `P ${n}`].forEach((x) => out.add(x));
    return Array.from(out.values());
  }

  m = s0.match(/^JHS\s*([1-3])$/i) || s0.match(/^JHS([1-3])$/i);
  if (m) {
    const j = Number(m[1]);
    const basic = 6 + j;
    [`JHS ${j}`, `JHS${j}`, `Basic ${basic}`, `Basic${basic}`, `B${basic}`, `B ${basic}`].forEach((x) => out.add(x));
    return Array.from(out.values());
  }

  return Array.from(out.values());
}

export default async function Page({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const sp = await resolveSearchParams(searchParams);

  const ctx = await requireServerUserContext({
    redirectTo: "/teacher/lesson-notes/studio",
    requireTenant: true,
  });

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") redirect("/app/dashboard");

  const [me, tp, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { name: true, firstName: true, lastName: true, email: true },
    }),
    prisma.teacherProfile.findUnique({
      where: {
        teacherProfile_tenant_user_unique: { tenantId: ctx.tenantId, userId: ctx.userId },
      },
      select: {
        phase: true,
        classLevel: true,
        jhsAssignments: true,
        primaryClassroomId: true,
        primaryClassroom: { select: { id: true, name: true, grade: true, arm: true } },
      },
    }),
    prisma.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
      select: { currentTerm: true, currentAcademicYear: true },
    }),
  ]);

  if (!tp) redirect("/teacher/dashboard?err=missing_teacher_profile");

  const roleName = cleanStr(membership.role?.name) || "TEACHER";
  const displayName =
    cleanStr(me?.name) || cleanStr(`${me?.firstName ?? ""} ${me?.lastName ?? ""}`) || "Teacher";
  const email = cleanStr(me?.email) || "";

  const initialSchemeItemId = spGet(sp, "schemeItemId").trim() || null;

  const prefill = {
    term: spGet(sp, "term").trim(),
    academicYear: spGet(sp, "academicYear").trim(),
    level: spGet(sp, "level").trim(),
    subject: spGet(sp, "subject").trim(),
    weekNumber: spGet(sp, "weekNumber").trim(),
  };

  const phase = tp.phase;
  const signupLevelRaw = cleanStr(tp.classLevel) || null;

  const jhsAssignments = phase === "JHS" ? parseJhsAssignments(tp.jhsAssignments) : [];
  const allowedLevels =
    phase === "JHS"
      ? uniqStrings(jhsAssignments.flatMap((a) => a.classes)).sort()
      : signupLevelRaw
        ? [signupLevelRaw]
        : [];

  let allowedSubjects: string[] = [];
  if (phase === "JHS") {
    allowedSubjects = uniqStrings(jhsAssignments.map((a) => a.subject)).sort();
  } else {
    if (signupLevelRaw) {
      const levelVariants = levelLookupVariants(signupLevelRaw);

      const subs = await prisma.curriculumSubject.findMany({
        where: {
          isActive: true,
          OR: levelVariants.map((lv) => ({
            level: { equals: lv, mode: "insensitive" as const },
          })),
        },
        select: { name: true, orderIndex: true },
        orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
        take: 200,
      });

      allowedSubjects = uniqStrings(subs.map((s) => s.name));
    }
  }

  const primaryAssignedLabel = tp.primaryClassroom
    ? `${tp.primaryClassroom.name}${tp.primaryClassroom.arm ? ` · Arm ${tp.primaryClassroom.arm}` : ""}`
    : null;

  return (
    <LessonNotesStudioClient
      initialSchemeItemId={initialSchemeItemId}
      prefill={prefill}
      teacher={{
        name: displayName,
        email,
        roleName,
        phase: String(phase),
        signupLevel: signupLevelRaw,
        primaryAssignedLabel,
        jhsAssignments,
        allowedLevels,
        allowedSubjects,
        defaultTerm: settings?.currentTerm ?? "",
        defaultAcademicYear: settings?.currentAcademicYear ?? "",
      }}
    />
  );
}