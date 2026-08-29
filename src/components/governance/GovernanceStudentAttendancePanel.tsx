"use client";

import { useEffect, useState } from "react";

type EvidenceState =
  | "COMPLETE"
  | "PARTIAL"
  | "NONE"
  | "HOLIDAY"
  | "NO_OPERATIONAL_CLASSES";

type AttendanceWeek = {
  weekNumber: number;
  presentPct: number | null;
  present: number;
  marked: number;
  current: boolean;
};

type SchoolRow = {
  tenantId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector: string;
  circuitId: string | null;
  circuitName: string | null;
  population: number;
  present: number;
  absent: number;
  operationalClassrooms: number;
  officialClassrooms: number;
  holidayClassrooms: number;
  evidenceState: EvidenceState;
  termLabel: string | null;
  currentWeek: number | null;
  weeks: AttendanceWeek[];
};

type CircuitRow = {
  circuitId: string;
  circuitName: string;
  population: number;
  present: number;
  absent: number;
  operationalClassrooms: number;
  officialClassrooms: number;
  holidayClassrooms: number;
  evidenceState: EvidenceState;
};

type FollowUpRow = {
  id: string;
  name: string;
  circuitName: string | null;
  missingRegisters: number;
  openRegisters: number;
  unmarkedLearners: number;
  uncertifiedRegisters: number;
  absentLearners: number;
  reason: string;
};

type SchoolAttendanceResponse = {
  ok: true;
  attendance: {
    view: "SCHOOL";
    date: string;
    schools: SchoolRow[];
    schoolsNeedingFollowUp: FollowUpRow[];
  };
};

type CircuitAttendanceResponse = {
  ok: true;
  attendance: {
    view: "CIRCUIT";
    date: string;
    circuits: CircuitRow[];
    circuitsNeedingFollowUp: FollowUpRow[];
  };
};

type ErrorResponse = {
  ok?: false;
  error?: string;
  message?: string;
};

type Props = {
  endpoint: string;
  view: "SCHOOL" | "CIRCUIT";
};

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value: unknown) {
  return new Intl.NumberFormat("en-GH").format(numberValue(value));
}

function dailyValue(value: number, state: EvidenceState) {
  if (state === "NONE" || state === "NO_OPERATIONAL_CLASSES") return "—";
  return formatNumber(value);
}

function evidenceLabel(state: EvidenceState) {
  if (state === "COMPLETE") return "Official today";
  if (state === "PARTIAL") return "Partial official registers";
  if (state === "HOLIDAY") return "Holiday";
  if (state === "NO_OPERATIONAL_CLASSES") return "No active class register";
  return "Awaiting certified registers";
}

function evidenceClass(state: EvidenceState) {
  if (state === "COMPLETE") {
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }
  if (state === "HOLIDAY") {
    return "border-sky-300/25 bg-sky-400/10 text-sky-100";
  }
  if (state === "PARTIAL") {
    return "border-amber-300/25 bg-amber-400/10 text-amber-100";
  }
  return "border-white/10 bg-white/5 text-slate-300";
}

function DailyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
    </div>
  );
}

