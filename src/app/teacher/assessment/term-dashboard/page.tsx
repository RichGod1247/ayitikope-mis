// src/app/teacher/assessment/term-dashboard/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type ClassroomInfo = {
  id: string;
  name: string | null;
  grade: string | null;
  arm: string | null;
};

type LearnerSummary = {
  studentId: string;
  fullName: string;
  guardianPhone: string | null;
  itemsCount: number;
  totalScore: number;
  totalMax: number;
  percentage: number | null;
  grade: number;
  remark: string;
};

type ClassAverage = {
  totalScore: number;
  totalMax: number;
  percentage: number | null;
  grade: number;
  remark: string;
};

type TermDashboardResponse = {
  ok: boolean;
  context: {
    tenantId: string;
    teacherUserId: string;
    classroomId: string;
    term: string;
    academicYear: string;
  };
  classroom: ClassroomInfo;
  learners: LearnerSummary[];
  classAverage: ClassAverage;
};

type FetchState = "idle" | "loading" | "error" | "loaded";

const TeacherTermDashboardPage: React.FC = () => {
  const searchParams = useSearchParams();

  const tenantId = searchParams.get("tenantId") ?? "";
  const teacherUserId = searchParams.get("teacherUserId") ?? "";
  const classroomId = searchParams.get("classroomId") ?? "";
  const term = searchParams.get("term") ?? "1st Term";
  const academicYear =
    searchParams.get("academicYear") ?? "2025/2026";

  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(
    null
  );
  const [data, setData] = useState<TermDashboardResponse | null>(
    null
  );

  useEffect(() => {
    async function load() {
      // If key params are missing, don't call the API yet.
      if (!tenantId || !teacherUserId || !classroomId) {
        setFetchState("idle");
        return;
      }

      try {
        setFetchState("loading");
        setErrorMessage(null);

        const params = new URLSearchParams({
          tenantId,
          teacherUserId,
          classroomId,
          term,
          academicYear,
        });

        const res = await fetch(
          `/api/teacher/assessment/term-dashboard?${params.toString()}`
        );

        if (!res.ok) {
          const text = await res.text();
          console.error(
            "[TeacherTermDashboardPage] HTTP error",
            res.status,
            text
          );
          setFetchState("error");
          setErrorMessage(
            `Server returned HTTP ${res.status}. Please check the URL parameters.`
          );
          return;
        }

        const json = (await res.json()) as
          | TermDashboardResponse
          | { ok: false; error: string };

        if (!("ok" in json) || json.ok !== true) {
          const msg =
            "error" in json && typeof json.error === "string"
              ? json.error
              : "Failed to load term dashboard.";
          setFetchState("error");
          setErrorMessage(msg);
          return;
        }

        setData(json);
        setFetchState("loaded");
      } catch (err) {
        console.error(
          "[TeacherTermDashboardPage] error loading data",
          err
        );
        setFetchState("error");
        setErrorMessage(
          "Something went wrong while loading the dashboard. Please try again."
        );
      }
    }

    load();
  }, [tenantId, teacherUserId, classroomId, term, academicYear]);

  const hasLearners = data && data.learners.length > 0;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              Term Assessment Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Per-learner continuous assessment summary for your class,
              with GES grading bands and remarks.
            </p>
          </div>
          <div className="text-xs text-right text-slate-500 space-y-1">
            <div>
              Term:{" "}
              <span className="font-medium">{term}</span>
            </div>
            <div>
              Academic year:{" "}
              <span className="font-medium">{academicYear}</span>
            </div>
            {data && (
              <div>
                Classroom:{" "}
                <span className="font-medium">
                  {data.classroom.name ||
                    data.classroom.grade ||
                    data.classroom.id}
                  {data.classroom.arm
                    ? ` (${data.classroom.arm})`
                    : ""}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* If key params missing, show guidance */}
        {(!tenantId || !teacherUserId || !classroomId) && (
          <section className="mb-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-xs sm:text-sm text-slate-600">
            <p>
              To use this page, open it with the required parameters in
              the URL, for example:
            </p>
            <pre className="mt-2 overflow-auto rounded bg-slate-900 p-2 text-[11px] text-slate-50">
              {`/teacher/assessment/term-dashboard?tenantId=YOUR_TENANT_ID
  &teacherUserId=YOUR_TEACHER_USER_ID
  &classroomId=YOUR_CLASSROOM_ID
  &term=1st%20Term
  &academicYear=2025/2026`}
            </pre>
            <p className="mt-2 text-[11px] text-slate-500">
              Later, this will be linked directly from the teacher
              dashboard or class selection, so you won&apos;t need to
              paste IDs manually.
            </p>
          </section>
        )}

        {/* Error state */}
        {fetchState === "error" && errorMessage && (
          <section className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-700">
            {errorMessage}
          </section>
        )}

        {/* Loading state */}
        {fetchState === "loading" && (
          <section className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs sm:text-sm text-slate-600">
            Loading term dashboard…
          </section>
        )}

        {/* When data is loaded */}
        {fetchState === "loaded" && data && (
          <section className="space-y-5">
            {/* Class average summary */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                Class summary
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Overall continuous assessment performance across all
                learners with recorded scores.
              </p>

              <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 px-3 py-3">
                  <div className="text-[11px] text-slate-500">
                    Learners in class
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {data.learners.length}
                  </div>
                </div>

                <div className="rounded-lg bg-indigo-50 px-3 py-3">
                  <div className="text-[11px] text-indigo-700">
                    Class average (%)
                  </div>
                  <div className="mt-1 text-lg font-semibold text-indigo-900">
                    {data.classAverage.percentage != null
                      ? `${data.classAverage.percentage.toFixed(2)}%`
                      : "No records yet"}
                  </div>
                  <div className="mt-1 text-[11px] text-indigo-700">
                    GES grade:{" "}
                    <span className="font-semibold">
                      {data.classAverage.grade}
                    </span>{" "}
                    •{" "}
                    <span className="font-semibold">
                      {data.classAverage.remark}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg bg-emerald-50 px-3 py-3">
                  <div className="text-[11px] text-emerald-700">
                    Total CA load (class)
                  </div>
                  <div className="mt-1 text-lg font-semibold text-emerald-900">
                    {data.classAverage.totalMax.toFixed(2)}
                  </div>
                  <div className="mt-1 text-[11px] text-emerald-700">
                    Total score achieved:{" "}
                    {data.classAverage.totalScore.toFixed(2)}
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-slate-500">
                These figures are based on all recorded assessment
                scores for this class, term and academic year. As
                teachers record more marks, this dashboard will update.
              </p>
            </div>

            {/* Learner table */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                Learner breakdown
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Per-learner continuous assessment summary: number of
                CA items, total score, percentage, and GES grade +
                remark.
              </p>

              {!hasLearners && (
                <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-xs text-slate-600">
                  No learners found in this classroom yet. Once
                  learners are enrolled and CA scores are recorded,
                  they will appear here.
                </div>
              )}

              {hasLearners && (
                <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-slate-100 text-xs">
                  <table className="min-w-full border-separate border-spacing-0 text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                          Learner
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">
                          Items
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                          Total score
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                          Total max
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                          Percentage
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">
                          GES grade
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                          Remark
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.learners.map((l, idx) => {
                        const zebra =
                          idx % 2 === 1 ? "bg-slate-50/60" : "bg-white";
                        const isVeryLow = l.grade >= 7;
                        const isExcellent = l.grade === 1;

                        return (
                          <tr key={l.studentId} className={zebra}>
                            <td className="border-b border-slate-100 px-3 py-1.5 align-top text-slate-900">
                              <div className="font-medium">
                                {l.fullName}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {l.guardianPhone
                                  ? `Guardian: ${l.guardianPhone}`
                                  : ""}
                              </div>
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-center align-top text-slate-800">
                              {l.itemsCount}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-right align-top text-slate-800">
                              {l.totalScore.toFixed(2)}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-right align-top text-slate-800">
                              {l.totalMax.toFixed(2)}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-right align-top text-slate-800">
                              {l.percentage != null
                                ? `${l.percentage.toFixed(2)}%`
                                : "—"}
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
                            <td className="border-b border-slate-100 px-3 py-1.5 align-top text-slate-800">
                              {l.remark}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Optional debug section for now */}
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-[11px] text-slate-500">
              <div className="mb-1 font-semibold">
                Developer debug (can be removed later)
              </div>
              <pre className="max-h-64 overflow-auto rounded bg-slate-900 p-2 text-[10px] text-slate-50">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          </section>
        )}
      </div>
    </main>
  );
};

export default TeacherTermDashboardPage;
