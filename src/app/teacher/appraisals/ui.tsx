// src/app/teacher/appraisals/ui.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type SectionPercentages = {
  preparation: number | null;
  lessonDelivery: number | null;
  classroomCulture: number | null;
  learnerParticipation: number | null;
  understandingStrategies: number | null;
  evaluationStrategies: number | null;
};

type AppraisalSummary = {
  id: string;
  dateObserved: string | null;
  classTaught: string | null;
  subject: string | null;
  subStrand: string | null;
  overallPercentage: number | null;
  finalizedAt: string | null;
  appraiserNameSnapshot: string | null;
  generalComment: string | null;
};

type ScoreRow = {
  id: string;
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  sectionMaxScore: number;
  itemKey: string;
  itemLabel: string;
  itemOrder: number;
  score: number | null;
  notApplicable: boolean;
};

type EvidenceWarning = {
  code: string;
  title: string;
  detail: string;
  severity?: string;
};

type EvidenceSummary = {
  schemeOfWorkId: string | null;
  lessonNoteId: string | null;
  lessonDeliveryId: string | null;
  summary: {
    teacherName: string;
    schoolName: string;
    circuit: string;
    scheme: { title: string; status: string };
    lessonNote: { title: string; subject: string; weekNumber: number | null };
    lessonDelivery: { dateTaught: string; notes: string };
    assessment: { count: number | null };
  };
};

type AppraisalDetail = AppraisalSummary & {
  term: string | null;
  academicYear: string | null;
  durationMinutes: number | null;
  yearsInService: number | null;
  yearsInPresentSchool: number | null;
  teacherNameSnapshot: string | null;
  schoolNameSnapshot: string | null;
  circuitSnapshot: string | null;
  sectionPercentages: SectionPercentages;
  evidence: EvidenceSummary;
  evidenceWarnings?: EvidenceWarning[];
  scores: ScoreRow[];
};

type GroupedScoreSection = {
  key: string;
  sectionKey: string;
  title: string;
  sectionOrder: number;
  sectionMaxScore: number;
  rows: ScoreRow[];
};

type ListResponse = { ok: true; items: AppraisalSummary[] } | { ok: false; error: string };
type DetailResponse = { ok: true; item: AppraisalDetail } | { ok: false; error: string };

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

