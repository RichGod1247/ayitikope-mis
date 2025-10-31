// src/app/admissions/fees/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const metadata = { title: "Fees & Levies • Admissions" };
export const dynamic = "force-dynamic";

// In Next 15, searchParams is async:
type SP = Promise<{ year?: string; term?: string }>;

function academicYearGuess(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0..11
  return m >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

const TERM_ORDER = ["Term 1", "Term 2", "Term 3"] as const;

type Level = "KG" | "Lower Primary" | "Upper Primary" | "JHS";
type Row = {
  assignment_id: string;
  level: Level;
  term: string;
  academic_year: string;
  amount_cedis: number | null;
  item: { name: string; default_amount_cedis: number } | null;
};

export default async function FeesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const year = sp.year || academicYearGuess();
  const term = sp.term || undefined;

  // 1) discover available year/term
  const { data: avail, error: availErr } = await supabaseAdmin
    .from("fee_assignments")
    .select("academic_year, term")
    .eq("active", true);

  let chosenYear = year;
  let chosenTerm = term;

  if (avail && avail.length) {
    const years = Array.from(new Set(avail.map((r) => r.academic_year))).sort().reverse();
    if (!years.includes(chosenYear)) chosenYear = years[0];

    const termsInYear = avail
      .filter((r) => r.academic_year === chosenYear)
      .map((r) => r.term);
    if (!chosenTerm || !termsInYear.includes(chosenTerm)) {
      const firstFound = TERM_ORDER.find((t) => termsInYear.includes(t));
      chosenTerm = firstFound || termsInYear[0];
    }
  }

  // 2) fetch assignments + joined item (can come back as object OR array)
  const { data, error } = await supabaseAdmin
    .from("fee_assignments")
    .select(
      `
      assignment_id,
      level,
      term,
      academic_year,
      amount_cedis,
      active,
      item:fee_items ( name, default_amount_cedis )
    `
    )
    .eq("active", true)
    .eq("academic_year", chosenYear)
    .eq("term", chosenTerm);

  const rows: Row[] = (data || []).map((r: any) => {
    const itemRaw = r.item;
    const itemObj = Array.isArray(itemRaw) ? itemRaw[0] : itemRaw;
    return {
      assignment_id: r.assignment_id,
      level: r.level as Level,
      term: r.term,
      academic_year: r.academic_year,
      amount_cedis: typeof r.amount_cedis === "number" ? r.amount_cedis : null,
      item: itemObj
        ? {
            name: String(itemObj.name ?? "—"),
            default_amount_cedis: Number(itemObj.default_amount_cedis ?? 0),
          }
        : null,
    };
  });

  const byLevel = new Map<Level, Row[]>();
  rows.forEach((r) => {
    const key = (r.level || "KG") as Level;
    if (!byLevel.has(key)) byLevel.set(key, []);
    byLevel.get(key)!.push(r);
  });

  const levelsInOrder: Level[] = ["KG", "Lower Primary", "Upper Primary", "JHS"];
  const payUrl = process.env.NEXT_PUBLIC_PAY_FEES_URL;

  return (
    <main className="container mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-blue-800">Fees & Levies</h1>
        <p className="mt-2 text-gray-700">
          Academic Year: <strong>{chosenYear}</strong> • Term:{" "}
          <strong>{chosenTerm || "—"}</strong>
        </p>
      </header>

      {availErr && (
        <p className="text-red-700 text-sm mb-4">Error loading options: {availErr.message}</p>
      )}
      {error && (
        <p className="text-red-700 text-sm mb-4">Error loading fees: {error.message}</p>
      )}

      <div className="mb-6 rounded-xl border bg-white p-4 text-sm text-gray-700">
        To view another term or year, add query params, e.g.
        <code className="ml-2 rounded bg-gray-100 px-2 py-0.5">
          /admissions/fees?year=2025/2026&term=Term%201
        </code>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {levelsInOrder.map((lvl) => {
          const group = byLevel.get(lvl) || [];
          if (group.length === 0) return null;

          const items = group.map((r) => {
            const base = r.item?.default_amount_cedis ?? 0;
            const amt = r.amount_cedis ?? base;
            return { name: r.item?.name || "—", amount: amt };
          });

          const total = items.reduce((s, x) => s + (x.amount || 0), 0);

          return (
            <section key={lvl} className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-blue-800">{lvl}</h2>
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="text-gray-600">
                    <th className="text-left py-2">Item</th>
                    <th className="text-right py-2">Amount (GHS)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-2">{it.name}</td>
                      <td className="py-2 text-right">{it.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 font-semibold">Total</td>
                    <td className="py-2 text-right font-semibold">{total.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              {payUrl && (
                <div className="mt-4">
                  <a
                    href={payUrl}
                    className="inline-flex items-center justify-center rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800"
                  >
                    Pay Now
                  </a>
                  <p className="mt-2 text-xs text-gray-500">
                    You’ll be taken to our secure payment page.
                  </p>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {!error && rows.length === 0 && (
        <p className="text-gray-600">No fee assignments found for the selected term/year.</p>
      )}
    </main>
  );
}
