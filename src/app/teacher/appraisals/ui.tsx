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
  scores: ScoreRow[];
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

function scoreTone(score: number | null, na: boolean) {
  if (na) return "border-white/10 bg-white/5 text-[#C9CDD6]";
  if (score == null) return "border-white/10 bg-white/5 text-[#C9CDD6]";
  if (score >= 4) return "border-emerald-300/25 bg-emerald-400/12 text-emerald-100";
  if (score === 3) return "border-amber-300/25 bg-amber-400/12 text-amber-100";
  return "border-rose-300/25 bg-rose-400/12 text-rose-100";
}

function percentTone(value: number | null | undefined) {
  if (value == null) return "border-white/10 bg-white/5 text-[#C9CDD6]";
  if (value >= 80) return "border-emerald-300/25 bg-emerald-400/12 text-emerald-100";
  if (value >= 60) return "border-amber-300/25 bg-amber-400/12 text-amber-100";
  return "border-rose-300/25 bg-rose-400/12 text-rose-100";
}

function sectionTitleFromKey(key: keyof SectionPercentages) {
  const map: Record<keyof SectionPercentages, string> = {
    preparation: "1.0 Preparation",
    lessonDelivery: "2.0 Lesson delivery",
    classroomCulture: "3.0 Classroom culture",
    learnerParticipation: "4.0 Learner participation",
    understandingStrategies: "5.0 Understanding strategies",
    evaluationStrategies: "6.0 Evaluation strategies",
  };
  return map[key];
}

const cardShell =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const panel = "rounded-2xl border border-white/10 bg-[#0C1730]/78";
const outlineBtn =
  "rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[#F7F4ED] transition hover:bg-white/10 disabled:opacity-60";

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

  const groupedScores = useMemo(() => {
    const m = new Map<string, { title: string; rows: ScoreRow[] }>();
    for (const row of detail?.scores ?? []) {
      const key = `${row.sectionOrder}:${row.sectionKey}`;
      const current = m.get(key);
      if (current) current.rows.push(row);
      else m.set(key, { title: row.sectionTitle, rows: [row] });
    }
    return Array.from(m.entries()).map(([key, value]) => ({ key, ...value }));
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
            <div className="space-y-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#F7F4ED]">
                    {detail.subject || selectedSummary?.subject || "Observed lesson"}
                  </h2>
                  <p className="mt-1 text-sm text-[#C9CDD6]">
                    {fmtDate(detail.dateObserved)} · {detail.classTaught || "Class not stated"} · {detail.term || "—"} · {detail.academicYear || "—"}
                  </p>
                  <p className="mt-1 text-xs text-[#AEB6C4]">
                    Finalized: {fmtDateTime(detail.finalizedAt)} · Appraiser: {detail.appraiserNameSnapshot || "Headteacher"}
                  </p>
                </div>

                <div className={cx("rounded-2xl border px-4 py-3 text-center", percentTone(detail.overallPercentage))}>
                  <p className="text-xs opacity-80">Overall score</p>
                  <p className="mt-1 text-2xl font-extrabold">{pct(detail.overallPercentage)}</p>
                </div>
              </div>

              {detail.generalComment ? (
                <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/10 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-[#E8C96A]">General comment</p>
                  <p className="mt-2 text-sm leading-7 text-[#F7F4ED]">{detail.generalComment}</p>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(Object.keys(detail.sectionPercentages) as Array<keyof SectionPercentages>).map((key) => (
                  <div key={key} className={cx("rounded-2xl border p-4", percentTone(detail.sectionPercentages[key]))}>
                    <p className="text-xs opacity-80">{sectionTitleFromKey(key)}</p>
                    <p className="mt-2 text-lg font-bold">{pct(detail.sectionPercentages[key])}</p>
                  </div>
                ))}
              </div>

              <div className={cx(panel, "p-4")}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#E8C96A]">Evidence linked</h3>
                <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs text-[#8F98A8]">Approved scheme</p>
                    <p className="mt-1 text-[#F7F4ED]">{detail.evidence.summary.scheme.title || (detail.evidence.schemeOfWorkId ? "Linked" : "Not linked")}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs text-[#8F98A8]">Approved lesson note</p>
                    <p className="mt-1 text-[#F7F4ED]">{detail.evidence.summary.lessonNote.title || (detail.evidence.lessonNoteId ? "Linked" : "Not linked")}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs text-[#8F98A8]">Lesson delivery</p>
                    <p className="mt-1 text-[#F7F4ED]">{detail.evidence.summary.lessonDelivery.dateTaught || (detail.evidence.lessonDeliveryId ? "Linked" : "Not linked")}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-4 text-sm leading-7 text-sky-100">
                <strong>How to read your score:</strong> each item is scored from 1 to 5. N/A items are not counted.
                Each section becomes a percentage, then the six section percentages are averaged into the overall score.
              </div>

              <div className="space-y-4">
                {groupedScores.map((section) => (
                  <div key={section.key} className={cx(panel, "p-4")}>
                    <h3 className="font-semibold text-[#F7F4ED]">{section.title}</h3>
                    <div className="mt-3 space-y-2">
                      {section.rows.map((row) => (
                        <div
                          key={row.id}
                          className="grid grid-cols-[52px_1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm"
                        >
                          <span className="font-semibold text-[#E8C96A]">{row.itemKey}</span>
                          <span className="leading-6 text-[#E1E6EF]">{row.itemLabel}</span>
                          <span className={cx("rounded-full border px-3 py-1 text-xs font-bold", scoreTone(row.score, row.notApplicable))}>
                            {scoreText(row)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </section>
    </div>
  );
}
