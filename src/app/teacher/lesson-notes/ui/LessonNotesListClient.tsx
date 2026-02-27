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

  // Accept YYYY-YYYY and normalize to YYYY/YYYY
  const dash = v.match(/^(\d{4})-(\d{4})$/);
  if (dash) return `${dash[1]}/${dash[2]}`;

  // Already correct: YYYY/YYYY
  if (/^\d{4}\/\d{4}$/.test(v)) return v;

  return v; // keep what user typed; server will validate on scheme mode usage
}

function toIntOrEmpty(raw: string): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n);
}

type TenantTermYearResponse = { ok?: boolean; term?: string | null; academicYear?: string | null };

export default function LessonNotesListClient() {
  const router = useRouter();

  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [status, setStatus] = useState<LessonNoteStatus | "">("");
  const [term, setTerm] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [weekNumber, setWeekNumber] = useState("");

  const [schemeNavLoading, setSchemeNavLoading] = useState(false);

  // Protect against race conditions (rapid filter changes)
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
    // cancel previous
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

      // stale response? ignore.
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

  /**
   * Upgrade #1: Entry point to scheme-mode from Lesson Notes.
   * - Uses teacher-entered term/year if present (normalized).
   * - Otherwise fetches tenant defaults from /api/settings/current-term-year.
   * - Routes to /teacher/curriculum?mode=scheme&term=...&academicYear=...&return=...
   */
  async function openSchemeBuilder() {
    if (schemeNavLoading) return;
    setSchemeNavLoading(true);

    try {
      let t = normalizeTerm(term);
      let y = normalizeAcademicYear(academicYear).trim();

      // Only fetch tenant defaults if missing anything
      if (!t || !y) {
        try {
          const res = await fetch("/api/settings/current-term-year", {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          });
          const data = (await res.json().catch(() => ({}))) as TenantTermYearResponse;
          if (res.ok && data?.ok) {
            if (!t && data.term) t = normalizeTerm(String(data.term));
            if (!y && data.academicYear) y = normalizeAcademicYear(String(data.academicYear)).trim();
          }
        } catch {
          // ignore; user can set inside scheme builder page
        }
      }

      const p = new URLSearchParams();
      p.set("mode", "scheme");
      if (t) p.set("term", t);
      if (y) p.set("academicYear", y);

      // Return path back to lesson notes; preserve filters where possible
      const ret = new URLSearchParams();
      if (status) ret.set("status", status);
      if (t) ret.set("term", t);
      if (y) ret.set("academicYear", y);
      const w = toIntOrEmpty(weekNumber);
      if (w) ret.set("weekNumber", w);

      const returnPath = `/teacher/lesson-notes${ret.toString() ? `?${ret.toString()}` : ""}`;
      p.set("return", returnPath);

      router.push(`/teacher/curriculum?${p.toString()}`);
    } finally {
      setSchemeNavLoading(false);
    }
  }

  const normalizedTerm = normalizeTerm(term);
  const normalizedYear = normalizeAcademicYear(academicYear);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Lesson Notes</h1>
          <p className="text-sm opacity-80">Draft → link NaCCA unit → fill → submit. Server-enforced, multi-tenant safe.</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            className="px-3 py-2 rounded-md border text-sm disabled:opacity-60"
            onClick={openSchemeBuilder}
            disabled={schemeNavLoading}
            title="Open Curriculum Explorer in Scheme Builder mode"
          >
            {schemeNavLoading ? "Opening…" : "Prepare scheme of work"}
          </button>

          <button
            className="px-3 py-2 rounded-md bg-black text-white text-sm"
            onClick={() => router.push("/teacher/lesson-notes/studio")}
          >
            New lesson note
          </button>

          <button className="px-3 py-2 rounded-md border text-sm" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="border rounded-md p-3">
          <label className="text-xs opacity-70">Status</label>
          <select
            className="mt-1 w-full border rounded-md p-2 text-sm"
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

        <div className="border rounded-md p-3">
          <label className="text-xs opacity-70">Term</label>
          <select
            className="mt-1 w-full border rounded-md p-2 text-sm"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          >
            <option value="">All</option>
            <option value="1st Term">1st Term</option>
            <option value="2nd Term">2nd Term</option>
            <option value="3rd Term">3rd Term</option>
          </select>
          {term && !normalizedTerm && (
            <div className="mt-1 text-[11px] text-amber-700">Tip: Use “1st Term / 2nd Term / 3rd Term”.</div>
          )}
        </div>

        <div className="border rounded-md p-3">
          <label className="text-xs opacity-70">Academic year</label>
          <input
            className="mt-1 w-full border rounded-md p-2 text-sm"
            placeholder="2025/2026"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
          />
          <div className="mt-1 text-[11px] text-zinc-500">
            Format: <span className="font-medium">YYYY/YYYY</span> (e.g. 2025/2026). “2025-2026” auto-normalizes.
          </div>
          {academicYear.trim() && !/^\d{4}\/\d{4}$/.test(normalizedYear) && (
            <div className="mt-1 text-[11px] text-amber-700">Heads-up: Scheme Builder requires YYYY/YYYY.</div>
          )}
        </div>

        <div className="border rounded-md p-3">
          <label className="text-xs opacity-70">Week number</label>
          <input
            className="mt-1 w-full border rounded-md p-2 text-sm"
            placeholder="1"
            inputMode="numeric"
            value={weekNumber}
            onChange={(e) => setWeekNumber(e.target.value)}
          />
          {weekNumber.trim() && !toIntOrEmpty(weekNumber) && (
            <div className="mt-1 text-[11px] text-amber-700">Use a positive whole number.</div>
          )}
        </div>
      </div>

      {/* Data */}
      <div className="mt-4">
        {err && <div className="border border-red-300 bg-red-50 text-red-800 rounded-md p-3 text-sm">{err}</div>}

        {loading ? (
          <div className="mt-4 text-sm opacity-80">Loading…</div>
        ) : items.length === 0 ? (
          <div className="mt-4 text-sm opacity-80">No lesson notes yet.</div>
        ) : (
          <div className="mt-4 overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="p-3">Week</th>
                  <th className="p-3">Subject</th>
                  <th className="p-3">Title</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Updated</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((n) => (
                  <tr key={n.id} className="border-t">
                    <td className="p-3">{n.weekNumber ?? "—"}</td>
                    <td className="p-3">{n.subject ?? "—"}</td>
                    <td className="p-3">
                      <div className="font-medium">{n.lessonTitle ?? "—"}</div>
                      <div className="text-xs opacity-70">
                        {n.term ?? "—"} • {n.academicYear ?? "—"}
                      </div>
                      {n.headteacherComment ? (
                        <div className="mt-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                          Headteacher: {n.headteacherComment}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3">
                      <span
                        className={cx(
                          "inline-flex px-2 py-1 rounded text-xs border",
                          n.status === "DRAFT" && "bg-gray-50",
                          n.status === "SUBMITTED" && "bg-blue-50 border-blue-200",
                          n.status === "APPROVED" && "bg-green-50 border-green-200",
                          n.status === "REJECTED" && "bg-red-50 border-red-200"
                        )}
                      >
                        {n.status}
                      </span>
                    </td>
                    <td className="p-3">{n.updatedAt ? new Date(n.updatedAt).toLocaleString() : "—"}</td>
                    <td className="p-3">
                      <div className="flex gap-2 flex-wrap">
                        <button className="px-2 py-1 rounded border" onClick={() => router.push(`/teacher/lesson-notes/${n.id}`)}>
                          Open
                        </button>
                        <button
                          className="px-2 py-1 rounded border"
                          onClick={() => router.push(`/teacher/lesson-notes/${n.id}/print`)}
                        >
                          Print
                        </button>
                        {n.status === "DRAFT" ? (
                          <button className="px-2 py-1 rounded border" onClick={() => onDelete(n.id)}>
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
  );
}