async function apiJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, cache: "no-store", credentials: "include" });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pct(v: number | null | undefined) {
  return typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(1)}%` : "—";
}

function scoreText(row: ScoreRow) {
  if (row.notApplicable) return "N/A";
  if (typeof row.score === "number") return String(row.score);
  return "—";
}

function scoreDescriptor(score: number | null, na: boolean) {
  if (na) return "Not applicable";
  if (score === 1) return "Very poor";
  if (score === 2) return "Poor";
  if (score === 3) return "Acceptable";
  if (score === 4) return "Good";
  if (score === 5) return "Very good";
  return "Not scored";
}

function paperScoreTone(score: number | null, na: boolean) {
  if (na) return "border-slate-300 bg-slate-100 text-slate-800";
  if (score == null) return "border-slate-300 bg-slate-100 text-slate-500";
  if (score >= 4) return "border-emerald-300 bg-emerald-100 text-emerald-950";
  if (score === 3) return "border-amber-300 bg-amber-100 text-amber-950";
  return "border-rose-300 bg-rose-100 text-rose-950";
}

function paperPercentTone(value: number | null | undefined) {
  if (value == null) return "border-slate-300 bg-slate-100 text-slate-700";
  if (value >= 80) return "border-emerald-300 bg-emerald-100 text-emerald-950";
  if (value >= 60) return "border-amber-300 bg-amber-100 text-amber-950";
  return "border-rose-300 bg-rose-100 text-rose-950";
}

function percentTone(value: number | null | undefined) {
  if (value == null) return "border-white/10 bg-white/5 text-[#C9CDD6]";
  if (value >= 80) return "border-emerald-300/25 bg-emerald-400/12 text-emerald-100";
  if (value >= 60) return "border-amber-300/25 bg-amber-400/12 text-amber-100";
  return "border-rose-300/25 bg-rose-400/12 text-rose-100";
}

function EvidenceWarningsBox({ warnings }: { warnings?: EvidenceWarning[] }) {
  if (!warnings?.length) return null;

  return (
    <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-100">
        Evidence warnings
      </p>
      <p className="mt-1 text-xs leading-5 text-amber-100/80">
        These warnings did not block finalization, but they show where high scores needed stronger linked evidence.
      </p>
      <div className="mt-3 space-y-2">
        {warnings.map((warning) => (
          <div
            key={`${warning.code}-${warning.title}`}
            className="rounded-xl border border-amber-300/20 bg-black/20 p-3"
          >
            <p className="text-sm font-bold text-amber-100">{warning.title}</p>
            <p className="mt-1 text-sm leading-6 text-[#F7F4ED]">{warning.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function compactParts(parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
}

function sectionPercentForOrder(detail: AppraisalDetail, order: number) {
  if (order === 1) return detail.sectionPercentages.preparation;
  if (order === 2) return detail.sectionPercentages.lessonDelivery;
  if (order === 3) return detail.sectionPercentages.classroomCulture;
  if (order === 4) return detail.sectionPercentages.learnerParticipation;
  if (order === 5) return detail.sectionPercentages.understandingStrategies;
  if (order === 6) return detail.sectionPercentages.evaluationStrategies;
  return null;
}

function scoredTotal(rows: ScoreRow[]) {
  return rows.reduce((sum, row) => {
    if (row.notApplicable || typeof row.score !== "number") return sum;
    return sum + row.score;
  }, 0);
}

function applicableMaximum(rows: ScoreRow[]) {
  return rows.filter((row) => !row.notApplicable).length * 5;
}

function selectedChoice(row: ScoreRow, value: number | "N/A") {
  if (value === "N/A") return row.notApplicable;
  return !row.notApplicable && row.score === value;
}

function choiceCellTone(row: ScoreRow, value: number | "N/A") {
  if (!selectedChoice(row, value)) return "border-slate-200 bg-white text-slate-300";
  if (value === "N/A") return "border-slate-400 bg-slate-200 text-slate-950";
  return paperScoreTone(value, false);
}

const cardShell =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const panel = "rounded-2xl border border-white/10 bg-[#0C1730]/78";
const outlineBtn =
  "rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[#F7F4ED] transition hover:bg-white/10 disabled:opacity-60";

function TeacherOfficialAppraisalForm({
  detail,
  selectedSummary,
  sections,
}: {
  detail: AppraisalDetail;
  selectedSummary: AppraisalSummary | null;
  sections: GroupedScoreSection[];
}) {
  const teacherName =
    detail.teacherNameSnapshot || detail.evidence.summary.teacherName || "—";
  const schoolName =
    detail.schoolNameSnapshot || detail.evidence.summary.schoolName || "—";
  const circuitName =
    detail.circuitSnapshot || detail.evidence.summary.circuit || "—";
  const subject =
    detail.subject || selectedSummary?.subject || "Observed lesson";

  const particulars: Array<[string, string]> = [
    ["Name of Teacher", teacherName],
    ["Number of Years in the Service", formatNumber(detail.yearsInService)],
    ["Name of School", schoolName],
    ["Number of Years in Present School", formatNumber(detail.yearsInPresentSchool)],
    ["Name of Circuit", circuitName],
    ["Subject Being Observed", subject],
    ["Date Observed", fmtDate(detail.dateObserved)],
    ["Sub-strand", detail.subStrand || "—"],
    ["Class Taught", detail.classTaught || "—"],
    [
      "Duration of Lesson",
      detail.durationMinutes != null ? `${detail.durationMinutes} minutes` : "—",
    ],
    ["Academic Context", compactParts([detail.term, detail.academicYear]) || "—"],
    ["Appraiser", detail.appraiserNameSnapshot || "Headteacher"],
    ["Finalized", fmtDateTime(detail.finalizedAt)],
  ];

  return (
    <div className="space-y-5">
      <article className="overflow-hidden rounded-[24px] border border-slate-300 bg-white text-slate-950 shadow-[0_20px_60px_rgba(0,0,0,0.24)]">
        <header className="border-b border-slate-300 px-4 py-5 text-center md:px-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">
            EduLife OS · Finalized teacher appraisal
          </p>
          <h2 className="mt-2 text-base font-black uppercase md:text-lg">
            Monitoring and Inspection Sheet (Teachers)
          </h2>
          <p className="mt-2 text-xs text-slate-600">
            Read-only official feedback · {schoolName}
          </p>
        </header>

        <section className="grid border-b border-slate-300 text-xs md:grid-cols-2">
          {particulars.map(([label, value]) => (
            <div
              key={label}
              className="grid grid-cols-[minmax(132px,42%)_1fr] border-b border-slate-200"
            >
              <div className="border-r border-slate-200 bg-slate-100 px-3 py-2 font-bold uppercase leading-5">
                {label}
              </div>
              <div className="min-w-0 break-words px-3 py-2 leading-5">{value}</div>
            </div>
          ))}
        </section>

        <section className="border-b border-slate-300 bg-slate-50 px-4 py-4 md:px-6">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-700">
            Scoring guide
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "N/A", detail: "Not applicable", score: null, na: true },
              { label: "1", detail: "Very poor", score: 1, na: false },
              { label: "2", detail: "Poor", score: 2, na: false },
              { label: "3", detail: "Acceptable", score: 3, na: false },
              { label: "4", detail: "Good", score: 4, na: false },
              { label: "5", detail: "Very good", score: 5, na: false },
            ].map((item) => (
              <div
                key={item.label}
                className={cx(
                  "rounded-xl border px-3 py-2 text-center",
                  paperScoreTone(item.score, item.na)
                )}
              >
                <p className="text-sm font-black">{item.label}</p>
                <p className="mt-0.5 text-[11px] font-semibold">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <div>
          {sections.map((section) => {
            const rows = [...section.rows].sort(
              (a, b) => a.itemOrder - b.itemOrder
            );
            const total = scoredTotal(rows);
            const maximum = applicableMaximum(rows) || section.sectionMaxScore;
            const percentage = sectionPercentForOrder(
              detail,
              section.sectionOrder
            );

            return (
              <section
                key={section.key}
                className="border-b border-slate-300 last:border-b-0"
              >
                <div className="bg-slate-800 px-4 py-3 text-white md:px-6">
                  <p className="text-xs font-black uppercase leading-5">
                    {section.sectionOrder}.0 {section.title}
                  </p>
                </div>

                <div className="space-y-2 p-3 md:hidden">
                  {rows.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <div className="flex items-start gap-3">
                        <span className="shrink-0 font-black text-slate-700">
                          {row.itemKey}
                        </span>
                        <p className="text-sm leading-6 text-slate-800">
                          {row.itemLabel}
                        </p>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <span
                          className={cx(
                            "rounded-full border px-3 py-1.5 text-xs font-black",
                            paperScoreTone(row.score, row.notApplicable)
                          )}
                        >
                          {scoreText(row)} ·{" "}
                          {scoreDescriptor(row.score, row.notApplicable)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[780px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="w-[52px] border border-slate-300 px-2 py-2">
                          S/N
                        </th>
                        <th className="border border-slate-300 px-2 py-2">
                          Behavioural competence
                        </th>
                        <th className="w-[48px] border border-slate-300 px-2 py-2 text-center">
                          N/A
                        </th>
                        {[1, 2, 3, 4, 5].map((score) => (
                          <th
                            key={score}
                            className="w-[42px] border border-slate-300 px-2 py-2 text-center"
                          >
                            {score}
                          </th>
                        ))}
                        <th className="w-[112px] border border-slate-300 px-2 py-2 text-center">
                          Final score
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <td className="border border-slate-300 px-2 py-2 font-bold">
                            {row.itemKey}
                          </td>
                          <td className="border border-slate-300 px-2 py-2 leading-5">
                            {row.itemLabel}
                          </td>
                          <td
                            className={cx(
                              "border px-2 py-2 text-center font-black",
                              choiceCellTone(row, "N/A")
                            )}
                          >
                            {selectedChoice(row, "N/A") ? "✓" : ""}
                          </td>
                          {[1, 2, 3, 4, 5].map((score) => (
                            <td
                              key={score}
                              className={cx(
                                "border px-2 py-2 text-center font-black",
                                choiceCellTone(row, score)
                              )}
                            >
                              {selectedChoice(row, score) ? "✓" : ""}
                            </td>
                          ))}
                          <td className="border border-slate-300 px-2 py-2 text-center">
                            <span
                              className={cx(
                                "inline-flex rounded-full border px-2.5 py-1 font-black",
                                paperScoreTone(row.score, row.notApplicable)
                              )}
                            >
                              {scoreText(row)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-2 border-t border-slate-200 bg-slate-50 p-3 text-xs font-bold sm:grid-cols-[1fr_auto_auto] sm:items-center md:px-6">
                  <span>TOTAL SCORE</span>
                  <span>
                    {total} / {maximum}
                  </span>
                  <span
                    className={cx(
                      "rounded-full border px-3 py-1 text-center",
                      paperPercentTone(percentage)
                    )}
                  >
                    {pct(percentage)}
                  </span>
                </div>

                <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-center text-[11px] font-bold text-slate-700 md:px-6">
                  PERCENTAGE SCORE = (TOTAL SCORE / {maximum}) × 100 ={" "}
                  {pct(percentage)}
                </div>
              </section>
            );
          })}
        </div>

        <section className="grid border-t border-slate-300 bg-slate-100 p-4 text-sm font-black sm:grid-cols-[1fr_auto] sm:items-center md:px-6">
          <span>
            OVERALL PERCENTAGE (1.0 + 2.0 + 3.0 + 4.0 + 5.0 + 6.0) ÷ 6
          </span>
          <span
            className={cx(
              "mt-3 rounded-xl border px-4 py-2 text-center text-xl sm:mt-0",
              paperPercentTone(detail.overallPercentage)
            )}
          >
            {pct(detail.overallPercentage)}
          </span>
        </section>

        <section className="grid border-t border-slate-300 md:grid-cols-2">
          <div className="border-b border-slate-300 p-4 md:border-b-0 md:border-r md:p-6">
            <p className="text-xs font-black uppercase tracking-[0.12em]">
              General comment(s)
            </p>
            <p className="mt-3 min-h-20 whitespace-pre-line text-sm leading-7">
              {detail.generalComment || "—"}
            </p>
          </div>

          <div className="p-4 md:p-6">
            <p className="text-xs font-black uppercase tracking-[0.12em]">
              Finalization record
            </p>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="font-bold text-slate-600">Appraiser</dt>
                <dd className="mt-1">{detail.appraiserNameSnapshot || "Headteacher"}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-600">Finalized</dt>
                <dd className="mt-1">{fmtDateTime(detail.finalizedAt)}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-600">Status</dt>
                <dd className="mt-1">Finalized · Read only</dd>
              </div>
            </dl>
          </div>
        </section>

        <footer className="border-t border-slate-300 bg-slate-100 px-4 py-3 text-[11px] leading-5 text-slate-700 md:px-6">
          N/A responses are excluded from the section denominator. The final
          overall percentage is the average of the six valid section percentages.
        </footer>
      </article>

      <EvidenceWarningsBox warnings={detail.evidenceWarnings} />

      <section className={cx(panel, "p-4 md:p-5")}>
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#E8C96A]">
          Evidence linked
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-[#8F98A8]">Approved scheme</p>
            <p className="mt-1 text-[#F7F4ED]">
              {detail.evidence.summary.scheme.title ||
                (detail.evidence.schemeOfWorkId ? "Linked" : "Not linked")}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-[#8F98A8]">Approved lesson note</p>
            <p className="mt-1 text-[#F7F4ED]">
              {detail.evidence.summary.lessonNote.title ||
                (detail.evidence.lessonNoteId ? "Linked" : "Not linked")}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-[#8F98A8]">Lesson delivery</p>
            <p className="mt-1 text-[#F7F4ED]">
              {detail.evidence.summary.lessonDelivery.dateTaught
                ? fmtDate(detail.evidence.summary.lessonDelivery.dateTaught)
                : detail.evidence.lessonDeliveryId
                  ? "Linked"
                  : "Not linked"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-[#8F98A8]">Assessment evidence</p>
            <p className="mt-1 text-[#F7F4ED]">
              {typeof detail.evidence.summary.assessment.count === "number"
                ? `${detail.evidence.summary.assessment.count} item(s)`
                : "Not stated"}
            </p>
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-4 text-sm leading-7 text-sky-100">
        <strong>How to read your score:</strong> each item is scored from 1 to 5.
        N/A items are not counted. Each section becomes a percentage, then the six
        section percentages are averaged into the overall score.
      </div>
    </div>
  );
}

export default function TeacherAppraisalsClient() {
  const [items, setItems] = useState<AppraisalSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<AppraisalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const firstAutoSelectDone = useRef(false);

  async function loadList() {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiJson<ListResponse>("/api/teacher/appraisals");
      if (!res.ok) throw new Error(res.error || "Could not load appraisals.");
      setItems(res.items);
      if (!firstAutoSelectDone.current && res.items[0]?.id) {
        firstAutoSelectDone.current = true;
        setSelectedId(res.items[0].id);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load appraisals.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    if (!id) {
      setDetail(null);
      return;
    }

    setDetailLoading(true);
    setErr(null);
    try {
      const res = await apiJson<DetailResponse>(`/api/teacher/appraisals?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(res.error || "Could not load appraisal.");
      setDetail(res.item);
    } catch (e) {
      setDetail(null);
      setErr(e instanceof Error ? e.message : "Could not load appraisal.");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
  }, []);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [selectedId]);

  const groupedScores = useMemo<GroupedScoreSection[]>(() => {
    const groups = new Map<string, GroupedScoreSection>();

    for (const row of detail?.scores ?? []) {
      const key = `${row.sectionOrder}:${row.sectionKey}`;
      const current = groups.get(key);

      if (current) {
        current.rows.push(row);
        continue;
      }

      groups.set(key, {
        key,
        sectionKey: row.sectionKey,
        title: row.sectionTitle,
        sectionOrder: row.sectionOrder,
        sectionMaxScore: row.sectionMaxScore,
        rows: [row],
      });
    }

    return Array.from(groups.values()).sort(
      (a, b) => a.sectionOrder - b.sectionOrder
    );
  }, [detail]);

  const selectedSummary = items.find((x) => x.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">EduLife OS · Teacher</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#F7F4ED] md:text-3xl">
              My Appraisals
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[#C9CDD6]">
              View finalized appraisal feedback from observed lessons. Use it as a growth map for your next lesson.
            </p>
          </div>

          <button type="button" onClick={loadList} className={outlineBtn} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      {err ? (
        <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">
          {err}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
        <aside className={cx(cardShell, "p-4 md:p-5")}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                Finalized feedback
              </h2>
              <p className="mt-1 text-xs text-[#AEB6C4]">
                Only finalized appraisals are shown here.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-[#F7F4ED]">
              {items.length}
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-[#C9CDD6]">
                Loading appraisals...
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-[#C9CDD6]">
                No finalized appraisal feedback yet. When your headteacher finalizes one, it will appear here.
              </div>
            ) : (
              items.map((item) => {
                const active = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={cx(
                      "w-full rounded-2xl border p-3 text-left transition",
                      active
                        ? "border-[#D4AF37]/35 bg-[#D4AF37]/12"
                        : "border-white/10 bg-[#0C1730]/70 hover:bg-white/8"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#F7F4ED]">
                          {item.subject || "Observed lesson"}
                        </p>
                        <p className="mt-1 text-xs text-[#AEB6C4]">
                          {fmtDate(item.dateObserved)} · {item.classTaught || "Class not stated"}
                        </p>
                      </div>
                      <span className={cx("rounded-full border px-2.5 py-1 text-xs font-semibold", percentTone(item.overallPercentage))}>
                        {pct(item.overallPercentage)}
                      </span>
                    </div>
                    {item.generalComment ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#C9CDD6]">
                        {item.generalComment}
                      </p>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main className={cx(cardShell, "min-h-[420px] p-4 md:p-5")}>
          {detailLoading ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-[#C9CDD6]">
              Loading selected appraisal...
            </div>
          ) : !detail ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm leading-7 text-[#C9CDD6]">
              Select an appraisal to view the feedback details.
            </div>
          ) : (
            <TeacherOfficialAppraisalForm
              detail={detail}
              selectedSummary={selectedSummary}
              sections={groupedScores}
            />
          )}
        </main>
      </section>
    </div>
  );
}
