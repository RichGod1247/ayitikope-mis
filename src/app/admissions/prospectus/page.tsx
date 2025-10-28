// src/app/admissions/prospectus/page.tsx
import ProspectusTabs from "../../../components/ProspectusTabs";

export const metadata = { title: "Prospectus • Admissions" };

export default function ProspectusPage() {
  return (
    <main className="container mx-auto px-6 py-10 space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Prospectus</h1>
        <p className="text-gray-700">Required items for new entrants—choose a level.</p>
      </header>

      <ProspectusTabs />
    </main>
  );
}
