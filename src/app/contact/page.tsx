// src/app/contact/page.tsx
"use client";

import { useState } from "react";

type FormState = {
  name: string;
  phone: string;   // parent's/guardian's phone
  email: string;
  subject: string;
  message: string;
};

export default function ContactPage() {
  const [f, setF] = useState<FormState>({
    name: "",
    phone: "",
    email: "",
    subject: "",
    message: "",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // School contacts (WhatsApp)
  const WHATSAPP = [
    {
      role: "Head Teacher",
      name: "Mr. Senu Peter",
      phoneDisplay: "050 802 1572",
      waNumber: "233508021572", // Ghana +233, no leading 0
    },
    {
      role: "Asst. Head Teacher (JHS)",
      name: "Mr. Angellus Anyigba Atsu",
      phoneDisplay: "024 544 4861",
      waNumber: "233245444861",
    },
    {
      role: "Asst. Head Mistress (Primary)",
      name: "Mrs. Magbele Janet",
      phoneDisplay: "024 338 1907",
      waNumber: "233243381907",
    },
  ];

  function onChange<K extends keyof FormState>(key: K, val: FormState[K]) {
    setF((s) => ({ ...s, [key]: val }));
  }

  function makeWhatsAppText(): string {
    const lines = [
      `New contact request from Ayitikope M/A Basic School website`,
      ``,
      `From: ${f.name || "(no name)"}  |  Phone: ${f.phone || "(no phone)"}  |  Email: ${f.email || "(no email)"}`,
      `Subject: ${f.subject || "(no subject)"}`,
      ``,
      f.message || "(no message)",
    ];
    return encodeURIComponent(lines.join("\n"));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    // Minimal validation (keep it gentle and clear)
    if (!f.name.trim() || !f.phone.trim() || !f.message.trim()) {
      setStatus("Please fill in your Name, Phone, and Message.");
      return;
    }

    setBusy(true);
    try {
      // Open WhatsApp chats (one tab per contact). Some browsers may block popups.
      const text = makeWhatsAppText();
      WHATSAPP.forEach((c, i) => {
        const url = `https://wa.me/${c.waNumber}?text=${text}`;
        // small delay between opens helps with popup blockers
        setTimeout(() => window.open(url, "_blank", "noopener,noreferrer"), i * 150);
      });

      setStatus("✅ Message prepared in WhatsApp. If a chat didn’t open, please tap the WhatsApp buttons below.");
      // (Optional) reset the form
      setF({ name: "", phone: "", email: "", subject: "", message: "" });
    } catch {
      setStatus("⚠️ Could not open WhatsApp automatically. Use the WhatsApp buttons below to send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container mx-auto px-6 py-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Contact Us</h1>
        <p className="text-gray-700 max-w-2xl">
          Send us a message and we’ll reach out. When you submit, we’ll also open WhatsApp chats
          to our senior staff so they can respond quickly.
        </p>
      </header>

      {/* FORM */}
      <form
        onSubmit={onSubmit}
        className="mt-6 grid gap-4 rounded-2xl border bg-white p-6 shadow-sm max-w-2xl"
      >
        <Field label="Your full name *">
          <input
            className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            value={f.name}
            onChange={(e) => onChange("name", e.target.value)}
            placeholder="e.g., Akpene Mensah"
          />
        </Field>

        <Field label="Your phone (WhatsApp) *">
          <input
            className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            value={f.phone}
            onChange={(e) => onChange("phone", e.target.value)}
            placeholder="e.g., 0241234567"
          />
        </Field>

        <Field label="Email (optional)">
          <input
            className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            value={f.email}
            onChange={(e) => onChange("email", e.target.value)}
            placeholder="you@example.com"
            type="email"
          />
        </Field>

        <Field label="Subject">
          <input
            className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            value={f.subject}
            onChange={(e) => onChange("subject", e.target.value)}
            placeholder="e.g., Admissions enquiry"
          />
        </Field>

        <Field label="Message *">
          <textarea
            className="w-full min-h-32 rounded-md border px-3 py-2 outline-none focus:border-blue-600"
            value={f.message}
            onChange={(e) => onChange("message", e.target.value)}
            placeholder="Type your message here…"
          />
        </Field>

        <button
          type="submit"
          className="mt-2 inline-flex items-center justify-center rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
          disabled={busy}
        >
          {busy ? "Sending…" : "Submit & Notify via WhatsApp"}
        </button>

        {status && <p className="text-sm">{status}</p>}
      </form>

      {/* CONTACT CARDS */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-blue-800">Key Contacts</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WHATSAPP.map((c) => (
            <article key={c.waNumber} className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="text-sm text-gray-500">{c.role}</div>
              <h3 className="font-semibold">{c.name}</h3>
              <p className="mt-1 text-gray-700">
                <a className="hover:underline" href={`tel:${c.phoneDisplay.replace(/\s+/g, "")}`}>
                  {c.phoneDisplay}
                </a>
              </p>
              <div className="mt-3 flex gap-2">
                <a
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
                  href={`tel:${c.phoneDisplay.replace(/\s+/g, "")}`}
                >
                  Call
                </a>
                <a
                  className="rounded-md bg-green-600 text-white px-3 py-1.5 text-sm hover:bg-green-700"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`https://wa.me/${c.waNumber}?text=${makeWhatsAppText()}`}
                >
                  WhatsApp
                </a>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-600">
          Tip: If your browser blocks popups, use the green WhatsApp buttons above to send the same message.
        </p>
      </section>
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
