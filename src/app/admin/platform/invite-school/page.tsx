// src/app/admin/platform/invite-school/page.tsx
import InviteSchoolClient from "./invite-school-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function InviteSchoolPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Invite a School (Tenant Bootstrap)</h1>
        <p className="text-sm text-zinc-600 mt-1">
          Sends a 15-minute enrollment link via SMS + Email. Single-use.
        </p>
      </div>

      <InviteSchoolClient />
    </div>
  );
}