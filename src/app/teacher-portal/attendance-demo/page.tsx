"use client";

import { useState } from "react";

export default function AttendanceDemo() {
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [klass, setKlass] = useState("");
  const [temp, setTemp] = useState("");
  const [status, setStatus] = useState<null | string>(null);
  const [busy, setBusy] = useState(false);

  async function submit(action: "IN" | "OUT") {
    setStatus(null);
    if (!studentId.trim() || !studentName.trim()) {
      setStatus("Please enter student ID and name.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          student_name: studentName,
          action,
          temp_celsius: temp ? Number(temp) : undefined,
          class: klass,
          guardian_phone: "", // optional for later notifications
        }),
      });
      const data = await res.json();
      setStatus(data.ok ? `✅ ${action} recorded.` : "⚠️ Failed to record.");
    } catch {
      setStatus("⚠️ Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold">Attendance Demo</h1>
      <p className="mt-2 text-gray-700 max-w-2xl">
        For testing: submit clock IN/OUT to the Google Sheet. Later we’ll connect this to the RFID/Fingerprint/Face device and auto-notifications.
      </p>

      <div className="mt-6 max-w-xl rounded-xl border bg-white p-6 shadow-sm grid gap-4">
        <Field label="Student ID">
          <input className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
            value={studentId} onChange={e => setStudentId(e.target.value)} placeholder="e.g., JHS1-023" />
        </Field>

        <Field label="Student Name">
          <input className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
            value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="e.g., Ama K." />
        </Field>

        <Field label="Class">
          <input className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
            value={klass} onChange={e => setKlass(e.target.value)} placeholder="e.g., JHS1" />
        </Field>

        <Field label="Temperature (°C) (optional)">
          <input type="number" step="0.1" className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
            value={temp} onChange={e => setTemp(e.target.value)} placeholder="e.g., 36.7" />
        </Field>

        <div className="flex gap-3">
          <button
            onClick={() => submit("IN")}
            disabled={busy}
            className="rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 py-2 font-semibold disabled:opacity-60"
          >
            Clock IN
          </button>
          <button
            onClick={() => submit("OUT")}
            disabled={busy}
            className="rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 font-semibold disabled:opacity-60"
          >
            Clock OUT
          </button>
        </div>

        {status && <p className="text-sm">{status}</p>}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
