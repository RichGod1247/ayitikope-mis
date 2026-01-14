// src/app/teacher/lesson-notes/ui/LessonNotesListClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
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

export default function LessonNotesListClient() {
  const router = useRouter();

  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [status, setStatus] = useState<LessonNoteStatus | "">( "");
  const [term, setTerm] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [weekNumber, setWeekNumber] = useState("");

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("take", "80");
    if (status) sp.set("status", status);
    if (term.trim()) sp.set("term", term.trim());
    if (academicYear.trim()) sp.set("academicYear", academicYear.trim());
    if (weekNumber.trim()) sp.set("weekNumber", weekNumber.trim());
    return sp.toString();
  }, [status, term, academicYear, weekNumber]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiJson<{ ok: true; items: ListItem[] }>(`/api/teachers/lesson-notes/list?${query}`);
      setItems(data.items || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load lesson notes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
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

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Lesson Notes</h1>
          <p className="text-sm opacity-80">
            Draft → link NaCCA unit → fill → submit. Server-enforced, multi-tenant safe.
          </p>
        </div>

        <div className="flex gap-2">
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
          <select className="mt-1 w-full border rounded-md p-2 text-sm" value={term} onChange={(e) => setTerm(e.target.value)}>
            <option value="">All</option>
            <option value="1st Term">1st Term</option>
            <option value="2nd Term">2nd Term</option>
            <option value="3rd Term">3rd Term</option>
          </select>
        </div>

        <div className="border rounded-md p-3">
          <label className="text-xs opacity-70">Academic year</label>
          <input
            className="mt-1 w-full border rounded-md p-2 text-sm"
            placeholder="2025/2026"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
          />
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
        </div>
      </div>

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
                        <button
                          className="px-2 py-1 rounded border"
                          onClick={() => router.push(`/teacher/lesson-notes/${n.id}`)}
                        >
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
