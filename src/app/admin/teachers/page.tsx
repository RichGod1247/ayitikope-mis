// src/app/admin/teachers/page.tsx
import { redirect } from "next/navigation";
import InviteTeacherClient from "@/components/admin/InviteTeacherClient";
import TeacherAssignmentFormClient from "@/components/admin/TeacherAssignmentFormClient";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SP = Record<string, string | string[] | undefined>;

const shellCard =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const innerCard = "rounded-2xl border border-white/10 bg-[#07111F]/80";
const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-[#05070B] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20";
const submitBtn =
  "inline-flex items-center justify-center rounded-xl border border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-sm font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] hover:brightness-105";
const dangerBtn =
  "inline-flex items-center justify-center rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-400/15";

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function firstParam(sp: SP, key: string) {
  const value = sp[key];
  return cleanStr(Array.isArray(value) ? value[0] : value);
}

function subjectNorm(v: unknown) {
  return cleanStr(v).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function safeInternalPath(raw: unknown, fallback = "/admin/teachers?saved=1") {
  const value = cleanStr(raw);
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("\\") || value.startsWith("\\\\")) {
    return fallback;
  }

  return value;
}

function actorUserId(safe: { userId?: string | null; user?: { id?: string | null } }) {
  return cleanStr(safe.userId ?? safe.user?.id);
}

function normalizePhase(raw: unknown): "KG" | "PRIMARY" | "JHS" | null {
  const value = cleanStr(raw).toUpperCase().replace(/\s+/g, "_");
  if (value === "KG") return "KG";
  if (value === "PRIMARY" || value === "BASIC" || value === "BASIC_SCHOOL") return "PRIMARY";
  if (value === "JHS" || value === "JUNIOR_HIGH" || value === "JUNIOR_HIGH_SCHOOL") return "JHS";
  return null;
}

function phaseFromLevel(raw: unknown): "KG" | "PRIMARY" | "JHS" | "" {
  const s = cleanStr(raw).toUpperCase().replace(/[^A-Z0-9]+/g, "");

  if (s === "KG1" || s === "KG2") return "KG";
  if (/^(B|BASIC|PRIMARY|P)[1-6]$/.test(s)) return "PRIMARY";
  if (/^(JHS)[1-3]$/.test(s) || /^(B|BASIC|BS)[7-9]$/.test(s)) return "JHS";

  return "";
}

function buildAssignmentRedirect(formData: FormData) {
  const fallback = "/admin/teachers?saved=1";
  const returnTo = safeInternalPath(formData.get("returnTo"), fallback);
  const sessionId = cleanStr(formData.get("sessionId"));

  if (returnTo === "/headteacher/assessment/mock" && sessionId) {
    return `/headteacher/assessment/mock?sessionId=${encodeURIComponent(sessionId)}`;
  }

  return returnTo.includes("?") ? `${returnTo}&saved=1` : `${returnTo}?saved=1`;
}

function classroomLabel(c: { name: string | null; grade: string | null; arm: string | null }) {
  const name = cleanStr(c.name) || "Classroom";
  const grade = cleanStr(c.grade);
  const arm = cleanStr(c.arm);

  if (grade && arm) return `${name} · ${grade} · Arm ${arm}`;
  if (grade) return `${name} · ${grade}`;
  if (arm) return `${name} · Arm ${arm}`;
  return name;
}

type ClassroomLite = {
  id: string;
  name: string | null;
  grade: string | null;
  arm: string | null;
};

function normalizeClassLevelToken(raw: unknown): string | null {
  const s = cleanStr(raw).toUpperCase().replace(/[^A-Z0-9]+/g, "");

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

function classroomLevelToken(c: ClassroomLite) {
  return normalizeClassLevelToken(c.grade) ?? normalizeClassLevelToken(c.name);
}

function classroomLevelOrder(c: ClassroomLite) {
  const token = classroomLevelToken(c);

  if (token === "KG1") return 1;
  if (token === "KG2") return 2;

  if (token && /^B[1-6]$/.test(token)) return 10 + Number(token.slice(1));
  if (token && /^JHS[1-3]$/.test(token)) return 30 + Number(token.slice(3));

  return 999;
}

function classroomArmRank(c: ClassroomLite) {
  const arm = cleanStr(c.arm).toUpperCase();

  if (!arm) return 0;
  if (arm === "A") return 1;

  return 2;
}

function singleStreamClassrooms(list: ClassroomLite[]) {
  const ordered = [...list].sort((a, b) => {
    return (
      classroomLevelOrder(a) - classroomLevelOrder(b) ||
      classroomArmRank(a) - classroomArmRank(b) ||
      classroomLabel(a).localeCompare(classroomLabel(b))
    );
  });

  const chosen = new Map<string, ClassroomLite>();

  for (const classroom of ordered) {
    const key = classroomLevelToken(classroom) ?? `CLASS:${cleanStr(classroom.name) || classroom.id}`;
    if (!chosen.has(key)) chosen.set(key, classroom);
  }

  return Array.from(chosen.values()).sort((a, b) => {
    return classroomLevelOrder(a) - classroomLevelOrder(b) || classroomLabel(a).localeCompare(classroomLabel(b));
  });
}

function includeCurrentClassroomOption(list: ClassroomLite[], current?: ClassroomLite | null) {
  if (!current) return list;
  if (list.some((item) => item.id === current.id)) return list;

  return [current, ...list];
}

function assignmentScopeLabel(a: {
  classroom?: { name: string | null; grade: string | null; arm: string | null } | null;
  classroomId: string | null;
  phase: string | null;
  level: string | null;
}) {
  if (a.classroom) return classroomLabel(a.classroom);
  if (a.level && a.phase) return `${a.phase} · ${a.level}`;
  if (a.level) return a.level;
  if (a.phase) return `${a.phase} phase`;
  if (a.classroomId) return "Specific classroom";
  return "Unscoped";
}

function assignmentTitle(a: {
  assignmentKind: string;
  subject: string | null;
}) {
  if (a.assignmentKind === "CLASS_ALL_SUBJECTS") return "All subjects";
  return cleanStr(a.subject) || "Subject";
}

async function setPrimaryClass(formData: FormData) {
  "use server";

  const safe = await requireServerUserContext({
    redirectTo: "/admin/teachers",
    requireTenant: true,
  });

  const userId = cleanStr(formData.get("userId"));
  const primaryClassroomIdRaw = cleanStr(formData.get("primaryClassroomId"));
  const primaryClassroomId = primaryClassroomIdRaw ? primaryClassroomIdRaw : null;

  if (!userId) redirect("/admin/teachers?err=missing_user");

  const tp = await prisma.teacherProfile.findFirst({
    where: { tenantId: safe.tenantId, userId },
    select: { id: true },
  });

  if (!tp) redirect("/admin/teachers?err=teacher_not_found");

  if (primaryClassroomId) {
    const klass = await prisma.classroom.findFirst({
      where: { id: primaryClassroomId, tenantId: safe.tenantId },
      select: { id: true },
    });
    if (!klass) redirect("/admin/teachers?err=bad_class");
  }

  await prisma.teacherProfile.updateMany({
    where: { tenantId: safe.tenantId, userId },
    data: { primaryClassroomId },
  });

  redirect("/admin/teachers?saved=1");
}

async function createTeacherAssignment(formData: FormData) {
  "use server";

  const safe = await requireServerUserContext({
    redirectTo: "/admin/teachers",
    requireTenant: true,
  });

  const tenantId = safe.tenantId;
  const createdByUserId = actorUserId(safe);

  const teacherUserId = cleanStr(formData.get("teacherUserId"));
  const phase = normalizePhase(formData.get("phase"));
  const subject = cleanStr(formData.get("subject")) || null;
  const norm = subjectNorm(subject) || null;

  const explicitClassroomId = cleanStr(formData.get("classroomId"));
  const checkedClassroomIds = formData.getAll("classroomIds").map(cleanStr).filter(Boolean);

  const classroomIds = Array.from(
    new Set([explicitClassroomId, ...checkedClassroomIds].filter(Boolean))
  );

  if (!teacherUserId) redirect("/admin/teachers?err=missing_teacher");
  if (!subject || !norm) redirect("/admin/teachers?err=subject_required");
  if (!phase) redirect("/admin/teachers?err=phase_required");
  if (classroomIds.length === 0) redirect("/admin/teachers?err=classroom_required");

  const teacher = await prisma.teacherProfile.findFirst({
    where: { tenantId, userId: teacherUserId },
    select: { id: true },
  });

  if (!teacher) redirect("/admin/teachers?err=teacher_not_found");

  const classrooms = await prisma.classroom.findMany({
    where: {
      id: { in: classroomIds },
      tenantId,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (classrooms.length !== classroomIds.length) {
    redirect("/admin/teachers?err=bad_class");
  }

  for (const classroomId of classroomIds) {
    const existing = await prisma.teacherAssessmentAssignment.findFirst({
      where: {
        tenantId,
        teacherUserId,
        assignmentKind: "SUBJECT",
        classroomId,
        subjectNorm: norm,
        status: "ACTIVE",
        revokedAt: null,
      },
      select: { id: true },
    });

    if (existing) continue;

    await prisma.teacherAssessmentAssignment.create({
      data: {
        tenantId,
        teacherUserId,
        assignmentKind: "SUBJECT",
        classroomId,
        phase,
        level: null,
        subject,
        subjectNorm: norm,
        createdByUserId: createdByUserId || null,
        metadata: {
  source: "ADMIN_TEACHER_ASSIGNMENT_PANEL",
  ui: "PHASE_SUBJECT_CLASS_CHECKBOXES",
},
      },
    });
  }

  redirect(buildAssignmentRedirect(formData));
}

async function revokeTeacherAssignment(formData: FormData) {
  "use server";

  const safe = await requireServerUserContext({
    redirectTo: "/admin/teachers",
    requireTenant: true,
  });

  const assignmentId = cleanStr(formData.get("assignmentId"));
  const reason = cleanStr(formData.get("revokeReason")) || "Revoked from admin teacher assignment panel.";
  const revokedByUserId = actorUserId(safe);

  if (!assignmentId) redirect("/admin/teachers?err=missing_assignment");

  const assignment = await prisma.teacherAssessmentAssignment.findFirst({
    where: {
      id: assignmentId,
      tenantId: safe.tenantId,
      status: "ACTIVE",
      revokedAt: null,
    },
    select: { id: true },
  });

  if (!assignment) redirect("/admin/teachers?err=assignment_not_found");

  await prisma.teacherAssessmentAssignment.update({
    where: { id: assignment.id },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revokedByUserId: revokedByUserId || null,
      revokeReason: reason,
    },
  });

  redirect("/admin/teachers?saved=1");
}

function statusChip(label: string, tone: "ok" | "warn" | "muted" | "bad" = "muted") {
  const cls =
    tone === "ok"
      ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-100"
      : tone === "warn"
      ? "border-amber-300/20 bg-amber-400/12 text-amber-100"
      : tone === "bad"
      ? "border-rose-300/20 bg-rose-400/12 text-rose-100"
      : "border-white/10 bg-white/5 text-[#D7DCE5]";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

export default async function AdminTeachersPage(props: { searchParams?: SP | Promise<SP> }) {
  const safe = await requireServerUserContext({
    redirectTo: "/admin/teachers",
    requireTenant: true,
  });

  const sp = (await Promise.resolve(props.searchParams ?? {})) as SP;

  const saved = sp.saved === "1";
  const err = firstParam(sp, "err");

  const focus = firstParam(sp, "focus");
  const focusSubject = firstParam(sp, "subject");
  const focusLevel = firstParam(sp, "level");
  const focusClassroomId = firstParam(sp, "classroomId");
  const focusSessionId = firstParam(sp, "sessionId");
  const returnTo = firstParam(sp, "returnTo");
  const focusPhase = phaseFromLevel(focusLevel);

  const [classrooms, profiles, subjectRows] = await Promise.all([
    prisma.classroom.findMany({
      where: { tenantId: safe.tenantId, status: "ACTIVE" },
      select: { id: true, name: true, grade: true, arm: true },
      orderBy: [{ grade: "asc" }, { name: "asc" }, { arm: "asc" }],
      take: 500,
    }),
    prisma.teacherProfile.findMany({
      where: { tenantId: safe.tenantId },
      select: {
        userId: true,
        phone: true,
        phase: true,
        classLevel: true,
        additionalDuties: true,
        primaryClassroomId: true,
        primaryClassroom: { select: { id: true, name: true, grade: true, arm: true } },
        updatedAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.curriculumSubject.findMany({
      where: {
        isActive: true,
        OR: [{ tenantId: safe.tenantId }, { tenantId: null }],
      },
      select: {
        name: true,
        phase: true,
        level: true,
        orderIndex: true,
      },
      orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
      take: 500,
    }),
  ]);

  const userIds = profiles.map((p) => p.userId);

  const [memberships, assignments] = await Promise.all([
    userIds.length
      ? prisma.membership.findMany({
          where: { tenantId: safe.tenantId, userId: { in: userIds }, status: "ACTIVE" },
          select: { userId: true, staffId: true, role: { select: { name: true } } },
        })
      : [],
    userIds.length
      ? prisma.teacherAssessmentAssignment.findMany({
          where: { tenantId: safe.tenantId, teacherUserId: { in: userIds } },
          select: {
            id: true,
            teacherUserId: true,
            assignmentKind: true,
            classroomId: true,
            phase: true,
            level: true,
            subject: true,
            subjectNorm: true,
            status: true,
            startsAt: true,
            endsAt: true,
            createdAt: true,
            revokedAt: true,
            revokeReason: true,
            classroom: { select: { id: true, name: true, grade: true, arm: true } },
          },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          take: 500,
        })
      : [],
  ]);

  const staffByUser = new Map(memberships.map((m) => [m.userId, m]));

  const assignmentsByUser = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const list = assignmentsByUser.get(assignment.teacherUserId) ?? [];
    list.push(assignment);
    assignmentsByUser.set(assignment.teacherUserId, list);
  }
  const primaryClassroomOptions = singleStreamClassrooms(classrooms);
  
  const subjectOptions = subjectRows
  .map((row) => ({
    name: cleanStr(row.name),
    phase: cleanStr(row.phase) || null,
    level: cleanStr(row.level) || null,
  }))
  .filter((row) => row.name);

if (focusSubject) {
  subjectOptions.unshift({
    name: focusSubject,
    phase: focusPhase || null,
    level: focusLevel || null,
  });
}

  const now = new Date();

  const invites = await prisma.invite.findMany({
    where: { tenantId: safe.tenantId, acceptedAt: null, expiresAt: { gt: now } },
    select: { email: true, token: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <section className="space-y-6">
      <header className={shellCard}>
        <div className="space-y-2">
          <div className="inline-flex items-center rounded-full border border-emerald-300/20 bg-emerald-400/12 px-3 py-1 text-[11px] font-medium text-emerald-100">
            EduLife OS · Admin · Teachers
          </div>
          <h1 className="text-2xl font-semibold text-[#F7F4ED]">Teachers & Assignments</h1>
          <p className="max-w-3xl text-sm text-[#C9CDD6]">
            Invite staff, assign primary classes, and manage the living subject/class responsibility spine used by
            assessments, Mock evidence ownership, and teacher dashboards.
          </p>
        </div>
      </header>

      {focus === "mock-subject-owner" ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Assignment focus from Mock cockpit: assign{" "}
          <span className="font-semibold text-[#F7F4ED]">{focusSubject || "the missing subject"}</span>
          {focusLevel ? <> for <span className="font-semibold text-[#F7F4ED]">{focusLevel}</span></> : null}.
        </div>
      ) : null}

      {saved ? (
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-3 text-sm text-emerald-100">
          Saved.
        </div>
      ) : null}

      {err ? (
        <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">
          Error: {err}
        </div>
      ) : null}

      <InviteTeacherClient />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={shellCard}>
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-[#F7F4ED]">Active Teachers</h2>
            <p className="mt-1 text-sm text-[#C9CDD6]">{profiles.length} teacher profile(s)</p>
          </div>

          <div className="space-y-3">
            {profiles.length === 0 ? (
              <p className="text-sm text-[#8F98A8]">No teachers yet.</p>
            ) : (
              profiles.map((p) => {
                const m = staffByUser.get(p.userId);
                const teacherAssignments = assignmentsByUser.get(p.userId) ?? [];
                const activeAssignments = teacherAssignments.filter((a) => a.status === "ACTIVE" && !a.revokedAt);
                const revokedAssignments = teacherAssignments.filter((a) => a.status === "REVOKED" || a.revokedAt);

                const primaryLabel = p.primaryClassroom
                  ? `${p.primaryClassroom.name}${p.primaryClassroom.arm ? ` · Arm ${p.primaryClassroom.arm}` : ""}`
                  : "Unassigned";

                return (
                  <div key={p.userId} className={`${innerCard} space-y-4 p-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#F7F4ED]">
                          {p.user?.name ?? "Unnamed"}
                        </p>
                        <p className="truncate text-xs text-[#C9CDD6]">{p.user?.email}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[#8F98A8]">Staff ID</p>
                        <p className="text-sm font-medium text-[#F7F4ED]">{m?.staffId ?? "—"}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-[#C9CDD6]">
                      <div>
                        <span className="text-[#8F98A8]">Role:</span> {m?.role?.name ?? "—"}
                      </div>
                      <div>
                        <span className="text-[#8F98A8]">Phase:</span> {p.phase}
                      </div>
                      <div>
                        <span className="text-[#8F98A8]">Class:</span> {p.classLevel ?? "—"}
                      </div>
                      <div>
                        <span className="text-[#8F98A8]">Phone:</span> {p.phone}
                      </div>
                    </div>

                    {p.additionalDuties?.length ? (
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#C9CDD6]">
                        <span className="text-[#8F98A8]">Additional duties:</span>{" "}
                        {p.additionalDuties.join(", ")}
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-white/10 bg-[#05070B] p-3">
                      <p className="text-xs text-[#8F98A8]">Primary class</p>
                      <p className="mt-1 text-sm font-medium text-[#F7F4ED]">{primaryLabel}</p>

                      <form action={setPrimaryClass} className="mt-3 flex items-center gap-2">
                        <input type="hidden" name="userId" value={p.userId} />
                        <select
                          name="primaryClassroomId"
                          defaultValue={p.primaryClassroomId ?? ""}
                          className={inputClass}
                        >
                          <option value="" className="bg-[#05070B] text-[#F7F4ED]">
                            Unassigned
                          </option>
                          {includeCurrentClassroomOption(primaryClassroomOptions, p.primaryClassroom).map((c) => (
  <option key={c.id} value={c.id} className="bg-[#05070B] text-[#F7F4ED]">
    {classroomLabel(c)}
  </option>
))}
                        </select>

                        <button className={submitBtn}>Save</button>
                      </form>
                    </div>

                    <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/5 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#F7F4ED]">Teaching assignments</p>
                          <p className="mt-1 text-xs leading-5 text-[#AEB6C4]">
                            Use this for subject ownership, cross-phase teaching, reshuffles, and Mock evidence responsibility.
                          </p>
                        </div>
                        {statusChip(`${activeAssignments.length} active`, activeAssignments.length ? "ok" : "warn")}
                      </div>

                      <div className="mt-3 space-y-2">
                        {activeAssignments.length === 0 ? (
                          <div className="rounded-xl border border-amber-300/15 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                            No active structured assignment yet.
                          </div>
                        ) : (
                          activeAssignments.map((a) => (
                            <div key={a.id} className="rounded-xl border border-white/10 bg-[#07111F]/80 px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-[#F7F4ED]">
                                    {assignmentTitle(a)}
                                  </p>
                                  <p className="mt-1 text-xs text-[#AEB6C4]">
                                    {a.assignmentKind === "CLASS_ALL_SUBJECTS" ? "Class all subjects" : "Subject"} ·{" "}
                                    {assignmentScopeLabel(a)}
                                  </p>
                                </div>
                                {statusChip("Active", "ok")}
                              </div>

                              <form action={revokeTeacherAssignment} className="mt-3 flex flex-col gap-2 md:flex-row">
                                <input type="hidden" name="assignmentId" value={a.id} />
                                <input
                                  name="revokeReason"
                                  className={inputClass}
                                  placeholder="Reason for revoke / reshuffle"
                                  defaultValue="Assignment changed by school admin."
                                />
                                <button className={dangerBtn}>Revoke</button>
                              </form>
                            </div>
                          ))
                        )}
                      </div>

<TeacherAssignmentFormClient
  teacherUserId={p.userId}
  action={createTeacherAssignment}
  classrooms={classrooms}
  subjects={subjectOptions}
  focusSubject={focusSubject}
  focusPhase={focusPhase}
  focusClassroomId={focusClassroomId}
  focusSessionId={focusSessionId}
  returnTo={returnTo || "/admin/teachers"}
/>

                      {revokedAssignments.length ? (
                        <details className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                          <summary className="cursor-pointer text-xs font-semibold text-[#C9CDD6]">
                            Assignment history ({revokedAssignments.length})
                          </summary>

                          <div className="mt-3 space-y-2">
                            {revokedAssignments.slice(0, 5).map((a) => (
                              <div key={a.id} className="rounded-xl border border-white/10 bg-[#05070B] px-3 py-2 text-xs text-[#AEB6C4]">
                                <div className="font-semibold text-[#F7F4ED]">{assignmentTitle(a)}</div>
                                <div>{assignmentScopeLabel(a)}</div>
                                <div className="mt-1">
                                  Revoked: {a.revokedAt ? a.revokedAt.toLocaleString() : "—"}
                                </div>
                                {a.revokeReason ? <div>Reason: {a.revokeReason}</div> : null}
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className={shellCard}>
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-[#F7F4ED]">Pending Invites</h2>
            <p className="mt-1 text-sm text-[#C9CDD6]">Unused, non-expired invites</p>
          </div>

          <div className="space-y-3">
            {invites.length === 0 ? (
              <p className="text-sm text-[#8F98A8]">No pending invites.</p>
            ) : (
              invites.map((inv) => (
                <div key={inv.token} className={`${innerCard} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#F7F4ED]">{inv.email}</p>
                      <p className="mt-1 text-xs text-[#8F98A8]">
                        Created: {inv.createdAt.toLocaleString()}
                      </p>
                    </div>
                    {statusChip("Pending", "warn")}
                  </div>

                  <p className="mt-2 text-xs text-[#C9CDD6]">
                    Expires: <span className="font-medium text-[#F7F4ED]">{inv.expiresAt.toLocaleString()}</span>
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
}