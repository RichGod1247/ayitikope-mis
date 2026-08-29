// src/app/admin/students/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { StudentStatus } from "@prisma/client";
import { normalizeGhPhoneE164 } from "@/lib/phoneNormGH";
import StudentBulkImportCard from "@/components/admin/StudentBulkImportCard";
import StudentEssentialAlertsCard from "@/components/admin/StudentEssentialAlertsCard";
import StudentClassSelect from "@/components/admin/StudentClassSelect";
import StudentListFilterBar from "@/components/admin/StudentListFilterBar";
import { studentClassroomDisplayLabel } from "@/lib/studentClassroomPresentation";
import {
  parseStudentDateOfBirth,
  studentDateOfBirthIso,
  studentDateOfBirthLabel,
} from "@/lib/studentDateOfBirth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_ROLES = ["ADMIN", "SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"] as const;

type SP = Record<string, string | string[] | undefined>;

async function requireAdmin(redirectTo: string) {
  return requireServerUserContext({
    redirectTo,
    requireTenant: true,
    requireRoleNames: [...ADMIN_ROLES],
  });
}

function clean(v: unknown, maxLen = 160) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function optional(v: unknown, maxLen = 160) {
  const s = clean(v, maxLen);
  return s ? s : null;
}

function buildHref(base: string, params: Record<string, string | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v.trim()) sp.set(k, v.trim());
  }
  const qs = sp.toString();
  return `${base}${qs ? `?${qs}` : ""}`;
}

function shellCardClass() {
  return "rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
}

function inputClass() {
  return "mt-1 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/25";
}

function selectClass() {
  return "mt-1 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/25";
}

function outlineBtnClass() {
  return "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-[#F7F4ED] transition hover:bg-white/10";
}

function primaryBtnClass() {
  return "rounded-lg border border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-sm font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] transition hover:brightness-105";
}

async function createStudent(formData: FormData) {
  "use server";

  const safe = await requireAdmin("/admin/students");

  const firstName = clean(formData.get("firstName"), 80);
  const lastName = clean(formData.get("lastName"), 80);
  const guardianName = optional(formData.get("guardianName"), 120);
  const guardianPhoneRaw = optional(formData.get("guardianPhone"), 32);
  const classroomId = optional(formData.get("classroomId"), 64);
  const gender = optional(formData.get("gender"), 32);
  const note = optional(formData.get("note"), 500);
  const dateOfBirth = parseStudentDateOfBirth(formData.get("dateOfBirth"));

  if (!firstName || !lastName) redirect("/admin/students?error=MISSING_NAME");
  if (!dateOfBirth.ok) redirect(`/admin/students?error=${dateOfBirth.error}`);

  if (classroomId) {
    const ok = await prisma.classroom.findFirst({
      where: { id: classroomId, tenantId: safe.tenantId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!ok) redirect("/admin/students?error=INVALID_CLASS");
  }

  const guardianPhoneNorm = guardianPhoneRaw ? normalizeGhPhoneE164(guardianPhoneRaw) : null;
  if (guardianPhoneRaw && !guardianPhoneNorm) redirect("/admin/students?error=INVALID_GUARDIAN_PHONE_GH");

  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  const dup = await prisma.student.findFirst({
    where: {
      tenantId: safe.tenantId,
      status: StudentStatus.ACTIVE,
      firstName,
      lastName,
      classroomId,
      guardianName,
      guardianPhone: guardianPhoneRaw,
      gender,
      note,
      createdAt: { gte: twoMinutesAgo },
    },
    select: { id: true },
  });

  if (dup) redirect("/admin/students?created=1&note=DUPLICATE_BLOCKED");

  await prisma.student.create({
    data: {
      tenantId: safe.tenantId,
      status: StudentStatus.ACTIVE,
      firstName,
      lastName,
      dateOfBirth: dateOfBirth.value,
      guardianName,
      guardianPhone: guardianPhoneRaw,
      guardianPhoneNorm,
      gender,
      note,
      classroomId,
      archivedAt: null,
    },
  });

  redirect("/admin/students?created=1");
}

async function updateStudentClass(formData: FormData) {
  "use server";

  const safe = await requireAdmin("/admin/students");
  const studentId = clean(formData.get("studentId"), 128);
  const classroomIdRaw = clean(formData.get("classroomId"), 128);
  const classroomId = classroomIdRaw ? classroomIdRaw : null;

  if (!studentId) redirect("/admin/students?error=BAD_INPUT");

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: safe.tenantId },
    select: { id: true, status: true },
  });
  if (!student) redirect("/admin/students?error=STUDENT_NOT_FOUND");
  if (student.status === StudentStatus.ARCHIVED) redirect("/admin/students?error=CANNOT_ASSIGN_ARCHIVED");

  if (classroomId) {
    const ok = await prisma.classroom.findFirst({
      where: { id: classroomId, tenantId: safe.tenantId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!ok) redirect("/admin/students?error=INVALID_CLASS");
  }

  await prisma.student.update({ where: { id: studentId }, data: { classroomId } });
  redirect(`/admin/students?saved=1&section=list${classroomId ? `&classroomId=${encodeURIComponent(classroomId)}` : ""}`);
}

async function archiveStudent(formData: FormData) {
  "use server";

  const safe = await requireAdmin("/admin/students");
  const studentId = clean(formData.get("studentId"), 128);
  if (!studentId) redirect("/admin/students?error=BAD_INPUT");

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: safe.tenantId },
    select: { id: true, status: true },
  });
  if (!student) redirect("/admin/students?error=STUDENT_NOT_FOUND");

  if (student.status !== StudentStatus.ARCHIVED) {
    await prisma.student.update({
      where: { id: studentId },
      data: { status: StudentStatus.ARCHIVED, archivedAt: new Date(), classroomId: null },
    });
  }

  redirect("/admin/students?archived=1&section=list");
}

