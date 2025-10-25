"use client";

import { useState } from "react";

type Level = "KG" | "Primary" | "JHS";

export default function AdmissionsPage() {
  const [level, setLevel] = useState<Level>("KG");
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [parent, setParent] = useState("");
  const [contact, setContact] = useState("");
  const [house, setHouse] = useState("");
  const [gps, setGps] = useState("");
  const [status, setStatus] = useState<null | string>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (!name.trim() || !dob.trim() || !parent.trim() || !contact.trim()) {
      setStatus("Please fill all required fields.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          name_of_student: name,
          date_of_birth: dob,
          name_of_parent_or_guardian: parent,
          contact_number: contact,
          house_number: house,
          digital_address: gps,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("✅ Application submitted successfully.");
        // reset
        setName(""); setDob(""); setParent(""); setContact(""); setHouse(""); setGps("");
      } else {
        setStatus("⚠️ Submission failed. Try again.");
      }
    } catch (err) {
      setStatus("⚠️ Network error. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold">Admissions — Apply Online</h1>
      <p className="mt-2 text-gray-700 max-w-2xl">
        Fill the form for <strong>KG</strong>, <strong>Primary</strong>, or <strong>JHS</strong>.
        We’ll confirm on WhatsApp and email.
      </p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4 rounded-xl border bg-white p-6 shadow-sm max-w-2xl">
        {/* Level */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Level</label>
          <div className="mt-1 flex gap-3">
            {(["KG","Primary","JHS"] as Level[]).map(l => (
              <label key={l} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="level"
                  value={l}
                  checked={level === l}
                  onChange={() => setLevel(l)}
                />
                <span>{l}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Fields */}
        <Field label="Name of Student *">
          <input className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
            value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
        </Field>

        <Field label="Date of Birth *">
          <input type="date" className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
            value={dob} onChange={e => setDob(e.target.value)} />
        </Field>

        <Field label="Name of Parent/Guardian *">
          <input className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
            value={parent} onChange={e => setParent(e.target.value)} placeholder="Full name" />
        </Field>

        <Field label="Contact Number of Parent/Guardian *">
          <input className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
            value={contact} onChange={e => setContact(e.target.value)} placeholder="024..." />
        </Field>

        <Field label="House Number">
          <input className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
            value={house} onChange={e => setHouse(e.target.value)} placeholder="e.g., H/No. 12" />
        </Field>

        <Field label="Digital Address (GhanaPost GPS)">
          <input className="w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
            value={gps} onChange={e => setGps(e.target.value)} placeholder="e.g., AK-123-4567" />
        </Field>

        <button
          type="submit"
          className="mt-2 inline-flex items-center justify-center rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
          disabled={busy}
        >
          {busy ? "Submitting..." : "Submit Application"}
        </button>

        {status && <p className="text-sm">{status}</p>}
      </form>

      {/* Payments box (optional quick access) */}
      <div className="mt-8 rounded-xl border bg-white p-5 shadow-sm max-w-2xl">
        <h2 className="text-lg font-semibold text-blue-800">Pay Fees & Dues</h2>
        <p className="text-sm text-gray-700">Use our secure online payment partners.</p>
        <div className="mt-3 flex gap-3">
          <a
            href={process.env.NEXT_PUBLIC_PAYSTACK_URL}
            target="_blank"
            className="rounded-lg bg-black text-white px-4 py-2 font-semibold"
          >
            Pay with Paystack
          </a>
          {process.env.NEXT_PUBLIC_HUBTEL_URL && (
            <a
              href={process.env.NEXT_PUBLIC_HUBTEL_URL}
              target="_blank"
              className="rounded-lg bg-green-700 text-white px-4 py-2 font-semibold"
            >
              Pay with Hubtel
            </a>
          )}
        </div>
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
