// src/app/admin/classes/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { normalizeArmNorm, normalizeNameNorm } from "@/lib/normalize";
import CanonicalClassSeedCard from "@/components/admin/CanonicalClassSeedCard";
import { ClassroomStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SP = Record<string, string | string[] | undefined>;

async function createClass(formData: FormData) {
  "use server";

  const safe = await requireServerUserContext({
    redirectTo: "/admin/classes",
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  const name = String(formData.get("name") ?? "").trim();
  const grade = String(formData.get("grade") ?? "").trim() || null;
  const arm = String(formData.get("arm") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!name) redirect("/admin/classes?error=NAME_REQUIRED");

  const nameNorm = normalizeNameNorm(name, 32);
  const armNorm = normalizeArmNorm(arm ?? "", 8);

  try {
    await prisma.classroom.create({
      data: {
        tenantId: safe.tenantId,
        name,
        grade,
        arm,
        nameNorm,
        armNorm,
        note,
      },
    });
  } catch (e: any) {
    if (String(e?.code || "") === "P2002") {
      redirect("/admin/classes?error=CLASSROOM_ALREADY_EXISTS");
    }
    console.error("[ADMIN_CLASSES_CREATE_ERROR]", e);
    redirect("/admin/classes?error=FAILED_TO_CREATE");
  }

  redirect("/admin/classes?created=1");
}

function buildHref(base: string, params: Record<string, string | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v.trim()) sp.set(k, v.trim());
  }
  const qs = sp.toString();
  return `${base}${qs ? `?${qs}` : ""}`;
}

export default async function AdminClassesPage(props: { searchParams?: SP | Promise<SP> }) {
  const safe = await requireServerUserContext({
    redirectTo: "/admin/classes",
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  const sp = (await Promise.resolve(props.searchParams ?? {})) as SP;

  const created = sp.created === "1";
  const error = typeof sp.error === "string" ? sp.error : null;
  const includeArchived = sp.includeArchived === "1";

  const [counts, classrooms] = await Promise.all([
    prisma.classroom.groupBy({
      by: ["status"],
      where: { tenantId: safe.tenantId },
      _count: { _all: true },
    }),
    prisma.classroom.findMany({
      where: {
        tenantId: safe.tenantId,
        ...(includeArchived ? {} : { status: ClassroomStatus.ACTIVE }),
      },
      select: {
        id: true,
        name: true,
        grade: true,
        arm: true,
        capacity: true,
        note: true,
        createdAt: true,
        status: true,
      },
      orderBy: [{ status: "asc" }, { grade: "asc" }, { name: "asc" }, { arm: "asc" }],
      take: 500,
    }),
  ]);

  const activeCount = counts.find((x) => x.status === ClassroomStatus.ACTIVE)?._count._all ?? 0;
  const archivedCount = counts.find((x) => x.status === ClassroomStatus.ARCHIVED)?._count._all ?? 0;

  const toggleArchivedHref = buildHref("/admin/classes", {
    includeArchived: includeArchived ? null : "1",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Classes</h1>
          <p className="text-sm text-zinc-600 mt-1">Create and manage classrooms for this tenant.</p>

          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-600">
            <span className="rounded-full border bg-white px-3 py-1">
              Active: <b>{activeCount}</b>
            </span>
            <span className="rounded-full border bg-white px-3 py-1">
              Archived: <b>{archivedCount}</b>
            </span>
            <span className="rounded-full border bg-white px-3 py-1">
              Showing: <b>{classrooms.length}</b>
            </span>
          </div>
        </div>

        <a className="rounded-xl border px-3 py-2 text-sm bg-white" href={toggleArchivedHref}>
          {includeArchived ? "Hide archived" : "Include archived"}
        </a>
      </div>

      {created ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Class created.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          Error: {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <form action={createClass} className="rounded-2xl border bg-white p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Create class</h2>
            <p className="text-sm text-zinc-600 mt-1">Manual creation stays available for exceptions and cleanup.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="text-sm text-zinc-700">Class name</label>
              <input
                name="name"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                placeholder="e.g. KG 1"
                required
              />
            </div>

            <div>
              <label className="text-sm text-zinc-700">Grade (optional)</label>
              <input name="grade" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" placeholder="e.g. KG1" />
            </div>

            <div>
              <label className="text-sm text-zinc-700">Arm (optional)</label>
              <input name="arm" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" placeholder="e.g. A" />
            </div>
          </div>

          <div>
            <label className="text-sm text-zinc-700">Note (optional)</label>
            <input name="note" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" placeholder="Any internal note" />
          </div>

          <button className="rounded-xl bg-black text-white px-4 py-2 text-sm">Create class</button>

          <p className="text-xs text-zinc-500">
            Rule: linking uses IDs only. Display names can vary; relations must not.
          </p>
        </form>

        {/* Canonical seeding controls (single/multi) */}
        <CanonicalClassSeedCard />
      </div>

      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Existing classes</h2>
        <p className="text-sm text-zinc-600 mt-1">{classrooms.length} class(es)</p>

        <div className="mt-4 space-y-2">
          {classrooms.length === 0 ? (
            <p className="text-sm text-zinc-500">No classes yet.</p>
          ) : (
            classrooms.map((c) => (
              <div key={c.id} className="rounded-xl border p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 truncate">
                    {c.name}{" "}
                    {c.status === ClassroomStatus.ARCHIVED ? <span className="text-xs text-zinc-500">· Archived</span> : null}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {c.grade ?? "—"} {c.arm ? ` · Arm ${c.arm}` : ""}
                  </p>
                  {c.note ? <p className="text-xs text-zinc-500 mt-1">{c.note}</p> : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}