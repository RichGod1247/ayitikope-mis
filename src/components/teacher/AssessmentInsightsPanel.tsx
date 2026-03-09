"use client";

import React, { useEffect, useMemo, useState } from "react";

type StudentLite = {
  id: string;
  name: string;
};

type Props = {
  classroomId: string;
  term: string;
  academicYear: string;
  students: StudentLite[];
};

type ClassInsightResponse =
  | {
      ok: true;
      metrics: {
        classAveragePercent: number | null;
        teacherEffectivenessIndex: number | null;
        expectedAssessmentsCount: number;
        subjectAverages: Array<{
          subject: string;
          averagePercent: number | null;
          scoredRows: number;
        }>;
        weakIndicators: Array<{
          indicatorCode: string;
          averagePercent: number | null;
          scoredRows: number;
          linkedAssessments: number;
        }>;
        topMissingScores: Array<{
          studentId: string;
          studentName: string;
          missingCount: number;
          expectedCount: number;
        }>;
        topAbsentees: Array<{
          studentId: string;
          studentName: string;
          absentCount: number;
          lateCount: number;
          presentCount: number;
          excusedCount: number;
          attendancePercent: number | null;
        }>;
        topHealthFlags: Array<{
          studentId: string;
          studentName: string;
          healthRecords: number;
          feverFlags: number;
        }>;
        coverage: {
          deliveryCoveragePercent: number | null;
          assessmentLinkCoveragePercent: number | null;
          scoringCoveragePercent: number | null;
        };
      };
      actions: Array<{
        code: string;
        priority: "HIGH" | "MEDIUM" | "LOW";
        message: string;
        because: string[];
      }>;
    }
  | { ok: false; error: string };

type StudentInsightResponse =
  | {
      ok: true;
      swot: {
        studentId: string;
        studentName: string;
        overallPercent: number | null;
        strengths: string[];
        weaknesses: string[];
        opportunities: string[];
        threats: string[];
        metrics: {
          expectedAssessmentsCount: number;
          scoredAssessmentsCount: number;
          missingAssessmentsCount: number;
          attendancePercent: number | null;
          absentCount: number;
          lateCount: number;
          healthRecords: number;
          feverFlags: number;
        };
      };
    }
  | { ok: false; error: string };

function pct(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}

