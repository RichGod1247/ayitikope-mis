// src/components/ParentPortalClient.tsx
"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

type SafeStudent = {
  id: string;
  firstName: string;
  lastName: string;
};

type Props = {
  initialStudents: SafeStudent[];
};

type ResultsReleaseInfo = {
  released: boolean;
  scope?: "SCHOOL" | "CLASSROOM";
  scopeKey?: string;
  releasedAt?: string | null;
};

type ParentChildInsightsOk = {
  ok: true;
  term: string;
  academicYear: string;

  children: Array<{
    id: string;
    name: string;
    classroomId: string | null;
  }>;

  selected: {
    id: string;
    name: string;
    classroomId: string | null;
  };

  report: ResultsReleaseInfo;

  attendance: {
    window: { start: string; end: string };
    present: number;
    absent: number;
    late: number;
    excused: number;
    attendancePercent: number | null;
  };

  health: {
    window: { start: string; end: string };
    healthRecords: number;
    feverFlags: number;
    feverThreshold: number;
  };

  performance: {
    overallPercent: number | null;
    subjects: Array<{ subject: string; percent: number | null }>;
    expectedAssessmentsCount: number;
    scoredAssessmentsCount: number;
    missingAssessmentsCount: number;
    locked?: boolean;
  };

  insights: {
    strengths: string[];
    weaknesses: string[];
    improvementFocus: string;
    risks: string[];
    locked?: boolean;
  };

  message?: string;
};

type ParentChildInsightsResponse =
  | ParentChildInsightsOk
  | { ok: false; error: string };

function pct(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}

function buildPrintHref(args: { studentId: string; term: string; academicYear: string }) {
  const sp = new URLSearchParams({
    studentId: args.studentId,
    term: args.term,
    academicYear: args.academicYear,
  });
  return `/parent/report/print?${sp.toString()}`;
}

function shellCardClass() {
  return "rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
}

function innerPanelClass() {
  return "rounded-2xl border border-white/10 bg-[#07111F]/80";
}

