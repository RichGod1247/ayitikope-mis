// src/components/admin/CanonicalClassSeedCard.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SeedState =
  | { kind: "idle" }
  | { kind: "loading"; mode: "single" | "multi" }
  | { kind: "success"; mode: string; created: number; skipped: number; total: number }
  | { kind: "error"; message: string };

export default function CanonicalClassSeedCard() {
  const router = useRouter();
  const [state, setState] = useState<SeedState>({ kind: "idle" });

  async function run(mode: "single" | "multi") {
    setState({ kind: "loading", mode });

    try {
      const res = await fetch("/api/classrooms/seed-canonical", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({ mode }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setState({
          kind: "error",
          message: String(data?.error || "Failed to seed canonical classes."),
        });
        return;
      }

      setState({
        kind: "success",
        mode: String(data.mode || mode),
        created: Number(data.created || 0),
        skipped: Number(data.skipped || 0),
        total: Number(data.total || 0),
      });

      router.refresh();
    } catch (e: any) {
      setState({
        kind: "error",
        message: String(e?.message || "Network error while seeding classes."),
      });
    }
  }

  const busy = state.kind === "loading";

  return (
    <div className="rounded-2xl border bg-white p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Canonical class seeding</h2>
        <p className="text-sm text-zinc-600 mt-1">
          One click creates the standard Ghana structure from KG1 to JHS3.
        </p>
      </div>

      <div className="grid gap-2">
        <button
          type="button"
          onClick={() => run("single")}
          disabled={busy}
          className="rounded-xl bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
        >
          {busy && state.kind === "loading" && state.mode === "single"
            ? "Seeding single-stream..."
            : "Seed single-stream"}
        </button>

        <button
          type="button"
          onClick={() => run("multi")}
          disabled={busy}
          className="rounded-xl border px-4 py-2 text-sm disabled:opacity-60"
        >
          {busy && state.kind === "loading" && state.mode === "multi"
            ? "Seeding multi-stream..."
            : "Seed multi-stream (A–D)"}
        </button>
      </div>

      <p className="text-xs text-zinc-500">
        Safe behavior only: this creates missing normalized class identities and skips existing ones.
        It does <b>not</b> auto-delete or auto-convert opposite stream structures.
      </p>

      {state.kind === "success" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Seeded <b>{state.mode}</b>: created <b>{state.created}</b>, skipped <b>{state.skipped}</b>, total{" "}
          <b>{state.total}</b>.
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {state.message}
        </div>
      ) : null}
    </div>
  );
}