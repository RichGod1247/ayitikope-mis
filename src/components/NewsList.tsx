"use client";

import Link from "next/link";
import { NEWS } from "@/data/news";

export default function NewsList({ max = 3 }: { max?: number }) {
  const items = NEWS.slice(0, max);

  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-semibold">News & Events</h2>
        <Link
          href="/news"
          className="text-blue-700 hover:text-blue-800"
        >
          View all →
        </Link>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((n) => (
          <article key={n.id} className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="text-xs text-gray-500 mb-2">
              {new Date(n.date).toLocaleDateString()}
            </div>
            <h3 className="font-semibold">{n.title}</h3>
            <p className="mt-2 text-gray-700">{n.summary}</p>
            {n.href && (
              <Link
                href={n.href}
                className="mt-3 inline-block text-blue-700 hover:text-blue-800"
              >
                Read more
              </Link>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
