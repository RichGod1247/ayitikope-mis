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

function shellCardClass() {
  return "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
}

function inputClass() {
  return "mt-1 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/25";
}

function primaryBtnClass() {
  return "rounded-xl border border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-sm font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] transition hover:brightness-105";
}

function outlineBtnClass() {
  return "rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F7F4ED] transition hover:bg-white/10";
}

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
    <div className="space-y-6 text-[#F7F4ED]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#F7F4ED]">Classes</h1>
          <p className="mt-1 text-sm text-[#C9CDD6]">
            Create and manage classrooms for this tenant.
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#D7DCE5]">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Active: <b>{activeCount}</b>
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Archived: <b>{archivedCount}</b>
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Showing: <b>{classrooms.length}</b>
            </span>
          </div>
        </div>

        <a className={outlineBtnClass()} href={toggleArchivedHref}>
          {includeArchived ? "Hide archived" : "Include archived"}
        </a>
      </div>

      {created ? (
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-3 text-sm text-emerald-100">
          Class created.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">
          Error: {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form action={createClass} className={`${shellCardClass()} p-6 space-y-4`}>
          <div>
            <h2 className="text-sm font-semibold text-[#F7F4ED]">Create class</h2>
            <p className="mt-1 text-sm text-[#C9CDD6]">
              Manual creation stays available for exceptions and cleanup.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="text-sm text-[#C9CDD6]">Class name</label>
              <input
                name="name"
                className={inputClass()}
                placeholder="e.g. KG 1"
                required
              />
            </div>

            <div>
              <label className="text-sm text-[#C9CDD6]">Grade (optional)</label>
              <input
                name="grade"
                className={inputClass()}
                placeholder="e.g. KG1"
              />
            </div>

            <div>
              <label className="text-sm text-[#C9CDD6]">Arm (optional)</label>
              <input
                name="arm"
                className={inputClass()}
                placeholder="e.g. A"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-[#C9CDD6]">Note (optional)</label>
            <input
              name="note"
              className={inputClass()}
              placeholder="Any internal note"
            />
          </div>

          <button className={primaryBtnClass()}>Create class</button>

          <p className="text-xs text-[#8F98A8]">
            Rule: linking uses IDs only. Display names can vary; relations must not.
          </p>
        </form>

        <CanonicalClassSeedCard />
      </div>

      <section className={`${shellCardClass()} p-6`}>
        <h2 className="text-sm font-semibold text-[#F7F4ED]">Existing classes</h2>
        <p className="mt-1 text-sm text-[#C9CDD6]">{classrooms.length} class(es)</p>

        <div className="mt-4 space-y-3">
          {classrooms.length === 0 ? (
            <p className="text-sm text-[#8F98A8]">No classes yet.</p>
          ) : (
            classrooms.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-white/10 bg-[#07111F]/80 p-4 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#F7F4ED]">
                    {c.name}{" "}
                    {c.status === ClassroomStatus.ARCHIVED ? (
                      <span className="text-xs text-[#8F98A8]">· Archived</span>
                    ) : null}
                  </p>

                  <p className="mt-1 text-xs text-[#C9CDD6]">
                    {c.grade ?? "—"}
                    {c.arm ? ` · Arm ${c.arm}` : ""}
                    {typeof c.capacity === "number" ? ` · Capacity ${c.capacity}` : ""}
                  </p>

                  {c.note ? (
                    <p className="mt-1 text-xs text-[#8F98A8]">{c.note}</p>
                  ) : null}

                  <p className="mt-1 text-[11px] text-[#738095]">
                    Created: {new Date(c.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}