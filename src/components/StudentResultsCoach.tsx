// src/components/StudentResultsCoach.tsx
"use client";

import React from "react";
import {
  buildStudentResultsCoach,
  SubjectSummaryForCoach,
} from "@/lib/resultsCoach";

export type StudentResultsCoachProps = {
  learnerName?: string;
  term: string;
  academicYear: string;
  overallPercentage: number; // 0–100
  subjects: SubjectSummaryForCoach[];
};

export function StudentResultsCoach(props: StudentResultsCoachProps) {
  const coach = buildStudentResultsCoach({
    learnerName: props.learnerName,
    term: props.term,
    academicYear: props.academicYear,
    overallPercentage: props.overallPercentage,
    subjects: props.subjects,
  });

  return (
    <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-xs text-slate-800 shadow-sm sm:text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
          Term Performance Coach
        </div>
        <div className="text-[11px] font-medium text-emerald-800">
          Band {coach.band} · {coach.bandLabel}
        </div>
      </div>

      <div className="mt-2 text-[13px] font-semibold text-slate-900 sm:text-sm">
        {coach.headline}
      </div>

      <p className="mt-1 text-[11px] text-slate-700 sm:text-xs">
        {coach.encouragement}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {/* Strengths */}
        <div className="rounded-xl bg-white/70 px-3 py-2">
          <div className="text-[11px] font-semibold text-emerald-800">
            Key strengths
          </div>
          {coach.strengths.length === 0 ? (
            <p className="mt-1 text-[11px] text-slate-600">
              No clear strong subjects yet — this is an opportunity to
              build one.
            </p>
          ) : (
            <ul className="mt-1 list-disc pl-4 text-[11px] text-slate-700">
              {coach.strengths.map((s, idx) => (
                <li key={idx}>{s}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Focus areas */}
        <div className="rounded-xl bg-white/70 px-3 py-2">
          <div className="text-[11px] font-semibold text-amber-800">
            Focus areas
          </div>
          {coach.focusAreas.length === 0 ? (
            <p className="mt-1 text-[11px] text-slate-600">
              No urgent weak subjects. Maintain your effort across all
              subjects.
            </p>
          ) : (
            <ul className="mt-1 list-disc pl-4 text-[11px] text-slate-700">
              {coach.focusAreas.map((s, idx) => (
                <li key={idx}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Next steps */}
      <div className="mt-3 rounded-xl bg-white/90 px-3 py-2">
        <div className="text-[11px] font-semibold text-slate-900">
          Simple next steps
        </div>
        <ul className="mt-1 list-disc pl-4 text-[11px] text-slate-700">
          {coach.nextSteps.map((step, idx) => (
            <li key={idx}>{step}</li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-slate-500">
          These are gentle guides, not punishments. The aim is steady
          growth, not fear.
        </p>
      </div>

      <div className="mt-2 text-[10px] text-slate-500">
        Term: {props.term}, {props.academicYear}
      </div>
    </section>
  );
}