export function ParentPortalClient({ initialStudents }: Props) {
  const students = Array.isArray(initialStudents) ? initialStudents : [];
  const [selectedId, setSelectedId] = useState<string>(students[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ParentChildInsightsResponse | null>(null);

  useEffect(() => {
    if (!students.length) {
      setSelectedId("");
      setData(null);
      return;
    }
    if (!selectedId || !students.some((s) => s.id === selectedId)) {
      setSelectedId(students[0].id);
    }
  }, [students, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setData(null);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({ studentId: selectedId });
        const res = await fetch(`/api/parent/insights/child?${sp.toString()}`, {
          cache: "no-store",
        });

        const json = (await res.json().catch(() => null)) as ParentChildInsightsResponse | null;
        if (cancelled) return;

        setData(json ?? { ok: false, error: `Failed to load child insights (HTTP ${res.status}).` });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selectedLabel = useMemo(() => {
    const s = students.find((x) => x.id === selectedId);
    if (!s) return "Select learner";
    return `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || "Select learner";
  }, [students, selectedId]);

  const reportReleased = data?.ok ? (data as ParentChildInsightsOk).report?.released === true : false;

  const printHref = useMemo(() => {
    if (!data?.ok) return "#";
    if (!reportReleased) return "#";
    return buildPrintHref({
      studentId: (data as ParentChildInsightsOk).selected.id,
      term: (data as ParentChildInsightsOk).term,
      academicYear: (data as ParentChildInsightsOk).academicYear,
    });
  }, [data, reportReleased]);

  return (
    <section className="space-y-4 text-[#F7F4ED]">
      <div className={`${shellCardClass()} space-y-3 px-4 py-4 sm:px-5`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-[#F7F4ED]">Choose learner</h2>
            <p className="max-w-xl text-[11px] leading-5 text-[#AEB6C4]">
              Parent copilot uses attendance, health, and released performance together — not scores alone.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-xs text-[#F7F4ED] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/25 sm:w-64"
              aria-label="Select learner"
              disabled={students.length === 0}
            >
              {students.length === 0 ? (
                <option value="">No learners found</option>
              ) : (
                students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {students.length === 0 ? (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-400/12 px-3 py-3 text-[11px] text-amber-100">
            No learners are linked to this phone number in the school records yet.
          </div>
        ) : (
          <p className="text-[11px] text-[#8F98A8]">
            Viewing: <span className="font-semibold text-[#F7F4ED]">{selectedLabel}</span>
          </p>
        )}

        {data?.ok ? (
          <div className={`${innerPanelClass()} px-3 py-3`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[11px] font-semibold text-[#F7F4ED]">Term report</div>
                <div className="text-[11px] text-[#AEB6C4]">
                  {(data as ParentChildInsightsOk).term} • {(data as ParentChildInsightsOk).academicYear}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                    reportReleased
                      ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-100"
                      : "border-amber-300/20 bg-amber-400/12 text-amber-100"
                  }`}
                >
                  {reportReleased ? "Released" : "Locked"}
                </span>

                <a
                  href={printHref}
                  className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-[11px] font-semibold transition ${
                    reportReleased
                      ? "border-[#D4AF37]/30 bg-[#D4AF37]/12 text-[#F7F4ED] hover:bg-[#D4AF37]/18"
                      : "pointer-events-none border-white/10 bg-white/5 text-[#738095]"
                  }`}
                >
                  Open report / Print
                </a>
              </div>
            </div>

            {!reportReleased ? (
              <div className="mt-2 rounded-xl border border-amber-300/20 bg-amber-400/12 px-3 py-2 text-[11px] text-amber-100">
                Report is not released yet by the headteacher. Attendance and health remain visible, but performance stays locked.
              </div>
            ) : (data as ParentChildInsightsOk).report?.releasedAt ? (
              <div className="mt-2 text-[11px] text-[#AEB6C4]">
                Released at:{" "}
                <span className="font-semibold text-[#F7F4ED]">
                  {new Date((data as ParentChildInsightsOk).report.releasedAt as string).toLocaleString()}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[#1B66D1]/20 bg-[#1B66D1]/12 px-4 py-3 text-[11px] text-sky-100 shadow-[0_12px_36px_rgba(0,0,0,0.16)]">
          Loading child insights…
        </div>
      ) : data && !data.ok ? (
        <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-[11px] text-rose-100 shadow-[0_12px_36px_rgba(0,0,0,0.16)]">
          {data.error}
        </div>
      ) : data && data.ok ? (
        <div className="space-y-4">
          <div className={`${shellCardClass()} px-4 py-4`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#AEB6C4]">Selected learner</p>
                <p className="mt-1 text-lg font-semibold text-[#F7F4ED]">{data.selected.name}</p>
                <p className="mt-1 text-[11px] text-[#8F98A8]">
                  {data.term} • {data.academicYear}
                </p>
              </div>

              <div className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/12 px-3 py-1 text-[11px] font-semibold text-[#F7F4ED]">
                Overall performance: {reportReleased ? pct(data.performance.overallPercent) : "Locked"}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card title="Attendance" tone="sky">
              <p className="text-sm font-semibold text-[#F7F4ED]">{pct(data.attendance.attendancePercent)}</p>
              <p className="mt-1 text-[11px] text-[#C9CDD6]">
                Present {data.attendance.present} • Absent {data.attendance.absent} • Late {data.attendance.late}
              </p>
            </Card>

            <Card title="Health" tone="amber">
              <p className="text-sm font-semibold text-[#F7F4ED]">{data.health.healthRecords} records</p>
              <p className="mt-1 text-[11px] text-[#C9CDD6]">
                Fever flags {data.health.feverFlags} • Threshold {data.health.feverThreshold}°C
              </p>
            </Card>

            <Card title="Assessment coverage" tone="emerald">
              {reportReleased ? (
                <>
                  <p className="text-sm font-semibold text-[#F7F4ED]">
                    {data.performance.scoredAssessmentsCount} / {data.performance.expectedAssessmentsCount}
                  </p>
                  <p className="mt-1 text-[11px] text-[#C9CDD6]">
                    Missing assessments {data.performance.missingAssessmentsCount}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-[#F7F4ED]">Locked</p>
                  <p className="mt-1 text-[11px] text-[#C9CDD6]">Visible after results are released.</p>
                </>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className={`${shellCardClass()} px-4 py-4`}>
              <p className="text-sm font-semibold text-[#F7F4ED]">Subject performance</p>
              <div className="mt-3 space-y-2">
                {!reportReleased ? (
                  <p className="text-[11px] text-[#AEB6C4]">
                    Performance is locked until the headteacher releases results for this term.
                  </p>
                ) : data.performance.subjects.length ? (
                  data.performance.subjects.map((s) => (
                    <div key={s.subject} className={`${innerPanelClass()} px-3 py-2`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[#F7F4ED]">{s.subject}</span>
                        <span className="text-[11px] text-[#C9CDD6]">{pct(s.percent)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-[#AEB6C4]">No subject performance signal yet.</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <SwotCard title="Strengths" tone="emerald" items={reportReleased ? data.insights.strengths : []} locked={!reportReleased} />
              <SwotCard title="Weaknesses" tone="rose" items={reportReleased ? data.insights.weaknesses : []} locked={!reportReleased} />
              <SwotCard title="Risks" tone="amber" items={data.insights.risks} locked={false} />
            </div>
          </div>

          <div className="rounded-2xl border border-[#1B66D1]/20 bg-[#1B66D1]/12 px-4 py-4 shadow-[0_12px_36px_rgba(0,0,0,0.16)]">
            <p className="text-sm font-semibold text-[#F7F4ED]">Parent action focus</p>
            <p className="mt-2 text-sm leading-7 text-[#D7DCE5]">
              {reportReleased
                ? data.insights.improvementFocus
                : "Results are not released yet. For now: protect attendance, sleep, and daily revision habits. When released, use the report to target weak subjects calmly."}
            </p>
          </div>

          {data.message ? (
            <div className={`${shellCardClass()} px-4 py-3 text-[11px] text-[#C9CDD6]`}>
              {data.message}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Card({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "sky" | "amber" | "emerald";
  children: ReactNode;
}) {
  const cls =
    tone === "sky"
      ? "border-sky-300/20 bg-sky-400/12"
      : tone === "amber"
      ? "border-amber-300/20 bg-amber-400/12"
      : "border-emerald-300/20 bg-emerald-400/12";

  return (
    <div className={`rounded-2xl border px-4 py-4 shadow-[0_12px_36px_rgba(0,0,0,0.16)] ${cls}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#D7DCE5]">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function SwotCard({
  title,
  tone,
  items,
  locked,
}: {
  title: string;
  tone: "emerald" | "rose" | "amber";
  items: string[];
  locked: boolean;
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-300/20 bg-emerald-400/12"
      : tone === "rose"
      ? "border-rose-300/20 bg-rose-400/12"
      : "border-amber-300/20 bg-amber-400/12";

  return (
    <div className={`rounded-2xl border px-4 py-4 shadow-[0_12px_36px_rgba(0,0,0,0.16)] ${cls}`}>
      <p className="text-sm font-semibold text-[#F7F4ED]">{title}</p>
      <ul className="mt-2 space-y-1 text-[11px] leading-5 text-[#D7DCE5]">
        {locked ? (
          <li>• Locked until results are released.</li>
        ) : items.length ? (
          items.map((x, i) => <li key={`${title}-${i}`}>• {x}</li>)
        ) : (
          <li>• No strong signal yet.</li>
        )}
      </ul>
    </div>
  );
}