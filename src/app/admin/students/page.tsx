// src/app/admin/students/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { StudentStatus } from "@prisma/client";
import { normalizeGhPhoneE164 } from "@/lib/phoneNormGH";
import StudentBulkImportCard from "@/components/admin/StudentBulkImportCard";

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
  return "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
}

function inputClass() {
  return "mt-1 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/25";
}

function selectClass() {
  return "mt-1 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/25";
}

function outlineBtnClass() {
  return "rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F7F4ED] transition hover:bg-white/10";
}

function primaryBtnClass() {
  return "rounded-xl border border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-sm font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] transition hover:brightness-105";
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

  if (!firstName || !lastName) redirect("/admin/students?error=MISSING_NAME");

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
  redirect("/admin/students?saved=1");
}

async function toggleGuardianSms(formData: FormData) {
  "use server";

  const safe = await requireAdmin("/admin/students");
  const studentId = clean(formData.get("studentId"), 128);
  if (!studentId) redirect("/admin/students?error=BAD_INPUT");

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: safe.tenantId },
    select: { id: true, guardianSmsOptIn: true, status: true },
  });
  if (!student) redirect("/admin/students?error=STUDENT_NOT_FOUND");
  if (student.status === StudentStatus.ARCHIVED) redirect("/admin/students?error=ARCHIVED_IMMUTABLE");

  await prisma.student.update({
    where: { id: studentId },
    data: { guardianSmsOptIn: !student.guardianSmsOptIn },
  });

  redirect("/admin/students?saved=1");
}

async function toggleHealthConsent(formData: FormData) {
  "use server";

  const safe = await requireAdmin("/admin/students");
  const studentId = clean(formData.get("studentId"), 128);
  if (!studentId) redirect("/admin/students?error=BAD_INPUT");

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: safe.tenantId },
    select: { id: true, healthConsentAt: true, status: true },
  });
  if (!student) redirect("/admin/students?error=STUDENT_NOT_FOUND");
  if (student.status === StudentStatus.ARCHIVED) redirect("/admin/students?error=ARCHIVED_IMMUTABLE");

  await prisma.student.update({
    where: { id: studentId },
    data: { healthConsentAt: student.healthConsentAt ? null : new Date() },
  });

  redirect("/admin/students?saved=1");
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

  redirect("/admin/students?archived=1");
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

  redirect("/admin/students?restored=1&show=archived");
}

