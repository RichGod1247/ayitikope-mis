// src/app/contact/page.tsx
"use client";

import { useState } from "react";

type Form = {
  name: string;
  phone: string;
  relation: "Parent/Guardian" | "Prospective Parent" | "Partner/NGO" | "Other";
  message: string;
};

const CONTACTS = [
  {
    label: "Mr. Senu Peter — Head Teacher",
    phone: "0508021572",
    wa: "233508021572", // Ghana: replace leading 0 with 233
  },
  {
    label: "Mr. Angellus Anyigba Atsu — Asst. Head (JHS)",
    phone: "0245444861",
    wa: "233245444861",
  },
  {
    label: "Mrs. Magbele Janet — Asst. Head (Primary)",
    phone: "0243381907",
    wa: "233243381907",
  },
];

export default function ContactPage() {
  const [form, setForm] = useState<Form>({
    name: "",
    phone: "",
    relation: "Parent/Guardian",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [waLinks, setWaLinks] = useState<string[] | null>(null);

  function onChange<K extends keyof Form>(key: K, v: Form[K]) {
    setForm((s) => ({ ...s, [key]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setWaLinks(null);

    if (!form.name.trim() || !form.phone.trim() || !form.message.trim()) {
      setStatus("Please fill all required fields.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!data?.ok) {
        setStatus("⚠️ Submission failed. Please try again.");
        return;
      }

      // Build WhatsApp deep-links with prefilled message
      const encodedMsg = encodeURIComponent(
        `New enquiry from ${form.name} (${form.relation}) — ${form.phone}\n\nMessage:\n${form.message}`
      );
      const links = CONTACTS.map((c) => `https://wa.me/${c.wa}?text=${encodedMsg}`);

      setWaLinks(links);
      setStatus("✅ Message received. You can also WhatsApp the staff directly below.");
      setForm({ name: "", phone: "", relation: "Parent/Guardian", message: "" });
    } catch (err) {
      setStatus("⚠️ Network error. Please try again.");
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
          alt="School"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-b from-black/30 via-black/30 to-black/60" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-white text-2xl sm:text-4xl font-bold drop-shadow">
              Contact Us
            </h1>
            <p className="mt-1 text-blue-100">We’re here to help.</p>
          </div>
        </div>
      </section>

      <main className="container mx-auto px-6 py-10 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* FORM */}
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border bg-white p-6 shadow-soft"
          noValidate
        >
          <h2 className="text-xl sm:text-2xl font-semibold text-blue-800">Send a Message</h2>
          <p className="mt-1 text-sm text-gray-600">Fields marked * are required.</p>

          <div className="mt-4">
            <label className="block text-sm font-medium">Your Name *</label>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
              value={form.name}
              onChange={(e) => onChange("name", e.target.value)}
              placeholder="e.g., Ama Mensah"
              required
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium">Phone (WhatsApp) *</label>
            <input
              inputMode="tel"
              className="mt-1 w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
              value={form.phone}
              onChange={(e) => onChange("phone", e.target.value)}
              placeholder="0241234567"
              required
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium">I am a *</label>
            <select
              className="mt-1 w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none bg-white"
              value={form.relation}
              onChange={(e) => onChange("relation", e.target.value as Form["relation"])}
              required
            >
              <option>Parent/Guardian</option>
              <option>Prospective Parent</option>
              <option>Partner/NGO</option>
              <option>Other</option>
            </select>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium">Message *</label>
            <textarea
              rows={5}
              className="mt-1 w-full rounded-md border px-3 py-2 focus:border-blue-600 outline-none"
              value={form.message}
              onChange={(e) => onChange("message", e.target.value)}
              placeholder="How can we help?"
              required
            />
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className={[
                "rounded-lg px-5 py-2.5 font-semibold text-white transition",
                busy ? "bg-blue-300" : "bg-blue-700 hover:bg-blue-800",
              ].join(" ")}
            >
              {busy ? "Sending…" : "Submit"}
            </button>
            <span className="text-sm" aria-live="polite">{status ?? ""}</span>
          </div>

          {/* After-submit WhatsApp shortcuts */}
          {waLinks && (
            <div className="mt-6 rounded-xl border bg-blue-50 p-4">
              <div className="font-semibold text-blue-900">Quick WhatsApp</div>
              <p className="text-sm text-blue-900/90">
                Tap a button to continue the conversation on WhatsApp:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {CONTACTS.map((c, i) => (
                  <a
                    key={c.wa}
                    href={waLinks[i]}
                    target="_blank"
                    className="rounded-md bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1.5"
                  >
                    {c.label.split(" — ")[0]}
                  </a>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* CONTACT CARDS */}
        <aside className="rounded-2xl border bg-white p-6 shadow-soft">
          <h3 className="text-lg font-semibold text-blue-800">Key Contacts</h3>
          <ul className="mt-3 space-y-3 text-sm">
            {CONTACTS.map((c) => (
              <li key={c.wa} className="rounded-md border p-3">
                <div className="font-semibold">{c.label}</div>
                <div className="text-gray-700">Phone: {c.phone}</div>
                <div className="mt-2 flex gap-2">
                  <a
                    href={`tel:${c.phone}`}
                    className="rounded-md border px-3 py-1.5 hover:bg-gray-50"
                  >
                    Call
                  </a>
                  <a
                    href={`https://wa.me/${c.wa}`}
                    target="_blank"
                    className="rounded-md bg-green-600 hover:bg-green-700 text-white px-3 py-1.5"
                  >
                    WhatsApp
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </main>
    </>
  );
}
