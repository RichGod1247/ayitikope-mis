// src/app/admissions/scholarships/apply/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

type Level = "KG" | "Lower Primary" | "Upper Primary" | "JHS";
type SchType = "Merit" | "Need-Based" | "STEM" | "Sports/Arts";

export default function ScholarshipApplyPage() {
  const [form, setForm] = useState({
    student_name: "",
    date_of_birth: "",
    level: "" as Level | "",
    scholarship_type: "" as SchType | "",
    guardian_name: "",
    guardian_phone: "",
    whatsapp_number: "",
    achievements: "",
    need_statement: "",
  });

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [debug, setDebug] = useState<string | null>(null);

  function onChange<K extends keyof typeof form>(key: K, v: string) {
    setForm((s) => ({ ...s, [key]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setDebug(null);

    // Minimal required validation
    if (
      !form.student_name.trim() ||
      !form.date_of_birth ||
      !form.level ||
      !form.scholarship_type ||
      !form.guardian_name.trim() ||
      !form.guardian_phone.trim()
    ) {
      setStatus("Please fill all required fields.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.from("scholarship_applications").insert([
        {
          student_name: form.student_name.trim(),
          date_of_birth: form.date_of_birth,
          level: form.level,
          scholarship_type: form.scholarship_type,
          guardian_name: form.guardian_name.trim(),
          guardian_phone: form.guardian_phone.trim(),
          whatsapp_number: form.whatsapp_number.trim() || null,
          achievements: form.achievements.trim() || null,
          need_statement: form.need_statement.trim() || null,
        },
      ]);

      if (error) {
        setStatus("⚠️ Submission failed. Please try again.");
        setDebug(JSON.stringify(error, null, 2));
      } else {
        setStatus("✅ Application submitted successfully.");
        setForm({
          student_name: "",
          date_of_birth: "",
          level: "",
          scholarship_type: "",
          guardian_name: "",
          guardian_phone: "",
          whatsapp_number: "",
          achievements: "",
          need_statement: "",
        });
      }
    } catch (err: any) {
      setStatus("⚠️ Network or setup error.");
      setDebug(String(err?.message || err));
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
              Fill the form below. We’ll review and contact you via WhatsApp if shortlisted.
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
          <Field label="Student’s Full Name *">
            <input
              value={form.student_name}
              onChange={(e) => onChange("student_name", e.target.value)}
              placeholder="e.g., Ama K. Mensah"
              className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            />
          </Field>
          <Field label="Date of Birth *">
            <input
              type="date"
              value={form.date_of_birth}
              onChange={(e) => onChange("date_of_birth", e.target.value)}
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
              value={form.scholarship_type}
              onChange={(e) => onChange("scholarship_type", e.target.value)}
              className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600 bg-white"
            >
              <option value="">Select type</option>
              <option value="Merit">Merit</option>
              <option value="Need-Based">Need-Based</option>
              <option value="STEM">STEM</option>
              <option value="Sports/Arts">Sports & Arts</option>
            </select>
          </Field>
        </div>

        {/* Row: guardian */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Parent/Guardian Name *">
            <input
              value={form.guardian_name}
              onChange={(e) => onChange("guardian_name", e.target.value)}
              placeholder="e.g., Mr./Mrs. Doe"
              className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            />
          </Field>
          <Field label="Parent/Guardian Phone *">
            <input
              value={form.guardian_phone}
              onChange={(e) => onChange("guardian_phone", e.target.value)}
              placeholder="024..."
              className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            />
          </Field>
          <Field label="WhatsApp Number (optional)">
            <input
              value={form.whatsapp_number}
              onChange={(e) => onChange("whatsapp_number", e.target.value)}
              placeholder="23324..."
              className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            />
          </Field>
        </div>

        {/* Conditional guidance */}
        <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
          Tip:
          {form.scholarship_type === "Need-Based" ? (
            <span> briefly explain your financial need below.</span>
          ) : form.scholarship_type === "STEM" ? (
            <span> list STEM projects/competitions or strong results.</span>
          ) : form.scholarship_type === "Sports/Arts" ? (
            <span> list awards, performances, or teams you play for.</span>
          ) : (
            <span> share achievements or reasons you’re a great fit.</span>
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
            value={form.need_statement}
            onChange={(e) => onChange("need_statement", e.target.value)}
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

        {status && <p className="text-sm whitespace-pre-wrap">{status}</p>}
        {debug && (
          <pre className="mt-2 rounded-md bg-gray-900 text-gray-100 text-xs p-3 overflow-auto">
            {debug}
          </pre>
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
