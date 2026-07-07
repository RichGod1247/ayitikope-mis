//src/app/headteacher/dashboard/ui.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type WeeklyRow = {
  classroomId: string;
  classLabel: string;
  enrolled: number;
  marks: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  pct: number;
};

type WeeklyOk = {
  ok: true;
  start: string;
  end: string;
  totals: {
    classes: number;
    enrolled: number;
    marks: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    pctOverall: number;
  };
  rows: WeeklyRow[];
};

type WeeklyResp = WeeklyOk | { ok: false; error: string };

type PendingResp =
  | {
      ok: true;
      start: string;
      end: string;
      count: number;
      items: Array<{ id: string; date: string; classroomId: string; classLabel: string }>;
    }
  | { ok: false; error: string };

type CertifyResp =
  | { ok: true; item: { id: string; certifiedAt: string; certifiedByUserId: string } }
  | { ok: false; error: string };

type PendingLessonNotesResp =
  | {
      ok: true;
      count: number;
      items: Array<{
        id: string;
        updatedAt: string;
        subject: string | null;
        term: string | null;
        academicYear: string | null;
        weekNumber: number | null;
        teacherUserId: string | null;
        teacherName: string | null;
      }>;
    }
  | { ok: false; error: string };

type ReleaseStatusResp =
  | {
      ok: true;
      term: string;
      academicYear: string;
      school: { releasedAt: string } | null;
      classroomReleaseMap: Record<string, { releasedAt: string }>;
    }
  | { ok: false; error: string; role?: string };

type GovernanceResp =
  | {
      ok: true;
      scope: {
        tenantId: string;
        term: string;
        academicYear: string;
        start: string;
        end: string;
      };
      metrics: {
        attendance: {
          totalSessions: number;
          closedSessions: number;
          certifiedSessions: number;
          pendingCertification: number;
          notifiedSessions: number;
          attendanceCertificationRate: number | null;
          notifyRate: number | null;
          avgCertifyDelayHrs: number | null;
          avgNotifyDelayHrs: number | null;
        };
        pipeline: {
          approvedNotesCount: number;
          deliveredLessonsCount: number;
          deliveryCoveragePercent: number | null;
          totalAssessmentsCount: number;
          linkedAssessmentsCount: number;
          assessmentLinkCoveragePercent: number | null;
          scoredAssessmentsCount: number;
          scoringCoveragePercent: number | null;
        };
        headteacherScore: number;
      };
      anomalies: {
        approvedNotDelivered: Array<any>;
        deliveredNotAssessed: Array<any>;
        assessedNotLinked: Array<any>;
      };
      actions: Array<{
        code: string;
        priority: "HIGH" | "MEDIUM" | "LOW";
        because: string[];
        message: string;
      }>;
    }
  | { ok: false; error: string };

type RiskBoardResp =
  | {
      ok: true;
      scope: {
        tenantId: string;
        term: string;
        academicYear: string;
        start: string;
        end: string;
        windowDays: number;
        feverThreshold: number;
      };
      totals: {
        students: number;
        classrooms: number;
        atRiskStudents: number;
        highRiskStudents: number;
      };
      topStudents: Array<{
        studentId: string;
        studentName: string;
        classroomId: string | null;
        classLabel: string | null;
        riskScore: number;
        reasons: string[];
        signals: {
          attendancePercent: number | null;
          feverFlags: number;
          healthRecords: number;
          overallPercent: number | null;
          missingAssessmentsCount: number;
          expectedAssessmentsCount: number;
          scoredAssessmentsCount: number;
        };
      }>;
      topClasses: Array<{
        classroomId: string;
        classLabel: string;
        enrolled: number;
        atRisk: number;
        highRisk: number;
        avgRiskScore: number | null;
        reasonsTop: string[];
      }>;
      actions: Array<{ code: string; priority: "HIGH" | "MEDIUM" | "LOW"; message: string }>;
      note?: string;
    }
  | { ok: false; error: string };

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return { start: isoDate(start), end: isoDate(end) };
}

