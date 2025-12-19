// src/components/StudentHealthDailyClient.tsx
"use client";

import React, { useEffect, useState } from "react";

type Student = {
  id: string;
  name: string;
  guardianName?: string | null;
  guardianPhone?: string | null;
};

type StudentHealthDailyClientProps = {
  tenantId: string;
  classroomId: string;
  classroomName: string;
  date: string; // initial date in YYYY-MM-DD
  students: Student[];
};

type SaveState = "idle" | "saving" | "saved" | "error";

type EntryDraft = {
  temperature: string;
  symptoms: string;
  notes: string;
};

type DailyItem = {
  id: string;
  studentId: string;
  temperatureC: number | null;
  symptoms: string | null;
  notes: string | null;
};

const StudentHealthDailyClient: React.FC<StudentHealthDailyClientProps> = ({
  tenantId,
  classroomId,
  classroomName,
  date,
  students,
}) => {
  const [currentDate, setCurrentDate] = useState<string>(date);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [entries, setEntries] = useState<Record<string, EntryDraft>>({});
  const [savingState, setSavingState] = useState<SaveState>("idle");

  // Build a blank entry map for all students
  function buildBlankEntries(): Record<string, EntryDraft> {
    const map: Record<string, EntryDraft> = {};
    for (const s of students) {
      map[s.id] = { temperature: "", symptoms: "", notes: "" };
    }
    return map;
  }

  // Load existing entries for currentDate
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setLoadingError(null);

        const params = new URLSearchParams({
          tenantId,
          classroomId,
          date: currentDate,
        });

        const res = await fetch(
          `/api/teacher/health/student-daily?${params.toString()}`
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data.ok) {
          throw new Error("Server returned ok:false");
        }

        const items: DailyItem[] = data.items ?? [];

        // Start with blank entries for every student
        const base = buildBlankEntries();

        // Fill from DB where available
        for (const item of items) {
          if (!base[item.studentId]) {
            base[item.studentId] = { temperature: "", symptoms: "", notes: "" };
          }
          base[item.studentId] = {
            temperature:
              item.temperatureC != null ? String(item.temperatureC) : "",
            symptoms: item.symptoms ?? "",
            notes: item.notes ?? "",
          };
        }

        setEntries(base);
      } catch (err) {
        console.error("[StudentHealthDailyClient] load error", err);
        setLoadingError("Failed to load student daily health for this date.");
        setEntries(buildBlankEntries());
      } finally {
        setLoading(false);
      }
    };

    load();
    // Intentionally NOT including `students` in deps to avoid noisy re-renders
  }, [tenantId, classroomId, currentDate]);

  async function handleSave() {
    setSavingState("saving");
    try {
      // Build entries payload: only rows with some data
      const payloadEntries = Object.entries(entries)
        .filter(([_, v]) => {
          const t = v.temperature.trim();
          const s = v.symptoms.trim();
          const n = v.notes.trim();
          return t !== "" || s !== "" || n !== "";
        })
        .map(([studentId, v]) => ({
          studentId,
          temperatureC:
            v.temperature.trim() === "" ? null : Number(v.temperature),
          symptoms: v.symptoms.trim() || null,
          notes: v.notes.trim() || null,
        }));

      const body = {
        tenantId,
        classroomId,
        date: currentDate,
        entries: payloadEntries,
      };

      const res = await fetch("/api/teacher/health/student-daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(
          "[StudentHealthDailyClient] save HTTP error",
          res.status,
          text
        );
        setSavingState("error");
        return;
      }

      const data = await res.json();
      if (!data.ok) {
        console.error("[StudentHealthDailyClient] save server error", data);
        setSavingState("error");
        return;
      }

      setSavingState("saved");
      setTimeout(() => setSavingState("idle"), 1200);
    } catch (err) {
      console.error("[StudentHealthDailyClient] save error", err);
      setSavingState("error");
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-slate-600">
        Loading student daily health…
      </div>
    );
  }

  if (loadingError) {
    return (
      <div className="p-6 text-sm text-red-600">
        {loadingError} Please refresh or contact the office.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Top bar */}
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <div className="font-medium text-slate-800">
            {classroomName || "Classroom"}
          </div>
          <div className="text-slate-600">
            Date:{" "}
            <input
              type="date"
              className="rounded border border-slate-300 px-2 py-0.5 text-xs"
              value={currentDate}
              onChange={(e) => setCurrentDate(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1 text-[11px] text-slate-500">
          <span className="rounded-full bg-white px-2 py-0.5 border border-slate-200">
            Learners: {students.length}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white text-xs">
        <div className="max-h-[380px] overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                  Learner
                </th>
                <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                  Temp (°C)
                </th>
                <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                  Symptoms
                </th>
                <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, idx) => {
                const row = entries[s.id] ?? {
                  temperature: "",
                  symptoms: "",
                  notes: "",
                };
                const isOdd = idx % 2 === 1;
                return (
                  <tr
                    key={s.id}
                    className={isOdd ? "bg-slate-50/60" : "bg-white"}
                  >
                    <td className="border-b border-slate-100 px-3 py-1.5 align-top">
                      <div className="font-medium text-slate-900">{s.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {s.guardianName || ""}{" "}
                        {s.guardianPhone ? `• ${s.guardianPhone}` : ""}
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-1.5 align-top">
                      <input
                        type="number"
                        step="0.1"
                        min={30}
                        max={45}
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
                        value={row.temperature}
                        onChange={(e) =>
                          setEntries((prev) => ({
                            ...prev,
                            [s.id]: {
                              ...prev[s.id],
                              temperature: e.target.value,
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="border-b border-slate-100 px-3 py-1.5 align-top">
                      <input
                        type="text"
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        placeholder="Symptoms (if any)"
                        value={row.symptoms}
                        onChange={(e) =>
                          setEntries((prev) => ({
                            ...prev,
                            [s.id]: {
                              ...prev[s.id],
                              symptoms: e.target.value,
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="border-b border-slate-100 px-3 py-1.5 align-top">
                      <input
                        type="text"
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        placeholder="Notes (optional)"
                        value={row.notes}
                        onChange={(e) =>
                          setEntries((prev) => ({
                            ...prev,
                            [s.id]: {
                              ...prev[s.id],
                              notes: e.target.value,
                            },
                          }))
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-2.5">
          <button
            type="button"
            onClick={handleSave}
            disabled={savingState === "saving"}
            className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingState === "saving" ? "Saving…" : "Save health log"}
          </button>
          {savingState === "error" && (
            <span className="text-[11px] text-red-600">
              Failed to save. Please try again.
            </span>
          )}
          {savingState === "saved" && (
            <span className="text-[11px] text-emerald-600">
              Saved successfully.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentHealthDailyClient;
