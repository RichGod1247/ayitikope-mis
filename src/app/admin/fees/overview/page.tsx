// src/app/admin/fees/overview/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Tenant = {
  id: string;
  name: string;
  slug?: string | null;
};

type FeeRow = {
  id: string;
  studentName: string;
  classLabel: string;
  guardianName?: string;
  guardianPhone?: string;
  term: string;
  academicYear: string;
  billed: number;
  paid: number;
};

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

// Mock data for Phase 0 (no DB yet)
const MOCK_ROWS: FeeRow[] = [
  {
    id: "s1",
    studentName: "Ama Mensah",
    classLabel: "P4 Green",
    guardianName: "Mr. Mensah",
    guardianPhone: "0240000001",
    term: "1st Term",
    academicYear: "2025/2026",
    billed: 500,
    paid: 350,
  },
  {
    id: "s2",
    studentName: "Kofi Adjei",
    classLabel: "P4 Green",
    guardianName: "Mrs. Adjei",
    guardianPhone: "0240000002",
    term: "1st Term",
    academicYear: "2025/2026",
    billed: 500,
    paid: 500,
  },
  {
    id: "s3",
    studentName: "Akosua Owusu",
    classLabel: "JHS1 A",
    guardianName: "Mr. Owusu",
    guardianPhone: "0240000003",
    term: "1st Term",
    academicYear: "2025/2026",
    billed: 750,
    paid: 400,
  },
  {
    id: "s4",
    studentName: "Yaw Tetteh",
    classLabel: "JHS1 A",
    guardianName: "Mad. Tetteh",
    guardianPhone: "0240000004",
    term: "1st Term",
    academicYear: "2025/2026",
    billed: 750,
    paid: 0,
  },
];

function formatCurrency(amount: number) {
  return `₵${amount.toFixed(2)}`;
}

