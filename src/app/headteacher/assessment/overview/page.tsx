"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type ClassBandSummary = {
  grade: number;
  label: string;
  minPercent: number;
  maxPercent: number;
  learnersCount: number;
};

type ClassOverview = {
  classroomId: string;
  classroomName: string;
  grade?: string | null;
  arm?: string | null;
  learnersCount: number;
  itemsCount: number;
  averagePercent: number | null;
  // We no longer rely on bands from this API; we load them via remark-summary
  bands?: ClassBandSummary[];
};

type HeadteacherAssessmentOverviewResponse = {
  ok: boolean;
  context: {
    tenantId: string;
    term: string;
    academicYear: string;
  };
  classes: ClassOverview[];
};

type RemarkSummaryResponse = {
  ok: boolean;
  context: {
    tenantId: string;
    classroomId: string;
    term: string;
    academicYear: string;
  };
  totalLearnersEvaluated: number;
  bands: ClassBandSummary[];
};

const DEFAULT_TERM = "1st Term";
const DEFAULT_YEAR = "2025/2026";

function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "0";
  return value.toLocaleString("en-US");
}

function bandOrder(band: ClassBandSummary): number {
  // Primary ordering by grade 1–9; fallback by minPercent descending
  if (typeof band.grade === "number") return band.grade;
  return 100 - (band.minPercent ?? 0);
}