function FollowUpList({
  title,
  rows,
}: {
  title: string;
  rows: FollowUpRow[];
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/45 p-3.5 md:p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-slate-400">
            Highest attendance follow-up priority first.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
          {rows.length}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {rows.length ? (
          rows.map((row, index) => (
            <article
              key={row.id}
              className="flex items-start gap-3 rounded-xl border border-amber-300/15 bg-amber-400/[0.06] p-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-300/20 bg-amber-400/10 text-xs font-bold text-amber-100">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{row.name}</p>
                {row.circuitName && row.circuitName !== row.name ? (
                  <p className="mt-0.5 text-[11px] text-slate-400">{row.circuitName}</p>
                ) : null}
                <p className="mt-1 text-xs leading-5 text-amber-100/90">{row.reason}</p>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
            No attendance follow-up is required from today’s register evidence.
          </div>
        )}
      </div>
    </section>
  );
}

function SchoolAttendance({
  date,
  schools,
  followUp,
}: {
  date: string;
  schools: SchoolRow[];
  followUp: FollowUpRow[];
}) {
  return (
    <section className="rounded-[24px] border border-emerald-300/20 bg-emerald-400/[0.08] p-3.5 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
            SISSO learner attendance
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">Schools in your circuit</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-emerald-100/75">
            Population is the active learner register. Present and absent use certified, non-Holiday attendance only.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-white">
          {date}
        </span>
      </div>

      <div className="mt-4 space-y-2.5">
        {schools.length ? (
          schools.map((school) => (
            <details
              key={school.tenantId}
              className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-950/55"
            >
              <summary className="cursor-pointer list-none p-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50 md:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-white md:text-base">
                      {school.schoolName}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {school.schoolCode || "No school code"}
                      {school.circuitName ? ` · ${school.circuitName}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${evidenceClass(
                      school.evidenceState,
                    )}`}
                  >
                    {evidenceLabel(school.evidenceState)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <DailyMetric label="Population" value={formatNumber(school.population)} />
                  <DailyMetric
                    label="Present"
                    value={dailyValue(school.present, school.evidenceState)}
                  />
                  <DailyMetric
                    label="Absent"
                    value={dailyValue(school.absent, school.evidenceState)}
                  />
                </div>

                <p className="mt-2 text-right text-[11px] font-semibold text-emerald-200">
                  <span className="group-open:hidden">View term-to-date ›</span>
                  <span className="hidden group-open:inline">Hide term-to-date ↑</span>
                </p>
              </summary>

              <div className="border-t border-white/10 p-3.5 pt-3 md:p-4">
                <div className="rounded-xl border border-emerald-300/15 bg-emerald-400/[0.06] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-white">Term-to-date</h4>
                      <p className="mt-0.5 text-[11px] text-emerald-100/70">
                        {school.termLabel || "Current term"} · week-on-week official attendance
                      </p>
                    </div>
                    {school.currentWeek ? (
                      <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-semibold text-slate-200">
                        Week {school.currentWeek}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 space-y-1.5">
                    {school.weeks.length ? (
                      school.weeks.map((week) => (
                        <div
                          key={week.weekNumber}
                          className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                        >
                          <span className="text-xs font-semibold text-slate-200">
                            Week {week.weekNumber}
                            {week.current ? " · Current" : ""}
                          </span>
                          <span className="text-sm font-bold text-white">
                            {week.presentPct === null ? "—" : `${week.presentPct}%`}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-5 text-slate-300">
                        Term week scores are unavailable until the school academic calendar is configured and certified attendance exists.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </details>
          ))
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
            No active school is attached to this circuit scope.
          </div>
        )}
      </div>

      <div className="mt-4">
        <FollowUpList title="Schools needing attendance follow-up" rows={followUp} />
      </div>
    </section>
  );
}

function CircuitAttendance({
  date,
  circuits,
  followUp,
}: {
  date: string;
  circuits: CircuitRow[];
  followUp: FollowUpRow[];
}) {
  return (
    <section className="rounded-[24px] border border-sky-300/20 bg-sky-500/[0.08] p-3.5 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200">
            Director learner attendance
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">Circuit attendance</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-sky-100/75">
            Circuits only. Population is the active learner register; present and absent use certified, non-Holiday attendance only.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-white">
          {date}
        </span>
      </div>

      <div className="mt-4 grid gap-2.5 md:grid-cols-2">
        {circuits.length ? (
          circuits.map((circuit) => (
            <article
              key={circuit.circuitId}
              className="rounded-2xl border border-white/10 bg-slate-950/55 p-3.5 md:p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-bold text-white md:text-base">
                  {circuit.circuitName}
                </h3>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${evidenceClass(
                    circuit.evidenceState,
                  )}`}
                >
                  {evidenceLabel(circuit.evidenceState)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <DailyMetric
                  label="Circuit population"
                  value={formatNumber(circuit.population)}
                />
                <DailyMetric
                  label="Present"
                  value={dailyValue(circuit.present, circuit.evidenceState)}
                />
                <DailyMetric
                  label="Absent"
                  value={dailyValue(circuit.absent, circuit.evidenceState)}
                />
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300 md:col-span-2">
            No circuit attendance rows are available inside this district scope.
          </div>
        )}
      </div>

      <div className="mt-4">
        <FollowUpList title="Circuits needing attendance follow-up" rows={followUp} />
      </div>
    </section>
  );
}

export default function GovernanceStudentAttendancePanel({ endpoint, view }: Props) {
  const [data, setData] = useState<
    SchoolAttendanceResponse | CircuitAttendanceResponse | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        const json = (await response.json().catch(() => null)) as
          | SchoolAttendanceResponse
          | CircuitAttendanceResponse
          | ErrorResponse
          | null;

        if (!response.ok || !json || json.ok !== true) {
          const message =
            json && "message" in json && json.message
              ? json.message
              : json && "error" in json && json.error
                ? json.error
                : `Failed to load learner attendance (${response.status})`;
          setData(null);
          setError(message);
          return;
        }

        setData(json);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setData(null);
        setError("Network/server error while loading learner attendance.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [endpoint, reloadToken]);

  if (loading) {
    return (
      <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
        Loading official learner attendance…
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-[24px] border border-red-300/20 bg-red-500/10 p-4">
        <p className="text-sm font-semibold text-red-100">{error}</p>
        <button
          type="button"
          onClick={() => setReloadToken((value) => value + 1)}
          className="mt-3 rounded-xl border border-red-200/20 bg-red-100/10 px-3 py-2 text-sm font-semibold text-red-50"
        >
          Try again
        </button>
      </section>
    );
  }

  if (!data) return null;

  if (view === "SCHOOL" && data.attendance.view === "SCHOOL") {
    return (
      <SchoolAttendance
        date={data.attendance.date}
        schools={data.attendance.schools}
        followUp={data.attendance.schoolsNeedingFollowUp}
      />
    );
  }

  if (view === "CIRCUIT" && data.attendance.view === "CIRCUIT") {
    return (
      <CircuitAttendance
        date={data.attendance.date}
        circuits={data.attendance.circuits}
        followUp={data.attendance.circuitsNeedingFollowUp}
      />
    );
  }

  return (
    <section className="rounded-[24px] border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">
      Attendance scope response did not match this governance dashboard.
    </section>
  );
}
