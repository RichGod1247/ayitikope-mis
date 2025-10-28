// src/app/admissions/prospectus/page.tsx
"use client";

import { useState } from "react";

type Level = "KG" | "Lower Primary" | "Upper Primary" | "JHS";

const DATA: Record<Level, string[]> = {
  "KG": [
    "Liquid soap — 1",
    "Powdered soap — 1",
    "Dettol — 1",
    "Toilet roll — 1",
    "Bar soap — 2 pieces",
    "Exercise books: A1 — 2 pieces",
    "Exercise books: G — 2 pieces",
    "Exercise books: D1 — 2 pieces",
    "Pencil — 2 pieces",
    "Sharpener — 1 piece",
    "Registration fee — ₵10",
  ],
  "Lower Primary": [
    "Exercise books (Note 1) — 12",
    "Notebooks (Note 3) — 2",
    "Pencil — 2 pieces",
    "Sharpener — 1 piece",
    "Eraser — 1 piece",
    "Drawing book — 1 piece",
    "My First Copy Book — 1",
    "My Second Copy Book — 1",
    "Neat school uniform",
  ],
  "Upper Primary": [
    "Exercise books (Note 1) — 12",
    "Notebooks (Note 3) — 4",
    "Pen — 2 pieces",
    "Mathematical set — 1",
    "Long ruler — 1",
    "Graph book — 1",
    "Duster — 1",
    "Drawing book — 1",
    "Neat school uniform",
  ],
  "JHS": [
    "Exercise books (Note 1) — 20",
    "Notebooks (Note 3) — 6",
    "Pens — 2 red, 2 blue",
    "Mathematical set — 1",
    "Long ruler — 1",
    "Graph book — 1",
    "Drawing board — 1",
    "Duster — 1",
    "Standing broom — 1",
    "Decent school uniform",
  ],
};

export const metadata = { title: "Prospectus • Admissions" };

export default function ProspectusPage() {
  const [level, setLevel] = useState<Level>("KG");
  const items = DATA[level];

  return (
    <main className="container mx-auto px-6 py-10 space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Prospectus</h1>
        <p className="text-gray-700">Required items for new entrants—choose a level.</p>
      </header>

      {/* Tabs */}
      <div className="inline-flex rounded-lg bg-gray-100 p-1">
        {(["KG", "Lower Primary", "Upper Primary", "JHS"] as Level[]).map((l) => {
          const active = l === level;
          return (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={[
                "px-3 sm:px-4 py-2 rounded-md text-sm font-medium",
                active ? "bg-white shadow text-blue-800" : "text-gray-700 hover:text-blue-700"
              ].join(" ")}
            >
              {l}
            </button>
          );
        })}
      </div>

      {/* List */}
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-blue-800">{level}</h2>
        <ul className="mt-3 grid gap-2">
          {items.map((it, idx) => (
            <li key={idx} className="rounded-md border bg-white p-3">
              {it}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-gray-600">
          Tip: Label all items with the learner’s name. Keep receipts where applicable.
        </p>
      </section>
    </main>
  );
}
