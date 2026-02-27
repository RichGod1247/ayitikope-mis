// src/app/auth/invite-code/page.tsx
import { Suspense } from "react";
import InviteCodeEntryClient from "./InviteCodeEntryClient";

function InviteCodeFallback() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Enter Onboarding Code</h1>
          <p className="text-sm text-zinc-600 mt-1">Loading…</p>
        </div>
      </div>
    </div>
  );
}

export default function InviteCodeEntryPage() {
  return (
    <Suspense fallback={<InviteCodeFallback />}>
      <InviteCodeEntryClient />
    </Suspense>
  );
}