// src/components/admin/CanonicalClassSeedCard.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SeedState =
  | { kind: "idle" }
  | { kind: "loading"; mode: "single" | "multi" }
  | { kind: "success"; mode: string; created: number; skipped: number; total: number }
  | { kind: "error"; message: string };

function shellCardClass() {
  return "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl space-y-4";
}

function primaryBtnClass(disabled: boolean) {
  return [
    "w-full rounded-xl border border-transparent px-4 py-2 text-sm font-semibold transition",
    "bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)]",
    disabled ? "opacity-60 cursor-not-allowed" : "hover:brightness-105",
  ].join(" ");
}

function outlineBtnClass(disabled: boolean) {
  return [
    "w-full rounded-xl border px-4 py-2 text-sm transition",
    "border-white/10 bg-white/5 text-[#F7F4ED]",
    disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-white/10",
  ].join(" ");
}

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
    <div className={shellCardClass()}>
      <div>
        <h2 className="text-sm font-semibold text-[#F7F4ED]">
          Canonical class seeding
        </h2>
        <p className="mt-1 text-sm text-[#C9CDD6]">
          One click creates the standard Ghana structure from KG1 to JHS3.
        </p>
      </div>

      <div className="grid gap-2">
        <button
          type="button"
          onClick={() => run("single")}
          disabled={busy}
          className={primaryBtnClass(busy)}
        >
          {busy && state.kind === "loading" && state.mode === "single"
            ? "Seeding single-stream..."
            : "Seed single-stream"}
        </button>

        <button
          type="button"
          onClick={() => run("multi")}
          disabled={busy}
          className={outlineBtnClass(busy)}
        >
          {busy && state.kind === "loading" && state.mode === "multi"
            ? "Seeding multi-stream..."
            : "Seed multi-stream (A–D)"}
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#07111F]/80 px-4 py-3">
        <p className="text-xs leading-5 text-[#C9CDD6]">
          Safe behavior only: this creates missing normalized class identities
          and skips existing ones. It does{" "}
          <span className="font-semibold text-[#F7FED]">not</span> auto-delete or
          auto-convert opposite stream structures.
        </p>
      </div>

      {state.kind === "success" ? (
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-3 text-sm text-emerald-100">
          Seeded <b>{state.mode}</b>: created <b>{state.created}</b>, skipped{" "}
          <b>{state.skipped}</b>, total <b>{state.total}</b>.
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">
          {state.message}
        </div>
      ) : null}
    </div>
  );
}