// src/components/teacher/TeacherTermDashboardClient.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type TermDashboardResponse = any;
type FetchState = "idle" | "loading" | "error" | "loaded";

export default function TeacherTermDashboardClient() {
  const searchParams = useSearchParams();

  const classroomId = searchParams.get("classroomId") ?? "";
  const term = searchParams.get("term") ?? "1st Term";
  const academicYear = searchParams.get("academicYear") ?? "2025/2026";

  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [data, setData] = useState<TermDashboardResponse | null>(null);

  useEffect(() => {
    async function load() {
      if (!classroomId) {
        setFetchState("idle");
        setData(null);
        return;
      }

      try {
        setFetchState("loading");
        setErrorMessage(null);

        const params = new URLSearchParams({ classroomId, term, academicYear });
        const res = await fetch(`/api/teachers/assessment/term-dashboard?${params.toString()}`);

        const text = await res.text();
        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          setFetchState("error");
          setErrorMessage("Server returned invalid JSON.");
          return;
        }

        if (!res.ok || !json.ok) {
          setFetchState("error");
          setErrorMessage(String(json?.error ?? `HTTP ${res.status}`));
          return;
        }

        setData(json);
        setFetchState("loaded");
      } catch {
        setFetchState("error");
        setErrorMessage("Something went wrong while loading the dashboard.");
      }
    }

    load();
  }, [classroomId, term, academicYear]);

  const hasLearners = !!data?.learners?.length;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Term Assessment Dashboard</h1>
            <p className="mt-1 text-sm text-slate-600">Session-scoped. No tenant/user IDs in URLs.</p>
          </div>
          <div className="text-xs text-right text-slate-500 space-y-1">
            <div>
              Term: <span className="font-medium">{term}</span>
            </div>
            <div>
              Academic year: <span className="font-medium">{academicYear}</span>
            </div>
          </div>
        </div>

        {!classroomId && (
          <section className="mb-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-xs sm:text-sm text-slate-600">
            <p>Open this page with:</p>
            <pre className="mt-2 overflow-auto rounded bg-slate-900 p-2 text-[11px] text-slate-50">
              {`/teacher/assessment/term-dashboard?classroomId=CLASSROOM_ID&term=1st%20Term&academicYear=2025/2026`}
            </pre>
          </section>
        )}

        {fetchState === "error" && errorMessage && (
          <section className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-700">
            {errorMessage}
          </section>
        )}

        {fetchState === "loading" && (
          <section className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs sm:text-sm text-slate-600">
            Loading term dashboard…
          </section>
        )}

        {fetchState === "loaded" && data && (
          <section className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Class summary</h2>

              <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 px-3 py-3">
                  <div className="text-[11px] text-slate-500">Learners</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{data.learners.length}</div>
                </div>

                <div className="rounded-lg bg-indigo-50 px-3 py-3">
                  <div className="text-[11px] text-indigo-700">Class average (%)</div>
                  <div className="mt-1 text-lg font-semibold text-indigo-900">
                    {data.classAverage?.percentage != null ? `${data.classAverage.percentage.toFixed(2)}%` : "No records"}
                  </div>
                  <div className="mt-1 text-[11px] text-indigo-700">
                    Grade: <span className="font-semibold">{data.classAverage?.grade ?? "—"}</span> •{" "}
                    <span className="font-semibold">{data.classAverage?.remark ?? "—"}</span>
                  </div>
                </div>

                <div className="rounded-lg bg-emerald-50 px-3 py-3">
                  <div className="text-[11px] text-emerald-700">Total max (class)</div>
                  <div className="mt-1 text-lg font-semibold text-emerald-900">
                    {typeof data.classAverage?.totalMax === "number" ? data.classAverage.totalMax.toFixed(2) : "—"}
                  </div>
                  <div className="mt-1 text-[11px] text-emerald-700">
                    Total score: {typeof data.classAverage?.totalScore === "number" ? data.classAverage.totalScore.toFixed(2) : "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Learner breakdown</h2>

              {!hasLearners && (
                <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-xs text-slate-600">
                  No learners found yet.
                </div>
              )}

              {hasLearners && (
                <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-slate-100 text-xs">
                  <table className="min-w-full border-separate border-spacing-0 text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">Learner</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">Items</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">Total</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">Max</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">%</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">Grade</th>
                        <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">Remark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.learners.map((l: any, idx: number) => {
                        const zebra = idx % 2 ? "bg-slate-50/60" : "bg-white";
                        const isVeryLow = typeof l.grade === "number" && l.grade >= 7;
                        const isExcellent = l.grade === 1;

                        return (
                          <tr key={l.studentId} className={zebra}>
                            <td className="border-b border-slate-100 px-3 py-1.5 align-top text-slate-900">
                              <div className="font-medium">{l.fullName}</div>
                              <div className="text-[11px] text-slate-500">{l.guardianPhone ? `Guardian: ${l.guardianPhone}` : ""}</div>
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-center align-top text-slate-800">{l.itemsCount}</td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-right align-top text-slate-800">{Number(l.totalScore).toFixed(2)}</td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-right align-top text-slate-800">{Number(l.totalMax).toFixed(2)}</td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-right align-top text-slate-800">
                              {l.percentage != null ? `${Number(l.percentage).toFixed(2)}%` : "—"}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-center align-top">
                              <span
                                className={[
                                  "inline-flex min-w-8 justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                  isExcellent
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : isVeryLow
                                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                                      : "bg-slate-50 text-slate-700 border border-slate-200",
                                ].join(" ")}
                              >
                                {l.grade}
                              </span>
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 align-top text-slate-800">{l.remark}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