async function restoreStudent(formData: FormData) {
  "use server";

  const safe = await requireAdmin("/admin/students");
  const studentId = clean(formData.get("studentId"), 128);
  if (!studentId) redirect("/admin/students?error=BAD_INPUT");

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: safe.tenantId },
    select: { id: true, status: true },
  });
  if (!student) redirect("/admin/students?error=STUDENT_NOT_FOUND");

  if (student.status !== StudentStatus.ACTIVE) {
    await prisma.student.update({
      where: { id: studentId },
      data: { status: StudentStatus.ACTIVE, archivedAt: null },
    });
  }

  redirect("/admin/students?restored=1&show=archived&section=list");
}

export default async function AdminStudentsPage(props: { searchParams?: SP | Promise<SP> }) {
  const safe = await requireAdmin("/admin/students");
  const sp = (await Promise.resolve(props.searchParams ?? {})) as SP;

  const show = typeof sp.show === "string" ? sp.show : "active";
  const showArchived = show === "archived";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const classroomIdFilter = typeof sp.classroomId === "string" ? sp.classroomId.trim() : "";
  const section = typeof sp.section === "string" ? sp.section : "";

  const created = sp.created === "1";
  const archived = sp.archived === "1";
  const restored = sp.restored === "1";
  const saved = sp.saved === "1";
  const note = typeof sp.note === "string" ? sp.note : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const shouldLoadStudentList = showArchived || Boolean(classroomIdFilter);

  const [classes, students, counts] = await Promise.all([
    prisma.classroom.findMany({
      where: { tenantId: safe.tenantId, status: "ACTIVE" },
      select: { id: true, name: true, grade: true, arm: true },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      take: 300,
    }),
    shouldLoadStudentList
      ? prisma.student.findMany({
          where: {
            tenantId: safe.tenantId,
            status: showArchived ? StudentStatus.ARCHIVED : StudentStatus.ACTIVE,
            ...(!showArchived && classroomIdFilter ? { classroomId: classroomIdFilter } : {}),
            ...(q
              ? {
                  OR: [
                    { firstName: { contains: q, mode: "insensitive" } },
                    { lastName: { contains: q, mode: "insensitive" } },
                    { guardianName: { contains: q, mode: "insensitive" } },
                    { guardianPhone: { contains: q, mode: "insensitive" } },
                    { guardianPhoneNorm: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            status: true,
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            dob: true,
            guardianName: true,
            guardianPhone: true,
            guardianPhoneNorm: true,
            classroomId: true,
            classroom: { select: { name: true, grade: true, arm: true } },
            archivedAt: true,
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          take: 1000,
        })
      : Promise.resolve([]),
    prisma.student.groupBy({
      by: ["status"],
      where: { tenantId: safe.tenantId },
      _count: { _all: true },
    }),
  ]);

  const activeCount = counts.find((c) => c.status === StudentStatus.ACTIVE)?._count._all ?? 0;
  const archivedCount = counts.find((c) => c.status === StudentStatus.ARCHIVED)?._count._all ?? 0;

  const classLabel = (c: { name: string; arm: string | null; grade?: string | null }) =>
    studentClassroomDisplayLabel({
      name: c.name,
      grade: c.grade ?? null,
      arm: c.arm,
    });

  const selectedClass = classes.find((c) => c.id === classroomIdFilter) ?? null;
  const selectedClassLabel = selectedClass
    ? classLabel({ name: selectedClass.name, grade: selectedClass.grade ?? null, arm: selectedClass.arm ?? null })
    : null;

  const statusPill = (s: StudentStatus) =>
    s === StudentStatus.ACTIVE
      ? "inline-flex rounded-full border border-emerald-300/20 bg-emerald-400/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-100"
      : "inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-[#D7DCE5]";

  const topHref = (nextShow: "active" | "archived") =>
    buildHref("/admin/students", {
      show: nextShow,
      q: q || null,
      classroomId: nextShow === "active" ? classroomIdFilter || null : null,
      section: section || null,
    });

  const studentListOpen = section === "list" || showArchived || Boolean(classroomIdFilter);
  const todayIso = studentDateOfBirthIso(new Date()) ?? undefined;

  return (
    <div className="space-y-4 text-[#F7F4ED]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#F7F4ED]">Students</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#C9CDD6]">
            Keep learner records clear, class-organized and ready for attendance. Essential Alerts use their own consent authority.
            <span className="font-medium text-[#F7F4ED]"> Archive removes the learner from attendance rosters.</span>
          </p>

          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#D7DCE5]">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Active: <b>{activeCount}</b>
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Archived: <b>{archivedCount}</b>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            className={`rounded-lg border px-3 py-2 text-sm transition ${
              !showArchived
                ? "border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D]"
                : "border-white/10 bg-white/5 text-[#F7F4ED] hover:bg-white/10"
            }`}
            href={topHref("active")}
          >
            Active
          </a>
          <a
            className={`rounded-lg border px-3 py-2 text-sm transition ${
              showArchived
                ? "border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D]"
                : "border-white/10 bg-white/5 text-[#F7F4ED] hover:bg-white/10"
            }`}
            href={topHref("archived")}
          >
            Archived
          </a>
        </div>
      </div>

      {created ? (
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-2.5 text-sm text-emerald-100">
          Student created{note === "DUPLICATE_BLOCKED" ? " (duplicate blocked)" : ""}.
        </div>
      ) : null}
      {archived ? (
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-2.5 text-sm text-emerald-100">
          Student archived (removed from roster + attendance).
        </div>
      ) : null}
      {restored ? (
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-2.5 text-sm text-emerald-100">
          Student restored. Reassign a class if needed.
        </div>
      ) : null}
      {saved ? (
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-2.5 text-sm text-emerald-100">Saved.</div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-300/20 bg-rose-400/12 px-4 py-2.5 text-sm text-rose-100">
          Error: {error}
        </div>
      ) : null}

      {!showArchived ? (
        <form
          action={createStudent}
          className="rounded-[26px] border border-[#D4AF37]/35 bg-[linear-gradient(180deg,rgba(212,175,55,0.12),rgba(255,255,255,0.035))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.2)]"
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">Main action</p>
              <h2 className="mt-1 text-lg font-semibold text-[#F7F4ED]">Add student</h2>
            </div>
            <p className="text-xs text-[#AAB3C2]">DOB is optional and stored as a separate learner record.</p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-[#C9CDD6]">First name</label>
              <input name="firstName" className={inputClass()} required />
            </div>
            <div>
              <label className="text-xs font-medium text-[#C9CDD6]">Last name</label>
              <input name="lastName" className={inputClass()} required />
            </div>
            <div>
              <label className="text-xs font-medium text-[#C9CDD6]">Date of birth (optional)</label>
              <input type="date" name="dateOfBirth" max={todayIso} className={inputClass()} />
            </div>
            <div>
              <label className="text-xs font-medium text-[#C9CDD6]">Class (optional)</label>
              <StudentClassSelect
                classes={classes}
                name="classroomId"
                emptyLabel="— Unassigned —"
                showModeHint
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#C9CDD6]">Guardian name</label>
              <input name="guardianName" className={inputClass()} />
            </div>
            <div>
              <label className="text-xs font-medium text-[#C9CDD6]">Guardian phone (GH)</label>
              <input name="guardianPhone" className={inputClass()} placeholder="e.g. 0241234567" />
            </div>
            <div>
              <label className="text-xs font-medium text-[#C9CDD6]">Gender (optional)</label>
              <select name="gender" className={selectClass()}>
                <option value="">—</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#C9CDD6]">Note (optional)</label>
              <input name="note" className={inputClass()} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[11px] text-[#8F98A8]">Guardian phone, when entered, must normalize to +233…</p>
            <button className={primaryBtnClass()}>Create student</button>
          </div>
        </form>
      ) : (
        <div className={`${shellCardClass()} p-4 text-sm text-[#D7DCE5]`}>
          You’re viewing archived students. Switch to <b className="text-[#F7F4ED]">Active</b> to create new learners.
        </div>
      )}

      <div className={`${shellCardClass()} p-3`}>
        <StudentListFilterBar
          classes={classes}
          initialQuery={q}
          initialClassroomId={classroomIdFilter}
          showArchived={showArchived}
        />
      </div>

      {!showArchived ? <StudentEssentialAlertsCard /> : null}

      {!showArchived ? (
        <details className={`${shellCardClass()} overflow-hidden`}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold marker:hidden">
            <span>Bulk Import</span>
            <span className="text-xs font-normal text-[#AAB3C2]">Excel-friendly · optional DOB</span>
          </summary>
          <div className="border-t border-white/10 p-3 sm:p-4">
            <StudentBulkImportCard
              embedded
              classes={classes.map((c) => ({
                id: c.id,
                name: c.name,
                grade: c.grade ?? null,
                arm: c.arm ?? null,
              }))}
            />
          </div>
        </details>
      ) : null}

      <details className={`${shellCardClass()} overflow-hidden`} open={studentListOpen}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold marker:hidden">
          <span>Student List</span>
          <span className="text-xs font-normal text-[#AAB3C2]">
            {showArchived
              ? `${students.length} archived`
              : selectedClassLabel
                ? `${selectedClassLabel} · ${students.length}`
                : "Choose a class first"}
          </span>
        </summary>

        <div className="border-t border-white/10 p-3 sm:p-4">
          {!showArchived && !classroomIdFilter ? (
            <div className="rounded-xl border border-white/10 bg-[#07111F]/70 px-4 py-4 text-sm text-[#C9CDD6]">
              Choose a class in the compact search bar to view only that class’s students.
            </div>
          ) : students.length === 0 ? (
            <p className="text-sm text-[#8F98A8]">No students found.</p>
          ) : (
            <div className="space-y-2">
              {students.map((s) => {
                const fullName = `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim();
                const dateOfBirth = s.dateOfBirth ?? s.dob;
                const classText = s.classroom
                  ? classLabel({ name: s.classroom.name, arm: s.classroom.arm ?? null, grade: s.classroom.grade ?? null })
                  : "Unassigned";
                const needsPhoneNorm = Boolean(s.guardianPhone && !s.guardianPhoneNorm);

                return (
                  <article key={s.id} className="rounded-xl border border-white/10 bg-[#07111F]/80 p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h3 className="truncate text-sm font-semibold text-[#F7F4ED]">{fullName || "Unnamed"}</h3>
                          <span className="text-[11px] text-[#AAB3C2]">DOB: {studentDateOfBirthLabel(dateOfBirth)}</span>
                          <span className={statusPill(s.status)}>{s.status}</span>
                          {needsPhoneNorm ? (
                            <span className="rounded-full border border-amber-300/20 bg-amber-400/12 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                              Phone needs correction
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-[#C9CDD6]">
                          {classText} · Guardian: {s.guardianName ?? "—"} · {s.guardianPhone ?? "No phone"}
                        </p>
                        {s.status === StudentStatus.ARCHIVED && s.archivedAt ? (
                          <p className="mt-1 text-[10px] text-[#738095]">
                            Archived {new Date(s.archivedAt).toLocaleString()}
                          </p>
                        ) : null}
                      </div>

                      {!showArchived ? (
                        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_auto] gap-2 lg:w-[520px]">
                          <form action={updateStudentClass} className="contents">
                            <input type="hidden" name="studentId" value={s.id} />
                            <StudentClassSelect
                              classes={classes}
                              name="classroomId"
                              defaultValue={s.classroomId ?? ""}
                              compact
                              emptyLabel="— Unassigned —"
                            />
                            <button className={outlineBtnClass()}>Save</button>
                          </form>
                          <form action={archiveStudent}>
                            <input type="hidden" name="studentId" value={s.id} />
                            <button className="h-full rounded-lg border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-400/18">
                              Archive
                            </button>
                          </form>
                        </div>
                      ) : (
                        <form action={restoreStudent} className="shrink-0">
                          <input type="hidden" name="studentId" value={s.id} />
                          <button className={outlineBtnClass()}>Restore to ACTIVE</button>
                        </form>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <p className="mt-3 text-[11px] text-[#738095]">
            Active learner lists are class-first. Archived learners have no class assignment because archiving deliberately removes them from attendance rosters.
          </p>
        </div>
      </details>
    </div>
  );
}
