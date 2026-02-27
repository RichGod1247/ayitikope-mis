// src/app/admin/settings/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function saveSettings(formData: FormData) {
  "use server";

  const safe = await requireServerUserContext({
    redirectTo: "/admin/settings",
    requireTenant: true,
  });

  const currentTerm = String(formData.get("currentTerm") ?? "").trim() || null;
  const currentAcademicYear = String(formData.get("currentAcademicYear") ?? "").trim() || null;

  await prisma.tenantSettings.upsert({
    where: { tenantId: safe.tenantId },
    create: { tenantId: safe.tenantId, currentTerm, currentAcademicYear },
    update: { currentTerm, currentAcademicYear },
  });

  redirect("/admin/settings?saved=1");
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const safe = await requireServerUserContext({
    redirectTo: "/admin/settings",
    requireTenant: true,
  });

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: safe.tenantId },
    select: { currentTerm: true, currentAcademicYear: true },
  });

  const saved = searchParams?.saved === "1";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Academic Settings</h1>
        <p className="text-sm text-zinc-600 mt-1">
          This becomes the default term/year context for dashboards and lesson notes.
        </p>
      </div>

      {saved ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Saved.
        </div>
      ) : null}

      <form action={saveSettings} className="rounded-2xl border bg-white p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-zinc-700">Current Term</label>
            <select
              name="currentTerm"
              defaultValue={settings?.currentTerm ?? "1st Term"}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm bg-white"
            >
              <option value="1st Term">1st Term</option>
              <option value="2nd Term">2nd Term</option>
              <option value="3rd Term">3rd Term</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-zinc-700">Academic Year</label>
            <input
              name="currentAcademicYear"
              defaultValue={settings?.currentAcademicYear ?? "2025/2026"}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="e.g. 2025/2026"
            />
          </div>
        </div>

        <button className="rounded-xl bg-black text-white px-4 py-2 text-sm">
          Save settings
        </button>
      </form>
    </div>
  );
}
