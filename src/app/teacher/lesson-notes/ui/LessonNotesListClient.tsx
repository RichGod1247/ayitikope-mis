// src/app/teacher/lesson-notes/ui/LessonNotesListClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type ListItem = {
  id: string;
  subject: string | null;
  term: string | null;
  academicYear: string | null;
  weekNumber: number | null;
  lessonTitle: string | null;
  strand: string | null;
  substrand: string | null;
  status: LessonNoteStatus;
  updatedAt: string | null;
  createdAt: string | null;
  headteacherComment: string | null;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
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

const VALID_TERMS = ["1st Term", "2nd Term", "3rd Term"] as const;
type Term = (typeof VALID_TERMS)[number];

function normalizeTerm(raw: string): Term | "" {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return "";
  if (v === "1st term" || v === "term 1" || v === "term1" || v === "1" || v === "first term") return "1st Term";
  if (v === "2nd term" || v === "term 2" || v === "term2" || v === "2" || v === "second term") return "2nd Term";
  if (v === "3rd term" || v === "term 3" || v === "term3" || v === "3" || v === "third term") return "3rd Term";
  const exact = (VALID_TERMS as readonly string[]).find((t) => t.toLowerCase() === v);
  return (exact as Term) ?? "";
}

function normalizeAcademicYear(raw: string): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";

  const dash = v.match(/^(\d{4})-(\d{4})$/);
  if (dash) return `${dash[1]}/${dash[2]}`;

  if (/^\d{4}\/\d{4}$/.test(v)) return v;

  return v;
}

function toIntOrEmpty(raw: string): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n);
}

function statusBadgeClass(status: LessonNoteStatus) {
  switch (status) {
    case "DRAFT":
      return "border-white/10 bg-white/5 text-[#D7DCE5]";
    case "SUBMITTED":
      return "border-sky-300/25 bg-sky-400/12 text-sky-100";
    case "APPROVED":
      return "border-emerald-300/25 bg-emerald-400/12 text-emerald-100";
    case "REJECTED":
      return "border-rose-300/25 bg-rose-400/12 text-rose-100";
    default:
      return "border-white/10 bg-white/5 text-[#D7DCE5]";
  }
}

const cardShell =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const panel =
  "rounded-2xl border border-white/10 bg-[#0C1730]/78";
const inputClass =
  "mt-1 w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#7E8796] focus:border-[#D4AF37]/40 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20";
const outlineBtn =
  "rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[#F7F4ED] transition hover:bg-white/10 disabled:opacity-60";
const goldBtn =
  "rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-3 py-2 text-sm font-semibold text-[#071A3D] shadow-[0_16px_40px_rgba(212,175,55,0.22)] transition hover:brightness-105 disabled:opacity-60";

