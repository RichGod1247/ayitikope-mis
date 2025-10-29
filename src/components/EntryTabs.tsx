// src/components/EntryTabs.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type Level = "KG" | "Lower Primary" | "Upper Primary" | "JHS";

// ---------- DATA (updated: Birth Certificate -> Date of Birth; removed passport photos) ----------
const DATA: Record<Level, { summary: string; items: string[] }> = {
  "KG": {
    summary: "For children typically aged 4–5, ready to begin play-based foundational learning.",
    items: [
      "Child’s Date of Birth (for age placement)",
      "Child health/immunization record (if available)",
      "Parent/Guardian contact (phone & WhatsApp)",
      "Residential address (house number & GhanaPost GPS)",
      "Readiness interaction (short informal session with KG teacher)",
      "PTA dues — ₵20 (per term)",
    ],
  },
  "Lower Primary": {
    summary: "For learners progressing from KG or transferring from another basic school (P1–P3).",
    items: [
      "Age-appropriate placement (P1–P3) based on Date of Birth",
      "Previous school transfer note (if applicable)",
      "Most recent report (if applicable)",
      "Parent/Guardian contact (phone & WhatsApp)",
      "Residential address (house number & GhanaPost GPS)",
      "Baseline check in literacy & numeracy (informal)",
      "PTA dues — ₵20 (per term)",
    ],
  },
  "Upper Primary": {
    summary: "For learners in upper primary grades (P4–P6).",
    items: [
      "Age-appropriate placement (P4–P6) based on Date of Birth",
      "Transfer letter (if changing schools)",
      "Last term’s report (if available)",
      "Parent/Guardian contact (phone & WhatsApp)",
      "Residential address (house number & GhanaPost GPS)",
      "Short placement check (literacy, numeracy, science basics)",
      "PTA dues — ₵20 (per term)",
    ],
  },
  "JHS": {
    summary: "For learners entering Junior High (JHS1–JHS3).",
    items: [
      "Placement into JHS1–JHS3 based on Date of Birth and prior class records",
      "Transfer letter & last report (if from another school)",
      "Parent/Guardian contact (phone & WhatsApp)",
      "Residential address (house number & GhanaPost GPS)",
      "Placement check (English, Mathematics, Science, Social)",
      "PTA dues — ₵20 (per term)",
    ],
  },
};

// ---------- URL helpers (hash & query) ----------
const HASH_TO_LEVEL: Record<string, Level> = {
  "#kg": "KG",
  "#lower": "Lower Primary",
  "#upper": "Upper Primary",
  "#jhs": "JHS",
};
const LEVEL_TO_HASH: Record<Level, string> = {
  "KG": "#kg",
  "Lower Primary": "#lower",
  "Upper Primary": "#upper",
  "JHS": "#jhs",
};
function parseLevelFromUrl(): Level | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hash.toLowerCase();
  if (HASH_TO_LEVEL[h]) return HASH_TO_LEVEL[h];
  const sp = new URLSearchParams(window.location.search);
  const q = sp.get("level");
  if (!q) return null;
  const s = q.toLowerCase();
  if (s === "kg") return "KG";
  if (s.includes("lower")) return "Lower Primary";
  if (s.includes("upper")) return "Upper Primary";
  if (s === "jhs" || s.includes("junior")) return "JHS";
  return null;
}

export default function EntryTabs() {
  // Stable SSR default, then sync from URL after mount (prevents hydration mismatch)
  const [level, setLevel] = useState<Level>("KG");
  const mounted = useRef(false);

  useEffect(() => {
    const initial = parseLevelFromUrl();
    if (initial && initial !== level) setLevel(initial);
    mounted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted.current || typeof window === "undefined") return;
    const targetHash = LEVEL_TO_HASH[level];
    if (window.location.hash !== targetHash) {
      history.replaceState(null, "", targetHash);
    }
  }, [level]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHash = () => {
      const lv = HASH_TO_LEVEL[window.location.hash.toLowerCase()];
      if (lv && lv !== level) setLevel(lv);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [level]);

  const data = DATA[level];

  return (
    <>
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

      {/* Content */}
      <section className="mt-4 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-blue-800">{level}</h2>
        <p className="mt-1 text-gray-700">{data.summary}</p>
        <ul className="mt-3 grid gap-2">
          {data.items.map((it, idx) => (
            <li key={idx} className="rounded-md border bg-white p-3">
              {it}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-gray-600">
          Notes: School may request additional documents for transfers. Bring originals for verification.
        </p>
      </section>
    </>
  );
}
