// src/app/teacher/health/weekly/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

function mondayOfUTC(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // Sun=0..Sat=6
  const back = (day + 6) % 7; // back to Monday
  d.setUTCDate(d.getUTCDate() - back);
  return d;
}
function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type Me = {
  ok: boolean;
  userId: string | null;
  tenantId?: string | null;
  roleName?: string | null;
  email?: string | null;
  name?: string | null;
};

export default function TeacherWeeklyHealthPage() {
  const [me, setMe] = useState<Me>({ ok: false, userId: null });

  const [weekStart, setWeekStart] = useState("");
  const [stressLevel, setStressLevel] = useState<number>(3);
  const [workload, setWorkload] = useState<number>(3);
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // init dates (current Monday UTC)
  useEffect(() => {
    setWeekStart(iso(mondayOfUTC(new Date())));
  }, []);

  // load current user context (session-derived)
  useEffect(() => {
    const run = async () => {
      try {
        const r = await fetch("/api/me", { credentials: "include" });
        const data = (await r.json()) as Me;
        setMe(data);
      } catch {
        setMe({ ok: false, userId: null });
      }
    };
    run();
  }, []);

  const canSave = useMemo(() => {
    return (
      !!me?.ok &&
      !!me?.userId &&
      !!weekStart &&
      clamp(stressLevel, 1, 5) === stressLevel &&
      clamp(workload, 1, 5) === workload &&
      !saving
    );
  }, [me, weekStart, stressLevel, workload, saving]);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setNotice(null);
    setError(null);

    try {
      const payload = {
        weekStart,
        stressLevel: clamp(stressLevel, 1, 5),
        workload: clamp(workload, 1, 5),
        comments: comments.trim().slice(0, 1000) || null,
        // ✅ DO NOT send tenantId or userId. Server must derive from session.
      };

      const r = await fetch("/api/health/teacher/weekly/upsert", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await r.json();
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Save failed");

      setNotice("Saved. Your weekly entry is recorded.");
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!me?.ok || !me?.userId) {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-2xl font-semibold">Weekly Health</h1>
        <p className="text-sm text-neutral-600">Please sign in to continue.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Weekly Health (Self-Report)</h1>
      <p className="text-sm text-neutral-600">
        Fill this once per week. Only your account can submit your weekly record.
      </p>

      <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-neutral-600 mb-1">Week start (Monday, UTC)</label>
            <input
              type="date"
              className="w-full border rounded-lg p-2"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-600 mb-1">Stress level (1–5)</label>
            <input
              type="number"
              min={1}
              max={5}
              className="w-full border rounded-lg p-2"
              value={stressLevel}
              onChange={(e) => setStressLevel(parseInt(e.target.value || "0", 10))}
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-600 mb-1">Workload (1–5)</label>
            <input
              type="number"
              min={1}
              max={5}
              className="w-full border rounded-lg p-2"
              value={workload}
              onChange={(e) => setWorkload(parseInt(e.target.value || "0", 10))}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-neutral-600 mb-1">Comments (optional)</label>
          <textarea
            className="w-full border rounded-lg p-2 min-h-[100px]"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="e.g., Busy exam prep week; need help covering Friday club."
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={!canSave}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Weekly Health"}
          </button>
        </div>

        {notice && (
          <div className="p-3 rounded-lg bg-green-50 text-green-700 border border-green-200">
            {notice}
          </div>
        )}
        {error && (
          <div className="p-3 rounded-lg bg-red-50 text-red-700 border border-red-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