export default async function AdminStudentsPage(props: { searchParams?: SP | Promise<SP> }) {
  const safe = await requireAdmin("/admin/students");

  const sp = (await Promise.resolve(props.searchParams ?? {})) as SP;

  const show = typeof sp.show === "string" ? sp.show : "active";
  const showArchived = show === "archived";

  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const classroomIdFilter = typeof sp.classroomId === "string" ? sp.classroomId.trim() : "";

  const created = sp.created === "1";
  const archived = sp.archived === "1";
  const restored = sp.restored === "1";
  const saved = sp.saved === "1";
  const note = typeof sp.note === "string" ? sp.note : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const [classes, students, counts] = await Promise.all([
    prisma.classroom.findMany({
      where: { tenantId: safe.tenantId, status: "ACTIVE" },
      select: { id: true, name: true, grade: true, arm: true },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      take: 300,
    }),
    prisma.student.findMany({
      where: {
        tenantId: safe.tenantId,
        status: showArchived ? StudentStatus.ARCHIVED : StudentStatus.ACTIVE,
        ...(classroomIdFilter ? { classroomId: classroomIdFilter } : {}),
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
        guardianName: true,
        guardianPhone: true,
        guardianPhoneNorm: true,
        guardianSmsOptIn: true,
        healthConsentAt: true,
        classroomId: true,
        classroom: { select: { name: true, grade: true, arm: true } },
        createdAt: true,
        archivedAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 1000,
    }),
    prisma.student.groupBy({
      by: ["status"],
      where: { tenantId: safe.tenantId },
      _count: { _all: true },
    }),
  ]);

  const activeCount = counts.find((c) => c.status === StudentStatus.ACTIVE)?._count._all ?? 0;
  const archivedCount = counts.find((c) => c.status === StudentStatus.ARCHIVED)?._count._all ?? 0;

  const classLabel = (c: { name: string; arm: string | null; grade?: string | null }) =>
    [c.name, c.grade, c.arm ? `Arm ${c.arm}` : null].filter(Boolean).join(" · ");

  const statusPill = (s: StudentStatus) =>
    s === StudentStatus.ACTIVE
      ? "inline-flex rounded-full border border-emerald-300/20 bg-emerald-400/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-100"
      : "inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-[#D7DCE5]";

  const topHref = (nextShow: "active" | "archived") =>
    buildHref("/admin/students", {
      show: nextShow,
      q: q || null,
      classroomId: classroomIdFilter || null,
    });

  const clearFiltersHref = buildHref("/admin/students", { show: showArchived ? "archived" : "active" });

  return (
    <div className="space-y-6 text-[#F7F4ED]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#F7F4ED]">Students</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#C9CDD6]">
            Create learners, assign classes, enable guardian SMS, and set health consent.
            <span className="font-medium text-[#F7F4ED]"> Archive removes the learner from attendance rosters.</span>
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#D7DCE5]">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Active: <b>{activeCount}</b>
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Archived: <b>{archivedCount}</b>
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Showing: <b>{students.length}</b>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            className={`rounded-xl border px-3 py-2 text-sm transition ${
              !showArchived
                ? "border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D]"
                : "border-white/10 bg-white/5 text-[#F7F4ED] hover:bg-white/10"
            }`}
            href={topHref("active")}
          >
            Active
          </a>
          <a
            className={`rounded-xl border px-3 py-2 text-sm transition ${
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
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-3 text-sm text-emerald-100">
          Student created{note === "DUPLICATE_BLOCKED" ? " (duplicate blocked)" : ""}.
        </div>
      ) : null}

      {archived ? (
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-3 text-sm text-emerald-100">
          Student archived (removed from roster + attendance).
        </div>
      ) : null}

      {restored ? (
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-3 text-sm text-emerald-100">
          Student restored (now ACTIVE). Reassign a class if needed.
        </div>
      ) : null}

      {saved ? (
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-3 text-sm text-emerald-100">
          Saved.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">
          Error: {error}
        </div>
      ) : null}

      <div className={`${shellCardClass()} p-5`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <form className="flex flex-col gap-3 md:flex-row md:items-end" action="/admin/students" method="get">
            <input type="hidden" name="show" value={showArchived ? "archived" : "active"} />

            <div>
              <label className="text-sm text-[#C9CDD6]">Search</label>
              <input
                name="q"
                defaultValue={q}
                className={`${inputClass()} md:w-72`}
                placeholder="Name, guardian, phone…"
              />
            </div>

            <div>
              <label className="text-sm text-[#C9CDD6]">Class</label>
              <select
                name="classroomId"
                defaultValue={classroomIdFilter}
                className={`${selectClass()} md:w-72`}
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {classLabel({ name: c.name, arm: c.arm ?? null, grade: c.grade ?? null })}
                  </option>
                ))}
              </select>
            </div>

            <button className={primaryBtnClass()}>Apply</button>
          </form>

          <a className="text-sm text-[#C9CDD6] underline underline-offset-4" href={clearFiltersHref}>
            Clear filters
          </a>
        </div>
      </div>

      {!showArchived ? (
        <StudentBulkImportCard
          classes={classes.map((c) => ({
            id: c.id,
            name: c.name,
            grade: c.grade ?? null,
            arm: c.arm ?? null,
          }))}
        />
      ) : null}

      {!showArchived ? (
        <form action={createStudent} className={`${shellCardClass()} p-6 space-y-4`}>
          <h2 className="text-sm font-semibold text-[#F7F4ED]">Add student</h2>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="text-sm text-[#C9CDD6]">First name</label>
              <input name="firstName" className={inputClass()} required />
            </div>
            <div>
              <label className="text-sm text-[#C9CDD6]">Last name</label>
              <input name="lastName" className={inputClass()} required />
            </div>
            <div>
              <label className="text-sm text-[#C9CDD6]">Guardian name</label>
              <input name="guardianName" className={inputClass()} />
            </div>
            <div>
              <label className="text-sm text-[#C9CDD6]">Guardian phone (GH)</label>
              <input
                name="guardianPhone"
                className={inputClass()}
                placeholder="e.g. 0241234567"
              />
              <p className="mt-1 text-[11px] text-[#8F98A8]">If entered, it must normalize to +233…</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="text-sm text-[#C9CDD6]">Class (optional)</label>
              <select name="classroomId" className={selectClass()}>
                <option value="">— Unassigned —</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {classLabel({ name: c.name, arm: c.arm ?? null, grade: c.grade ?? null })}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-[#C9CDD6]">Gender (optional)</label>
              <select name="gender" className={selectClass()}>
                <option value="">—</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-[#C9CDD6]">Note (optional)</label>
              <input name="note" className={inputClass()} />
            </div>
          </div>

          <button className={primaryBtnClass()}>Create</button>
        </form>
      ) : (
        <div className={`${shellCardClass()} p-6 text-sm text-[#D7DCE5]`}>
          You’re viewing archived students. Switch to <b className="text-[#F7F4ED]">Active</b> to create new learners.
        </div>
      )}

      <section className={`${shellCardClass()} p-6`}>
        <h2 className="text-sm font-semibold text-[#F7F4ED]">Student list</h2>
        <p className="mt-1 text-sm text-[#C9CDD6]">
          {students.length} student(s){q || classroomIdFilter ? " (filtered)" : ""}.
        </p>

        <div className="mt-4 space-y-3">
          {students.length === 0 ? (
            <p className="text-sm text-[#8F98A8]">No students found.</p>
          ) : (
            students.map((s) => {
              const fullName = `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim();
              const classText = s.classroom
                ? classLabel({ name: s.classroom.name, arm: s.classroom.arm ?? null, grade: s.classroom.grade ?? null })
                : "Unassigned";
              const needsPhoneNorm = !!s.guardianPhone && !s.guardianPhoneNorm;

              return (
                <div key={s.id} className="rounded-2xl border border-white/10 bg-[#07111F]/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-[#F7F4ED]">{fullName || "Unnamed"}</p>
                        <span className={statusPill(s.status)}>{s.status}</span>
                        {needsPhoneNorm ? (
                          <span className="inline-flex rounded-full border border-amber-300/20 bg-amber-400/12 px-2 py-0.5 text-[11px] font-semibold text-amber-100">
                            Phone not normalized
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-1 truncate text-xs text-[#C9CDD6]">
                        Class: <span className="font-medium text-[#F7F4ED]">{classText}</span>
                      </p>

                      <p className="mt-1 truncate text-xs text-[#8F98A8]">
                        Guardian: {s.guardianName ?? "—"} · {s.guardianPhone ?? "—"}
                        {s.guardianPhoneNorm ? ` · ${s.guardianPhoneNorm}` : ""}
                      </p>

                      <p className="mt-1 truncate font-mono text-[11px] text-[#738095]">ID: {s.id}</p>

                      {s.status === StudentStatus.ARCHIVED && s.archivedAt ? (
                        <p className="mt-1 text-[11px] text-[#8F98A8]">
                          Archived at: {new Date(s.archivedAt).toLocaleString()}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-1 text-right">
                      <div>
                        <p className="text-xs text-[#8F98A8]">SMS</p>
                        <p className="text-sm font-medium text-[#F7F4ED]">{s.guardianSmsOptIn ? "ON" : "OFF"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#8F98A8]">Health consent</p>
                        <p className="text-sm font-medium text-[#F7F4ED]">{s.healthConsentAt ? "ON" : "OFF"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
                    {!showArchived ? (
                      <>
                        <form action={updateStudentClass} className="flex items-center gap-2 md:col-span-2">
                          <input type="hidden" name="studentId" value={s.id} />
                          <select
                            name="classroomId"
                            defaultValue={s.classroomId ?? ""}
                            className="w-full rounded-xl border border-white/10 bg-[#05070B] px-3 py-2 text-sm text-[#F7F4ED]"
                            disabled={s.status === StudentStatus.ARCHIVED}
                          >
                            <option value="">— Unassigned —</option>
                            {classes.map((c) => (
                              <option key={c.id} value={c.id}>
                                {classLabel({ name: c.name, arm: c.arm ?? null, grade: c.grade ?? null })}
                              </option>
                            ))}
                          </select>
                          <button className={outlineBtnClass()} disabled={s.status === StudentStatus.ARCHIVED}>
                            Save
                          </button>
                        </form>

                        <form action={toggleGuardianSms}>
                          <input type="hidden" name="studentId" value={s.id} />
                          <button className={`w-full ${outlineBtnClass()}`} disabled={s.status === StudentStatus.ARCHIVED}>
                            Toggle SMS
                          </button>
                        </form>

                        <form action={toggleHealthConsent}>
                          <input type="hidden" name="studentId" value={s.id} />
                          <button className={`w-full ${outlineBtnClass()}`} disabled={s.status === StudentStatus.ARCHIVED}>
                            Toggle Health Consent
                          </button>
                        </form>

                        <form action={archiveStudent} className="md:col-span-4">
                          <input type="hidden" name="studentId" value={s.id} />
                          <button
                            className="w-full rounded-xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-400/18"
                            disabled={s.status === StudentStatus.ARCHIVED}
                          >
                            Archive (removes from attendance)
                          </button>
                        </form>
                      </>
                    ) : (
                      <form action={restoreStudent} className="md:col-span-4">
                        <input type="hidden" name="studentId" value={s.id} />
                        <button className={`w-full ${outlineBtnClass()}`}>Restore to ACTIVE</button>
                      </form>
                    )}

                    <div className="md:col-span-4 flex items-center text-xs text-[#8F98A8]">
                      Attendance rosters exclude ARCHIVED learners. Archive also clears class assignment to prevent stale rosters.
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}