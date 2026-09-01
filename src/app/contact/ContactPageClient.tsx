"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

type Form = {
  name: string;
  phone: string;
  relation: string;
  message: string;
};

type Contact = {
  label: string;
  phone: string;
  wa: string;
  focus: string;
};

type Intent = {
  slug: string;
  title: string;
  relation: string;
  message: string;
};

const SUPPORT_EMAIL = "support@edulifeos.com";

const CONTACTS: Contact[] = [
  {
    label: "Product Lead",
    phone: "0242914353",
    wa: "233242914353",
    focus: "Product direction, institutional demos, implementation guidance, adoption, and client success.",
  },
  {
    label: "Institutional Partnerships Lead",
    phone: "0547899418",
    wa: "233547899418",
    focus: "Schools, circuits, districts, partnerships, rollout conversations, adoption, and client success.",
  },
];

const INTENTS: Intent[] = [
  {
    slug: "demo",
    title: "Book an Institutional Demo",
    relation: "School / Governance Leader",
    message:
      "Hello EduLife OS team, I would like to book an institutional demo to see how EduLife OS can support teaching, school leadership, educational governance, family communication, and accountable follow-up.",
  },
  {
    slug: "pilot",
    title: "Request a Pilot",
    relation: "School / Governance Leader",
    message:
      "Hello EduLife OS team, I would like to discuss a focused rollout and understand the best starting workflow for our school or education context.",
  },
  {
    slug: "partner",
    title: "Partnership / NGO Enquiry",
    relation: "Partner / NGO",
    message:
      "Hello EduLife OS team, I would like to discuss partnership opportunities, deployment support, or collaboration around school transformation.",
  },
];

function statusTone(status: string | null) {
  if (!status) return "text-[#C9CDD6]";
  if (status.startsWith("✅")) return "text-emerald-300";
  if (status.startsWith("⚠️")) return "text-amber-300";
  return "text-[#C9CDD6]";
}

