// src/app/tenant/enroll/page.tsx
import { Suspense } from "react";
import TenantEnrollClient from "./TenantEnrollClient";

function TenantEnrollFallback() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto p-6 text-sm text-slate-700">Loading invite…</div>
    </main>
  );
}

export default function TenantEnrollPage() {
  return (
    <Suspense fallback={<TenantEnrollFallback />}>
      <TenantEnrollClient />
    </Suspense>
  );
}