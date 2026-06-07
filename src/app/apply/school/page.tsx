// src/app/apply/school/page.tsx
import SchoolApplicationClient from "./SchoolApplicationClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function SchoolApplicationPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <SchoolApplicationClient />
    </main>
  );
}