function pctLabel(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.max(0, Math.min(100, v)).toFixed(1)}%`;
}

function errorOf(resp: any) {
  if (!resp) return "";
  if (resp.ok === false) return resp.error || "";
  return "";
}

function panelClass(extra?: string) {
  return `rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] ${extra ?? ""}`;
}

function StatCard(props: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0C1730] p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8F98A8]">
        {props.title}
      </p>
      <p className="mt-2 text-2xl font-semibold text-[#F7F4ED]">{props.value}</p>
      {props.sub ? <p className="mt-1 text-xs text-[#C9CDD6]">{props.sub}</p> : null}
    </div>
  );
}

function MajorTile(props: {
  title: string;
  desc: string;
  cta: string;
  onClick?: () => void;
  toneClass: string;
  accentClass: string;
  badge?: string;
  disabled?: boolean;
}) {
  const isDisabled = props.disabled || !props.onClick;

  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={isDisabled}
      className={`group w-full rounded-[28px] border bg-gradient-to-br p-4 text-left shadow-[0_12px_36px_rgba(0,0,0,0.20)] transition ${
        isDisabled ? "cursor-not-allowed opacity-80" : "hover:-translate-y-1"
      } ${props.toneClass}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${props.accentClass}`}
        >
          {props.badge ?? "Open"}
        </div>
      </div>
      <div className="mt-4 text-base font-semibold text-[#F7F4ED]">{props.title}</div>
      <div className="mt-2 text-xs leading-6 text-[#D9DEE8]">{props.desc}</div>
      <div className="mt-4 text-[11px] font-semibold text-[#F7F4ED] group-hover:underline">
        {props.cta}
      </div>
    </button>
  );
}

function StudentsAttendanceTile({ onDaily, onWeekly }: { onDaily: () => void; onWeekly: () => void }) {
  return (
    <div className="w-full rounded-[28px] border border-cyan-300/20 bg-gradient-to-br from-[#091C24] via-[#0D2530] to-[#08111C] p-4 text-left shadow-[0_12px_36px_rgba(0,0,0,0.20)]">
      <div className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-400/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
        Open
      </div>

      <div className="mt-4 text-base font-semibold text-[#F7F4ED]">Students Attendance</div>
      <div className="mt-2 text-xs leading-6 text-[#D9DEE8]">
        Mark today’s register or review weekly attendance patterns.
      </div>

      <div className="mt-4 grid gap-2">
        <button
          type="button"
          onClick={onDaily}
          className="min-h-11 rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/12 px-3 py-2 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#D4AF37]/18"
        >
          Daily attendance →
        </button>
        <button
          type="button"
          onClick={onWeekly}
          className="min-h-11 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-[#F7F4ED] transition hover:bg-white/10"
        >
          Weekly attendance →
        </button>
      </div>
    </div>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  try {
    return (await r.json()) as T;
  } catch {
    return { ok: false, error: "Invalid server response." } as unknown as T;
  }
}

function formatDateShort(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusPill(text: string, tone: "green" | "amber" | "slate") {
  const cls =
    tone === "green"
      ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-100"
      : tone === "amber"
        ? "border-amber-300/25 bg-amber-400/12 text-amber-100"
        : "border-white/10 bg-white/5 text-[#C9CDD6]";

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${cls}`}>
      {text}
    </span>
  );
}

