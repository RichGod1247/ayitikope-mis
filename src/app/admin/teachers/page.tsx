// src/app/admin/teachers/page.tsx
import { redirect } from "next/navigation";
import InviteTeacherClient from "@/components/admin/InviteTeacherClient";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SP = Record<string, string | string[] | undefined>;

const shellCard =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const innerCard =
  "rounded-2xl border border-white/10 bg-[#07111F]/80";
const inputClass =
  "h-10 w-full rounded-xl border border-white/10 bg-[#05070B] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20";
const submitBtn =
  "inline-flex items-center justify-center rounded-xl border border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-sm font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] hover:brightness-105";
const outlineBtn =
  "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F7F4ED] hover:bg-white/10";

async function setPrimaryClass(formData: FormData) {
  "use server";

  const safe = await requireServerUserContext({
    redirectTo: "/admin/teachers",
    requireTenant: true,
  });

  const userId = String(formData.get("userId") ?? "").trim();
  const primaryClassroomIdRaw = String(formData.get("primaryClassroomId") ?? "").trim();
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

function statusChip(label: string, tone: "ok" | "warn" | "muted" = "muted") {
  const cls =
    tone === "ok"
      ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-100"
      : tone === "warn"
      ? "border-amber-300/20 bg-amber-400/12 text-amber-100"
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
  const err = typeof sp.err === "string" ? sp.err : null;

  const [classrooms, profiles] = await Promise.all([
    prisma.classroom.findMany({
      where: { tenantId: safe.tenantId },
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
  ]);

  const userIds = profiles.map((p) => p.userId);
  const memberships = userIds.length
    ? await prisma.membership.findMany({
        where: { tenantId: safe.tenantId, userId: { in: userIds }, status: "ACTIVE" },
        select: { userId: true, staffId: true, role: { select: { name: true } } },
      })
    : [];

  const staffByUser = new Map(memberships.map((m) => [m.userId, m]));
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
          <h1 className="text-2xl font-semibold text-[#F7F4ED]">Teachers</h1>
          <p className="max-w-3xl text-sm text-[#C9CDD6]">
            Invite teachers, assign their <span className="font-semibold text-[#F7F4ED]">primary class</span>,
            and track onboarding without exposing tenant drift.
          </p>
        </div>
      </header>

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
                const primaryLabel = p.primaryClassroom
                  ? `${p.primaryClassroom.name}${p.primaryClassroom.arm ? ` · Arm ${p.primaryClassroom.arm}` : ""}`
                  : "Unassigned";

                return (
                  <div key={p.userId} className={`${innerCard} space-y-3 p-4`}>
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

                    {p.additionalDuties ? (
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#C9CDD6]">
                        <span className="text-[#8F98A8]">Additional duties:</span> {p.additionalDuties}
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-white/10 bg-[#05070B] p-3">
                      <p className="text-xs text-[#8F98A8]">Primary class (Option A)</p>
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
                          {classrooms.map((c) => {
                            const label = `${c.name}${c.arm ? ` · Arm ${c.arm}` : ""}`;
                            return (
                              <option key={c.id} value={c.id} className="bg-[#05070B] text-[#F7F4ED]">
                                {label}
                              </option>
                            );
                          })}
                        </select>

                        <button className={submitBtn}>Save</button>
                      </form>

                      <p className="mt-2 text-xs text-[#8F98A8]">
                        Attendance uses this primary class to keep the system deterministic and shippable.
                      </p>
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