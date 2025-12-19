// src/components/ParentOverviewClient.tsx
"use client";

import React, { useState } from "react";

export type ParentOverviewClientProps = {
  tenantId: string;
  defaultTerm: string;
  defaultAcademicYear: string;
};

type ParentStudent = {
  id: string;
  name: string;
  classroomName: string | null;
  fees: {
    term: string;
    academicYear: string;
    totalBilledPesewas: number;
    totalWaivedPesewas: number;
    totalPaidPesewas: number;
    balancePesewas: number;
    lastPaymentAmountPesewas: number | null;
    lastPaymentAt: string | null;
  };
  health: {
    lastDate: string;
    temperatureC: number | null;
    symptoms: string | null;
    notes: string | null;
  } | null;
};

type OverviewResponse = {
  ok: boolean;
  guardianPhone: string;
  meta: { term: string; academicYear: string };
  students: ParentStudent[];
};

type LoadState = "idle" | "loading" | "error";

function formatCedis(pesewas: number): string {
  const cedis = pesewas / 100;
  return `GH₵ ${cedis.toFixed(2)}`;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

const ParentOverviewClient: React.FC<ParentOverviewClientProps> = ({
  tenantId,
  defaultTerm,
  defaultAcademicYear,
}) => {
  const [phone, setPhone] = useState("");
  const [term, setTerm] = useState(defaultTerm);
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);

  const [loadingState, setLoadingState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OverviewResponse | null>(null);

  async function handleLoad(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setData(null);

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setError("Please enter the phone number you registered with the school.");
      return;
    }

    setLoadingState("loading");

    try {
      const params = new URLSearchParams({
        tenantId,
        guardianPhone: trimmedPhone,
        term,
        academicYear,
      });

      const res = await fetch(`/api/parent/overview?${params.toString()}`);
      const json = (await res.json()) as any;

      if (!res.ok || !json.ok) {
        setLoadingState("error");
        setError(
          json?.error ||
            "Failed to load your information. Please check your number and try again."
        );
        return;
      }

      setData(json as OverviewResponse);
      setLoadingState("idle");
    } catch (err) {
      console.error("[ParentOverviewClient] load error", err);
      setLoadingState("error");
      setError(
        "Something went wrong while loading your information. Please try again."
      );
    }
  }

  const hasResults = !!data && data.students && data.students.length > 0;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Intro / instructions */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs sm:text-sm">
        <div className="font-semibold text-slate-900">
          Welcome to the Parent Portal
        </div>
        <p className="mt-1 text-slate-600">
          Enter the phone number you used when registering your child to see{" "}
          <span className="font-medium">
            fees for this term and recent health notes
          </span>
          . If something does not look right, kindly contact the school office.
        </p>
      </div>

      {/* Lookup form */}
      <form
        onSubmit={handleLoad}
        className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs sm:flex-row sm:items-end sm:text-sm"
      >
        <div className="flex-1 space-y-1">
          <label className="block text-[11px] font-medium text-slate-700 sm:text-xs">
            Phone number (as registered with the school)
          </label>
          <input
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs sm:text-sm"
            placeholder="e.g. 0244 123 456"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-slate-700 sm:text-xs">
            Term
          </label>
          <select
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs sm:text-sm"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          >
            <option value="1st Term">1st Term</option>
            <option value="2nd Term">2nd Term</option>
            <option value="3rd Term">3rd Term</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-slate-700 sm:text-xs">
            Academic year
          </label>
          <input
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs sm:text-sm"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
          />
        </div>

        <div className="pt-1 sm:pt-0">
          <button
            type="submit"
            disabled={loadingState === "loading"}
            className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          >
            {loadingState === "loading" ? "Loading..." : "View my children"}
          </button>
        </div>
      </form>

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 sm:text-sm">
          {error}
        </div>
      )}

      {/* No results yet */}
      {!error && !hasResults && data && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs sm:text-sm">
          <div className="font-medium text-slate-900">No learners found</div>
          <p className="mt-1 text-slate-600">
            We could not find any learners linked to{" "}
            <span className="font-mono">{data.guardianPhone}</span> for{" "}
            <span className="font-medium">{data.meta.term}</span>,{" "}
            <span className="font-medium">{data.meta.academicYear}</span>. Please
            confirm the phone number you registered with the school.
          </p>
        </div>
      )}

      {/* Results */}
      {hasResults && data && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs sm:text-sm">
            <div className="text-slate-700">
              Showing information for phone:{" "}
              <span className="font-mono font-semibold">
                {data.guardianPhone}
              </span>
            </div>
            <div className="mt-1 text-slate-600">
              Term:{" "}
              <span className="font-medium">{data.meta.term}</span> • Academic
              year:{" "}
              <span className="font-medium">{data.meta.academicYear}</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {data.students.map((s) => {
              const f = s.fees;
              const h = s.health;
              const balance = f.balancePesewas;
              const isCleared = balance <= 0;
              const isHealthFlag =
                h && h.temperatureC != null && h.temperatureC >= 37.5;

              return (
                <div
                  key={s.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {s.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        Class:{" "}
                        <span className="font-medium">
                          {s.classroomName || "Not set"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-[11px]">
                      <span
                        className={[
                          "inline-flex items-center rounded-full px-2 py-0.5",
                          isCleared
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200",
                        ].join(" ")}
                      >
                        {isCleared ? "Fees cleared" : "Balance due"}
                      </span>
                      {isHealthFlag && (
                        <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-red-700">
                          Health attention needed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Fees summary */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      Fees summary
                    </div>
                    <div className="grid grid-cols-2 gap-y-1">
                      <div className="text-slate-600">Total billed:</div>
                      <div className="text-right font-medium">
                        {formatCedis(f.totalBilledPesewas)}
                      </div>
                      <div className="text-slate-600">Total paid:</div>
                      <div className="text-right font-medium text-emerald-700">
                        {formatCedis(f.totalPaidPesewas)}
                      </div>
                      <div className="text-slate-600">Waived / discount:</div>
                      <div className="text-right">
                        {formatCedis(f.totalWaivedPesewas)}
                      </div>
                      <div className="mt-1 text-slate-700">Balance:</div>
                      <div
                        className={[
                          "mt-1 text-right font-semibold",
                          isCleared ? "text-emerald-700" : "text-amber-700",
                        ].join(" ")}
                      >
                        {formatCedis(balance)}
                      </div>
                    </div>
                    {f.lastPaymentAt && (
                      <div className="mt-2 text-[11px] text-slate-500">
                        Last payment:{" "}
                        {formatCedis(f.lastPaymentAmountPesewas || 0)} on{" "}
                        {formatDateShort(f.lastPaymentAt)}
                      </div>
                    )}
                  </div>

                  {/* Health summary */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      Recent health note
                    </div>
                    {!h ? (
                      <div className="text-slate-500">
                        No recent health entries recorded.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600">
                            Date: {formatDateShort(h.lastDate)}
                          </span>
                          {h.temperatureC != null && (
                            <span
                              className={[
                                "font-semibold",
                                h.temperatureC >= 37.5
                                  ? "text-red-600"
                                  : "text-emerald-700",
                              ].join(" ")}
                            >
                              Temp: {h.temperatureC.toFixed(1)}°C
                            </span>
                          )}
                        </div>
                        {h.symptoms && (
                          <div className="text-[11px] text-slate-700">
                            Symptoms: {h.symptoms}
                          </div>
                        )}
                        {h.notes && (
                          <div className="text-[11px] text-slate-700">
                            Notes: {h.notes}
                          </div>
                        )}
                        {!h.symptoms && !h.notes && (
                          <div className="text-[11px] text-slate-500">
                            No special notes. Learner appears normal.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentOverviewClient;
