import { Suspense } from "react";
import ParentFeesClient from "./ParentFeesClient";

export default function ParentFeesPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-zinc-50">
          <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-zinc-600">
            Loading fees…
          </div>
        </main>
      }
    >
      <ParentFeesClient />
    </Suspense>
  );
}
