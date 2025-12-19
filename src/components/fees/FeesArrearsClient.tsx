// src/components/fees/FeesArrearsClient.tsx
"use client";

import { useState } from "react";

type ArrearRow = {
  id: number;
  studentId?: string;
  studentName: string;
  guardianName: string;
  guardianPhone: string;
  amountDue: string;
  selected: boolean;
};

type Props = {
  initialTerm: string;
  initialClassName: string;
  initialDueDate: string; // yyyy-mm-dd
  initialBrand?: string;
};

type FeesResult = {
  ok: boolean;
  total: number;
  successCount: number;
  brand: string;
  className: string;
  term: string;
  dueDate: string | null;
  results: {
    studentName: string;
    guardianPhone: string;
    amountDue: string;
    ok: boolean;
    to?: string;
    error?: string;
  }[];
};

export default function FeesArrearsClient({
  initialTerm,
  initialClassName,
  initialDueDate,
  initialBrand = "AYITIADMIN",
}: Props) {
  const [term, setTerm] = useState(initialTerm);
  const [className, setClassName] = useState(initialClassName);
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [brand, setBrand] = useState(initialBrand);

  const [rows, setRows] = useState<ArrearRow[]>([
    {
      id: 1,
      studentId: "STU-001",
      studentName: "Test Student 1",
      guardianName: "Mr. Parent 1",
      guardianPhone: "0242914353",
      amountDue: "150",
      selected: true,
    },
    {
      id: 2,
      studentId: "STU-002",
      studentName: "Test Student 2",
      guardianName: "Mrs. Parent 2",
      guardianPhone: "0244000000",
      amountDue: "200",
      selected: true,
    },
  ]);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FeesResult | null>(null);

  function updateRow(id: number, patch: Partial<ArrearRow>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  function addRow() {
    setRows((prev) => {
      const nextId = prev.length ? Math.max(...prev.map((r) => r.id)) + 1 : 1;
      return [
        ...prev,
        {
          id: nextId,
          studentId: "",
          studentName: "",
          guardianName: "",
          guardianPhone: "",
          amountDue: "",
          selected: true,
        },
      ];
    });
  }

  function removeRow(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleSendReminders() {
    setError(null);
    setResult(null);

    const selected = rows.filter((r) => r.selected);

    if (selected.length === 0) {
      setError("No rows selected. Select at least one student to notify.");
      return;
    }

    const arrears = selected.map((r) => ({
      studentId: r.studentId || undefined,
      studentName: r.studentName,
      guardianName: r.guardianName,
      guardianPhone: r.guardianPhone,
      amountDue: r.amountDue,
    }));

    // Quick validation
    const invalid = arrears.find(
      (a) => !a.studentName || !a.guardianPhone || !a.amountDue
    );
    if (invalid) {
      setError(
        "Each selected row must have student name, guardian phone, and amount due."
      );
      return;
    }

    // Format due date as dd/mm/yyyy for message, but send raw as string
    let dueLabel: string | undefined = undefined;
    if (dueDate) {
      try {
        const d = new Date(dueDate);
        dueLabel = d.toLocaleDateString("en-GB");
      } catch {
        dueLabel = dueDate;
      }
    }

    try {
      setSending(true);
      const res = await fetch("/api/fees/notify-arrears", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term,
          className,
          dueDate: dueLabel,
          brand,
          arrears,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error ||
            `Failed to send fees reminders (status ${res.status})`
        );
      }

      const data = (await res.json()) as FeesResult;
      setResult(data);
    } catch (err: any) {
      setError(err?.message || "Unexpected error sending fees reminders.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen flex justify-center bg-slate-50 py-8 px-4">
      <div className="w-full max-w-6xl bg-white shadow-md rounded-xl p-6 border border-slate-200 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">Fees Arrears – SMS Reminders</h1>
          <p className="text-sm text-slate-600">
            Prepare a list of students with outstanding fees and send polite SMS
            reminders to their parents/guardians via Hubtel.
          </p>
          <p className="text-xs text-slate-500">
            This page uses the <code>/api/fees/notify-arrears</code> endpoint
            and logs all messages in{" "}
            <code>/admin/tools/sms-logs</code> with purpose{" "}
            <code>fees-reminder-auto</code>.
          </p>
        </header>

        {/* Filters / meta */}
        <section className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
          <div className="sm:col-span-2">
            <label className="block text-slate-700 mb-1">Term</label>
            <input
              className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-slate-700 mb-1">Class / Form</label>
            <input
              className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-slate-700 mb-1">Due Date</label>
            <input
              type="date"
              className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-slate-700 mb-1">SMS Brand</label>
            <select
              className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            >
              <option value="AYITIADMIN">AYITIADMIN (Admin Wallet)</option>
              <option value="AYITIKOPJHS">AYITIKOPJHS (JHS Wallet)</option>
              <option value="AYITIKPRIM">AYITIKPRIM (Primary Wallet)</option>
            </select>
          </div>
        </section>

        {/* Table */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              Fees Arrears List
            </h2>
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center px-3 py-1 rounded-md text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100"
            >
              + Add Row
            </button>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Send?
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Student
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Guardian Name
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Guardian Phone
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Amount Due (GHS)
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-200 odd:bg-white even:bg-slate-50"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={(e) =>
                          updateRow(r.id, { selected: e.target.checked })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
                        value={r.studentName}
                        onChange={(e) =>
                          updateRow(r.id, { studentName: e.target.value })
                        }
                        placeholder="Student Name"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
                        value={r.guardianName}
                        onChange={(e) =>
                          updateRow(r.id, { guardianName: e.target.value })
                        }
                        placeholder="Guardian Name"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
                        value={r.guardianPhone}
                        onChange={(e) =>
                          updateRow(r.id, { guardianPhone: e.target.value })
                        }
                        placeholder="024XXXXXXX"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
                        value={r.amountDue}
                        onChange={(e) =>
                          updateRow(r.id, { amountDue: e.target.value })
                        }
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeRow(r.id)}
                        className="text-[10px] text-rose-700 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-4 text-center text-slate-500"
                    >
                      No rows. Click &quot;Add Row&quot; to start building your
                      fees arrears list.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Actions */}
        <section className="space-y-3">
          <button
            type="button"
            onClick={handleSendReminders}
            disabled={sending}
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {sending
              ? "Sending Fees Reminders..."
              : "Send SMS Fees Reminders"}
          </button>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          {result && (
            <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 space-y-1">
              <p className="font-semibold">
                Fees SMS Result – {result.className} ({result.term})
              </p>
              <p>
                Brand:{" "}
                <span className="font-mono bg-slate-100 px-1 rounded">
                  {result.brand}
                </span>{" "}
                • Total: {result.total} • Success: {result.successCount} • Due:{" "}
                {result.dueDate || "N/A"}
              </p>
              <ul className="list-disc ml-5 mt-1 space-y-1">
                {result.results.map((r, idx) => (
                  <li key={idx}>
                    {r.studentName} –{" "}
                    <span className="font-mono">{r.guardianPhone}</span> – GHS{" "}
                    {r.amountDue} →{" "}
                    {r.ok ? (
                      <span className="text-emerald-700 font-semibold">
                        OK
                      </span>
                    ) : (
                      <span className="text-rose-700 font-semibold">
                        FAILED ({r.error})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
