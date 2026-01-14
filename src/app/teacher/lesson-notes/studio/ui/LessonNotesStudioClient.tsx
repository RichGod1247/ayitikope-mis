// src/app/teacher/lesson-notes/studio/ui/LessonNotesStudioClient.tsx
"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CreateResp =
  | { ok: true; note: { id: string } }
  | { ok: true; item: { id: string } }
  | { ok: true; lessonNoteId: string }
  | { ok: false; error: string };

async function safeJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

function extractCreatedNoteId(r: CreateResp): string | null {
  if (!r.ok) return null;
  if ("note" in r && r.note?.id) return r.note.id;
  if ("item" in r && r.item?.id) return r.item.id;
  if ("lessonNoteId" in r && r.lessonNoteId) return r.lessonNoteId;
  return null;
}

function handleAuthFailure() {
  window.location.href = "/auth/login";
}

const inputBase =
  "w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black bg-white";
const btnBase =
  "inline-flex items-center justify-center rounded-xl border text-sm h-10 px-4 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

export default function LessonNotesStudioClient() {
  const router = useRouter();

  const [term, setTerm] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [level, setLevel] = useState("");
  const [subject, setSubject] = useState("");
  const [weekNumber, setWeekNumber] = useState<string>("");

  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canCreate = useMemo(() => {
    const hasAny =
      term.trim() ||
      academicYear.trim() ||
      level.trim() ||
      subject.trim() ||
      weekNumber.trim();
    return Boolean(hasAny);
  }, [term, academicYear, level, subject, weekNumber]);

  const handleCreate = useCallback(async () => {
    if (creating) return;

    setCreating(true);
    setErr(null);

    const payload: Record<string, any> = {
      term: term.trim() || null,
      academicYear: academicYear.trim() || null,
      level: level.trim() || null,
      subject: subject.trim() || null,
      weekNumber: weekNumber.trim() ? Number(weekNumber.trim()) : null,
    };

    try {
      const res = await fetch("/api/teachers/lesson-notes/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 401 || res.status === 403) return handleAuthFailure();

      const data = await safeJson<CreateResp>(res);

      if (!res.ok || !data.ok) {
        setErr((!data.ok && data.error) || "Failed to create lesson note. Please try again.");
        return;
      }

      const id = extractCreatedNoteId(data);
      if (!id) {
        setErr("Lesson note created, but no ID was returned by the server.");
        return;
      }

      router.push(`/teacher/lesson-notes/${encodeURIComponent(id)}?from=studio`);
    } catch {
      setErr("Network/server error while creating. Try again.");
    } finally {
      setCreating(false);
    }
  }, [creating, term, academicYear, level, subject, weekNumber, router]);

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl md:text-2xl font-semibold">Lesson Notes Studio</h1>
            <p className="text-sm text-zinc-600">
              Create a new lesson note, then continue in the editor.
            </p>
          </div>
          <button
            type="button"
            className={btnOutline}
            onClick={() => router.push("/teacher/lesson-notes")}
          >
            Back to list
          </button>
        </div>

        {err && (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-2xl px-4 py-3 text-sm">
            {err}
          </div>
        )}

        <div className="border rounded-2xl bg-white p-4 md:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Term</label>
              <input
                className={inputBase}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder='e.g. "Term 1"'
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Academic Year</label>
              <input
                className={inputBase}
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder='e.g. "2025/2026"'
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Class / Level</label>
              <input
                className={inputBase}
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="e.g. KG1, Basic 4, JHS 1"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Subject</label>
              <input
                className={inputBase}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Mathematics, Computing"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Week Number (optional)</label>
              <input
                className={inputBase}
                value={weekNumber}
                onChange={(e) => setWeekNumber(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="e.g. 1"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={!canCreate || creating}
              onClick={handleCreate}
              title={canCreate ? "" : "Fill at least one field before creating."}
            >
              {creating ? "Creating…" : "Create lesson note"}
            </button>

            <p className="text-xs text-zinc-500">After creation you’ll be redirected into the editor.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
