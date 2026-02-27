import InviteTenantClient from "./inviteTenantClient";

export const dynamic = "force-dynamic";

export default function InviteTenantPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Invite School</h1>
        <p className="text-sm text-zinc-600 mt-1">
          Creates a bootstrap invite and delivers it via SMS and/or Email.
        </p>
      </div>

      <InviteTenantClient />
    </div>
  );
}