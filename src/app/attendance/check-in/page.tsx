// src/app/attendance/check-in/page.tsx
"use client";

import { useState } from "react";

export default function AttendanceCheckInPage() {
  const [studentId, setStudentId] = useState("");
  const [classCode, setClassCode] = useState("");
  const [temp, setTemp] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!studentId.trim() || !classCode.trim()) {
      setMsg("Please enter Student ID and Class Code.");
      return;
    }

    setBusy(true);
    try {
      const r = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId.trim(),
          class_code: classCode.trim(),
          temperature_c: temp.trim() ? Number(temp) : null,
        }),
      });

      const data = await r.json();
      if (!r.ok || !data.ok) {
        setMsg(`⚠️ Failed: ${data?.error || "Unknown error"}`);
      } else {
        setMsg("✅ Checked in successfully.");
        setStudentId("");
        setClassCode("");
        setTemp("");
      }
    } catch (err: any) {
      setMsg(`⚠️ Network error: ${String(err?.message || err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-blue-800">Attendance — Check In</h1>
        <p className="text-gray-700">
          Paste a <strong>Student ID (UUID)</strong> from Admin → Admissions and enter the student’s class.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="max-w-xl grid gap-4 rounded-2xl border bg-white p-6 shadow-sm"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700">Student ID (UUID) *</label>
          <input
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="e.g., 8f41639e-b89c-43f6-be9c-aba347490f21"
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
          <p className="mt-1 text-xs text-gray-500">
            Tip: Copy from <em>Admin → Recent Admissions</em> table.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Class Code *</label>
          <input
            value={classCode}
            onChange={(e) => setClassCode(e.target.value)}
            placeholder="e.g., KG1, P4A, JHS2A"
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
          <p className="mt-1 text-xs text-gray-500">
            Use your internal code (the value stored in <code>classes.class_code</code>).
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Temperature (°C) — optional
          </label>
          <input
            type="number"
            step="0.1"
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            placeholder="e.g., 36.6"
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
        </div>

        <button
          type="submit"
          className="mt-2 inline-flex items-center justify-center rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
          disabled={busy}
        >
          {busy ? "Checking in..." : "Check In"}
        </button>

        {msg && <p className="text-sm">{msg}</p>}
      </form>
    </main>
  );
}
