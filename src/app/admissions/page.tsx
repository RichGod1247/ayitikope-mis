"use client";

import { useState } from "react";
import FormLogo from "@/components/FormLogo";

type Level = "KG" | "Primary" | "JHS";

export default function AdmissionsPage() {
  const [level, setLevel] = useState<Level>("KG");
  const [studentName, setStudentName] = useState("");
  const [dob, setDob] = useState("");
  const [parent, setParent] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState(""); // GPS
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/api/admissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          student_name: studentName,
          dob,
          parent,
          phone,
          address,
          notes,
        }),
      });

      const json = await res.json();
      if (res.ok && json?.ok) {
        setStatus({ ok: true, msg: "Application submitted successfully." });
        // clear
        setStudentName("");
        setDob("");
        setParent("");
        setPhone("");
        setAddress("");
        setNotes("");
      } else {
        setStatus({ ok: false, msg: "Submission failed. Please try again." });
      }
    } catch {
      setStatus({ ok: false, msg: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container mx-auto px-6 py-10 max-w-2xl">
      <FormLogo subtitle="Admissions" />
      <h1 className="text-3xl font-bold mb-6 text-blue-900">Admissions</h1>

      <form onSubmit={submit} className="space-y-4 bg-white rounded-xl p-6 shadow">
        <label className="grid gap-1">
          <span className="text-sm font-medium">Level</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as Level)}
            className="border rounded-md px-3 py-2"
          >
            <option value="KG">KG</option>
            <option value="Primary">Primary</option>
            <option value="JHS">JHS</option>
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Student Name</span>
          <input
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            className="border rounded-md px-3 py-2"
            placeholder="Full name"
            required
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Date of Birth</span>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="border rounded-md px-3 py-2"
            required
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Parent/Guardian</span>
          <input
            value={parent}
            onChange={(e) => setParent(e.target.value)}
            className="border rounded-md px-3 py-2"
            placeholder="Parent/Guardian name"
            required
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="border rounded-md px-3 py-2"
            placeholder="Phone number"
            required
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Address (GPS)</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="border rounded-md px-3 py-2"
            placeholder="e.g. GX-0123-4567"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="border rounded-md px-3 py-2"
            rows={3}
            placeholder="Anything we should know?"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-2 rounded-md"
        >
          {loading ? "Submitting..." : "Submit Application"}
        </button>

        {status && (
          <p className={status.ok ? "text-green-700 mt-2" : "text-red-600 mt-2"}>
            {status.msg}
          </p>
        )}
      </form>
    </main>
  );
}
