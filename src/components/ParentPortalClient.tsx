// src/components/ParentPortalClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

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
    sex: string | null;
    guardianName: string | null;
    guardianPhone: string | null;
    guardianSmsOptIn: boolean;
    note: string | null;
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
    attendanceRate: number | null; // 0..1
  };
};

type SummaryState =
  | { status: "idle" }
  | { status: "loading"; studentId: string }
  | { status: "error"; message: string }
  | { status: "ready"; data: ParentStudentSummaryResponse };

function safeNum(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(v: unknown) {
  return safeNum(v, 0).toFixed(2);
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    const ct = res.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function ParentPortalClient({ initialStudents }: Props) {
  const students = Array.isArray(initialStudents) ? initialStudents : [];
  const [selectedId, setSelectedId] = useState<string>(students[0]?.id ?? "");
  const [state, setState] = useState<SummaryState>({ status: "idle" });

  // If students load empty or change, keep selection safe.
  useEffect(() => {
    if (students.length === 0) {
      setSelectedId("");
      setState({ status: "idle" });
      return;
    }
    if (!selectedId || !students.some((s) => s.id === selectedId)) {
      setSelectedId(students[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students.length]);

  useEffect(() => {
    // Never fetch when no learner is selected
    if (!selectedId) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;

    (async () => {
      setState({ status: "loading", studentId: selectedId });

      try {
        const res = await fetch(`/api/parent/student/summary?studentId=${encodeURIComponent(selectedId)}`, {
          method: "GET",
          cache: "no-store",
        });

        const json =
          (await safeJson<ParentStudentSummaryResponse>(res)) ??
          ({
            ok: false,
            error: `Server returned non-JSON (HTTP ${res.status}).`,
          } as ParentStudentSummaryResponse);

        if (cancelled) return;

        if (!res.ok || !json.ok) {
          setState({
            status: "error",
            message:
              json.error ||
              (res.status === 401
                ? "Session expired. Please login again."
                : res.status === 403
                ? "Access denied for this learner."
                : "Could not load the summary. Please try again."),
          });
          return;
        }

        if (!json.student || !json.fees || !json.attendance) {
          setState({
            status: "error",
            message: "Summary is incomplete. Please refresh or contact the school office.",
          });
          return;
        }

        setState({ status: "ready", data: json });
      } catch {
        if (cancelled) return;
        setState({
          status: "error",
          message: "Network error while loading summary. Check connection and try again.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selectedLabel = useMemo(() => {
    const s = students.find((x) => x.id === selectedId);
    if (!s) return "Select learner";
    return `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || "Select learner";
  }, [students, selectedId]);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900">Choose learner</h2>
            <p className="text-[11px] text-slate-500 max-w-xl">
              Select the learner you want to view. You&apos;ll see a simple summary of{" "}
              <span className="font-semibold">fees and attendance</span>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:w-64"
              aria-label="Select learner"
              disabled={students.length === 0}
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

        {students.length === 0 ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            No learners are linked to this phone number in the school records yet. Please contact the school office to
            confirm the phone number on your child&apos;s file.
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">
            Viewing: <span className="font-semibold">{selectedLabel}</span>
          </p>
        )}
      </div>

      {selectedId ? <ChildSummary state={state} /> : null}
    </section>
  );
}

function ChildSummary({ state }: { state: SummaryState }) {
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-[11px] text-emerald-900 shadow-sm">
        Loading summary…
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
    attendance.attendanceRate != null && Number.isFinite(attendance.attendanceRate)
      ? (attendance.attendanceRate * 100).toFixed(1)
      : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Learner</p>
        <p className="mt-1 text-lg font-semibold text-slate-900">
          {student.firstName} {student.lastName}
        </p>

        <div className="mt-1 text-[11px] text-slate-600 flex flex-wrap gap-3">
          {student.sex ? (
            <span>
              Sex: <span className="font-semibold">{student.sex}</span>
            </span>
          ) : null}

          {student.guardianPhone ? (
            <span>
              Your phone on record: <span className="font-semibold">{student.guardianPhone}</span>
            </span>
          ) : null}

          <span>
            SMS consent:{" "}
            <span className="font-semibold">
              {student.guardianSmsOptIn ? "Yes – school can send updates" : "No – consent not recorded yet"}
            </span>
          </span>
        </div>

        {student.note ? <p className="mt-1 text-[11px] text-slate-500">School note: {student.note}</p> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">Fees summary</p>
          <p className="mt-0.5 text-[11px] text-amber-900/90 max-w-xs">Overview of school fees recorded for this learner.</p>

          <div className="mt-3 text-[11px] text-amber-900/90 space-y-0.5">
            <p>
              Total billed: <span className="font-semibold">GH₵ {formatMoney(fees.totalBilled)}</span>
            </p>
            <p>
              Total paid: <span className="font-semibold">GH₵ {formatMoney(fees.totalPaid)}</span>
            </p>
            <p>
              Outstanding balance: <span className="font-semibold">GH₵ {formatMoney(fees.totalOutstanding)}</span>
            </p>
            <p className="text-[10px] text-amber-800/80">Invoices recorded: {safeNum(fees.invoiceCount, 0)}</p>
          </div>

          <div className="mt-3 space-y-1 max-h-48 overflow-y-auto pr-1">
            {Array.isArray(fees.invoices) && fees.invoices.length > 0 ? (
              fees.invoices.map((inv) => (
                <div key={inv.id} className="rounded-xl border border-amber-100 bg-white px-3 py-2 text-[10px] text-amber-900/90">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-semibold">
                      {inv.term} · {inv.academicYear}
                    </span>
                    <span className="text-amber-700/80">{new Date(inv.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-0.5">
                    Billed: GH₵ {formatMoney(inv.billed)} · Paid: GH₵ {formatMoney(inv.paid)} · Outstanding: GH₵{" "}
                    {formatMoney(inv.outstanding)}
                  </div>
                  {inv.note ? <div className="mt-0.5 text-amber-700/80">Note: {inv.note}</div> : null}
                </div>
              ))
            ) : (
              <p className="text-[10px] text-amber-800/80">
                No invoices recorded yet for this learner. Contact the school office if you have questions.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">Attendance summary</p>
          <p className="mt-0.5 text-[11px] text-sky-900/90 max-w-xs">Based on attendance records captured in EduLife OS.</p>

          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-sky-900/90">
            <div>
              <p className="text-sky-700/80">Total school days recorded</p>
              <p className="mt-0.5 text-sm font-semibold text-sky-900">{safeNum(attendance.totalMarks, 0)}</p>
              <p className="mt-0.5 text-[10px] text-sky-700/80">Each record = one session when attendance was taken.</p>
            </div>
            <div>
              <p className="text-sky-700/80">Attendance rate</p>
              <p className="mt-0.5 text-sm font-semibold text-sky-900">
                {attendanceRatePercent !== null ? `${attendanceRatePercent}%` : "—"}
              </p>
              <p className="mt-0.5 text-[10px] text-sky-700/80">Present + Excused out of total marks.</p>
            </div>
          </div>

          <div className="mt-3 text-[11px] text-sky-900/90 space-y-0.5">
            <p>
              Present: <span className="font-semibold">{safeNum(attendance.present, 0)}</span> · Absent:{" "}
              <span className="font-semibold">{safeNum(attendance.absent, 0)}</span>
            </p>
            <p>
              Late: <span className="font-semibold">{safeNum(attendance.late, 0)}</span> · Other:{" "}
              <span className="font-semibold">{safeNum(attendance.other, 0)}</span>
            </p>
          </div>

          {safeNum(attendance.totalMarks, 0) === 0 ? (
            <p className="mt-2 text-[10px] text-sky-700/80">
              No attendance records yet for this learner. Once teachers start recording attendance, this updates automatically.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}