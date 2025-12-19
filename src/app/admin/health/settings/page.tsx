// src/app/admin/health/settings/page.tsx

import type { Metadata } from "next";
import AdminHealthSettingsClient from "@/components/AdminHealthSettingsClient";

export const metadata: Metadata = {
  title: "Health Settings | EduLife OS",
  description:
    "Configure health & wellbeing parameters (fever threshold, notifications) for this school.",
};

const TENANT_ID = "cmhhnghn00008vcpgp3fl07fl";

export default function AdminHealthSettingsPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              Health & Wellbeing Settings
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Define how EduLife OS flags fever and prepares alerts for parents
              and health partners.
            </p>
          </div>
          <div className="text-xs text-slate-500">Admin • EduLife OS</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <AdminHealthSettingsClient tenantId={TENANT_ID} />
        </div>
      </div>
    </main>
  );
}