const HeadteacherAssessmentOverviewPage: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tenantId =
    searchParams.get("tenantId") ||
    process.env.NEXT_PUBLIC_DEMO_TENANT_ID ||
    "cmhhnghn00008vcpgp3fl07fl";

  const initialTerm = searchParams.get("term") || DEFAULT_TERM;
  const initialYear = searchParams.get("academicYear") || DEFAULT_YEAR;

  const [term, setTerm] = useState(initialTerm);
  const [academicYear, setAcademicYear] = useState(initialYear);

  const [overview, setOverview] =
    useState<HeadteacherAssessmentOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(
    null
  );

  // remark-summary cache: classroomId -> bands
  const [remarkBandsByClassroom, setRemarkBandsByClassroom] = useState<
    Record<string, ClassBandSummary[]>
  >({});
  const [remarkLoadingClassId, setRemarkLoadingClassId] = useState<string | null>(
    null
  );
  const [remarkError, setRemarkError] = useState<string | null>(null);

  const classes: ClassOverview[] = overview?.classes ?? [];

  const selectedClass = useMemo(() => {
    if (!classes.length) return null;
    if (selectedClassroomId) {
      const found = classes.find((c) => c.classroomId === selectedClassroomId);
      if (found) return found;
    }
    return classes[0];
  }, [classes, selectedClassroomId]);

  // Keep URL in sync when term/year changes (for bookmarking/sharing)
  useEffect(() => {
    const params = new URLSearchParams();
    if (tenantId) params.set("tenantId", tenantId);
    if (term) params.set("term", term);
    if (academicYear) params.set("academicYear", academicYear);
    router.replace(`/headteacher/assessment/overview?${params.toString()}`);
  }, [tenantId, term, academicYear, router]);

  async function loadRemarkSummaryForClass(
    tenantIdValue: string,
    classroomId: string,
    termValue: string,
    yearValue: string
  ) {
    if (!tenantIdValue || !classroomId) return;

    setRemarkError(null);
    setRemarkLoadingClassId(classroomId);

    try {
      const params = new URLSearchParams({
        tenantId: tenantIdValue,
        classroomId,
        term: termValue,
        academicYear: yearValue,
      });

      const url = `/api/teacher/assessment/remark-summary?${params.toString()}`;
      const res = await fetch(url);
      const text = await res.text();

      if (!res.ok) {
        console.error(
          "[HeadteacherAssessmentOverview] remark-summary HTTP error",
          res.status,
          text
        );
        setRemarkError(
          "Failed to load remark-band summary for this class. Please try again later."
        );
        setRemarkBandsByClassroom((prev) => ({
          ...prev,
          [classroomId]: [],
        }));
        return;
      }

      let data: RemarkSummaryResponse | null = null;
      try {
        data = JSON.parse(text);
      } catch (err) {
        console.error(
          "[HeadteacherAssessmentOverview] remark-summary JSON parse error",
          err,
          text
        );
        setRemarkError("Failed to read remark-band data from server.");
        setRemarkBandsByClassroom((prev) => ({
          ...prev,
          [classroomId]: [],
        }));
        return;
      }

      if (!data?.ok) {
        console.error(
          "[HeadteacherAssessmentOverview] remark-summary ok:false",
          data
        );
        setRemarkError(
          "Server returned an error while loading remark-band summary."
        );
        setRemarkBandsByClassroom((prev) => ({
          ...prev,
          [classroomId]: [],
        }));
        return;
      }

      setRemarkBandsByClassroom((prev) => ({
        ...prev,
        [classroomId]: Array.isArray(data?.bands) ? data.bands : [],
      }));
    } catch (err) {
      console.error(
        "[HeadteacherAssessmentOverview] remark-summary network error",
        err
      );
      setRemarkError("Network error while loading remark-band summary.");
      setRemarkBandsByClassroom((prev) => ({
        ...prev,
        [classroomId]: [],
      }));
    } finally {
      setRemarkLoadingClassId(null);
    }
  }

  async function loadOverview(
    tenantIdValue: string,
    termValue: string,
    yearValue: string
  ) {
    if (!tenantIdValue) {
      setLoadError("Tenant ID is missing.");
      setOverview(null);
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      const params = new URLSearchParams({
        tenantId: tenantIdValue,
        term: termValue,
        academicYear: yearValue,
      });

      const url = `/api/headteacher/assessment/overview?${params.toString()}`;
      const res = await fetch(url);

      const text = await res.text();

      if (!res.ok) {
        console.error(
          "[HeadteacherAssessmentOverview] HTTP error",
          res.status,
          text
        );
        setLoadError("Unexpected server error while loading overview.");
        setOverview(null);
        return;
      }

      let data: HeadteacherAssessmentOverviewResponse | null = null;
      try {
        data = JSON.parse(text);
      } catch (err) {
        console.error(
          "[HeadteacherAssessmentOverview] Failed to parse JSON",
          err,
          text
        );
        setLoadError("Failed to parse overview response from server.");
        setOverview(null);
        return;
      }

      if (!data?.ok) {
        console.error(
          "[HeadteacherAssessmentOverview] Response ok:false",
          data
        );
        setLoadError("Server returned an error while loading overview.");
        setOverview(null);
        return;
      }

      setOverview(data);

      if (data.classes && data.classes.length > 0) {
        const firstClass = data.classes[0];
        setSelectedClassroomId(firstClass.classroomId);

        // Preload remark summary for the first class
        await loadRemarkSummaryForClass(
          tenantIdValue,
          firstClass.classroomId,
          termValue,
          yearValue
        );
      } else {
        setSelectedClassroomId(null);
      }
    } catch (err) {
      console.error(
        "[HeadteacherAssessmentOverview] Network or unexpected error",
        err
      );
      setLoadError("Network error while loading overview data.");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }

  // Initial load + whenever tenantId/term/year changes
  useEffect(() => {
    if (!tenantId) return;
    loadOverview(tenantId, term, academicYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, term, academicYear]);

  const totalClasses = classes.length;
  const totalLearners = useMemo(
    () => classes.reduce((sum, c) => sum + (c.learnersCount || 0), 0),
    [classes]
  );
  const totalItems = useMemo(
    () => classes.reduce((sum, c) => sum + (c.itemsCount || 0), 0),
    [classes]
  );
  const averageAcrossSchool = useMemo(() => {
    if (!classes.length) return null;
    const sum = classes.reduce(
      (acc, c) => acc + (c.averagePercent ?? 0),
      0
    );
    return sum / classes.length;
  }, [classes]);

  const selectedBands: ClassBandSummary[] = useMemo(() => {
    if (!selectedClassroomId) return [];
    return remarkBandsByClassroom[selectedClassroomId] ?? [];
  }, [selectedClassroomId, remarkBandsByClassroom]);

  const isRemarkLoading =
    selectedClass &&
    remarkLoadingClassId === selectedClass.classroomId;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-6 space-y-5">
        {/* Top bar */}
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Headteacher • Assessment Overview
            </div>
            <div className="text-sm font-semibold text-slate-900">
              Whole-School Continuous Assessment Snapshot
            </div>
            <div className="text-[11px] text-slate-600">
              Term:{" "}
              <span className="font-medium">
                {term || overview?.context.term}
              </span>{" "}
              • Academic Year:{" "}
              <span className="font-medium">
                {academicYear || overview?.context.academicYear}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <div className="space-y-1">
                <label className="block text-[10px] font-medium text-slate-500">
                  Term
                </label>
                <select
                  className="rounded-md border border-slate-300 px-2 py-1 text-[11px]"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                >
                  <option value="1st Term">1st Term</option>
                  <option value="2nd Term">2nd Term</option>
                  <option value="3rd Term">3rd Term</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-medium text-slate-500">
                  Academic Year
                </label>
                <input
                  className="w-28 rounded-md border border-slate-300 px-2 py-1 text-[11px]"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  placeholder="2025/2026"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => loadOverview(tenantId, term, academicYear)}
              disabled={loading}
              className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Refreshing…" : "Refresh data"}
            </button>
          </div>
        </div>

        {/* Error state (no crash if API fails) */}
        {loadError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            {loadError} Please check that the API route is working correctly or
            contact the system administrator.
          </div>
        )}

        {/* Empty state */}
        {!loading && !loadError && !classes.length && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs text-slate-600">
            No assessment overview data yet for this term. Once teachers record
            continuous assessment scores and class averages are computed, a
            whole-school snapshot will appear here.
          </div>
        )}

        {/* Main content when we have classes */}
        {classes.length > 0 && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)]">
            {/* LEFT: High-level metrics + class list */}
            <div className="space-y-3">
              {/* High-level cards */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs">
                  <div className="text-[11px] font-medium text-slate-500">
                    Classes reporting
                  </div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">
                    {formatNumber(totalClasses)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    With at least one assessment captured
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs">
                  <div className="text-[11px] font-medium text-slate-500">
                    Learners covered
                  </div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">
                    {formatNumber(totalLearners)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    Across all reporting classes
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs">
                  <div className="text-[11px] font-medium text-slate-500">
                    Schoolwide average
                  </div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">
                    {formatPercent(averageAcrossSchool)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    Mean of class averages
                  </div>
                </div>
              </div>

              {/* Class list */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs font-semibold text-slate-900">
                      Classes (overview)
                    </h2>
                    <p className="text-[11px] text-slate-600">
                      Select a class to see its CA distribution and remark bands.
                    </p>
                  </div>
                  <span className="min-w-8 rounded-full bg-slate-100 px-2 py-0.5 text-center text-[10px] font-medium text-slate-700">
                    {classes.length} class{classes.length === 1 ? "" : "es"}
                  </span>
                </div>

                <div className="max-h-[340px] overflow-auto">
                  <ul className="space-y-1.5">
                    {classes.map((cls) => {
                      const isSelected =
                        selectedClass?.classroomId === cls.classroomId;
                      return (
                        <li key={cls.classroomId}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedClassroomId(cls.classroomId);
                              if (
                                !remarkBandsByClassroom[cls.classroomId]
                              ) {
                                loadRemarkSummaryForClass(
                                  tenantId,
                                  cls.classroomId,
                                  term,
                                  academicYear
                                );
                              }
                            }}
                            className={[
                              "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition",
                              isSelected
                                ? "border-blue-500 bg-blue-50/80"
                                : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/40",
                            ].join(" ")}
                          >
                            <div className="space-y-0.5">
                              <div className="text-xs font-semibold text-slate-900">
                                {cls.classroomName}
                              </div>
                              <div className="text-[11px] text-slate-600">
                                Learners: {formatNumber(cls.learnersCount)} •
                                Items: {formatNumber(cls.itemsCount)}
                              </div>
                            </div>
                            <div className="text-right text-[11px] text-slate-600">
                              <div className="font-semibold text-slate-900">
                                {formatPercent(cls.averagePercent)}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                Class average
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>

            {/* RIGHT: Selected class details */}
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                {!selectedClass ? (
                  <div className="py-6 text-center text-[11px] text-slate-600">
                    Select a class on the left to view its assessment summary.
                  </div>
                ) : (
                  <>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-slate-900">
                          {selectedClass.classroomName}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          Learners:{" "}
                          <span className="font-medium">
                            {formatNumber(selectedClass.learnersCount)}
                          </span>{" "}
                          • Items:{" "}
                          <span className="font-medium">
                            {formatNumber(selectedClass.itemsCount)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] font-medium text-slate-500">
                          Class average
                        </div>
                        <div className="text-xl font-semibold text-slate-900">
                          {formatPercent(selectedClass.averagePercent)}
                        </div>
                      </div>
                    </div>

                    {/* Remark bands distribution */}
                    <div className="mt-2 space-y-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                        Learner distribution by remark band
                      </h3>

                      {isRemarkLoading ? (
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-[11px] text-slate-600">
                          Loading remark summary for this class…
                        </div>
                      ) : selectedBands.length === 0 ? (
                        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-[11px] text-slate-600">
                          No remark summary data yet for this class. Once term
                          totals are computed and remark bands are generated,
                          the WAEC-style bands (Excellent, Very Good, etc.) will
                          appear here.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {remarkError && (
                            <div className="rounded-md bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                              {remarkError}
                            </div>
                          )}
                          <div className="grid gap-1.5 md:grid-cols-2">
                            {selectedBands
                              .slice()
                              .sort((a, b) => bandOrder(a) - bandOrder(b))
                              .map((band) => (
                                <div
                                  key={band.grade}
                                  className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-[11px]"
                                >
                                  <div>
                                    <div className="font-semibold text-slate-900">
                                      {band.label}
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      {band.minPercent}–{band.maxPercent}%
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-semibold text-slate-900">
                                      {formatNumber(band.learnersCount)}
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      learners
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HeadteacherAssessmentOverviewPage;
