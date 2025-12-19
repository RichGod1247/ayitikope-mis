// src/components/attendance/AttendanceSessionClient.tsx
"use client";

import { useState } from "react";

type Student = {
  id: string;
  name: string;
  guardianName: string;
  guardianPhone: string;
};

type Props = {
  sessionId: string;
  initialClassName: string;
  initialDate: string;
  initialBrand?: string;
};

type AttendanceResult = {
  ok: boolean;
  total: number;
  successCount: number;
  brand: string;
  className: string;
  date: string;
  results: {
    studentName: string;
    guardianPhone: string;
    ok: boolean;
    to?: string;
    error?: string;
  }[];
};

export default function AttendanceSessionClient({
  sessionId,
  initialClassName,
  initialDate,
  initialBrand = "AYITIKOPJHS",
}: Props) {
  // Mock student list for now – later this will come from your DB
  const [students, setStudents] = useState<Student[]>([
    {
      id: "STU-001",
      name: "Test Student 1",
      guardianName: "Mr. Parent 1",
      guardianPhone: "0242914353",
    },
    {
      id: "STU-002",
      name: "Test Student 2",
      guardianName: "Mrs. Parent 2",
      guardianPhone: "0244000000",
    },
    {
      id: "STU-003",
      name: "Test Student 3",
      guardianName: "Mr. Parent 3",
      guardianPhone: "0245000000",
    },
  ]);

  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set());
  const [className, setClassName] = useState(initialClassName);
  const [dateLabel, setDateLabel] = useState(initialDate);
  const [brand, setBrand] = useState(initialBrand);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AttendanceResult | null>(null);

  function toggleAbsent(id: string) {
    setAbsentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateStudentField(
    id: string,
    field: keyof Student,
    value: string
  ) {
    setStudents((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  }

  async function handleCloseAndNotify() {
    setError(null);
    setResult(null);

    const absentees = students
      .filter((s) => absentIds.has(s.id))
      .map((s) => ({
        studentId: s.id,
        studentName: s.name,
        guardianName: s.guardianName,
        guardianPhone: s.guardianPhone,
      }));

    if (absentees.length === 0) {
      setError("No absentees selected. Mark at least one student as absent.");
      return;
    }

    try {
      setSending(true);
      const res = await fetch("/api/attendance/notify-absentees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          className,
          date: dateLabel,
          brand,
          absentees,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error || `Failed to notify absentees (status ${res.status})`
        );
      }

      const data = (await res.json()) as AttendanceResult;
      setResult(data);
    } catch (err: any) {
      setError(err?.message || "Unexpected error sending attendance alerts.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen flex justify-center bg-slate-50 py-8 px-4">
      <div className="w-full max-w-5xl bg-white shadow-md rounded-xl p-6 border border-slate-200 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">
            Attendance – Close & Notify Parents
          </h1>
          <p className="text-sm text-slate-600">
            Session ID:{" "}
            <span className="font-mono bg-slate-100 px-1 rounded">
              {sessionId}
            </span>
          </p>
          <p className="text-xs text-slate-500">
            Mark absentees below, confirm guardian phone numbers, then click{" "}
            <strong>Close &amp; Notify Parents</strong> to send SMS via Hubtel.
          </p>
        </header>

        {/* Session meta */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <label className="block text-slate-700 mb-1">Class / Form</label>
            <input
              className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-slate-700 mb-1">Date</label>
            <input
              className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm"
              value={dateLabel}
              onChange={(e) => setDateLabel(e.target.value)}
              placeholder="14/11/2025"
            />
          </div>
          <div>
            <label className="block text-slate-700 mb-1">SMS Brand</label>
            <select
              className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            >
              <option value="AYITIKOPJHS">AYITIKOPJHS (JHS Wallet)</option>
              <option value="AYITIKPRIM">AYITIKPRIM (Primary Wallet)</option>
              <option value="AYITIADMIN">AYITIADMIN (Admin Wallet)</option>
            </select>
          </div>
        </section>

        {/* Students table */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-800">
            Mark Absentees & Confirm Guardian Contacts
          </h2>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Absent?
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
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const isAbsent = absentIds.has(s.id);
                  return (
                    <tr
                      key={s.id}
                      className="border-t border-slate-200 odd:bg-white even:bg-slate-50"
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isAbsent}
                          onChange={() => toggleAbsent(s.id)}
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-800">{s.name}</td>
                      <td className="px-3 py-2">
                        <input
                          className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
                          value={s.guardianName}
                          onChange={(e) =>
                            updateStudentField(
                              s.id,
                              "guardianName",
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
                          value={s.guardianPhone}
                          onChange={(e) =>
                            updateStudentField(
                              s.id,
                              "guardianPhone",
                              e.target.value
                            )
                          }
                          placeholder="024XXXXXXX"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Actions & status */}
        <section className="space-y-3">
          <button
            onClick={handleCloseAndNotify}
            disabled={sending}
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {sending ? "Sending SMS to Parents..." : "Close & Notify Parents"}
          </button>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          {result && (
            <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 space-y-1">
              <p className="font-semibold">
                Attendance SMS Result – {result.className} on {result.date}
              </p>
              <p>
                Brand:{" "}
                <span className="font-mono bg-slate-100 px-1 rounded">
                  {result.brand}
                </span>{" "}
                • Total: {result.total} • Success: {result.successCount}
              </p>
              <ul className="list-disc ml-5 mt-1 space-y-1">
                {result.results.map((r, idx) => (
                  <li key={idx}>
                    {r.studentName} –{" "}
                    <span className="font-mono">{r.guardianPhone}</span> →{" "}
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
