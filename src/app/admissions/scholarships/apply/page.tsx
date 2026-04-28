// src/app/admissions/scholarships/apply/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

type Level = "KG" | "Lower Primary" | "Upper Primary" | "JHS";
type SchType = "Merit" | "Need-Based" | "STEM" | "Sports/Arts";

const EMPTY_FORM = {
  studentName: "",
  dateOfBirth: "",
  level: "" as Level | "",
  scholarshipType: "" as SchType | "",
  guardianName: "",
  guardianPhone: "",
  whatsappNumber: "",
  achievements: "",
  needStatement: "",
};

export default function ScholarshipApplyPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  function onChange<K extends keyof typeof form>(key: K, v: string) {
    setForm((s) => ({ ...s, [key]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (
      !form.studentName.trim() ||
      !form.level ||
      !form.scholarshipType ||
      !form.guardianName.trim() ||
      !form.guardianPhone.trim()
    ) {
      setStatus({ ok: false, message: "Please fill all required fields." });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admissions/scholarships/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: form.studentName.trim(),
          dateOfBirth: form.dateOfBirth || null,
          level: form.level,
          scholarshipType: form.scholarshipType,
          guardianName: form.guardianName.trim(),
          guardianPhone: form.guardianPhone.trim(),
          whatsappNumber: form.whatsappNumber.trim() || null,
          achievements: form.achievements.trim() || null,
          needStatement: form.needStatement.trim() || null,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setStatus({ ok: true, message: "Application submitted successfully. We will contact you if shortlisted." });
        setForm(EMPTY_FORM);
      } else {
        setStatus({ ok: false, message: data.error ?? "Submission failed. Please try again." });
      }
    } catch {
      setStatus({ ok: false, message: "Network error. Please check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container mx-auto px-6 py-10">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-blue-50 via-white to-blue-50" />
        <div className="relative flex items-center gap-5 px-6 py-6">
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <Image
              src="/admissions.png"
              alt="Scholarship Application"
              width={72}
              height={72}
              className="rounded-md object-contain"
              priority
            />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-blue-900">
              Scholarship Application
            </h1>
            <p className="mt-2 max-w-3xl text-gray-700">
              Fill the form below. We&apos;ll review and contact you via WhatsApp if shortlisted.
            </p>
            <div className="mt-4 flex gap-3">
              <Link
                href="/admissions/scholarships"
                className="rounded-lg border px-5 py-2.5 text-blue-700 font-semibold bg-white hover:bg-gray-50"
              >
                Back to Scholarships
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Form */}
      <form
        onSubmit={onSubmit}
        className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 shadow-sm max-w-3xl"
      >
        {/* Row: name + dob */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Student's Full Name *">
            <input
              value={form.studentName}
              onChange={(e) => onChange("studentName", e.target.value)}
              placeholder="e.g., Ama K. Mensah"
              className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            />
          </Field>
          <Field label="Date of Birth">
            <input
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => onChange("dateOfBirth", e.target.value)}
              className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            />
          </Field>
        </div>

        {/* Row: level + type */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Level *">
            <select
              value={form.level}
              onChange={(e) => onChange("level", e.target.value)}
              className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600 bg-white"
            >
              <option value="">Select level</option>
              <option value="KG">KG</option>
              <option value="Lower Primary">Lower Primary</option>
              <option value="Upper Primary">Upper Primary</option>
              <option value="JHS">JHS</option>
            </select>
          </Field>

          <Field label="Scholarship Type *">
            <select
              value={form.scholarshipType}
              onChange={(e) => onChange("scholarshipType", e.target.value)}
              className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600 bg-white"
            >
              <option value="">Select type</option>
              <option value="Merit">Merit</option>
              <option value="Need-Based">Need-Based</option>
              <option value="STEM">STEM</option>
              <option value="Sports/Arts">Sports &amp; Arts</option>
            </select>
          </Field>
        </div>

        {/* Row: guardian */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Parent/Guardian Name *">
            <input
              value={form.guardianName}
              onChange={(e) => onChange("guardianName", e.target.value)}
              placeholder="e.g., Mr./Mrs. Doe"
              className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            />
          </Field>
          <Field label="Parent/Guardian Phone *">
            <input
              value={form.guardianPhone}
              onChange={(e) => onChange("guardianPhone", e.target.value)}
              placeholder="024..."
              className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            />
          </Field>
          <Field label="WhatsApp Number (optional)">
            <input
              value={form.whatsappNumber}
              onChange={(e) => onChange("whatsappNumber", e.target.value)}
              placeholder="23324..."
              className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            />
          </Field>
        </div>

        {/* Conditional guidance */}
        <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
          Tip:
          {form.scholarshipType === "Need-Based" ? (
            <span> briefly explain your financial need below.</span>
          ) : form.scholarshipType === "STEM" ? (
            <span> list STEM projects/competitions or strong results.</span>
          ) : form.scholarshipType === "Sports/Arts" ? (
            <span> list awards, performances, or teams you play for.</span>
          ) : (
            <span> share achievements or reasons you&apos;re a great fit.</span>
          )}
        </div>

        {/* Text areas */}
        <Field label="Achievements / Evidence (optional)">
          <textarea
            value={form.achievements}
            onChange={(e) => onChange("achievements", e.target.value)}
            rows={4}
            placeholder="Prizes, projects, competitions, grades, performances…"
            className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
        </Field>

        <Field label="Financial Need (optional)">
          <textarea
            value={form.needStatement}
            onChange={(e) => onChange("needStatement", e.target.value)}
            rows={4}
            placeholder="If applying for Need-Based support, briefly explain the situation."
            className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
          />
        </Field>

        <button
          type="submit"
          disabled={busy}
          className="mt-2 inline-flex items-center justify-center rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
        >
          {busy ? "Submitting..." : "Submit Application"}
        </button>

        {status && (
          <p className={`text-sm ${status.ok ? "text-green-700" : "text-red-600"}`}>
            {status.ok ? "✓ " : "⚠ "}{status.message}
          </p>
        )}
      </form>
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
