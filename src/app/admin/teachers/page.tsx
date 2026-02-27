// src/app/admin/teachers/page.tsx
import { redirect } from "next/navigation";
import InviteTeacherClient from "@/components/admin/InviteTeacherClient";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SP = Record<string, string | string[] | undefined>;

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Teachers</h1>
        <p className="text-sm text-zinc-600 mt-1">
          Invite teachers, assign their primary class (Option A), and track onboarding.
        </p>
      </div>

      {saved ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Saved.
        </div>
      ) : null}

      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          Error: {err}
        </div>
      ) : null}

      <InviteTeacherClient />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border bg-white p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Active Teachers</h2>
          <p className="text-sm text-zinc-600 mt-1">{profiles.length} teacher profile(s)</p>

          <div className="mt-4 space-y-3">
            {profiles.length === 0 ? (
              <p className="text-sm text-zinc-500">No teachers yet.</p>
            ) : (
              profiles.map((p) => {
                const m = staffByUser.get(p.userId);
                const primaryLabel = p.primaryClassroom
                  ? `${p.primaryClassroom.name}${p.primaryClassroom.arm ? ` · Arm ${p.primaryClassroom.arm}` : ""}`
                  : "Unassigned";

                return (
                  <div key={p.userId} className="rounded-xl border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 truncate">
                          {p.user?.name ?? "Unnamed"}
                        </p>
                        <p className="text-xs text-zinc-600 truncate">{p.user?.email}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Staff ID</p>
                        <p className="text-sm font-medium">{m?.staffId ?? "—"}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-zinc-700">
                      <div>
                        <span className="text-zinc-500">Role:</span> {m?.role?.name ?? "—"}
                      </div>
                      <div>
                        <span className="text-zinc-500">Phase:</span> {p.phase}
                      </div>
                      <div>
                        <span className="text-zinc-500">Class:</span> {p.classLevel ?? "—"}
                      </div>
                      <div>
                        <span className="text-zinc-500">Phone:</span> {p.phone}
                      </div>
                    </div>

                    <div className="rounded-xl border bg-zinc-50 p-3">
                      <p className="text-xs text-zinc-500">Primary class (Option A)</p>
                      <p className="text-sm font-medium text-zinc-900 mt-1">{primaryLabel}</p>

                      <form action={setPrimaryClass} className="mt-3 flex items-center gap-2">
                        <input type="hidden" name="userId" value={p.userId} />
                        <select
                          name="primaryClassroomId"
                          defaultValue={p.primaryClassroomId ?? ""}
                          className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                        >
                          <option value="">Unassigned</option>
                          {classrooms.map((c) => {
                            const label = `${c.name}${c.arm ? ` · Arm ${c.arm}` : ""}`;
                            return (
                              <option key={c.id} value={c.id}>
                                {label}
                              </option>
                            );
                          })}
                        </select>

                        <button className="rounded-xl bg-black text-white px-3 py-2 text-sm whitespace-nowrap">
                          Save
                        </button>
                      </form>

                      <p className="text-xs text-zinc-500 mt-2">
                        Attendance (Day 4) will use this primary class to keep the system shippable.
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Pending Invites</h2>
          <p className="text-sm text-zinc-600 mt-1">Unused, non-expired invites</p>

          <div className="mt-4 space-y-3">
            {invites.length === 0 ? (
              <p className="text-sm text-zinc-500">No pending invites.</p>
            ) : (
              invites.map((inv) => (
                <div key={inv.token} className="rounded-xl border p-4">
                  <p className="text-sm font-medium text-zinc-900">{inv.email}</p>
                  <p className="text-xs text-zinc-600 mt-1">Expires: {inv.expiresAt.toISOString()}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}