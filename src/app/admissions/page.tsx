// src/app/admissions/page.tsx
"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Level = "KG" | "Primary" | "JHS";
type Gender = "Male" | "Female";

export default function AdmissionsPage() {
  const [level, setLevel] = useState<Level>("KG");
  const [name, setName] = useState("");          // full name (we'll split)
  const [gender, setGender] = useState<Gender | "">(""); // NEW
  const [dob, setDob] = useState("");
  const [parent, setParent] = useState("");
  const [contact, setContact] = useState("");    // parent/guardian phone (WhatsApp)
  const [house, setHouse] = useState("");
  const [gps, setGps] = useState("");
  const [status, setStatus] = useState<null | string>(null);
  const [busy, setBusy] = useState(false);
  const [debug, setDebug] = useState<string | null>(null);
  const [submittedName, setSubmittedName] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      name.trim().length >= 3 &&
      !!gender &&                               // NEW
      !!dob &&
      parent.trim().length >= 3 &&
      contact.trim().length >= 9 // simple Ghana length sanity
    );
  }, [name, gender, dob, parent, contact]);

  function splitName(full: string) {
    const parts = full.trim().split(/\s+/);
    if (parts.length === 0) return { first_name: "", last_name: "" };
    if (parts.length === 1) return { first_name: parts[0], last_name: "" };
    return {
      first_name: parts.slice(0, -1).join(" "),
      last_name: parts.slice(-1)[0],
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setDebug(null);

    if (!canSubmit) {
      setStatus("Please complete all required fields.");
      return;
    }

    setBusy(true);
    try {
      const { first_name, last_name } = splitName(name);

      const payload = {
        first_name,
        last_name,
        gender,                                 // NEW
        date_of_birth: dob,                     // yyyy-mm-dd
        guardian_primary_name: parent,
        guardian_primary_phone: contact,
        house_number: house || null,
        digital_address: gps || null,
        class_code: null,
        whatsapp_number: contact,
        status: "pending",
        applied_level: level,
      };

      // 1) Insert student
      const { error: studentErr } = await supabase.from("students").insert([payload]);
      if (studentErr) {
        console.error("[Admissions] supabase insert error:", studentErr);
        setStatus("⚠️ Submission failed. Please try again.");
        setDebug(JSON.stringify(studentErr, null, 2));
        return;
      }

      // 2) Log a notification request (insert-only, safe under your RLS)
      const notify = {
        channel: "whatsapp",
        template_key: "admissions_submitted",
        recipient: contact,
        student_id: null,
        status: "queued",
        meta: {
          parent_name: parent,
          student_full_name: name,
          applied_level: level,
          gender,                               // NEW
          dob,
          gps,
        } as any,
      };
      const { error: notifErr } = await supabase.from("notifications_log").insert([notify]);
      if (notifErr) {
        console.warn("[Admissions] notification log insert failed:", notifErr);
      }

      setSubmittedName(name);
      setStatus("✅ Application submitted successfully.");
      setName(""); setGender(""); setDob(""); setParent(""); setContact(""); setHouse(""); setGps("");
      setLevel("KG");
    } catch (err: any) {
      console.error("[Admissions] unexpected error:", err);
      setStatus("⚠️ Network or setup error. Please try again.");
      setDebug(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* HERO */}
      <section className="relative w-full h-48 sm:h-64 overflow-hidden">
        <img
          src="/admissions.png"
          alt="Admissions"
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-linear-to-b from-black/30 via-black/30 to-black/60" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-white text-xs sm:text-sm">
              2025/26 Intake • KG • Primary • JHS
            </div>
            <h1 className="mt-2 text-white text-2xl sm:text-4xl font-bold tracking-wide drop-shadow">
              Admissions — Apply Online
            </h1>
            <p className="mt-1 text-blue-100 text-sm sm:text-base">
              Knowledge • Character • Service
            </p>
          </div>
        </div>
      </section>

      <main className="container mx-auto px-6 py-10">
        {/* STEP HEADER */}
        <div className="mx-auto max-w-4xl">
          <ol className="flex items-center justify-center gap-4 text-xs sm:text-sm">
            <li className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-blue-800 border">
              1. Fill Applicant Details
            </li>
            <li className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-blue-800 border">
              2. Submit
            </li>
            <li className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-blue-800 border">
              3. Confirmation
            </li>
          </ol>
        </div>

        {/* CARD LAYOUT */}
        <section className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          {/* FORM CARD */}
          <form
            onSubmit={onSubmit}
            className="rounded-2xl border bg-white p-6 shadow-soft"
            noValidate
            aria-describedby="form-status"
          >
            <header className="flex items-baseline justify-between">
              <h2 className="text-xl sm:text-2xl font-semibold text-blue-800">
                Applicant Information
              </h2>
              <span className="text-xs text-gray-500">* Required fields</span>
            </header>

            {/* Level */}
            <div className="mt-5">
              <label className="block text-sm font-medium text-gray-700">
                Entry Level *
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["KG", "Primary", "JHS"] as Level[]).map((l) => (
                  <button
                    type="button"
                    key={l}
                    onClick={() => setLevel(l)}
                    className={[
                      "rounded-md px-3 py-1.5 text-sm border transition",
                      level === l
                        ? "bg-blue-600 text-white border-blue-700"
                        : "bg-white text-gray-700 hover:bg-gray-50"
                    ].join(" ")}
                    aria-pressed={level === l}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Choose the level you’re applying for.
              </p>
            </div>

            {/* Name */}
            <Field
              label="Full Name of Student *"
              error={name.trim().length < 3 ? "Enter at least 3 characters" : ""}
            >
              <input
                className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Ama Mensah"
                required
              />
            </Field>

            {/* Gender (NEW) */}
            <Field
              label="Gender *"
              error={!gender ? "Required" : ""}
            >
              <select
                className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none bg-white"
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender)}
                required
              >
                <option value="" disabled>Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </Field>

            {/* DOB */}
            <Field label="Date of Birth *" error={!dob ? "Required" : ""}>
              <input
                type="date"
                className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                required
              />
            </Field>

            {/* Parent */}
            <Field
              label="Name of Parent/Guardian *"
              error={parent.trim().length < 3 ? "Enter at least 3 characters" : ""}
            >
              <input
                className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
                value={parent}
                onChange={(e) => setParent(e.target.value)}
                placeholder="e.g., Kofi Mensah"
                required
              />
            </Field>

            {/* Contact */}
            <Field
              label="Parent/Guardian Phone (WhatsApp) *"
              hint="e.g., 0241234567"
              error={contact.trim().length < 9 ? "Enter a valid phone number" : ""}
            >
              <input
                inputMode="tel"
                className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="0241234567"
                required
              />
            </Field>

            {/* Address extras */}
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="House Number">
                <input
                  className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
                  value={house}
                  onChange={(e) => setHouse(e.target.value)}
                  placeholder="e.g., H/No. 12"
                />
              </Field>
              <Field label="Digital Address (GhanaPost GPS)">
                <input
                  className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
                  value={gps}
                  onChange={(e) => setGps(e.target.value)}
                  placeholder="e.g., AK-123-4567"
                />
              </Field>
            </div>

            {/* CTA */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className={[
                  "inline-flex items-center justify-center rounded-lg px-5 py-2.5 font-semibold text-white transition",
                  canSubmit && !busy
                    ? "bg-blue-700 hover:bg-blue-800"
                    : "bg-blue-300"
                ].join(" ")}
                disabled={!canSubmit || busy}
              >
                {busy ? "Submitting…" : "Submit Application"}
              </button>
              <span
                id="form-status"
                className="text-sm"
                aria-live="polite"
              >
                {status ?? ""}
              </span>
            </div>

            {/* Dev-only error reveal */}
            {debug && (
              <pre className="mt-3 rounded-md bg-gray-900 text-gray-100 text-xs p-3 overflow-auto">
                {debug}
              </pre>
            )}
          </form>

          {/* SIDE INFO CARD */}
          <aside className="rounded-2xl border bg-white p-6 shadow-soft">
            <h3 className="text-lg font-semibold text-blue-800">What you’ll need</h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              <li>• Student’s full name, gender & date of birth</li>
              <li>• Parent/Guardian name & WhatsApp number</li>
              <li>• House number & GhanaPost GPS (optional)</li>
            </ul>

            <div className="mt-6 rounded-xl border p-4">
              <h4 className="font-semibold text-gray-800">Why parents choose us</h4>
              <ul className="mt-2 space-y-1 text-sm text-gray-700">
                <li>• Strong literacy & numeracy foundation</li>
                <li>• Character & service as daily habits</li>
                <li>• Caring teachers, safe environment</li>
              </ul>
            </div>

            {/* Success panel */}
            {status?.startsWith("✅") && submittedName && (
              <div className="mt-6 rounded-xl border bg-blue-50 p-4">
                <div className="text-blue-900 font-semibold">Thank you, {submittedName.split(" ")[0]}!</div>
                <p className="mt-1 text-sm text-blue-900/90">
                  Your application has been received. You’ll get a WhatsApp update soon.
                </p>
                <div className="mt-3 flex gap-2">
                  <a href="/admissions/prospectus" className="text-sm rounded-md border px-3 py-1.5 hover:bg-white">
                    View Prospectus
                  </a>
                  <a href="/admissions/entry" className="text-sm rounded-md border px-3 py-1.5 hover:bg-white">
                    Entry Requirements
                  </a>
                </div>
              </div>
            )}
          </aside>
        </section>
      </main>
    </>
  );
}

function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="mt-4">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {!!error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