async function safeJson(res: Response) {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;

  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function ContactPageClient() {
  const searchParams = useSearchParams();
  const intent = searchParams.get("intent");

  const [form, setForm] = useState<Form>({
    name: "",
    phone: "",
    relation: "School / Governance Leader",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [waLinks, setWaLinks] = useState<string[] | null>(null);

  function onChange<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyIntent(slug: string) {
    const hit = INTENTS.find((x) => x.slug === slug);
    if (!hit) return;

    setForm((prev) => ({
      ...prev,
      relation: hit.relation,
      message: hit.message,
    }));
  }

  useEffect(() => {
    if (!intent) return;

    const hit = INTENTS.find((x) => x.slug === intent);
    if (!hit) return;

    setForm((prev) => {
      if (prev.message.trim()) return prev;
      return {
        ...prev,
        relation: hit.relation,
        message: hit.message,
      };
    });
  }, [intent]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    setWaLinks(null);

    if (!form.name.trim() || !form.phone.trim() || !form.message.trim()) {
      setStatus("⚠️ Please complete all required fields.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          relation: form.relation.trim(),
          message: form.message.trim(),
        }),
      });

      const data = await safeJson(res);

      if (!res.ok || !data?.ok) {
        setStatus("⚠️ Submission failed. Please try again.");
        return;
      }

      const encodedMsg = encodeURIComponent(
        `New EduLife OS enquiry from ${form.name} (${form.relation}) — ${form.phone}\n\nMessage:\n${form.message}`
      );

      const links = CONTACTS.map((c) => `https://wa.me/${c.wa}?text=${encodedMsg}`);

      setWaLinks(links);
      setStatus("✅ Enquiry received. You can continue directly on WhatsApp below.");
      setForm({
        name: "",
        phone: "",
        relation: "School / Governance Leader",
        message: "",
      });
    } catch {
      setStatus("⚠️ Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#05070B] text-[#F7F4ED]">
      <section className="relative overflow-hidden border-b border-white/8">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#05070B_0%,#071A3D_60%,#05070B_100%)]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:68px_68px]" />

        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <div className="inline-flex items-center rounded-full border border-[#E8C96A]/25 bg-white/6 px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#E8C96A]">
              EduLife OS Contact & Deployment
            </div>

            <h1 className="mt-8 text-4xl font-semibold leading-[1.02] sm:text-5xl lg:text-7xl">
              Speak with the team about{" "}
              <span className="bg-[linear-gradient(135deg,#D4AF37,#E8C96A,#F7F4ED)] bg-clip-text text-transparent">
                demos, pilots,
              </span>{" "}
              and institutional rollout.
            </h1>

            <p className="mt-6 max-w-3xl text-base leading-8 text-[#C9CDD6] sm:text-lg">
              EduLife OS serves schools and education leaders who value trust, clarity, and accountable execution.
              Reach out to discuss an institutional demo, focused rollout, partnership, adoption, or implementation support.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {[
                "Clear institutional rollout",
                "Built for Ghanaian education reality",
                "Teaching, governance, and family trust in one system",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[#D8DDE7]"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/8 bg-[#07111F]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="grid gap-3 md:grid-cols-3">
            {INTENTS.map((entry) => (
              <button
                key={entry.slug}
                type="button"
                onClick={() => applyIntent(entry.slug)}
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left transition hover:border-[#E8C96A]/25 hover:bg-white/8"
              >
                <div className="text-xs uppercase tracking-[0.16em] text-[#E8C96A]">
                  Quick Start
                </div>
                <div className="mt-2 text-lg font-semibold text-[#F7F4ED]">
                  {entry.title}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <form
            onSubmit={onSubmit}
            noValidate
            className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.04))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-8"
          >
            <div className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
              Enquiry Form
            </div>
            <h2 className="mt-3 text-2xl font-semibold sm:text-4xl">
              Start the conversation clearly.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#C9CDD6] sm:text-base">
              Tell us what kind of school conversation you want to have — demonstration, pilot rollout,
              or partnership — and we will guide the next step with clarity.
            </p>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-[#F7F4ED]">
                  Your Name *
                </label>
                <input
                  value={form.name}
                  onChange={(e) => onChange("name", e.target.value)}
                  placeholder="e.g. Ama Mensah"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#081326] px-4 py-3 text-[#F7F4ED] outline-none transition placeholder:text-[#8F98A8] focus:border-[#E8C96A]/35"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#F7F4ED]">
                  Phone / WhatsApp *
                </label>
                <input
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => onChange("phone", e.target.value)}
                  placeholder="0241234567"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#081326] px-4 py-3 text-[#F7F4ED] outline-none transition placeholder:text-[#8F98A8] focus:border-[#E8C96A]/35"
                  required
                />
              </div>
            </div>

            <div className="mt-5">
              <label className="block text-sm font-medium text-[#F7F4ED]">
                I am contacting as *
              </label>
              <select
                value={form.relation}
                onChange={(e) => onChange("relation", e.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#081326] px-4 py-3 text-[#F7F4ED] outline-none transition focus:border-[#E8C96A]/35"
                required
              >
                <option>School / Governance Leader</option>
                <option>Headteacher / School Leader</option>
                <option>Governance Officer</option>
                <option>Teacher / Staff</option>
                <option>Parent / Guardian</option>
                <option>Partner / NGO</option>
                <option>Other</option>
              </select>
            </div>

            <div className="mt-5">
              <label className="block text-sm font-medium text-[#F7F4ED]">
                Message *
              </label>
              <textarea
                rows={7}
                value={form.message}
                onChange={(e) => onChange("message", e.target.value)}
                placeholder="Tell us about your school, your need, or the kind of pilot or demonstration you want to discuss."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#081326] px-4 py-3 text-[#F7F4ED] outline-none transition placeholder:text-[#8F98A8] focus:border-[#E8C96A]/35"
                required
              />
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-6 py-3 text-sm font-semibold text-[#071A3D] transition hover:scale-[1.02] disabled:opacity-70"
              >
                {busy ? "Sending..." : "Send Enquiry"}
              </button>

              <div className={`text-sm ${statusTone(status)}`} aria-live="polite">
                {status ?? "Your enquiry is sent through the secure contact route above."}
              </div>
            </div>

            {waLinks && (
              <div className="mt-6 rounded-[24px] border border-[#E8C96A]/20 bg-[linear-gradient(135deg,rgba(212,175,55,0.12),rgba(11,61,145,0.10),rgba(5,7,11,0.92))] p-5">
                <div className="text-sm font-semibold text-[#F7F4ED]">
                  Continue instantly on WhatsApp
                </div>
                <p className="mt-2 text-sm leading-7 text-[#D9DEE8]">
                  Your enquiry has been received. You can also continue directly with the available contacts below.
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {CONTACTS.map((c, i) => (
                    <a
                      key={c.wa}
                      href={waLinks[i]}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-white/10 bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700"
                    >
                      {c.label.split(" — ")[0]}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </form>

          <aside className="space-y-6">
            <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.04))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
              <div className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                What Happens Next
              </div>
              <div className="mt-5 space-y-4">
                {[
                  "We understand your institution and responsibility first.",
                  "We recommend the right starting workflow and adoption path.",
                  "We guide the next step clearly — demo, pilot, or partnership discussion.",
                ].map((item, idx) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/8 bg-[#081326] px-4 py-4 text-sm text-[#D9DEE8]"
                  >
                    <span className="mr-3 text-[#E8C96A]">{String(idx + 1).padStart(2, "0")}</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.04))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
              <div className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                Speak with the EduLife OS team
              </div>

              <h2 className="mt-3 text-2xl font-semibold text-[#F7F4ED]">
                Reach the responsibility closest to your need.
              </h2>

              <p className="mt-3 text-sm leading-7 text-[#C9CDD6]">
                Both contact points can support adoption and client success. For email enquiries, use{" "}
                <a
                  href={"mailto:" + SUPPORT_EMAIL}
                  className="font-medium text-[#F4D97F] hover:text-white"
                >
                  {SUPPORT_EMAIL}
                </a>.
              </p>

              <div className="mt-5 space-y-4">
                {CONTACTS.map((c) => (
                  <div
                    key={c.wa}
                    className="rounded-2xl border border-white/8 bg-[#081326] p-4"
                  >
                    <div className="text-sm font-semibold text-[#F7F4ED]">
                      {c.label}
                    </div>

                    <p className="mt-2 text-sm leading-6 text-[#BFC7D4]">
                      {c.focus}
                    </p>

                    <div className="mt-2 text-sm text-[#C9CDD6]">
                      Phone: {c.phone}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <a
                        href={"tel:" + c.phone}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[#F7F4ED] transition hover:bg-white/10"
                      >
                        Call
                      </a>

                      <a
                        href={"https://wa.me/" + c.wa}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700"
                      >
                        WhatsApp
                      </a>

                      <a
                        href={"mailto:" + SUPPORT_EMAIL}
                        className="rounded-full border border-[#E8C96A]/20 bg-[#E8C96A]/8 px-4 py-2 text-sm font-medium text-[#F4D97F] transition hover:bg-[#E8C96A]/12"
                      >
                        Email
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[32px] border border-[#E8C96A]/20 bg-[linear-gradient(135deg,rgba(212,175,55,0.12),rgba(11,61,145,0.10),rgba(5,7,11,0.92))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
              <div className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                Why institutions reach out
              </div>
              <div className="mt-4 space-y-3">
                {[
                  "To see EduLife OS in the context of their institution",
                  "To plan a focused school or governance rollout",
                  "To explore partnership, adoption, or implementation support",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#E5E8EF]"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}