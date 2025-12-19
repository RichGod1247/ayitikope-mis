// src/components/HeadteacherAttendanceSummaryCard.tsx
"use client";

import React, { useEffect, useState } from "react";

type AttendanceSummaryResponse = {
  ok: boolean;
  error?: string;
  tenantId?: string;
  totalMarks?: number;
  byStatus?: {
    present: number;
    absent: number;
    late: number;
    other: number;
  };
  attendanceRate?: number | null;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      data: {
        totalMarks: number;
        present: number;
        absent: number;
        late: number;
        other: number;
        attendanceRate: number | null;
      };
    };

export function HeadteacherAttendanceSummaryCard() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          "/api/headteacher/attendance/summary",
          {
            method: "GET",
          }
        );

        const json: AttendanceSummaryResponse = await res
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
              "Could not load attendance summary. Please try again or contact the office.",
          });
          return;
        }

        const byStatus = json.byStatus || {
          present: 0,
          absent: 0,
          late: 0,
          other: 0,
        };

        setState({
          status: "ready",
          data: {
            totalMarks: json.totalMarks ?? 0,
            present: byStatus.present ?? 0,
            absent: byStatus.absent ?? 0,
            late: byStatus.late ?? 0,
            other: byStatus.other ?? 0,
            attendanceRate:
              typeof json.attendanceRate === "number"
                ? json.attendanceRate
                : null,
          },
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            "Network error while loading attendance summary. Check your connection and try again.",
        });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">
          Attendance pulse
        </p>
        <p className="mt-1 text-[11px] text-sky-900/80">
          Loading live attendance summary…
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50/70 px-4 py-3 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-red-800">
          Attendance pulse
        </p>
        <p className="mt-1 text-[11px] text-red-900/80">
          {state.message}
        </p>
        <p className="mt-1 text-[10px] text-red-800/80">
          Once your database connection is restored and teachers start
          marking attendance in EduLife OS, this tile will show the
          real-time picture.
        </p>
      </div>
    );
  }

  const { totalMarks, present, absent, late, other, attendanceRate } =
    state.data;

  const ratePercent =
    attendanceRate !== null
      ? (attendanceRate * 100).toFixed(1)
      : null;

  return (
    <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 shadow-sm h-full">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">
            Attendance pulse – live
          </p>
          <p className="mt-0.5 text-[11px] text-sky-900/80 max-w-xs">
            Overview of all attendance marks recorded in{" "}
            <span className="font-semibold">EduLife OS</span> for this
            school.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <p className="text-sky-700/80">Total marks</p>
          <p className="mt-0.5 text-sm font-semibold text-sky-900">
            {totalMarks}
          </p>
          <p className="mt-0.5 text-[10px] text-sky-700/80">
            Each mark = one learner recorded (present/absent/late).
          </p>
        </div>
        <div>
          <p className="text-sky-700/80">Attendance rate</p>
          {ratePercent !== null ? (
            <p className="mt-0.5 text-sm font-semibold text-sky-900">
              {ratePercent}%
            </p>
          ) : (
            <p className="mt-0.5 text-sm font-semibold text-sky-900">
              —
            </p>
          )}
          <p className="mt-0.5 text-[10px] text-sky-700/80">
            Based on Present vs Absent. Late/Other are tracked
            separately.
          </p>
        </div>
      </div>

      <div className="mt-2 text-[11px] text-sky-900/80 space-y-0.5">
        <p>
          Present:{" "}
          <span className="font-semibold">
            {present}
          </span>{" "}
          · Absent:{" "}
          <span className="font-semibold">
            {absent}
          </span>
        </p>
        <p>
          Late:{" "}
          <span className="font-semibold">
            {late}
          </span>{" "}
          · Other:{" "}
          <span className="font-semibold">
            {other}
          </span>
        </p>
        {totalMarks === 0 && (
          <p className="text-[10px] text-sky-700/80">
            No attendance records yet. Once teachers start using the
            class registers or the EduLife OS device, this will update
            automatically.
          </p>
        )}
      </div>
    </div>
  );
}