function priorityChip(priority: "HIGH" | "MEDIUM" | "LOW") {
  const cls =
    priority === "HIGH"
      ? "border-rose-300/25 bg-rose-400/12 text-rose-100"
      : priority === "MEDIUM"
        ? "border-amber-300/25 bg-amber-400/12 text-amber-100"
        : "border-white/10 bg-white/5 text-[#C9CDD6]";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${cls}`}>
      {priority}
    </span>
  );
}

function riskTone(score: number) {
  if (score >= 80) return "border-rose-300/25 bg-rose-400/12 text-rose-100";
  if (score >= 70) return "border-amber-300/25 bg-amber-400/12 text-amber-100";
  return "border-white/10 bg-white/5 text-[#C9CDD6]";
}

export default function HeadteacherDashboardClient() {
  const router = useRouter();

  const initial = useMemo(() => defaultRange(), []);
  const [start] = useState(initial.start);
  const [end] = useState(initial.end);

  const [weekly, setWeekly] = useState<WeeklyResp | null>(null);
  const [pending, setPending] = useState<PendingResp | null>(null);
  const [pendingNotes, setPendingNotes] = useState<PendingLessonNotesResp | null>(null);
  const [releaseStatus, setReleaseStatus] = useState<ReleaseStatusResp | null>(null);
  const [governance, setGovernance] = useState<GovernanceResp | null>(null);
  const [riskBoard, setRiskBoard] = useState<RiskBoardResp | null>(null);

  const [, setLoading] = useState(false);
  const [busyCertifyId, setBusyCertifyId] = useState<string | null>(null);
  const [noteBySessionId, setNoteBySessionId] = useState<Record<string, string>>({});

  const reqSeq = useRef(0);

  async function loadAll() {
    const mySeq = ++reqSeq.current;

    if (start && end && start > end) {
      const bad = { ok: false, error: "Start date cannot be after end date." } as const;
      setWeekly(bad);
      setPending(bad);
      setPendingNotes(bad);
      setReleaseStatus(bad);
      setGovernance(bad);
      setRiskBoard(bad);
      return;
    }

    setLoading(true);

    try {
      const qs = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

      const [w, p, pn, rs, g, rb] = await Promise.all([
        fetchJson<WeeklyResp>(`/api/headteacher/attendance/weekly/summary?${qs}`, {
          cache: "no-store",
        }),
        fetchJson<PendingResp>(`/api/headteacher/attendance/sessions/pending?${qs}`, {
          cache: "no-store",
        }),
        fetchJson<PendingLessonNotesResp>(`/api/headteacher/lesson-notes/pending?limit=5`, {
          cache: "no-store",
        }),
        fetchJson<ReleaseStatusResp>(`/api/headteacher/results/release/status`, {
          cache: "no-store",
        }),
        fetchJson<GovernanceResp>(`/api/headteacher/insights/governance?${qs}`, {
          cache: "no-store",
        }),
        fetchJson<RiskBoardResp>(`/api/headteacher/insights/risk-board?${qs}`, {
          cache: "no-store",
        }),
      ]);

      if (mySeq !== reqSeq.current) return;

      setWeekly(w);
      setPending(p);
      setPendingNotes(pn);
      setReleaseStatus(rs);
      setGovernance(g);
      setRiskBoard(rb);

    } catch {
      if (mySeq !== reqSeq.current) return;
      const bad = { ok: false, error: "Failed to load dashboard data." } as const;
      setWeekly(bad);
      setPending(bad);
      setPendingNotes(bad);
      setReleaseStatus({ ok: false, error: "Failed to load results release status." });
      setGovernance({ ok: false, error: "Failed to load governance insights." });
      setRiskBoard({ ok: false, error: "Failed to load risk board." });
    } finally {
      if (mySeq === reqSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function certify(sessionId: string) {
    setBusyCertifyId(sessionId);
    try {
      const note = (noteBySessionId[sessionId] ?? "").trim() || null;

      const res = await fetchJson<CertifyResp>(`/api/headteacher/attendance/certify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, note }),
      });

      if (!res.ok) {
        window.alert((res as any).error || "Failed to certify.");
        return;
      }

      setNoteBySessionId((m) => {
        const next = { ...m };
        delete next[sessionId];
        return next;
      });

      await loadAll();
    } catch {
      window.alert("Server error certifying attendance.");
    } finally {
      setBusyCertifyId(null);
    }
  }

  const weeklyOk = weekly && (weekly as any).ok === true;
  const pendingOk = pending && (pending as any).ok === true;
  const pendingNotesOk = pendingNotes && (pendingNotes as any).ok === true;
  const governanceOk = governance && (governance as any).ok === true;
  const riskOk = riskBoard && (riskBoard as any).ok === true;

  const releaseOk = releaseStatus && (releaseStatus as any).ok === true;
  const releasedSchool = releaseOk ? (releaseStatus as any).school : null;

  const releasePill = releaseOk
    ? releasedSchool
      ? statusPill(
          `Parent access ON • ${(releaseStatus as any).term} • ${(releaseStatus as any).academicYear}`,
          "green"
        )
      : statusPill(
          `Parent access OFF • ${(releaseStatus as any).term} • ${(releaseStatus as any).academicYear}`,
          "amber"
        )
    : statusPill("Parent access unavailable", "slate");

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MajorTile
          title="Students Assessment"
          desc="See class performance, weak learners, and subjects needing support."
          cta="Open students assessment"
          toneClass="border-indigo-300/20 from-[#1A1034] via-[#25194A] to-[#0C1320]"
          accentClass="border-indigo-300/25 bg-indigo-400/12 text-indigo-100"
          onClick={() => router.push("/headteacher/assessment/overview")}
        />

        <StudentsAttendanceTile
          onDaily={() => router.push("/headteacher/day")}
          onWeekly={() => router.push("/headteacher/attendance/weekly")}
        />

        <MajorTile
          title="Teacher Attendance"
          desc="Staff attendance register for headteacher marking and supervision."
          cta="Coming next: A15.3"
          badge="Next"
          disabled
          toneClass="border-lime-300/20 from-[#101F0A] via-[#1D2D10] to-[#08121C]"
          accentClass="border-lime-300/25 bg-lime-400/12 text-lime-100"
        />

        <MajorTile
          title="Teacher Appraisal"
          desc="Teacher preparation, lesson delivery, classroom culture, and supervision evidence."
          cta="Coming next: A15.4"
          badge="Next"
          disabled
          toneClass="border-fuchsia-300/20 from-[#26102B] via-[#351642] to-[#0C1320]"
          accentClass="border-fuchsia-300/25 bg-fuchsia-400/12 text-fuchsia-100"
        />

        <MajorTile
          title="Class Term Reports"
          desc="Open class report grids and compare learner performance across the term."
          cta="Open class reports"
          toneClass="border-emerald-300/20 from-[#0A1F14] via-[#102C1D] to-[#08121C]"
          accentClass="border-emerald-300/25 bg-emerald-400/12 text-emerald-100"
          onClick={() => router.push("/headteacher/reports")}
        />

        <MajorTile
          title="Learner Term Report"
          desc="Open one learner’s printable report."
          cta="Open learner report"
          toneClass="border-sky-300/20 from-[#0C1730] via-[#10244A] to-[#07111F]"
          accentClass="border-sky-300/25 bg-sky-400/12 text-sky-100"
          onClick={() => router.push("/headteacher/reports/student-report")}
        />

        <MajorTile
          title="Parent Result Release"
          desc="Control when parents can view released results."
          cta="Open release controls"
          toneClass="border-amber-300/20 from-[#271408] via-[#362111] to-[#0C1320]"
          accentClass="border-amber-300/25 bg-amber-400/12 text-amber-100"
          onClick={() => router.push("/headteacher/reports/release")}
        />

        <MajorTile
          title="Lesson Notes Inbox"
          desc="Review submitted lesson notes and clear your approval queue."
          cta="Open lesson-note inbox"
          toneClass="border-rose-300/20 from-[#251013] via-[#30151B] to-[#0C1320]"
          accentClass="border-rose-300/25 bg-rose-400/12 text-rose-100"
          onClick={() => router.push("/headteacher/lesson-notes")}
        />
      </div>

      <div className={panelClass("p-4")}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#F7F4ED]">Parent result access</p>
            <p className="text-xs leading-6 text-[#C9CDD6]">
              This is separate from teacher assessment entry. It only controls whether parents can view released results.
            </p>
          </div>

          <div>{releasePill}</div>
        </div>

        {releaseOk && releasedSchool ? (
          <p className="mt-3 text-[11px] text-[#C9CDD6]">
            Parents can currently access released end-of-term results.
          </p>
        ) : releaseOk ? (
          <p className="mt-3 text-[11px] text-[#C9CDD6]">
            Parents are currently blocked from viewing results until release is turned on.
          </p>
        ) : (
          <p className="mt-3 text-[11px] text-rose-200">
            {(releaseStatus as any)?.error || "Failed to load release status."}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Overall Attendance"
          value={weeklyOk ? pctLabel((weekly as WeeklyOk).totals.pctOverall) : "—"}
          sub={weeklyOk ? `${(weekly as WeeklyOk).totals.marks.toLocaleString()} marks` : errorOf(weekly)}
        />

        <StatCard
          title="Classes Covered"
          value={weeklyOk ? String((weekly as WeeklyOk).totals.classes) : "—"}
          sub={weeklyOk ? `${(weekly as WeeklyOk).totals.enrolled.toLocaleString()} enrolled` : ""}
        />

        <StatCard
          title="Present / Absent"
          value={
            weeklyOk
              ? `${(weekly as WeeklyOk).totals.present.toLocaleString()} / ${(weekly as WeeklyOk).totals.absent.toLocaleString()}`
              : "—"
          }
          sub="This range"
        />

        <StatCard
          title="Headteacher Score"
          value={governanceOk ? pctLabel((governance as any).metrics.headteacherScore) : "—"}
          sub={governanceOk ? "Governance discipline index" : errorOf(governance)}
        />
      </div>

      <div className={panelClass("p-4 space-y-3")}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#F7F4ED]">Schoolwide risk board</p>
            <p className="text-xs leading-6 text-[#C9CDD6]">
              Combines attendance risk, fever flags, missing assessments, and low performance to prioritize follow-up.
            </p>
          </div>

          {riskOk ? (
            <div className="rounded-full border border-indigo-300/25 bg-indigo-400/12 px-3 py-1 text-[11px] font-semibold text-indigo-100">
              At-risk: {(riskBoard as any).totals.atRiskStudents} • High-risk: {(riskBoard as any).totals.highRiskStudents}
            </div>
          ) : (
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-[#C9CDD6]">
              Risk: —
            </div>
          )}
        </div>

        {!riskBoard ? (
          <p className="text-sm text-[#C9CDD6]">Loading…</p>
        ) : riskOk ? (
          <>
            {(riskBoard as any).actions?.length ? (
              <div className="grid gap-2 md:grid-cols-2">
                {(riskBoard as any).actions.slice(0, 4).map((a: any) => (
                  <div key={a.code} className="rounded-2xl border border-white/10 bg-[#0C1730] px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold text-[#F7F4ED]">{a.code}</div>
                      {priorityChip(a.priority)}
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-[#C9CDD6]">{a.message}</div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#07111F]">
                <div className="border-b border-white/10 px-4 py-3">
                  <div className="text-sm font-semibold text-[#F7F4ED]">Top at-risk learners</div>
                  <div className="text-[11px] text-[#C9CDD6]">
                    Window: {(riskBoard as any).scope.start} → {(riskBoard as any).scope.end}
                  </div>
                </div>

                <div className="space-y-2 p-4">
                  {(riskBoard as any).topStudents?.length ? (
                    (riskBoard as any).topStudents.slice(0, 10).map((s: any) => (
                      <div key={s.studentId} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[#F7F4ED]">{s.studentName}</div>
                            <div className="mt-1 text-[11px] text-[#C9CDD6]">
                              {s.classLabel ?? "No class"} • Attendance {s.signals.attendancePercent ?? "—"}% • Fever {s.signals.feverFlags} • Missing {s.signals.missingAssessmentsCount}
                            </div>
                            <div className="mt-2 text-[11px] leading-5 text-[#D9DEE8]">
                              {Array.isArray(s.reasons) && s.reasons.length ? s.reasons.slice(0, 3).join(" ") : "No reasons"}
                            </div>
                          </div>

                          <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${riskTone(Number(s.riskScore ?? 0))}`}>
                            {Number(s.riskScore ?? 0)}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/12 px-3 py-3 text-[11px] text-emerald-100">
                      No major risk signals detected in this window.
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#07111F]">
                <div className="border-b border-white/10 px-4 py-3">
                  <div className="text-sm font-semibold text-[#F7F4ED]">Top risk classes</div>
                  <div className="text-[11px] text-[#C9CDD6]">Based on aggregated learner risk</div>
                </div>

                <div className="space-y-2 p-4">
                  {(riskBoard as any).topClasses?.length ? (
                    (riskBoard as any).topClasses.slice(0, 10).map((c: any) => (
                      <div key={c.classroomId} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[#F7F4ED]">{c.classLabel}</div>
                            <div className="mt-1 text-[11px] text-[#C9CDD6]">
                              Enrolled {c.enrolled} • At-risk {c.atRisk} • High-risk {c.highRisk}
                            </div>
                            {Array.isArray(c.reasonsTop) && c.reasonsTop.length ? (
                              <div className="mt-2 text-[11px] leading-5 text-[#D9DEE8]">
                                {c.reasonsTop.slice(0, 3).join(" ")}
                              </div>
                            ) : null}
                          </div>

                          <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${riskTone(Number(c.avgRiskScore ?? 0))}`}>
                            {c.avgRiskScore ?? "—"}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-[11px] text-[#C9CDD6]">
                      No class risk aggregation available yet.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {(riskBoard as any).note ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-[11px] leading-5 text-[#C9CDD6]">
                {(riskBoard as any).note}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-rose-200">{(riskBoard as any).error || "Failed to load risk board."}</p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className={panelClass("p-4")}>
            <div>
              <p className="text-sm font-semibold text-[#F7F4ED]">Pending lesson notes</p>
              <p className="text-xs leading-6 text-[#C9CDD6]">Clear these quickly. This is one of the main headteacher bottlenecks.</p>
            </div>

            <div className="mt-4">
              {!pendingNotes ? (
                <p className="text-sm text-[#C9CDD6]">Loading…</p>
              ) : pendingNotesOk ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard title="Pending" value={String((pendingNotes as any).count)} sub="Submitted" />
                    <StatCard title="Review SLA" value="Today" sub="Aim same-day feedback" />
                    <StatCard title="Scope" value="Tenant" sub="Session-scoped" />
                  </div>

                  {(pendingNotes as any).items.length ? (
                    <div className="mt-4 space-y-2">
                      {(pendingNotes as any).items.map((it: any) => {
                        const teacherLabel = (it.teacherName ?? it.teacherUserId ?? "Teacher —") as string;

                        return (
                          <button
                            key={it.id}
                            type="button"
                            onClick={() => router.push(`/headteacher/lesson-notes/${encodeURIComponent(it.id)}`)}
                            className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left hover:bg-white/8"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[#F7F4ED]">
                                  {(it.subject ?? "Subject —")} • {(it.term ?? "Term —")} • {(it.academicYear ?? "Year —")}
                                </p>
                                <p className="text-[11px] text-[#C9CDD6]">
                                  {it.weekNumber != null ? `Week ${it.weekNumber}` : "Week —"} • Updated:{" "}
                                  {formatDateShort(it.updatedAt)}
                                </p>
                                <p className="text-[11px] text-[#8F98A8]">
                                  Teacher: <span className="font-medium text-[#F7F4ED]">{teacherLabel}</span>
                                </p>
                              </div>

                              <span className="font-mono text-[11px] text-[#8F98A8]">{String(it.id).slice(0, 8)}…</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-[#C9CDD6]">No submitted lesson notes right now.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-rose-200">{(pendingNotes as any).error || "Failed to load pending lesson notes."}</p>
              )}
            </div>
          </div>

          <div className={panelClass("p-4")}>
            <div>
              <p className="text-sm font-semibold text-[#F7F4ED]">Pending attendance certifications</p>
              <p className="text-xs leading-6 text-[#C9CDD6]">Only closed sessions should be certified.</p>
            </div>

            <div className="mt-4">
              {!pending ? (
                <p className="text-sm text-[#C9CDD6]">Loading…</p>
              ) : pendingOk ? (
                (pending as any).items.length ? (
                  <div className="space-y-3">
                    {(pending as any).items.map((it: any) => (
                      <div key={it.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-sm font-semibold text-[#F7F4ED]">
                          {it.classLabel} <span className="font-normal text-[#8F98A8]">· {it.date}</span>
                        </p>

                        <div className="mt-3 flex flex-col gap-2">
                          <input
                            className="w-full rounded-2xl border border-white/10 bg-[#0C1730] px-3 py-2 text-sm text-[#F7F4ED] outline-none focus:border-[#E8C96A]/35"
                            placeholder="Optional certification note"
                            value={noteBySessionId[it.id] ?? ""}
                            onChange={(e) => setNoteBySessionId((m) => ({ ...m, [it.id]: e.target.value }))}
                          />

                          <button
                            className="w-full rounded-full bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-sm font-semibold text-[#071A3D] sm:w-auto"
                            onClick={() => void certify(it.id)}
                            disabled={busyCertifyId === it.id}
                          >
                            {busyCertifyId === it.id ? "Certifying…" : "Certify"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#C9CDD6]">No pending certifications for this range.</p>
                )
              ) : (
                <p className="text-sm text-rose-200">{(pending as any).error || "Failed to load pending sessions."}</p>
              )}
            </div>
          </div>
      </div>

      <div className={panelClass("p-4")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#F7F4ED]">Governance copilot</p>
            <p className="text-xs leading-6 text-[#C9CDD6]">
              Measures whether school leadership is enforcing the chain:
              approved note → delivered lesson → linked assessment → scored assessment.
            </p>
          </div>

          {governanceOk ? (
            statusPill(
              `Score ${pctLabel((governance as any).metrics.headteacherScore)}`,
              (governance as any).metrics.headteacherScore >= 80 ? "green" : "amber"
            )
          ) : null}
        </div>

        <div className="mt-4">
          {!governance ? (
            <p className="text-sm text-[#C9CDD6]">Loading…</p>
          ) : governanceOk ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <StatCard
                  title="Attendance Certification"
                  value={pctLabel((governance as any).metrics.attendance.attendanceCertificationRate)}
                  sub={`${(governance as any).metrics.attendance.pendingCertification} pending`}
                />
                <StatCard
                  title="Delivery Coverage"
                  value={pctLabel((governance as any).metrics.pipeline.deliveryCoveragePercent)}
                  sub={`${(governance as any).metrics.pipeline.deliveredLessonsCount} delivered`}
                />
                <StatCard
                  title="Scoring Coverage"
                  value={pctLabel((governance as any).metrics.pipeline.scoringCoveragePercent)}
                  sub={`${(governance as any).metrics.pipeline.scoredAssessmentsCount} scored`}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-[#0C1730] px-3 py-3 text-xs">
                  <div className="text-[#8F98A8]">Approved not delivered</div>
                  <div className="mt-1 text-lg font-semibold text-[#F7F4ED]">
                    {(governance as any).anomalies.approvedNotDelivered.length}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0C1730] px-3 py-3 text-xs">
                  <div className="text-[#8F98A8]">Delivered not assessed</div>
                  <div className="mt-1 text-lg font-semibold text-[#F7F4ED]">
                    {(governance as any).anomalies.deliveredNotAssessed.length}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0C1730] px-3 py-3 text-xs">
                  <div className="text-[#8F98A8]">Assessed not linked</div>
                  <div className="mt-1 text-lg font-semibold text-[#F7F4ED]">
                    {(governance as any).anomalies.assessedNotLinked.length}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#F7F4ED]">Priority actions</p>
                {(governance as any).actions.length ? (
                  (governance as any).actions.map((a: any) => (
                    <div key={a.code} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-[#F7F4ED]">{a.code}</p>
                        {priorityChip(a.priority)}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[#C9CDD6]">{a.message}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/12 px-3 py-3 text-xs text-emerald-100">
                    Governance is stable in this range. Keep the same discipline.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-rose-200">{(governance as any).error || "Failed to load governance insights."}</p>
          )}
        </div>
      </div>
    </div>
  );
}