export default function LessonNotesListClient() {
  const router = useRouter();

  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [status, setStatus] = useState<LessonNoteStatus | "">("");
  const [term, setTerm] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [weekNumber, setWeekNumber] = useState("");

  const loadSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("take", "80");
    if (status) sp.set("status", status);

    const t = normalizeTerm(term);
    if (t) sp.set("term", t);

    const y = normalizeAcademicYear(academicYear);
    if (y.trim()) sp.set("academicYear", y.trim());

    const w = toIntOrEmpty(weekNumber);
    if (w) sp.set("weekNumber", w);

    return sp.toString();
  }, [status, term, academicYear, weekNumber]);

  async function load() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const seq = ++loadSeq.current;
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`/api/teachers/lesson-notes/list?${query}`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        signal: ac.signal,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
        throw new Error(msg);
      }

      if (seq !== loadSeq.current) return;

      setItems((data?.items as ListItem[]) || []);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setErr(e?.message || "Failed to load lesson notes.");
      setItems([]);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function onDelete(id: string) {
    const yes = window.confirm("Delete this DRAFT lesson note? This cannot be undone.");
    if (!yes) return;

    try {
      await apiJson<{ ok: true }>(`/api/teachers/lesson-notes/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonNoteId: id }),
      });
      await load();
    } catch (e: any) {
      alert(e?.message || "Failed to delete.");
    }
  }



  const normalizedTerm = normalizeTerm(term);
  const normalizedYear = normalizeAcademicYear(academicYear);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">EduLife OS · Teacher</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#F7F4ED] md:text-3xl">
              Lesson Notes
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[#C9CDD6]">
              Existing Lesson Notes stay here. To prepare a new one, start from an approved Scheme of Work.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className={goldBtn}
              onClick={() => router.push("/teacher/schemes")}
            >
              Prepare Lesson Note
            </button>

            <button className={outlineBtn} onClick={load}>
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section className={cardShell}>
        <div className="p-4 md:p-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
              Filters
            </h2>
            <p className="mt-1 text-xs text-[#9AA4B2]">
              Narrow the workspace by status, term, year, and week.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className={panel + " p-3"}>
              <label className="text-xs text-[#9AA4B2]">Status</label>
              <select
                className={inputClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
              >
                <option value="">All</option>
                <option value="DRAFT">DRAFT</option>
                <option value="SUBMITTED">SUBMITTED</option>
                <option value="APPROVED">APPROVED</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </div>

            <div className={panel + " p-3"}>
              <label className="text-xs text-[#9AA4B2]">Term</label>
              <select
                className={inputClass}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              >
                <option value="">All</option>
                <option value="1st Term">1st Term</option>
                <option value="2nd Term">2nd Term</option>
                <option value="3rd Term">3rd Term</option>
              </select>
              {term && !normalizedTerm && (
                <div className="mt-2 text-[11px] text-amber-200">Tip: Use “1st Term / 2nd Term / 3rd Term”.</div>
              )}
            </div>

            <div className={panel + " p-3"}>
              <label className="text-xs text-[#9AA4B2]">Academic year</label>
              <input
                className={inputClass}
                placeholder="2025/2026"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
              />
              <div className="mt-2 text-[11px] text-[#8F98A8]">
                Format: <span className="font-medium text-[#F7F4ED]">YYYY/YYYY</span>. “2025-2026” auto-normalizes.
              </div>
              {academicYear.trim() && !/^\d{4}\/\d{4}$/.test(normalizedYear) && (
                <div className="mt-2 text-[11px] text-amber-200">Use academic year as YYYY/YYYY.</div>
              )}
            </div>

            <div className={panel + " p-3"}>
              <label className="text-xs text-[#9AA4B2]">Week number</label>
              <input
                className={inputClass}
                placeholder="1"
                inputMode="numeric"
                value={weekNumber}
                onChange={(e) => setWeekNumber(e.target.value)}
              />
              {weekNumber.trim() && !toIntOrEmpty(weekNumber) && (
                <div className="mt-2 text-[11px] text-amber-200">Use a positive whole number.</div>
              )}
            </div>
          </div>

          <div className="mt-5">
            {err && (
              <div className="rounded-2xl border border-rose-300/20 bg-rose-500/12 p-3 text-sm text-rose-100">
                {err}
              </div>
            )}

            {loading ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-[#C9CDD6]">
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-white/12 bg-white/[0.04] p-4 text-sm text-[#C9CDD6]">
                No lesson notes yet. Open Scheme of Work, get it approved, then choose the week and indicator you want to teach.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-[24px] border border-white/10 bg-[#08111F]/90 shadow-[0_20px_70px_rgba(0,0,0,0.20)]">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.04]">
                    <tr className="text-left text-[#E8C96A]">
                      <th className="p-3 text-xs font-semibold uppercase tracking-[0.14em]">Week</th>
                      <th className="p-3 text-xs font-semibold uppercase tracking-[0.14em]">Subject</th>
                      <th className="p-3 text-xs font-semibold uppercase tracking-[0.14em]">Title</th>
                      <th className="p-3 text-xs font-semibold uppercase tracking-[0.14em]">Status</th>
                      <th className="p-3 text-xs font-semibold uppercase tracking-[0.14em]">Updated</th>
                      <th className="p-3 text-xs font-semibold uppercase tracking-[0.14em]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((n) => (
                      <tr key={n.id} className="border-t border-white/10 align-top">
                        <td className="p-3 text-[#DDE3ED]">{n.weekNumber ?? "—"}</td>
                        <td className="p-3 text-[#F7F4ED]">{n.subject ?? "—"}</td>
                        <td className="p-3">
                          <div className="font-medium text-[#F7F4ED]">{n.lessonTitle ?? "—"}</div>
                          <div className="mt-1 text-xs text-[#8F98A8]">
                            {n.term ?? "—"} • {n.academicYear ?? "—"}
                          </div>
                          {n.headteacherComment ? (
                            <div className="mt-2 rounded-xl border border-amber-300/20 bg-amber-400/12 p-2 text-xs text-amber-100">
                              Headteacher: {n.headteacherComment}
                            </div>
                          ) : null}
                        </td>
                        <td className="p-3">
                          <span
                            className={cx(
                              "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                              statusBadgeClass(n.status)
                            )}
                          >
                            {n.status}
                          </span>
                        </td>
                        <td className="p-3 text-[#C9CDD6]">
                          {n.updatedAt ? new Date(n.updatedAt).toLocaleString() : "—"}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className={outlineBtn + " px-2.5 py-1.5 text-xs"}
                              onClick={() => router.push(`/teacher/lesson-notes/${n.id}`)}
                            >
                              Open
                            </button>
                            <button
                              className={outlineBtn + " px-2.5 py-1.5 text-xs"}
                              onClick={() => router.push(`/teacher/lesson-notes/${n.id}/print`)}
                            >
                              Print
                            </button>
                            {n.status === "DRAFT" ? (
                              <button
                                className="rounded-xl border border-rose-300/20 bg-rose-500/12 px-2.5 py-1.5 text-xs font-medium text-rose-100 transition hover:bg-rose-500/18"
                                onClick={() => onDelete(n.id)}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}