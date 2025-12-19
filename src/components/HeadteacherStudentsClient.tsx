// src/components/HeadteacherStudentsClient.tsx
"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

export type StudentRow = {
  id: string;
  firstName: string;
  lastName: string;
  sex: string;
  guardianName: string;
  guardianPhone: string;
  guardianSmsOptIn: boolean;
  note: string;
  createdAt: string; // ISO
};

type Props = {
  initialStudents: StudentRow[];
};

type SaveState = {
  [id: string]:
    | { status: "idle" }
    | { status: "saving" }
    | { status: "saved" }
    | { status: "error"; message: string };
};

type NewRow = {
  firstName: string;
  lastName: string;
  sex: string;
  guardianName: string;
  guardianPhone: string;
  guardianSmsOptIn: boolean;
  note: string;
};

const EMPTY_NEW_ROW: NewRow = {
  firstName: "",
  lastName: "",
  sex: "",
  guardianName: "",
  guardianPhone: "",
  guardianSmsOptIn: false,
  note: "",
};

type FeesByStudentApiResponse = {
  ok: boolean;
  error?: string;
  tenantId?: string;
  byStudent?: {
    [studentId: string]: {
      billedPesewas: number;
      paidPesewas: number;
      outstandingPesewas: number;
      billed: number;
      paid: number;
      outstanding: number;
      invoiceCount: number;
    };
  };
};

type FeesMap = {
  [studentId: string]: {
    billed: number;
    paid: number;
    outstanding: number;
    invoiceCount: number;
  };
};

