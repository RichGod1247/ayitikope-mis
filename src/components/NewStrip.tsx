"use client";

import Link from "next/link";

const ITEMS = [
  { text: "Admissions for 2025 are open", href: "/contact" },
  { text: "New ICT Lab unveiled", href: "/gallery" },
  { text: "KG Play & Learn Day — Photos", href: "/gallery" },
  { text: "Ayitikope wins District Award of Excellence", href: "/gallery" },
];

export default function NewStrip() {
  return (
    <section className="bg-[--color-brand-50] border-y border-[--color-brand-200] py-2">
      <div className="container mx-auto px-6 text-sm flex gap-6 overflow-x-auto">
        {ITEMS.map((i, idx) => (
          <Link
            key={idx}
            href={i.href}
            className="shrink-0 hover:text-[--color-brand-700] transition"
          >
            • {i.text}
          </Link>
        ))}
      </div>
    </section>
  );
}
