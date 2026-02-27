// src/app/parent/fees/page.tsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

type FeesSummary = {
  totalBilledPesewas: number;
  totalWaivedPesewas: number;
  totalPaidPesewas: number;
  balancePesewas: number;
  invoiceCount: number;
  paymentCount: number;
  lastPaymentDate: string | null;
  lastPaymentAmountPesewas: number | null;
  note: string;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  studentId?: string;
  studentName?: string;
  tenantId?: string;
  term?: string;
  academicYear?: string;
  summary?: FeesSummary;
};

function formatCedis(pesewas: number | null | undefined): string {
  const value = typeof pesewas === "number" ? pesewas : 0;
  return `GH₵${(value / 100).toFixed(2)}`;
}

export default function ParentFeesPage() {
  const searchParams = useSearchParams();
  const tenantIdFromUrl = searchParams.get("tenantId") || "";

  const [studentId, setStudentId] = useState("");
  const [term, setTerm] = useState("1st Term");
  const [academicYear, setAcademicYear] = useState("2025/2026");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FeesSummary | null>(null);
  const [meta, setMeta] = useState<{
    studentName: string | null;
    studentId: string | null;
  }>({
    studentName: null,
    studentId: null,
  });

  async function handleFetch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setData(null);

    const trimmedId = studentId.trim();
    if (!trimmedId) {
      setError("Please enter the learner's ID.");
      return;
    }

    try {
      setLoading(true);

      const url = new URL(
        "/api/parent/fees/summary",
        window.location.origin
      );
      url.searchParams.set("studentId", trimmedId);
      url.searchParams.set("term", term);
      url.searchParams.set("academicYear", academicYear);

      const res = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
      });

      const json = (await res.json()) as ApiResponse;

      if (!res.ok || !json.ok) {
        setError(
          json.error ||
            "We could not load this learner's fee summary. Please check the ID or try again."
        );
        return;
      }

      if (!json.summary) {
        setError("No summary data was returned for this learner.");
        return;
      }

      setData(json.summary);
      setMeta({
        studentName: json.studentName || null,
        studentId: json.studentId || trimmedId,
      });
    } catch (err) {
      console.error("[PARENT_FEES_UI_ERROR]", err);
      setError(
        "Network or server error while loading fees. Please try again, or contact the school office if the issue continues."
      );
    } finally {
      setLoading(false);
    }
  }

  const effectiveBalance =
    data?.balancePesewas != null ? data.balancePesewas : 0;

  const isSettled = data ? effectiveBalance <= 0 : false;

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-5xl px-4 py-6 md:py-8 space-y-6">
        {/* Header / Hero */}
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-900">
            <span>EduLife OS · Parent · Fees</span>
            {tenantIdFromUrl && (
              <span className="text-[10px] text-amber-800/80">
                Demo tenant:{" "}
                <span className="font-mono">{tenantIdFromUrl}</span>
              </span>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)] items-start">
            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">
                Fees &amp; Payments (calm view)
              </h1>
              <p className="text-xs md:text-sm text-zinc-600 max-w-xl">
                See how much has been{" "}
                <span className="font-semibold">billed</span>, what you&apos;ve{" "}
                <span className="font-semibold">already paid</span>, and any{" "}
                <span className="font-semibold">remaining balance</span> — with
                no shaming or confusion. Just clear numbers to help you plan.
              </p>
              <p className="text-[11px] text-zinc-500 max-w-xl">
                EduLife OS is being built so parents feel{" "}
                <span className="font-semibold">safe, respected and in control</span>{" "}
                of school payments, not surprised or embarrassed.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-amber-50 px-4 py-3 md:px-5 md:py-4 space-y-2">
              <p className="text-xs md:text-sm font-medium text-emerald-900">
                Heart behind this page
              </p>
              <ul className="text-[11px] md:text-xs text-emerald-900/90 space-y-1.5">
                <li>• You are treated as a partner, not a defaulter.</li>
                <li>• No surprise fees — everything is written down.</li>
                <li>• If things are hard, talk to the school. There is always a next step.</li>
              </ul>
              <p className="text-[10px] text-emerald-900/80">
                We believe school fees should support your child&apos;s future,
                not attack your dignity.
              </p>
            </div>
          </div>
        </header>

        {/* Selector form */}
        <section className="rounded-2xl border border-zinc-200 bg-white/90 px-4 py-4 md:px-5 md:py-5 shadow-sm">
          <form
            onSubmit={handleFetch}
            className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
          >
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-700">
                  Learner ID
                </label>
                <input
                  type="text"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="e.g. STU_123..."
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <p className="text-[10px] text-zinc-500">
                  In a real parent login, this will be picked automatically.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-700">
                  Term
                </label>
                <select
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="1st Term">1st Term</option>
                  <option value="2nd Term">2nd Term</option>
                  <option value="3rd Term">3rd Term</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-700">
                  Academic year
                </label>
                <input
                  type="text"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="e.g. 2025/2026"
                />
              </div>
            </div>

            <div className="flex flex-col items-stretch gap-2 md:w-[150px]">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-black disabled:opacity-50"
              >
                {loading ? "Loading…" : "View fees"}
              </button>
              <p className="text-[10px] text-zinc-500 text-center md:text-left">
                Demo mode · data comes from the school&apos;s actual invoices &
                payments.
              </p>
            </div>
          </form>

          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
              {error}
            </div>
          )}
        </section>

        {/* Summary cards */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm md:text-base font-semibold text-zinc-900">
                Term fee summary
              </h2>
              <p className="text-[11px] md:text-xs text-zinc-500">
                Based on all recorded invoices and payments for the selected term
                and academic year.
              </p>
            </div>
            {meta.studentName && (
              <div className="text-[11px] text-zinc-600 text-right">
                Learner:{" "}
                <span className="font-semibold">{meta.studentName}</span>
                {meta.studentId && (
                  <>
                    {" "}
                    · <span className="font-mono">{meta.studentId}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {data ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Total billed */}
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-medium text-amber-800">
                        Total billed (after waivers)
                      </div>
                      <div className="mt-1 text-xl font-semibold text-amber-900">
                        {formatCedis(
                          data.totalBilledPesewas - data.totalWaivedPesewas
                        )}
                      </div>
                      <p className="mt-1 text-[10px] text-amber-800/90">
                        Raw billed: {formatCedis(data.totalBilledPesewas)} · Waived:{" "}
                        {formatCedis(data.totalWaivedPesewas)}
                      </p>
                    </div>
                    <span className="text-2xl" aria-hidden="true">
                      📄
                    </span>
                  </div>
                </div>

                {/* Total paid */}
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-medium text-emerald-800">
                        Amount paid so far
                      </div>
                      <div className="mt-1 text-xl font-semibold text-emerald-900">
                        {formatCedis(data.totalPaidPesewas)}
                      </div>
                      <p className="mt-1 text-[10px] text-emerald-900/90">
                        Payments recorded: {data.paymentCount}
                      </p>
                    </div>
                    <span className="text-2xl" aria-hidden="true">
                      💚
                    </span>
                  </div>
                </div>

                {/* Balance */}
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-medium text-zinc-700">
                        Current balance
                      </div>
                      <div
                        className={`mt-1 text-xl font-semibold ${
                          isSettled ? "text-emerald-900" : "text-zinc-900"
                        }`}
                      >
                        {formatCedis(effectiveBalance)}
                      </div>
                      <p className="mt-1 text-[10px] text-zinc-600">
                        Invoices: {data.invoiceCount} · Waivers already included.
                      </p>
                    </div>
                    <span className="text-2xl" aria-hidden="true">
                      🧮
                    </span>
                  </div>
                </div>
              </div>

              {/* Encouraging message */}
              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm space-y-2">
                {isSettled ? (
                  <p className="text-xs text-emerald-900">
                    🎉 <span className="font-semibold">Thank you!</span> Fees for this
                    learner in the selected term appear to be{" "}
                    <span className="font-semibold">fully settled</span>. Your support
                    is helping the school serve children better.
                  </p>
                ) : (
                  <p className="text-xs text-zinc-700">
                    You still have some balance for this term. You are not alone — many
                    families pay in steps. If you are facing any difficulty, please
                    talk to the school. EduLife OS is here to give you a clear picture,
                    not to shame you.
                  </p>
                )}

                {data.lastPaymentDate && (
                  <p className="text-[11px] text-zinc-500">
                    Last recorded payment:{" "}
                    <span className="font-semibold">
                      {new Date(data.lastPaymentDate).toLocaleDateString()}
                    </span>{" "}
                    for{" "}
                    <span className="font-semibold">
                      {formatCedis(data.lastPaymentAmountPesewas)}
                    </span>
                    .
                  </p>
                )}

                <p className="text-[10px] text-zinc-500">
                  {data.note}
                </p>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-4 text-[11px] text-zinc-500">
              Enter a learner ID and term above, then tap{" "}
              <span className="font-semibold">“View fees”</span>. This view will use
              the school&apos;s real invoice and payment records to show a calm,
              accurate picture of fees for that learner.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
