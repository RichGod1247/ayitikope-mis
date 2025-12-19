// src/components/HeadteacherHealthOverviewClient.tsx
"use client";

import React, { useEffect, useState } from "react";

type HeadteacherHealthOverviewClientProps = {
  tenantId: string;
  initialDate: string; // "YYYY-MM-DD"
};

type ClassroomSummary = {
  classroomId: string | null;
  classroomName: string;
  totalRecords: number;
  feverCount: number;
  maxTemp: number | null;
};

type SampleRow = {
  studentName: string;
  classroomName: string;
  temperatureC: number | null;
  symptoms: string | null;
  notes: string | null;
  isFever: boolean;
};

type ApiResponse = {
  ok: boolean;
  tenantId: string;
  tenantName: string;
  date: string;
  feverThresholdC: number;
  totalRecords: number;
  feverCount: number;
  byClassroom: ClassroomSummary[];
  samples: SampleRow[];
};

type LoadState = "idle" | "loading" | "error";

function formatDateForDisplay(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

const HeadteacherHealthOverviewClient: React.FC<
  HeadteacherHealthOverviewClientProps
> = ({ tenantId, initialDate }) => {
  const [date, setDate] = useState<string>(initialDate);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  const load = async (targetDate: string) => {
    try {
      setLoadState("loading");
      setError(null);

      const params = new URLSearchParams({
        tenantId,
        date: targetDate,
      });

      const res = await fetch(
        `/api/headteacher/health/overview?${params.toString()}`
      );
      if (!res.ok) {
        const text = await res.text();
        console.error(
          "[HeadteacherHealthOverviewClient] load error",
          res.status,
          text
        );
        setLoadState("error");
        setError("Failed to load health overview.");
        return;
      }

      const payload: ApiResponse = await res.json();
      if (!payload.ok) {
        console.error(
          "[HeadteacherHealthOverviewClient] payload not ok",
          payload
        );
        setLoadState("error");
        setError("Failed to load health overview.");
        return;
      }

      setData(payload);
      setLoadState("idle");
    } catch (err) {
      console.error(
        "[HeadteacherHealthOverviewClient] exception while loading",
        err
      );
      setLoadState("error");
      setError("Failed to load health overview.");
    }
  };

  useEffect(() => {
    load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, tenantId]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDate(e.target.value);
  };

  const total = data?.totalRecords ?? 0;
  const fever = data?.feverCount ?? 0;
  const feverRate =
    total > 0 ? `${((fever / total) * 100).toFixed(1)}%` : "0.0%";

  if (loadState === "loading" && !data) {
    return (
      <div className="p-4 text-sm text-slate-600">
        Loading health overview…
      </div>
    );
  }

  if (loadState === "error" && !data) {
    return (
      <div className="p-4 text-sm text-red-600">
        {error ?? "Failed to load health overview. Please refresh the page."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Top bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
            Daily Health & Safety Snapshot
          </h2>
          <p className="text-xs text-slate-600 sm:text-sm">
            Overview of learner temperatures and symptoms across the school for
            a selected day.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 text-xs sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-slate-700 sm:text-xs">
              Date
            </label>
            <input
              type="date"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs sm:text-sm"
              value={date}
              onChange={handleDateChange}
            />
          </div>
          {data && (
            <div className="text-[11px] text-slate-500 sm:text-xs">
              {formatDateForDisplay(data.date)}
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[11px] text-slate-500">Total readings</div>
          <div className="mt-1 text-xl font-semibold text-slate-900">
            {total}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[11px] text-slate-500">Fever cases</div>
          <div className="mt-1 text-xl font-semibold text-rose-600">
            {fever}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {feverRate} of measured learners
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[11px] text-slate-500">
            Fever threshold (°C)
          </div>
          <div className="mt-1 text-xl font-semibold text-slate-900">
            {data?.feverThresholdC?.toFixed(1) ?? "–"}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Configured in Admin → Health Settings
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[11px] text-slate-500">School</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {data?.tenantName ?? "—"}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {data?.tenantId ?? ""}
          </div>
        </div>
      </div>

      {loadState === "loading" && data && (
        <div className="text-xs text-slate-500">Refreshing overview…</div>
      )}
      {loadState === "error" && data && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {error ??
            "There was a problem refreshing the latest data. Showing last successful snapshot."}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)]">
        {/* By-classroom summary */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Class-level overview
          </h3>
          <div className="rounded-xl border border-slate-200 bg-white text-xs shadow-sm">
            {data && data.byClassroom.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-500">
                No health entries recorded for this date yet.
              </div>
            ) : (
              <div className="max-h-[360px] overflow-auto">
                <table className="min-w-full border-separate border-spacing-0 text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                        Class
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                        Readings
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                        Fever cases
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                        Max temp (°C)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.byClassroom.map((c, idx) => {
                      const isOdd = idx % 2 === 1;
                      const rate =
                        c.totalRecords > 0
                          ? `${(
                              (c.feverCount / c.totalRecords) *
                              100
                            ).toFixed(1)}%`
                          : "0.0%";
                      return (
                        <tr
                          key={c.classroomId ?? `no-class-${idx}`}
                          className={isOdd ? "bg-slate-50/60" : "bg-white"}
                        >
                          <td className="border-b border-slate-100 px-3 py-2 align-top">
                            <div className="font-medium text-slate-900">
                              {c.classroomName}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Fever: {c.feverCount} ({rate})
                            </div>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2 text-right align-top text-slate-800">
                            {c.totalRecords}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2 text-right align-top text-rose-600">
                            {c.feverCount}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2 text-right align-top text-slate-800">
                            {c.maxTemp != null
                              ? c.maxTemp.toFixed(1)
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Sample rows */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Sample learner records
          </h3>
          <div className="rounded-xl border border-slate-200 bg-white text-xs shadow-sm">
            {data && data.samples.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-500">
                No learner health entries captured for this date.
              </div>
            ) : (
              <div className="max-h-[360px] overflow-auto">
                <table className="min-w-full border-separate border-spacing-0 text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                        Learner &amp; class
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                        Temp (°C)
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                        Symptoms / notes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.samples.map((s, idx) => {
                      const isOdd = idx % 2 === 1;
                      return (
                        <tr
                          key={idx}
                          className={isOdd ? "bg-slate-50/60" : "bg-white"}
                        >
                          <td className="border-b border-slate-100 px-3 py-2 align-top">
                            <div className="font-medium text-slate-900">
                              {s.studentName}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {s.classroomName}
                            </div>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2 text-right align-top">
                            {s.temperatureC != null ? (
                              <span
                                className={
                                  s.isFever
                                    ? "font-semibold text-rose-600"
                                    : "text-slate-800"
                                }
                              >
                                {s.temperatureC.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2 align-top">
                            <div className="text-[11px] text-slate-700">
                              {s.symptoms || "—"}
                            </div>
                            {s.notes && (
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                {s.notes}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeadteacherHealthOverviewClient;
