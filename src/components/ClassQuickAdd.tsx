"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClassQuickAdd() {
  const router = useRouter();
  const [class_code, setCode] = useState("");
  const [class_name, setName] = useState("");
  const [level, setLevel] = useState("KG");
  const [teacher_id, setTeacher] = useState("");
  const [academic_year, setYear] = useState("");
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/classes/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // In production you would add: 'x-admin-key': process.env.NEXT_PUBLIC_... (but don't expose secrets public).
        // For now (dev), no header needed.
        body: JSON.stringify({
          class_code,
          class_name,
          level,
          teacher_id,
          academic_year,
          term,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Failed");
      }
      setMsg("✅ Saved.");
      setCode("");
      setName("");
      setTeacher("");
      // Keep year/term/level if you like, but we’ll leave them as-is
      router.refresh(); // refresh table
    } catch (err: any) {
      setMsg("⚠️ " + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Class Code *</label>
          <input
            value={class_code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g., JHS1A"
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Class Name *</label>
          <input
            value={class_name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., JHS 1 A"
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Level *</label>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          >
            <option>KG</option>
            <option>Lower Primary</option>
            <option>Upper Primary</option>
            <option>JHS</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Teacher ID (optional)</label>
          <input
            value={teacher_id}
            onChange={(e) => setTeacher(e.target.value)}
            placeholder="e.g., TCH-001"
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
          <p className="mt-1 text-xs text-gray-500">
            (Use an ID from the Teachers table. We’ll add a dropdown later.)
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Academic Year</label>
          <input
            value={academic_year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="e.g., 2024/2025"
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Term</label>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="e.g., 1"
            className="mt-1 w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
        >
          {busy ? "Saving..." : "Add / Update Class"}
        </button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
    </form>
  );
}
