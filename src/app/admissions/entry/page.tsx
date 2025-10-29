// src/app/admissions/entry/page.tsx
import EntryTabs from "@/components/EntryTabs";

export const metadata = { title: "Entry Requirements • Admissions" };

export default function EntryRequirementsPage() {
  return (
    <main className="container mx-auto px-6 py-10 space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Entry Requirements</h1>
        <p className="text-gray-700">
          What learners need to join at each level: KG, Lower Primary, Upper Primary, and JHS.
        </p>
      </header>

      <EntryTabs />
    </main>
  );
}