type FeesDetailResponse = {
  ok: boolean;
  error?: string;
  studentId?: string;
  invoices?: {
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

type FeesDetail = {
  id: string;
  term: string;
  academicYear: string;
  note: string | null;
  billed: number;
  paid: number;
  outstanding: number;
  createdAt: string;
};

type FeesDetailMap = {
  [studentId: string]: FeesDetail[];
};

// Attendance API types
type AttendanceByStudentApiResponse = {
  ok: boolean;
  error?: string;
  tenantId?: string;
  byStudent?: {
    [studentId: string]: {
      present: number;
      absent: number;
      late: number;
      other: number;
      totalMarks: number;
      attendanceRate: number | null;
    };
  };
};

type AttendanceMap = {
  [studentId: string]: {
    present: number;
    absent: number;
    late: number;
    other: number;
    totalMarks: number;
    attendanceRate: number | null;
  };
};

export function HeadteacherStudentsClient({ initialStudents }: Props) {
  const [rows, setRows] = useState<StudentRow[]>(initialStudents);
  const [filter, setFilter] = useState("");
  const [saveState, setSaveState] = useState<SaveState>(() => {
    const m: SaveState = {};
    for (const s of initialStudents) {
      m[s.id] = { status: "idle" };
    }
    return m;
  });

  // New learner form state
  const [newRow, setNewRow] = useState<NewRow>({ ...EMPTY_NEW_ROW });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Per-learner fees summary (from API)
  const [feesMap, setFeesMap] = useState<FeesMap>({});
  const [feesStatus, setFeesStatus] = useState<
    "idle" | "loading" | "error"
  >("loading");
  const [feesError, setFeesError] = useState<string | null>(null);

  // Per-learner invoice details (expanded)
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(
    null
  );
  const [feesDetailMap, setFeesDetailMap] = useState<FeesDetailMap>({});
  const [feesDetailStatus, setFeesDetailStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [feesDetailError, setFeesDetailError] = useState<string | null>(
    null
  );

  // Per-learner attendance summary (from API)
  const [attendanceMap, setAttendanceMap] = useState<AttendanceMap>({});
  const [attendanceStatus, setAttendanceStatus] = useState<
    "idle" | "loading" | "error"
  >("loading");
  const [attendanceError, setAttendanceError] = useState<string | null>(
    null
  );

  // Load fees summary once on mount
  useEffect(() => {
    let cancelled = false;

    async function loadFeesSummary() {
      try {
        setFeesStatus("loading");
        setFeesError(null);

        const res = await fetch(
          "/api/headteacher/students/fees-summary",
          {
            method: "GET",
          }
        );

        const json: FeesByStudentApiResponse = await res
          .json()
          .catch(() => ({ ok: false, error: "Invalid JSON from server" }));

        if (cancelled) return;

        if (!res.ok || !json.ok) {
          setFeesStatus("error");
          setFeesError(
            json.error ||
              "Could not load per-learner fees summary. Please try again."
          );
          return;
        }

        const raw = json.byStudent || {};
        const nextFees: FeesMap = {};
        for (const [studentId, v] of Object.entries(raw)) {
          nextFees[studentId] = {
            billed: v.billed ?? 0,
            paid: v.paid ?? 0,
            outstanding: v.outstanding ?? 0,
            invoiceCount: v.invoiceCount ?? 0,
          };
        }

        setFeesMap(nextFees);
        setFeesStatus("idle");
      } catch (err) {
        if (cancelled) return;
        setFeesStatus("error");
        setFeesError(
          "Network error while loading per-learner fees summary."
        );
      }
    }

    loadFeesSummary();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load attendance summary once on mount
  useEffect(() => {
    let cancelled = false;

    async function loadAttendanceSummary() {
      try {
        setAttendanceStatus("loading");
        setAttendanceError(null);

        const res = await fetch(
          "/api/headteacher/students/attendance-summary",
          {
            method: "GET",
          }
        );

        const json: AttendanceByStudentApiResponse = await res
          .json()
          .catch(() => ({ ok: false, error: "Invalid JSON from server" }));

        if (cancelled) return;

        if (!res.ok || !json.ok) {
          setAttendanceStatus("error");
          setAttendanceError(
            json.error ||
              "Could not load per-learner attendance summary. Please try again."
          );
          return;
        }

        const raw = json.byStudent || {};
        const nextAttendance: AttendanceMap = {};
        for (const [studentId, v] of Object.entries(raw)) {
          nextAttendance[studentId] = {
            present: v.present ?? 0,
            absent: v.absent ?? 0,
            late: v.late ?? 0,
            other: v.other ?? 0,
            totalMarks: v.totalMarks ?? 0,
            attendanceRate:
              typeof v.attendanceRate === "number"
                ? v.attendanceRate
                : null,
          };
        }

        setAttendanceMap(nextAttendance);
        setAttendanceStatus("idle");
      } catch (err) {
        if (cancelled) return;
        setAttendanceStatus("error");
        setAttendanceError(
          "Network error while loading per-learner attendance summary."
        );
      }
    }

    loadAttendanceSummary();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((s) => {
      const name = `${s.firstName} ${s.lastName}`.toLowerCase();
      const phone = (s.guardianPhone ?? "").toLowerCase();
      return (
        name.includes(q) ||
        phone.includes(q) ||
        (s.guardianName ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter]);

  function updateRow(id: string, patch: Partial<StudentRow>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
    setSaveState((prev) => ({
      ...prev,
      [id]: { status: "idle" },
    }));
  }

  async function handleSave(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;

    setSaveState((prev) => ({
      ...prev,
      [id]: { status: "saving" },
    }));

    try {
      const res = await fetch("/api/headteacher/students/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: row.id,
          sex: row.sex || null,
          guardianName: row.guardianName || null,
          guardianPhone: row.guardianPhone || null,
          guardianSmsOptIn: row.guardianSmsOptIn,
          note: row.note || null,
        }),
      });

      const j = await res
        .json()
        .catch(() => ({ ok: false, error: "Invalid JSON" }));

      if (!res.ok || !j.ok) {
        const msg =
          j.error || "Could not save changes. Please try again.";
        setSaveState((prev) => ({
          ...prev,
          [id]: { status: "error", message: msg },
        }));
        return;
      }

      setSaveState((prev) => ({
        ...prev,
        [id]: { status: "saved" },
      }));

      // Reset back to idle after a short delay
      setTimeout(() => {
        setSaveState((prev) => ({
          ...prev,
          [id]: { status: "idle" },
        }));
      }, 1500);
    } catch (err) {
      setSaveState((prev) => ({
        ...prev,
        [id]: {
          status: "error",
          message:
            "Network error while saving. Check your connection and try again.",
        },
      }));
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);

    if (!newRow.firstName.trim() || !newRow.lastName.trim()) {
      setCreateError("First name and last name are required.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/headteacher/students/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: newRow.firstName,
          lastName: newRow.lastName,
          sex: newRow.sex,
          guardianName: newRow.guardianName,
          guardianPhone: newRow.guardianPhone,
          guardianSmsOptIn: newRow.guardianSmsOptIn,
          note: newRow.note,
        }),
      });

      const j = await res
        .json()
        .catch(() => ({ ok: false, error: "Invalid JSON" }));

      if (!res.ok || !j.ok) {
        setCreateError(
          j.error ||
            "Could not create learner. Please check the details and try again."
        );
        setCreating(false);
        return;
      }

      const created = (j.student || {}) as any;

      const newStudent: StudentRow = {
        id: created.id,
        firstName: created.firstName ?? "",
        lastName: created.lastName ?? "",
        sex: created.sex ?? "",
        guardianName: created.guardianName ?? "",
        guardianPhone: created.guardianPhone ?? "",
        guardianSmsOptIn: !!created.guardianSmsOptIn,
        note: created.note ?? "",
        createdAt: created.createdAt ?? new Date().toISOString(),
      };

      // Add to the top of the list
      setRows((prev) => [newStudent, ...prev]);
      setSaveState((prev) => ({
        ...prev,
        [newStudent.id]: { status: "idle" },
      }));

      // Reset the form
      setNewRow({ ...EMPTY_NEW_ROW });
      setCreateError(null);
    } catch (err) {
      setCreateError(
        "Network error while creating learner. Check your connection and try again."
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleInvoices(studentId: string) {
    // Collapse if clicking the same student again
    if (expandedStudentId === studentId) {
      setExpandedStudentId(null);
      setFeesDetailError(null);
      return;
    }

    // If already loaded, just show
    if (feesDetailMap[studentId]) {
      setExpandedStudentId(studentId);
      setFeesDetailError(null);
      return;
    }

    // Otherwise, fetch from API
    try {
      setFeesDetailStatus("loading");
      setFeesDetailError(null);

      const res = await fetch(
        `/api/headteacher/students/fees-detail?studentId=${encodeURIComponent(
          studentId
        )}`,
        {
          method: "GET",
        }
      );

      const json: FeesDetailResponse = await res
        .json()
        .catch(() => ({ ok: false, error: "Invalid JSON from server" }));

      if (!res.ok || !json.ok) {
        setFeesDetailStatus("error");
        setFeesDetailError(
          json.error ||
            "Could not load fee invoices for this learner. Please try again."
        );
        return;
      }

      const details = (json.invoices || []).map((inv) => ({
        id: inv.id,
        term: inv.term,
        academicYear: inv.academicYear,
        note: inv.note ?? null,
        billed: inv.billed ?? 0,
        paid: inv.paid ?? 0,
        outstanding: inv.outstanding ?? 0,
        createdAt: inv.createdAt,
      }));

      setFeesDetailMap((prev) => ({
        ...prev,
        [studentId]: details,
      }));
      setExpandedStudentId(studentId);
      setFeesDetailStatus("idle");
    } catch (err) {
      setFeesDetailStatus("error");
      setFeesDetailError(
        "Network error while loading fee invoices for this learner."
      );
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-900">
            Students & guardians
          </h2>
          <p className="text-[11px] text-slate-500 max-w-xl">
            Search a learner and update{" "}
            <span className="font-semibold">
              guardian name, phone and SMS consent
            </span>{" "}
            before sending any broadcast messages. You can also{" "}
            <span className="font-semibold">add new learners</span> here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search by learner / guardian / phone"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:w-64"
          />
        </div>
      </div>

      {/* New learner form */}
      <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        <form
          onSubmit={handleCreate}
          className="grid gap-2 md:grid-cols-5 md:items-end"
        >
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-700">
              First name
            </label>
            <input
              type="text"
              value={newRow.firstName}
              onChange={(e) =>
                setNewRow((prev) => ({
                  ...prev,
                  firstName: e.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="e.g. Akosua"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-700">
              Last name
            </label>
            <input
              type="text"
              value={newRow.lastName}
              onChange={(e) =>
                setNewRow((prev) => ({
                  ...prev,
                  lastName: e.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="e.g. Mensah"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-700">
              Sex
            </label>
            <select
              value={newRow.sex}
              onChange={(e) =>
                setNewRow((prev) => ({
                  ...prev,
                  sex: e.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">—</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-700">
              Guardian phone
            </label>
            <input
              type="tel"
              value={newRow.guardianPhone}
              onChange={(e) =>
                setNewRow((prev) => ({
                  ...prev,
                  guardianPhone: e.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="e.g. 0244…"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-700">
              &nbsp;
            </label>
            <button
              type="submit"
              disabled={creating}
              className="w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              {creating ? "Adding learner…" : "Add learner"}
            </button>
          </div>
        </form>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1 text-[11px] text-slate-700">
            <input
              type="checkbox"
              checked={newRow.guardianSmsOptIn}
              onChange={(e) =>
                setNewRow((prev) => ({
                  ...prev,
                  guardianSmsOptIn: e.target.checked,
                }))
              }
              className="h-3 w-3 rounded border-slate-400"
            />
            <span>Guardian consents to SMS</span>
          </label>
          {createError && (
            <span className="text-[11px] text-red-600">{createError}</span>
          )}
          {!createError && (
            <span className="text-[10px] text-slate-500">
              Tip: you can fill in guardian name and note later via the table
              below.
            </span>
          )}
        </div>
      </div>

      {/* Summary load statuses */}
      {feesStatus === "error" && feesError && (
        <div className="border-b border-red-100 bg-red-50/70 px-4 py-2 text-[11px] text-red-800">
          Could not load per-learner fees summary: {feesError}
        </div>
      )}
      {feesStatus === "loading" && (
        <div className="border-b border-emerald-100 bg-emerald-50/60 px-4 py-2 text-[11px] text-emerald-800">
          Loading per-learner fees summary…
        </div>
      )}
      {attendanceStatus === "error" && attendanceError && (
        <div className="border-b border-red-100 bg-red-50/70 px-4 py-2 text-[11px] text-red-800">
          Could not load per-learner attendance summary:{" "}
          {attendanceError}
        </div>
      )}
      {attendanceStatus === "loading" && (
        <div className="border-b border-sky-100 bg-sky-50/70 px-4 py-2 text-[11px] text-sky-800">
          Loading per-learner attendance summary…
        </div>
      )}
      {feesDetailStatus === "error" && feesDetailError && (
        <div className="border-b border-red-100 bg-red-50/70 px-4 py-2 text-[11px] text-red-800">
          {feesDetailError}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <Th align="left">Learner</Th>
              <Th align="left">Sex</Th>
              <Th align="left">Guardian name</Th>
              <Th align="left">Guardian phone</Th>
              <Th align="left">Guardian SMS</Th>
              <Th align="left">Attendance</Th>
              <Th align="left">Fees (GH₵)</Th>
              <Th align="left">Note</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, idx) => {
              const state = saveState[s.id] || { status: "idle" };
              const zebra =
                idx % 2 === 1 ? "bg-slate-50/60" : "bg-white";
              const fees = feesMap[s.id];
              const details = feesDetailMap[s.id];
              const att = attendanceMap[s.id];

              let rateDisplay = "—";
              if (att && att.attendanceRate !== null) {
                rateDisplay = `${(att.attendanceRate * 100).toFixed(
                  1
                )}%`;
              }

              return (
                <Fragment key={s.id}>
                  <tr className={zebra}>
                    {/* Learner name */}
                    <td className="px-3 py-2 align-top text-slate-900">
                      <div className="font-semibold text-[11px]">
                        {s.firstName} {s.lastName}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        ID: {s.id.slice(0, 8)}…
                      </div>
                    </td>

                    {/* Sex */}
                    <td className="px-3 py-2 align-top">
                      <select
                        value={s.sex || ""}
                        onChange={(e) =>
                          updateRow(s.id, {
                            sex: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="">—</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </td>

                    {/* Guardian name */}
                    <td className="px-3 py-2 align-top">
                      <input
                        type="text"
                        value={s.guardianName}
                        onChange={(e) =>
                          updateRow(s.id, {
                            guardianName: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        placeholder="Guardian full name"
                      />
                    </td>

                    {/* Guardian phone */}
                    <td className="px-3 py-2 align-top">
                      <input
                        type="tel"
                        value={s.guardianPhone}
                        onChange={(e) =>
                          updateRow(s.id, {
                            guardianPhone: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        placeholder="e.g. 0244…"
                      />
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        Use the guardian&apos;s WhatsApp / active line.
                      </div>
                    </td>

                    {/* Guardian SMS opt-in */}
                    <td className="px-3 py-2 align-top">
                      <label className="inline-flex items-center gap-1 text-[11px] text-slate-700">
                        <input
                          type="checkbox"
                          checked={s.guardianSmsOptIn}
                          onChange={(e) =>
                            updateRow(s.id, {
                              guardianSmsOptIn: e.target.checked,
                            })
                          }
                          className="h-3 w-3 rounded border-slate-400"
                        />
                        <span>Consent to SMS</span>
                      </label>
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        Tick only when they have agreed.
                      </div>
                    </td>

                    {/* Attendance */}
                    <td className="px-3 py-2 align-top text-slate-900">
                      {att ? (
                        <div className="space-y-0.5">
                          <div className="text-[11px]">
                            Present:{" "}
                            <span className="font-semibold">
                              {att.present}
                            </span>{" "}
                            / {att.totalMarks}
                          </div>
                          <div className="text-[10px] text-slate-600">
                            Rate:{" "}
                            <span className="font-semibold">
                              {rateDisplay}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Absent: {att.absent} · Late: {att.late}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400">
                          No attendance records yet for this learner.
                        </div>
                      )}
                    </td>

                    {/* Fees (GH₵) */}
                    <td className="px-3 py-2 align-top text-slate-900">
                      {fees ? (
                        <div className="space-y-0.5">
                          <div className="text-[11px]">
                            Outstanding:{" "}
                            <span className="font-semibold">
                              GH₵ {fees.outstanding.toFixed(2)}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-600">
                            Billed: GH₵ {fees.billed.toFixed(2)} · Paid:
                            GH₵ {fees.paid.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center justify-between gap-2">
                            <span>
                              Invoices: {fees.invoiceCount}
                            </span>
                            {fees.invoiceCount > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleInvoices(s.id)
                                }
                                className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-800 underline"
                              >
                                {expandedStudentId === s.id
                                  ? "Hide"
                                  : "View invoices"}
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400">
                          No invoices yet for this learner.
                        </div>
                      )}
                    </td>

                    {/* Note */}
                    <td className="px-3 py-2 align-top">
                      <textarea
                        value={s.note}
                        onChange={(e) =>
                          updateRow(s.id, {
                            note: e.target.value,
                          })
                        }
                        rows={2}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        placeholder="e.g. lives with grandmother; prefers SMS after 4pm."
                      />
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2 align-top text-right">
                      <button
                        type="button"
                        onClick={() => handleSave(s.id)}
                        disabled={state.status === "saving"}
                        className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {state.status === "saving"
                          ? "Saving…"
                          : "Save"}
                      </button>
                      {state.status === "saved" && (
                        <div className="mt-1 text-[10px] text-emerald-700">
                          Saved ✓
                        </div>
                      )}
                      {state.status === "error" && "message" in state && (
                        <div className="mt-1 max-w-[10rem] text-[10px] text-red-600">
                          {state.message}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Expanded invoice details row */}
                  {expandedStudentId === s.id && (
                    <tr className={zebra}>
                      <td
                        colSpan={9}
                        className="px-3 pb-3 pt-0 text-[11px]"
                      >
                        <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-[11px] font-semibold text-slate-800 mb-1">
                            Fee invoices for {s.firstName} {s.lastName}
                          </p>
                          {!details || details.length === 0 ? (
                            <p className="text-[10px] text-slate-500">
                              No invoice details found for this learner.
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {details.map((inv) => (
                                <div
                                  key={inv.id}
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-1">
                                    <div className="text-[10px] font-semibold text-slate-800">
                                      {inv.term} · {inv.academicYear}
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      Created:{" "}
                                      {new Date(
                                        inv.createdAt
                                      ).toLocaleDateString()}
                                    </div>
                                  </div>
                                  <div className="mt-0.5 text-[10px] text-slate-700">
                                    Billed: GH₵{" "}
                                    {inv.billed.toFixed(2)} · Paid:
                                    GH₵ {inv.paid.toFixed(2)} ·
                                    Outstanding: GH₵{" "}
                                    {inv.outstanding.toFixed(2)}
                                  </div>
                                  {inv.note && (
                                    <div className="mt-0.5 text-[10px] text-slate-500">
                                      Note: {inv.note}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-6 text-center text-[11px] text-slate-500"
                >
                  No learners match your search. Try a different
                  name, guardian, or phone number.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500">
        Tip: for your 31st March demo, you can fully populate{" "}
        <span className="font-semibold">
          one JHS class and a few KG learners
        </span>{" "}
        so that fees, attendance and health SMS all feel real.
      </div>
    </section>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-2 text-[11px] font-semibold text-slate-500 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
