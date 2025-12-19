// src/components/ParentPortalClient.tsx
"use client";

import { useEffect, useState } from "react";

type SafeStudent = {
  id: string;
  firstName: string;
  lastName: string;
};

type Props = {
  initialStudents: SafeStudent[];
};

type ParentStudentSummaryResponse = {
  ok: boolean;
  error?: string;
  tenantId?: string;
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    sex: string;
    guardianName: string;
    guardianPhone: string;
    guardianSmsOptIn: boolean;
    note: string;
    createdAt: string;
  };
  fees?: {
    invoiceCount: number;
    totalBilled: number;
    totalPaid: number;
    totalOutstanding: number;
    invoices: {
      id: string;
      term: string;
      academicYear: string;
      note: string | null;
      billed: number;
      paid: number;
      outstanding: number;
      createdAt: string;
    }[];
  };
  attendance?: {
    present: number;
    absent: number;
    late: number;
    other: number;
    totalMarks: number;
    attendanceRate: number | null;
  };
};

type SummaryState =
  | { status: "idle" }
  | { status: "loading"; studentId: string }
  | { status: "error"; message: string }
  | { status: "ready"; data: ParentStudentSummaryResponse };

export function ParentPortalClient({ initialStudents }: Props) {
  const [students] = useState<SafeStudent[]>(initialStudents);
  const [selectedId, setSelectedId] = useState<string | "">(
    initialStudents[0]?.id ?? ""
  );
  const [state, setState] = useState<SummaryState>({ status: "idle" });

  // Load summary whenever selectedId changes
  useEffect(() => {
    if (!selectedId) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;

    async function load() {
      setState({ status: "loading", studentId: selectedId });

      try {
        const res = await fetch(
          `/api/parent/student/summary?studentId=${encodeURIComponent(
            selectedId
          )}`,
          {
            method: "GET",
          }
        );

        const json: ParentStudentSummaryResponse = await res
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
              "Could not load your child’s summary. Please try again or contact the office.",
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
            "Network error while loading your child’s summary. Please check your connection and try again.",
        });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <section className="space-y-4">
      {/* Child selector */}
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900">
              Choose learner
            </h2>
            <p className="text-[11px] text-slate-500 max-w-xl">
              Select the learner you want to view. You&apos;ll see a simple
              summary of{" "}
              <span className="font-semibold">
                fees and attendance
              </span>{" "}
              based on records in EduLife OS.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:w-64"
            >
              {students.length === 0 ? (
                <option value="">No learners found</option>
              ) : (
                students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
        {students.length === 0 && (
          <p className="mt-2 text-[11px] text-red-700">
            There are currently no learners in this school for your
            account. Please contact the headteacher or ICT lead.
          </p>
        )}
      </div>

      {/* Summary area */}
      {selectedId && (
        <ChildSummary state={state} />
      )}
    </section>
  );
}

function ChildSummary({ state }: { state: SummaryState }) {
  if (state.status === "idle") {
    return null;
  }

  if (state.status === "loading") {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-[11px] text-emerald-900 shadow-sm">
        Loading your child&apos;s summary…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50/70 px-4 py-3 text-[11px] text-red-900 shadow-sm">
        {state.message}
      </div>
    );
  }

  const data = state.data;
  const student = data.student!;
  const fees = data.fees!;
  const attendance = data.attendance!;

  const attendanceRatePercent =
    attendance.attendanceRate !== null
      ? (attendance.attendanceRate * 100).toFixed(1)
      : null;

  return (
    <div className="space-y-4">
      {/* Identity card */}
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Learner
        </p>
        <p className="mt-1 text-lg font-semibold text-slate-900">
          {student.firstName} {student.lastName}
        </p>
        <div className="mt-1 text-[11px] text-slate-600 flex flex-wrap gap-3">
          {student.sex && (
            <span>
              Sex:{" "}
              <span className="font-semibold">
                {student.sex}
              </span>
            </span>
          )}
          {student.guardianPhone && (
            <span>
              Your phone on record:{" "}
              <span className="font-semibold">
                {student.guardianPhone}
              </span>
            </span>
          )}
          <span>
            SMS consent:{" "}
            <span className="font-semibold">
              {student.guardianSmsOptIn
                ? "Yes – school can send you updates"
                : "No – consent not recorded yet"}
            </span>
          </span>
        </div>
        {student.note && (
          <p className="mt-1 text-[11px] text-slate-500">
            School note: {student.note}
          </p>
        )}
      </div>

      {/* Two-column summary: Fees + Attendance */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Fees card */}
        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            Fees summary
          </p>
          <p className="mt-0.5 text-[11px] text-amber-900/90 max-w-xs">
            Overview of school fees recorded in EduLife OS for this
            learner.
          </p>

          <div className="mt-3 text-[11px] text-amber-900/90 space-y-0.5">
            <p>
              Total billed:{" "}
              <span className="font-semibold">
                GH₵ {fees.totalBilled.toFixed(2)}
              </span>
            </p>
            <p>
              Total paid:{" "}
              <span className="font-semibold">
                GH₵ {fees.totalPaid.toFixed(2)}
              </span>
            </p>
            <p>
              Outstanding balance:{" "}
              <span className="font-semibold">
                GH₵ {fees.totalOutstanding.toFixed(2)}
              </span>
            </p>
            <p className="text-[10px] text-amber-800/80">
              Invoices recorded: {fees.invoiceCount}
            </p>
          </div>

          <div className="mt-3 space-y-1 max-h-48 overflow-y-auto pr-1">
            {fees.invoices.length === 0 ? (
              <p className="text-[10px] text-amber-800/80">
                No invoices have been recorded yet for this learner.
                Please contact the school office if you have
                questions.
              </p>
            ) : (
              fees.invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="rounded-xl border border-amber-100 bg-white px-3 py-2 text-[10px] text-amber-900/90"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-semibold">
                      {inv.term} · {inv.academicYear}
                    </span>
                    <span className="text-amber-700/80">
                      {new Date(
                        inv.createdAt
                      ).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-0.5">
                    Billed: GH₵ {inv.billed.toFixed(2)} · Paid:
                    GH₵ {inv.paid.toFixed(2)} ·
                    Outstanding: GH₵{" "}
                    {inv.outstanding.toFixed(2)}
                  </div>
                  {inv.note && (
                    <div className="mt-0.5 text-amber-700/80">
                      Note: {inv.note}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Attendance card */}
        <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">
            Attendance summary
          </p>
          <p className="mt-0.5 text-[11px] text-sky-900/90 max-w-xs">
            Based on attendance records captured in EduLife OS.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-sky-900/90">
            <div>
              <p className="text-sky-700/80">Total school days recorded</p>
              <p className="mt-0.5 text-sm font-semibold text-sky-900">
                {attendance.totalMarks}
              </p>
              <p className="mt-0.5 text-[10px] text-sky-700/80">
                Each record = one day (or session) when the register
                was taken.
              </p>
            </div>
            <div>
              <p className="text-sky-700/80">Attendance rate</p>
              <p className="mt-0.5 text-sm font-semibold text-sky-900">
                {attendanceRatePercent !== null
                  ? `${attendanceRatePercent}%`
                  : "—"}
              </p>
              <p className="mt-0.5 text-[10px] text-sky-700/80">
                Based on days marked Present vs Absent.
              </p>
            </div>
          </div>

          <div className="mt-3 text-[11px] text-sky-900/90 space-y-0.5">
            <p>
              Present:{" "}
              <span className="font-semibold">
                {attendance.present}
              </span>{" "}
              · Absent:{" "}
              <span className="font-semibold">
                {attendance.absent}
              </span>
            </p>
            <p>
              Late:{" "}
              <span className="font-semibold">
                {attendance.late}
              </span>{" "}
              · Other:{" "}
              <span className="font-semibold">
                {attendance.other}
              </span>
            </p>
          </div>

          {attendance.totalMarks === 0 && (
            <p className="mt-2 text-[10px] text-sky-700/80">
              No attendance records have been captured yet for this
              learner in EduLife OS. Once teachers start recording
              attendance, this will update automatically.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
