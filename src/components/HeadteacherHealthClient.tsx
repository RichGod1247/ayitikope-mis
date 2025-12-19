// src/components/HeadteacherHealthClient.tsx
"use client";

import { useEffect, useState } from "react";

type HealthSummaryResponse = {
  ok: boolean;
  error?: string;
  tenantId?: string;
  windows?: {
    studentDailySince: string;
    teacherWeeklySince: string;
  };
  studentDaily?: {
    entriesLast7Days: number;
  };
  teacherWeekly?: {
    entriesLast28Days: number;
  };
};

type HealthState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: HealthSummaryResponse };

export function HeadteacherHealthClient() {
  const [state, setState] = useState<HealthState>({
    status: "idle",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: "loading" });

      try {
        const res = await fetch(
          "/api/headteacher/health/summary",
          { method: "GET" }
        );

        const json: HealthSummaryResponse = await res
          .json()
          .catch(() => ({
            ok: false,
            error: "Invalid JSON from server",
          }));

        if (cancelled) return;

        if (!res.ok || !json.ok) {
          setState({
            status: "error",
            message:
              json.error ||
              "Could not load health summary. Please try again.",
          });
          return;
        }

        setState({
          status: "ready",
          data: json,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            "Network error while loading health summary. Please check your connection and try again.",
        });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "idle" || state.status === "loading") {
    return (
      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-[11px] text-emerald-900 shadow-sm">
        Loading health & wellbeing pulse…
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="rounded-2xl border border-red-100 bg-red-50/70 px-4 py-3 text-[11px] text-red-900 shadow-sm">
        {state.message}
      </section>
    );
  }

  const data = state.data;
  const studentDailyCount =
    data.studentDaily?.entriesLast7Days ?? 0;
  const teacherWeeklyCount =
    data.teacherWeekly?.entriesLast28Days ?? 0;

  const windows = data.windows || {
    studentDailySince: "",
    teacherWeeklySince: "",
  };

  const studentSinceStr = windows.studentDailySince
    ? new Date(windows.studentDailySince).toLocaleDateString()
    : "—";
  const teacherSinceStr = windows.teacherWeeklySince
    ? new Date(windows.teacherWeeklySince).toLocaleDateString()
    : "—";

  return (
    <section className="space-y-4">
      {/* Summary tiles */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Student health pulse */}
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-900">
            Student health entries (last 7 days)
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Number of{" "}
            <span className="font-semibold">
              daily health check-ins
            </span>{" "}
            recorded for learners in the last week.
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-emerald-700">
              {studentDailyCount}
            </span>
            <span className="text-[11px] text-slate-500">
              entries since {studentSinceStr}
            </span>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Future slice: break this down by{" "}
            <span className="font-semibold">“fine”, “unwell”</span>{" "}
            and trigger SMS alerts for repeated issues.
          </p>
        </div>

        {/* Teacher wellbeing pulse */}
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-900">
            Teacher wellbeing check-ins (last 28 days)
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Number of{" "}
            <span className="font-semibold">
              weekly wellbeing updates
            </span>{" "}
            recorded by teachers in roughly the last month.
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-emerald-700">
              {teacherWeeklyCount}
            </span>
            <span className="text-[11px] text-slate-500">
              entries since {teacherSinceStr}
            </span>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Future slice: surface trends (stress, joy, burnout) and
            nudge you when a teacher might need support.
          </p>
        </div>
      </div>

      {/* Narrative hint */}
      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-[11px] text-slate-700 shadow-sm">
        <p className="font-semibold text-slate-900 mb-1">
          Reading the pulse
        </p>
        <p className="mb-1">
          Even a small number of entries is better than zero. It
          means your school is{" "}
          <span className="font-semibold">
            talking about health, not only scores
          </span>
          .
        </p>
        <p>
          In later phases, each entry will link to{" "}
          <span className="font-semibold">specific cases</span>, SMS
          nudges, and patterns that help you protect both learners and
          teachers.
        </p>
      </div>
    </section>
  );
}
