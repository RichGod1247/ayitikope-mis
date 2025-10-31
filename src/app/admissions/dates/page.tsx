// src/app/admissions/dates/page.tsx
export const metadata = { title: "Key Dates • Admissions" };
export const dynamic = "force-dynamic";

type DateItem = {
  title: string;
  desc?: string;
  date?: string;      // e.g., "Mon, 10 Nov 2025"
  range?: string;     // e.g., "Nov 10–14, 2025"
  note?: string;
};

const DATES: DateItem[] = [
  {
    title: "Admissions Open",
    date: "Mon, 03 Nov 2025",
    desc: "Online application form becomes available (KG, Primary, JHS).",
  },
  {
    title: "Document Verification (Rolling)",
    range: "Nov 10–Dec 05, 2025",
    desc: "Parents may be contacted to verify biodata and guardianship.",
  },
  {
    title: "Placement & Notifications",
    date: "Fri, 05 Dec 2025",
    desc: "You’ll receive WhatsApp/SMS updates on application status.",
  },
  {
    title: "Uniform Fitting & PTA Registration",
    range: "Dec 08–12, 2025",
    desc: "On-campus. Bring student along for measurements.",
    note: "PTA dues: GHS 20 (across board).",
  },
  {
    title: "Reporting Day (All Levels)",
    date: "Tue, 07 Jan 2026",
    desc: "First day of school for the new term.",
  },
];

export default async function KeyDatesPage() {
  return (
    <main className="container mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-blue-800">Admissions — Key Dates</h1>
        <p className="mt-2 text-gray-700 max-w-2xl">
          Keep an eye on these timelines for a smooth admission process. Dates may be adjusted by the school when necessary.
        </p>
      </header>

      <section className="grid gap-4">
        {DATES.map((d, i) => (
          <article key={i} className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-blue-800">{d.title}</h2>
            {(d.date || d.range) && (
              <p className="mt-1 text-sm text-gray-600">
                <span className="inline-block rounded bg-blue-50 px-2 py-0.5">
                  {d.date ?? d.range}
                </span>
              </p>
            )}
            {d.desc && <p className="mt-2 text-gray-700">{d.desc}</p>}
            {d.note && <p className="mt-2 text-sm text-gray-600 italic">{d.note}</p>}
          </article>
        ))}
      </section>

      <footer className="mt-8 rounded-xl border bg-white p-4 text-sm text-gray-600">
        Tip: Save this page. We’ll add an automated calendar download and reminders later.
      </footer>
    </main>
  );
}
