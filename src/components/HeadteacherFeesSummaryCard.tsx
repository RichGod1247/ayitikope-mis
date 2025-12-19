// src/components/HeadteacherFeesSummaryCard.tsx
"use client";

import React, { useEffect, useState } from "react";

type FeesSummaryResponse = {
  ok: boolean;
  error?: string;
  tenantId?: string;
  invoiceCount?: number;
  totalBilled?: number;
  totalPaid?: number;
  totalOutstanding?: number;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      data: Required<
        Omit<FeesSummaryResponse, "ok" | "error">
      >;
    };

type Props = {
  studentCount: number;
  /**
   * PTA dues per learner in Ghana cedis.
   * Default: 20 (as per Ayitikope PTA dues).
   */
  ptaDuesPerLearner?: number;
};

export function HeadteacherFeesSummaryCard({
  studentCount,
  ptaDuesPerLearner = 20,
}: Props) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/headteacher/fees/summary", {
          method: "GET",
        });

        const json: FeesSummaryResponse = await res
          .json()
          .catch(() => ({ ok: false, error: "Invalid JSON from server" }));

        if (cancelled) return;

        if (!res.ok || !json.ok) {
          setState({
            status: "error",
            message:
              json.error ||
              "Could not load fees summary. Please try again or contact the office.",
          });
          return;
        }

        setState({
          status: "ready",
          data: {
            tenantId: json.tenantId!,
            invoiceCount: json.invoiceCount ?? 0,
            totalBilled: json.totalBilled ?? 0,
            totalPaid: json.totalPaid ?? 0,
            totalOutstanding: json.totalOutstanding ?? 0,
          },
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            "Network error while loading fees summary. Check your connection and try again.",
        });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
          School fees
        </p>
        <p className="mt-1 text-[11px] text-emerald-900/80">
          Loading live fees summary…
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50/70 px-4 py-3 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-red-800">
          School fees
        </p>
        <p className="mt-1 text-[11px] text-red-900/80">
          {state.message}
        </p>
      </div>
    );
  }

  const { invoiceCount, totalBilled, totalPaid, totalOutstanding } =
    state.data;

  // PTA potential calculation (based on your 20 cedis per learner)
  const ptaExpectedTotal = studentCount * ptaDuesPerLearner;

  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 shadow-sm h-full">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
            School fees – live
          </p>
          <p className="mt-0.5 text-[11px] text-emerald-900/80 max-w-xs">
            Totals for all invoices and payments recorded in{" "}
            <span className="font-semibold">EduLife OS</span> for this school.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <p className="text-emerald-700/80">Total billed</p>
          <p className="mt-0.5 text-sm font-semibold text-emerald-900">
            GH₵ {totalBilled.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-emerald-700/80">Total paid</p>
          <p className="mt-0.5 text-sm font-semibold text-emerald-900">
            GH₵ {totalPaid.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-emerald-700/80">Outstanding</p>
          <p className="mt-0.5 text-sm font-semibold text-emerald-900">
            GH₵ {totalOutstanding.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="mt-2 text-[11px] text-emerald-900/80 space-y-1">
        <p>
          Invoices found:{" "}
          <span className="font-semibold">{invoiceCount}</span>
        </p>
        <p className="text-[10px]">
          PTA dues assumption:{" "}
          <span className="font-semibold">
            GH₵ {ptaDuesPerLearner.toFixed(2)} per learner
          </span>
          . With{" "}
          <span className="font-semibold">{studentCount}</span> learners,
          full PTA compliance would be approximately{" "}
          <span className="font-semibold">
            GH₵ {ptaExpectedTotal.toFixed(2)}
          </span>
          .
        </p>
        <p className="text-[10px]">
          Note: The totals above include{" "}
          <span className="font-semibold">all fee types</span> recorded in
          EduLife OS (tuition, PTA, printing, etc.). We&apos;ll later break
          this down by fee category.
        </p>
      </div>
    </div>
  );
}
