"use client";

import React, { useEffect, useState } from "react";

type TeacherWellbeingClientProps = {
  tenantId: string;
  userId: string;
};

type Entry = {
  id: string;
  tenantId: string;
  userId: string;
  weekStart: string;
  stressLevel: number;
  workload: number;
  comments?: string | null;
  createdAt: string;
  updatedAt: string;
};

type LoadState = "idle" | "loading" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

function getCurrentWeekStartISO() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // Monday-based
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

const TeacherWellbeingClient: React.FC<TeacherWellbeingClientProps> = ({
  tenantId,
  userId,
}) => {
  const [weekStart, setWeekStart] = useState<string>(getCurrentWeekStartISO);

  const [stressLevel, setStressLevel] = useState<number>(5);
  const [workload, setWorkload] = useState<number>(5);
  const [comments, setComments] = useState<string>("");

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load existing entry for this week (if any)
  useEffect(() => {
    const load = async () => {
      try {
        setLoadState("loading");
        setErrorMessage(null);

        const params = new URLSearchParams({
          tenantId,
          userId,
          weekStart,
        });

        const res = await fetch(
          `/api/teacher/health/weekly?${params.toString()}`
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        if (!data.ok) {
          throw new Error(data.error || "Failed to load entry.");
        }

        const entry = data.entry as
          | (Entry & { weekStart: string })
          | null
          | undefined;

        if (entry) {
          setStressLevel(entry.stressLevel);
          setWorkload(entry.workload);
          setComments(entry.comments ?? "");
        } else {
          // no entry for this week, reset to neutral defaults
          setStressLevel(5);
          setWorkload(5);
          setComments("");
        }

        setLoadState("idle");
      } catch (err: any) {
        console.error("[TeacherWellbeingClient] load error", err);
        setErrorMessage("Failed to load this week's check-in.");
        setLoadState("error");
      }
    };

    load();
  }, [tenantId, userId, weekStart]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveState("saving");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/teacher/health/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          userId,
          weekStart,
          stressLevel,
          workload,
          comments: comments.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        console.error("[TeacherWellbeingClient] save error", data);
        setErrorMessage(data.error || "Failed to save check-in.");
        setSaveState("error");
        return;
      }

      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch (err) {
      console.error("[TeacherWellbeingClient] save exception", err);
      setErrorMessage("Failed to save check-in.");
      setSaveState("error");
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Weekly Wellbeing Check-in
          </h1>
          <p className="mt-1 text-xs text-slate-600">
            A quick private snapshot of your stress and workload levels for this
            week.
          </p>
        </div>
        <div className="text-[11px] text-slate-500">
          EduLife OS • Teacher wellbeing
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <div className="font-medium text-slate-800">
            Week of{" "}
            <input
              type="date"
              className="inline-flex rounded border border-slate-300 px-2 py-0.5 text-xs bg-white"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
          </div>
          <div className="text-slate-600">
            We always store the answer against the Monday of this week.
          </div>
        </div>
        <div className="text-[11px] text-slate-500">
          {loadState === "loading"
            ? "Loading..."
            : loadState === "error"
            ? "Could not load this week."
            : "Loaded."}
        </div>
      </div>

      <form
        onSubmit={handleSave}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 text-xs"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-slate-700">
              Stress level (1–10)
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={stressLevel}
              onChange={(e) => setStressLevel(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>1: Very low</span>
              <span className="font-semibold text-slate-800">
                {stressLevel}
              </span>
              <span>10: Extremely high</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-slate-700">
              Workload (1–10)
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={workload}
              onChange={(e) => setWorkload(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>1: Very light</span>
              <span className="font-semibold text-slate-800">{workload}</span>
              <span>10: Overloaded</span>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-slate-700">
            Any comments or notes (optional)
          </label>
          <textarea
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            rows={3}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="E.g. 'Extra duties this week', 'Feeling strong and motivated', etc."
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="submit"
            disabled={saveState === "saving"}
            className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveState === "saving" ? "Saving..." : "Save this week's check-in"}
          </button>
          <div className="flex items-center gap-2 text-[11px]">
            {saveState === "error" && (
              <span className="text-red-600">
                {errorMessage || "Failed to save."}
              </span>
            )}
            {saveState === "saved" && (
              <span className="text-emerald-600">Saved.</span>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default TeacherWellbeingClient;