function priorityChip(priority: "HIGH" | "MEDIUM" | "LOW") {
  const cls =
    priority === "HIGH"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : priority === "MEDIUM"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${cls}`}>
      {priority}
    </span>
  );
}

export default function AssessmentInsightsPanel({
  classroomId,
  term,
  academicYear,
  students,
}: Props) {
  const [classData, setClassData] = useState<ClassInsightResponse | null>(null);
  const [classLoading, setClassLoading] = useState(false);

  const [selectedStudentId, setSelectedStudentId] = useState<string>(students[0]?.id ?? "");
  const [studentData, setStudentData] = useState<StudentInsightResponse | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);

  useEffect(() => {
    if (!students.length) {
      setSelectedStudentId("");
      return;
    }
    if (!selectedStudentId || !students.some((s) => s.id === selectedStudentId)) {
      setSelectedStudentId(students[0].id);
    }
  }, [students, selectedStudentId]);

  useEffect(() => {
    if (!classroomId) {
      setClassData(null);
      return;
    }

    let cancelled = false;

    (async () => {
      setClassLoading(true);
      try {
        const sp = new URLSearchParams({
          classroomId,
          term,
          academicYear,
        });

        const res = await fetch(`/api/teacher/insights/class?${sp.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as ClassInsightResponse | null;
        if (cancelled) return;

        setClassData(
          json ?? { ok: false, error: `Failed to load class insights (HTTP ${res.status}).` }
        );
      } finally {
        if (!cancelled) setClassLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [classroomId, term, academicYear]);

  useEffect(() => {
    if (!classroomId || !selectedStudentId) {
      setStudentData(null);
      return;
    }

    let cancelled = false;

    (async () => {
      setStudentLoading(true);
      try {
        const sp = new URLSearchParams({
          classroomId,
          studentId: selectedStudentId,
          term,
          academicYear,
        });

        const res = await fetch(`/api/teacher/insights/student?${sp.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as StudentInsightResponse | null;
        if (cancelled) return;

        setStudentData(
          json ?? { ok: false, error: `Failed to load learner SWOT (HTTP ${res.status}).` }
        );
      } finally {
        if (!cancelled) setStudentLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [classroomId, selectedStudentId, term, academicYear]);

  const selectedStudentName = useMemo(
    () => students.find((s) => s.id === selectedStudentId)?.name ?? "Learner",
    [students, selectedStudentId]
  );

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-3 text-xs">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">AI co-tutor insights</div>
          <div className="text-[11px] text-slate-500">
            Uses performance, missing scores, attendance, and health signals to guide next action.
          </div>
        </div>

        {(classData as any)?.ok ? (
          <div className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700">
            Teacher effectiveness: {pct((classData as any).metrics.teacherEffectivenessIndex)}
          </div>
        ) : null}
      </div>

      {classLoading ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-slate-600">
          Loading class insights…
        </div>
      ) : classData && !classData.ok ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-amber-800">
          {classData.error}
        </div>
      ) : classData && classData.ok ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Class average" value={pct(classData.metrics.classAveragePercent)} />
            <MetricCard label="Scoring coverage" value={pct(classData.metrics.coverage.scoringCoveragePercent)} />
            <MetricCard label="Delivery coverage" value={pct(classData.metrics.coverage.deliveryCoveragePercent)} />
            <MetricCard
              label="Expected assessed items"
              value={String(classData.metrics.expectedAssessmentsCount)}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-3">
              <Section title="Priority teaching actions">
                {classData.actions.length ? (
                  classData.actions.map((a) => (
                    <div key={a.code} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-900">{a.code}</p>
                        {priorityChip(a.priority)}
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-slate-700">{a.message}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-600">No urgent actions right now.</p>
                )}
              </Section>

              <Section title="Weak indicators to reteach first">
                {classData.metrics.weakIndicators.length ? (
                  <div className="space-y-2">
                    {classData.metrics.weakIndicators.slice(0, 5).map((w) => (
                      <div key={w.indicatorCode} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">{w.indicatorCode}</span>
                          <span className="text-[11px] text-slate-700">{pct(w.averagePercent)}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {w.scoredRows} scored rows • {w.linkedAssessments} linked assessments
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-600">
                    No weak indicator signal yet. Link assessments to delivered lessons to activate this fully.
                  </p>
                )}
              </Section>

              <Section title="Subject averages">
                {classData.metrics.subjectAverages.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {classData.metrics.subjectAverages.slice(0, 6).map((s) => (
                      <div key={s.subject} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="font-semibold text-slate-900">{s.subject}</div>
                        <div className="mt-1 text-[11px] text-slate-700">
                          Average: {pct(s.averagePercent)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-600">No subject distribution yet.</p>
                )}
              </Section>
            </div>

            <div className="space-y-3">
              <Section title="Learners missing scored work">
                {classData.metrics.topMissingScores.length ? (
                  <div className="space-y-2">
                    {classData.metrics.topMissingScores.slice(0, 5).map((x) => (
                      <div key={x.studentId} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="font-semibold text-slate-900">{x.studentName}</div>
                        <div className="mt-1 text-[11px] text-slate-600">
                          Missing {x.missingCount} of {x.expectedCount} expected scored items
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-600">No missing-score risk detected.</p>
                )}
              </Section>

              <Section title="Absence / lateness risk">
                {classData.metrics.topAbsentees.length ? (
                  <div className="space-y-2">
                    {classData.metrics.topAbsentees.slice(0, 5).map((x) => (
                      <div key={x.studentId} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="font-semibold text-slate-900">{x.studentName}</div>
                        <div className="mt-1 text-[11px] text-slate-600">
                          Absent {x.absentCount} • Late {x.lateCount} • Attendance {pct(x.attendancePercent)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-600">No attendance risk signal yet.</p>
                )}
              </Section>

              <Section title="Repeated health flags">
                {classData.metrics.topHealthFlags.length ? (
                  <div className="space-y-2">
                    {classData.metrics.topHealthFlags.slice(0, 5).map((x) => (
                      <div key={x.studentId} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="font-semibold text-slate-900">{x.studentName}</div>
                        <div className="mt-1 text-[11px] text-slate-600">
                          Health records {x.healthRecords} • Fever flags {x.feverFlags}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-600">No repeated health flag signal yet.</p>
                )}
              </Section>
            </div>
          </div>
        </>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Learner SWOT</div>
            <div className="text-[11px] text-slate-500">
              Individual learner diagnosis from the same class signals.
            </div>
          </div>

          <div className="w-full sm:w-72">
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3">
          {studentLoading ? (
            <div className="text-[11px] text-slate-600">Loading SWOT for {selectedStudentName}…</div>
          ) : studentData && !studentData.ok ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-amber-800">
              {studentData.error}
            </div>
          ) : studentData && studentData.ok ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-4">
                <MetricCard label="Overall" value={pct(studentData.swot.overallPercent)} />
                <MetricCard
                  label="Attendance"
                  value={pct(studentData.swot.metrics.attendancePercent)}
                />
                <MetricCard
                  label="Missing assessments"
                  value={String(studentData.swot.metrics.missingAssessmentsCount)}
                />
                <MetricCard
                  label="Fever flags"
                  value={String(studentData.swot.metrics.feverFlags)}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <SwotBox title="Strengths" items={studentData.swot.strengths} tone="emerald" />
                <SwotBox title="Weaknesses" items={studentData.swot.weaknesses} tone="rose" />
                <SwotBox title="Opportunities" items={studentData.swot.opportunities} tone="sky" />
                <SwotBox title="Threats" items={studentData.swot.threats} tone="amber" />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold text-slate-900">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function SwotBox({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "emerald" | "rose" | "sky" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50"
        : tone === "sky"
          ? "border-sky-200 bg-sky-50"
          : "border-amber-200 bg-amber-50";

  return (
    <div className={`rounded-xl border px-3 py-3 ${toneClass}`}>
      <div className="text-xs font-semibold text-slate-900">{title}</div>
      <ul className="mt-2 space-y-1 text-[11px] text-slate-700">
        {items.length ? (
          items.map((x, i) => <li key={`${title}-${i}`}>• {x}</li>)
        ) : (
          <li>• No strong signal yet.</li>
        )}
      </ul>
    </div>
  );
}