export default function AdminFeesOverviewPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  // Filters (UI-only for now)
  const [selectedTerm, setSelectedTerm] = useState<string>("1st Term");
  const [selectedYear, setSelectedYear] = useState<string>("2025/2026");
  const [selectedClass, setSelectedClass] = useState<string>("All");
  const [search, setSearch] = useState<string>("");

  // ---------------------------
  // Bootstrap tenant (school)
  // ---------------------------
  useEffect(() => {
    (async () => {
      setTenantLoading(true);
      setTenantError(null);
      try {
        const r = await fetch("/api/test/tenants");
        const j = await r.json().catch(() => ({}));
        const t = j?.tenants?.[0];

        if (t?.id) {
          setTenant({
            id: t.id,
            name: t.name || "School",
            slug: t.slug ?? null,
          });
        } else {
          setTenantError(
            "No tenant/school configured. Please contact the administrator."
          );
        }
      } catch {
        setTenantError(
          "Failed to load school context. Please check your connection or contact the school."
        );
      } finally {
        setTenantLoading(false);
      }
    })();
  }, []);

  // ---------------------------
  // Derived + filtered data
  // ---------------------------
  const classOptions = useMemo(() => {
    const set = new Set(MOCK_ROWS.map((r) => r.classLabel));
    return ["All", ...Array.from(set)];
  }, []);

  const termOptions = ["1st Term", "2nd Term", "3rd Term"];
  const yearOptions = ["2025/2026", "2024/2025"];

  const filteredRows = useMemo(() => {
    return MOCK_ROWS.filter((row) => {
      if (row.term !== selectedTerm) return false;
      if (row.academicYear !== selectedYear) return false;
      if (selectedClass !== "All" && row.classLabel !== selectedClass)
        return false;
      if (search.trim().length) {
        const q = search.trim().toLowerCase();
        const text = [
          row.studentName,
          row.classLabel,
          row.guardianName || "",
          row.guardianPhone || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [selectedTerm, selectedYear, selectedClass, search]);

  const summary = useMemo(() => {
    const totalBilled = filteredRows.reduce((sum, r) => sum + r.billed, 0);
    const totalPaid = filteredRows.reduce((sum, r) => sum + r.paid, 0);
    const totalOwed = totalBilled - totalPaid;
    const fullyPaidCount = filteredRows.filter(
      (r) => r.paid >= r.billed && r.billed > 0
    ).length;
    const partialOrUnpaidCount = filteredRows.length - fullyPaidCount;

    return {
      count: filteredRows.length,
      totalBilled,
      totalPaid,
      totalOwed,
      fullyPaidCount,
      partialOrUnpaidCount,
    };
  }, [filteredRows]);

  // ---------------------------
  // UI
  // ---------------------------
  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Fees &amp; Billing — Overview</h1>
        <p className="text-sm text-zinc-600 max-w-3xl">
          A calm, high-level view of{" "}
          <span className="font-semibold">
            billed amounts, payments, and balances
          </span>{" "}
          per learner — so you can plan, follow up gently, and protect families
          from surprise pressure.
        </p>
        {tenant && (
          <p className="text-xs text-zinc-500">
            School: <span className="font-semibold">{tenant.name}</span>
          </p>
        )}
        {tenantLoading && (
          <p className="text-xs text-zinc-500">Loading school information…</p>
        )}
        {tenantError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {tenantError}
          </p>
        )}
        <p className="text-[11px] text-zinc-500 max-w-3xl">
          <span className="font-semibold">Phase 0 note:</span> This page
          currently uses{" "}
          <span className="font-semibold">mock/demo data only</span> while we
          design the flow. In a later phase we&apos;ll plug this into:
          (1) manual fee records, (2) Paystack / Hubtel, and (3) parent portal
          &quot;My fees&quot;.
        </p>
      </header>

      {/* Filters bar */}
      <section className="border rounded-xl p-4 bg-white space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Filters
            </div>
            <p className="text-xs text-zinc-600 max-w-md">
              Narrow down by{" "}
              <span className="font-semibold">term, year, class, or name</span>{" "}
              to see just the group you&apos;re discussing in a staff or PTA
              meeting.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnOutline}
              onClick={() => {
                setSelectedTerm("1st Term");
                setSelectedYear("2025/2026");
                setSelectedClass("All");
                setSearch("");
              }}
            >
              Reset filters
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Term
            </label>
            <select
              className="w-full border rounded-xl px-2 py-2 h-10 text-sm"
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
            >
              {termOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Academic Year
            </label>
            <select
              className="w-full border rounded-xl px-2 py-2 h-10 text-sm"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Class
            </label>
            <select
              className="w-full border rounded-xl px-2 py-2 h-10 text-sm"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Search learner / guardian / phone
            </label>
            <input
              className="w-full border rounded-xl px-3 py-2 h-10 text-sm"
              placeholder="e.g. Ama, Mensah, 024..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Summary cards */}
      <section className="grid md:grid-cols-4 gap-3">
        <div className="border rounded-xl p-3 bg-white">
          <div className="text-[11px] text-zinc-500">Learners in view</div>
          <div className="text-xl font-bold">{summary.count}</div>
          <div className="text-[11px] text-zinc-500 mt-1">
            After applying filters
          </div>
        </div>

        <div className="border rounded-xl p-3 bg-white">
          <div className="text-[11px] text-zinc-500">Total billed</div>
          <div className="text-xl font-bold">
            {formatCurrency(summary.totalBilled)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            For selected term/year
          </div>
        </div>

        <div className="border rounded-xl p-3 bg-white">
          <div className="text-[11px] text-zinc-500">Total paid</div>
          <div className="text-xl font-bold">
            {formatCurrency(summary.totalPaid)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Includes cash + digital (future)
          </div>
        </div>

        <div className="border rounded-xl p-3 bg-white">
          <div className="text-[11px] text-zinc-500">Outstanding balance</div>
          <div className="text-xl font-bold">
            {formatCurrency(summary.totalOwed)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {summary.partialOrUnpaidCount} learner
            {summary.partialOrUnpaidCount === 1 ? "" : "s"} with{" "}
            <span className="font-semibold">partial or unpaid</span> fees
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="border rounded-xl p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">
            Fees for {selectedTerm}, {selectedYear}
          </h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnOutline} disabled>
              Export CSV (coming soon)
            </button>
            <button type="button" className={btnOutline} disabled>
              Open in detailed fees module (later)
            </button>
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <p className="text-xs text-zinc-600">
            No learners match these filters yet. Try changing the class or
            search text.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border rounded-xl overflow-hidden">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-3 py-2 text-left border-b">Learner</th>
                  <th className="px-3 py-2 text-left border-b">Class</th>
                  <th className="px-3 py-2 text-left border-b">Guardian</th>
                  <th className="px-3 py-2 text-left border-b">Phone</th>
                  <th className="px-3 py-2 text-right border-b">Billed</th>
                  <th className="px-3 py-2 text-right border-b">Paid</th>
                  <th className="px-3 py-2 text-right border-b">Balance</th>
                  <th className="px-3 py-2 text-left border-b">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const balance = row.billed - row.paid;
                  const isCleared = balance <= 0 && row.billed > 0;
                  const isPartial = balance > 0 && row.paid > 0;
                  const isUnpaid = balance > 0 && row.paid === 0;

                  let statusText = "Not set";
                  let statusClasses =
                    "inline-flex px-2 py-0.5 rounded-full border text-[11px]";

                  if (isCleared) {
                    statusText = "Cleared";
                    statusClasses +=
                      " bg-emerald-50 border-emerald-200 text-emerald-800";
                  } else if (isPartial) {
                    statusText = "Partial";
                    statusClasses +=
                      " bg-amber-50 border-amber-200 text-amber-800";
                  } else if (isUnpaid) {
                    statusText = "Unpaid";
                    statusClasses +=
                      " bg-red-50 border-red-200 text-red-800";
                  }

                  return (
                    <tr key={row.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2 align-top font-semibold">
                        {row.studentName}
                      </td>
                      <td className="px-3 py-2 align-top">{row.classLabel}</td>
                      <td className="px-3 py-2 align-top">
                        {row.guardianName || "—"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {row.guardianPhone ? (
                          <a
                            href={`tel:${row.guardianPhone}`}
                            className="underline underline-offset-2"
                          >
                            {row.guardianPhone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        {formatCurrency(row.billed)}
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        {formatCurrency(row.paid)}
                      </td>
                      <td className="px-3 py-2 align-top text-right font-semibold">
                        {formatCurrency(balance)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span className={statusClasses}>{statusText}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-[11px] text-zinc-500 max-w-3xl">
          This overview is designed for{" "}
          <span className="font-semibold">
            planning and compassionate follow-up
          </span>
          , not shaming. In future phases we&apos;ll connect it to the real
          fees engine, digital payments, and a simple &quot;My Fees&quot; view
          in the parent portal.
        </p>
      </section>
    </main>
  );
}
