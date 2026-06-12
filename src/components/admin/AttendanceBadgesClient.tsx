//src/components/admin/AttendanceBadgesClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as QRCode from "qrcode";
import AttendanceScanAuditPanel from "@/components/attendance/AttendanceScanAuditPanel";

type ClassroomOption = {
  id: string;
  label: string;
  status?: string | null;
  activeLearnerCount?: number;
  hasArm?: boolean;
};

type ClassroomListResponse = {
  ok: boolean;
  items?: ClassroomOption[];
  error?: string;
};

type BadgeState = "NO_BADGE" | "ACTIVE" | "REVOKED";

type BadgeListItem = {
  student: {
    id: string;
    name: string;
    guardianName?: string | null;
    guardianPhone?: string | null;
    guardianSmsOptIn?: boolean | null;
    classroomId?: string | null;
    classroomLabel: string;
  };
  badgeState: BadgeState;
  badge: {
    id: string;
    tokenHint: string | null;
    label: string | null;
    issuedAt: string | null;
    lastUsedAt: string | null;
    revokedAt: string | null;
    revokeReason: string | null;
  } | null;
  activeBadgeId: string | null;
  badgeCount: number;
};

type BadgeListResponse = {
  ok: boolean;
  error?: string;
  tenant?: {
    id: string;
    name: string;
    schoolCode: string | null;
  };
  classroom?: {
    id: string;
    label: string;
  };
  summary?: {
    totalLearners: number;
    activeBadges: number;
    revokedOnly: number;
    noBadge: number;
  };
  items?: BadgeListItem[];
};

type IssueResponse = {
  ok: boolean;
  error?: string;
  badge?: {
    id: string;
    tokenHint: string | null;
    issuedAt: string;
  };
  student?: {
    id: string;
    name: string;
    classroomId: string;
    classroomLabel: string;
  };
  qrPayload?: string;
};

type RevokeResponse = {
  ok: boolean;
  error?: string;
};

type PrintBadge = {
  id: string;
  badgeId: string;
  tokenHint: string | null;
  qrPayload: string;
  qrDataUrl: string;
  studentId: string;
  studentName: string;
  classroomLabel: string;
  schoolName: string;
  schoolCode: string | null;
  issuedAt: string;
};

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";

  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";

  return dt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadgeClass(state: BadgeState) {
  if (state === "ACTIVE") {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  }

  if (state === "REVOKED") {
    return "border-amber-400/25 bg-amber-400/10 text-amber-200";
  }

  return "border-white/10 bg-white/5 text-[#C9CDD6]";
}

function statusLabel(state: BadgeState) {
  if (state === "ACTIVE") return "Active badge";
  if (state === "REVOKED") return "Revoked only";
  return "No badge";
}

async function readJson<T>(res: Response, label: string): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();

  if (!raw.trim()) {
    throw new Error(
      `${label} returned an empty response (${res.status} ${res.statusText || "No status text"}). Check the Next.js terminal for the real server error.`,
    );
  }

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      `${label} returned non-JSON (${res.status}). Preview: ${raw.slice(0, 180)}`,
    );
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      `${label} returned invalid JSON (${res.status}). Preview: ${raw.slice(0, 180)}`,
    );
  }
}

export default function AttendanceBadgesClient() {
  const [classes, setClasses] = useState<ClassroomOption[]>([]);
  const [classroomId, setClassroomId] = useState("");
  const [showStreamArms, setShowStreamArms] = useState(false);
  const [rows, setRows] = useState<BadgeListItem[]>([]);
  const [tenantName, setTenantName] = useState("School");
  const [schoolCode, setSchoolCode] = useState<string | null>(null);
  const [classroomLabel, setClassroomLabel] = useState("");
  const [summary, setSummary] =
    useState<BadgeListResponse["summary"]>(undefined);

  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [busyStudentId, setBusyStudentId] = useState<string | null>(null);
  const [busyBadgeId, setBusyBadgeId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [printBadges, setPrintBadges] = useState<PrintBadge[]>([]);

  const selectedClass = useMemo(
    () => classes.find((item) => item.id === classroomId) ?? null,
    [classes, classroomId],
  );

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    setErr(null);

    try {
      const mode = showStreamArms ? "streams" : "single";

      const res = await fetch(
        `/api/admin/attendance/badges/classrooms?mode=${encodeURIComponent(mode)}`,
        { cache: "no-store" },
      );

      const data = await readJson<ClassroomListResponse>(
        res,
        "Badge classroom list",
      );

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not load badge classrooms.");
      }

      const items = data.items ?? [];
      setClasses(items);

      setClassroomId((current) => {
        if (current && items.some((item) => item.id === current))
          return current;
        return items[0]?.id ?? "";
      });
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "Could not load badge classrooms.",
      );
    } finally {
      setLoadingClasses(false);
    }
  }, [showStreamArms]);

  const loadBadges = useCallback(async () => {
    if (!classroomId) {
      setRows([]);
      setSummary(undefined);
      return;
    }

    setLoadingRows(true);
    setErr(null);

    try {
      const res = await fetch(
        `/api/admin/attendance/badges/list?classroomId=${encodeURIComponent(classroomId)}`,
        { cache: "no-store" },
      );

      const data = await readJson<BadgeListResponse>(res, "Badge register");

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not load attendance badges.");
      }

      setRows(data.items ?? []);
      setSummary(data.summary);
      setTenantName(data.tenant?.name || "School");
      setSchoolCode(data.tenant?.schoolCode ?? null);
      setClassroomLabel(data.classroom?.label || selectedClass?.label || "");
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "Could not load attendance badges.",
      );
    } finally {
      setLoadingRows(false);
    }
  }, [classroomId, selectedClass?.label]);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    void loadBadges();
  }, [loadBadges]);

  async function issueBadge(row: BadgeListItem) {
    setBusyStudentId(row.student.id);
    setErr(null);
    setMsg(null);

    try {
      const res = await fetch("/api/admin/attendance/badges/issue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId: row.student.id,
          label: `Attendance badge · ${row.student.name}`,
          revokeExisting: true,
        }),
      });

      const data = await readJson<IssueResponse>(res, "Issue badge");

      if (
        !res.ok ||
        !data.ok ||
        !data.qrPayload ||
        !data.badge ||
        !data.student
      ) {
        throw new Error(data.error || "Could not issue badge.");
      }

      const qrDataUrl = await QRCode.toDataURL(data.qrPayload, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 240,
      });

      const printable: PrintBadge = {
        id: `${data.badge.id}-${Date.now()}`,
        badgeId: data.badge.id,
        tokenHint: data.badge.tokenHint,
        qrPayload: data.qrPayload,
        qrDataUrl,
        studentId: data.student.id,
        studentName: data.student.name,
        classroomLabel:
          data.student.classroomLabel || row.student.classroomLabel,
        schoolName: tenantName,
        schoolCode,
        issuedAt: data.badge.issuedAt,
      };

      setPrintBadges((prev) =>
        [
          printable,
          ...prev.filter((item) => item.studentId !== data.student?.id),
        ].slice(0, 80),
      );
      setMsg(
        `${data.student.name} badge issued. Print it now; the raw QR secret will not be stored.`,
      );
      await loadBadges();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not issue badge.");
    } finally {
      setBusyStudentId(null);
    }
  }

  async function revokeBadge(row: BadgeListItem) {
    if (!row.activeBadgeId) return;

    const confirmed = window.confirm(
      `Revoke the active badge for ${row.student.name}? The old printed QR will stop working.`,
    );

    if (!confirmed) return;

    setBusyBadgeId(row.activeBadgeId);
    setErr(null);
    setMsg(null);

    try {
      const res = await fetch("/api/admin/attendance/badges/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          badgeId: row.activeBadgeId,
          reason: "Revoked from badge operations page.",
        }),
      });

      const data = await readJson<RevokeResponse>(res, "Revoke badge");

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not revoke badge.");
      }

      setMsg(`${row.student.name} badge revoked.`);
      setPrintBadges((prev) =>
        prev.filter((item) => item.studentId !== row.student.id),
      );
      await loadBadges();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not revoke badge.");
    } finally {
      setBusyBadgeId(null);
    }
  }

  function printQueuedBadges() {
    if (!printBadges.length) {
      setErr("Issue or reissue at least one badge before printing.");
      return;
    }

    window.print();
  }

  const noClass = !loadingClasses && classes.length === 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          #attendance-badge-print-area,
          #attendance-badge-print-area * {
            visibility: visible !important;
          }

          #attendance-badge-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 16mm !important;
            color: #111827 !important;
            background: white !important;
          }

          .attendance-badge-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          @page {
            size: A4;
            margin: 10mm;
          }
        }
      `}</style>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/20 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#E8C96A]">
              EduLife OS · Attendance
            </p>
            <h1 className="mt-2 text-2xl font-bold text-[#F7F4ED] md:text-3xl">
              QR Attendance Badges
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#AEB7C7]">
              Issue, reissue, revoke, and print learner QR badges. Badges mark
              attendance only. They never capture health data, temperature,
              symptoms, or device readings.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadBadges()}
              disabled={!classroomId || loadingRows}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-[#F7F4ED] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={printQueuedBadges}
              disabled={!printBadges.length}
              className="rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-sm font-bold text-[#071A3D] shadow-lg shadow-[#D4AF37]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Print Queue ({printBadges.length})
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8F98A8]">
              Select class
            </span>
            <select
              value={classroomId}
              onChange={(e) => setClassroomId(e.target.value)}
              disabled={loadingClasses || noClass}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-[#07111F] px-4 py-3 text-sm font-semibold text-[#F7F4ED] outline-none ring-0 transition focus:border-[#E8C96A]/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingClasses ? <option>Loading classes…</option> : null}
              {!loadingClasses && noClass ? (
                <option>No active classes found</option>
              ) : null}
              {!loadingClasses
                ? classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} · {item.activeLearnerCount ?? 0} learners
                    </option>
                  ))
                : null}
            </select>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-[#C9CDD6] hover:bg-white/10">
                <input
                  type="checkbox"
                  checked={showStreamArms}
                  onChange={(e) => {
                    setShowStreamArms(e.target.checked);
                    setClassroomId("");
                  }}
                  className="h-4 w-4 accent-[#E8C96A]"
                />
                Show multi-stream arms A–D
              </label>

              <span className="text-xs text-[#8F98A8]">
                Default view shows one student-bearing class per level.
              </span>
            </div>
          </label>

          <div className="rounded-2xl border border-white/10 bg-[#07111F]/80 px-4 py-3 text-sm text-[#C9CDD6]">
            <p className="font-semibold text-[#F7F4ED]">{tenantName}</p>
            <p className="mt-0.5 text-xs text-[#8F98A8]">
              {classroomLabel || selectedClass?.label || "No class selected"}
            </p>
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {err}
          </div>
        ) : null}

        {msg ? (
          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {msg}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8F98A8]">
            Learners
          </p>
          <p className="mt-2 text-3xl font-bold text-[#F7F4ED]">
            {summary?.totalLearners ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
            Active
          </p>
          <p className="mt-2 text-3xl font-bold text-emerald-100">
            {summary?.activeBadges ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
            Revoked only
          </p>
          <p className="mt-2 text-3xl font-bold text-amber-100">
            {summary?.revokedOnly ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8F98A8]">
            No badge
          </p>
          <p className="mt-2 text-3xl font-bold text-[#F7F4ED]">
            {summary?.noBadge ?? 0}
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#F7F4ED]">
              Learner badge register
            </h2>
            <p className="text-sm text-[#8F98A8]">
              Reissue creates a new QR and revokes the old one automatically.
            </p>
          </div>
        </div>

        {loadingRows ? (
          <div className="rounded-2xl border border-white/10 bg-[#07111F]/80 px-4 py-10 text-center text-sm text-[#C9CDD6]">
            Loading badge register…
          </div>
        ) : rows.length ? (
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10">
                <thead className="bg-white/[0.04]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-[#8F98A8]">
                      Learner
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-[#8F98A8]">
                      Badge
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-[#8F98A8]">
                      Last activity
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.14em] text-[#8F98A8]">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/8 bg-[#07111F]/40">
                  {rows.map((row) => {
                    const issuing = busyStudentId === row.student.id;
                    const revoking = row.activeBadgeId
                      ? busyBadgeId === row.activeBadgeId
                      : false;

                    return (
                      <tr key={row.student.id} className="align-top">
                        <td className="px-4 py-4">
                          <p className="font-semibold text-[#F7F4ED]">
                            {row.student.name}
                          </p>
                          <p className="mt-1 text-xs text-[#8F98A8]">
                            {row.student.classroomLabel}
                          </p>
                          <p className="mt-1 text-xs text-[#6F7A8C]">
                            Guardian: {row.student.guardianName || "—"}
                          </p>
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusBadgeClass(
                              row.badgeState,
                            )}`}
                          >
                            {statusLabel(row.badgeState)}
                          </span>

                          <div className="mt-2 text-xs leading-5 text-[#AEB7C7]">
                            <p>Hint: {row.badge?.tokenHint || "—"}</p>
                            <p>Issued: {fmtDate(row.badge?.issuedAt)}</p>
                            {row.badge?.revokedAt ? (
                              <p className="text-amber-200">
                                Revoked: {fmtDate(row.badge.revokedAt)}
                              </p>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-xs leading-5 text-[#AEB7C7]">
                          <p>Last used: {fmtDate(row.badge?.lastUsedAt)}</p>
                          {row.badge?.revokeReason ? (
                            <p className="mt-1 max-w-xs text-amber-200">
                              {row.badge.revokeReason}
                            </p>
                          ) : null}
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => void issueBadge(row)}
                              disabled={issuing || revoking}
                              className="rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-3 py-2 text-xs font-bold text-[#071A3D] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {row.badgeState === "ACTIVE"
                                ? issuing
                                  ? "Reissuing…"
                                  : "Reissue"
                                : issuing
                                  ? "Issuing…"
                                  : "Issue"}
                            </button>

                            <button
                              type="button"
                              onClick={() => void revokeBadge(row)}
                              disabled={
                                !row.activeBadgeId || issuing || revoking
                              }
                              className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-100 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {revoking ? "Revoking…" : "Revoke"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-[#07111F]/80 px-4 py-10 text-center text-sm text-[#C9CDD6]">
            No active learners found for this class.
          </div>
        )}
      </section>

      {classroomId ? (
        <AttendanceScanAuditPanel
          classroomId={classroomId}
          endpoint="/api/admin/attendance/scan-audit/list"
          title="Class QR scan audit"
          description="Shows QR scan evidence for the selected class. This view hides raw QR payloads, token hashes, parent contact data, health data, and location data."
          showClassroom={false}
        />
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#F7F4ED]">Print queue</h2>
            <p className="text-sm text-[#8F98A8]">
              Only newly issued badges appear here. Print before leaving this
              page.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={printQueuedBadges}
              disabled={!printBadges.length}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-[#F7F4ED] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Print
            </button>

            <button
              type="button"
              onClick={() => setPrintBadges([])}
              disabled={!printBadges.length}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-[#C9CDD6] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear queue
            </button>
          </div>
        </div>

        {!printBadges.length ? (
          <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-[#8F98A8]">
            No badges waiting to print.
          </div>
        ) : (
          <div id="attendance-badge-print-area" className="mt-5">
            <div className="hidden print:block">
              <h1 className="text-xl font-bold">
                EduLife OS Attendance Badges
              </h1>
              <p className="mt-1 text-sm">
                {tenantName} {schoolCode ? `(${schoolCode})` : ""}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
              {printBadges.map((badge) => (
                <div
                  key={badge.id}
                  className="attendance-badge-card rounded-2xl border border-white/10 bg-[#07111F] p-4 text-[#F7F4ED] print:border print:border-gray-300 print:bg-white print:text-gray-900"
                >
                  <div className="flex gap-4">
                    <div className="rounded-xl bg-white p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={badge.qrDataUrl}
                        alt={`QR badge for ${badge.studentName}`}
                        className="h-28 w-28"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#E8C96A] print:text-gray-500">
                        Attendance only
                      </p>
                      <h3 className="mt-1 text-base font-extrabold leading-tight">
                        {badge.studentName}
                      </h3>
                      <p className="mt-1 text-xs text-[#AEB7C7] print:text-gray-600">
                        {badge.classroomLabel}
                      </p>
                      <p className="mt-2 text-xs font-semibold">
                        {badge.schoolName}
                      </p>
                      {badge.schoolCode ? (
                        <p className="text-[11px] text-[#8F98A8] print:text-gray-500">
                          Code: {badge.schoolCode}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#C9CDD6] print:border-gray-200 print:bg-gray-50 print:text-gray-700">
                    <p>
                      Hint:{" "}
                      <span className="font-bold">
                        {badge.tokenHint || "—"}
                      </span>
                    </p>
                    <p>Issued: {fmtDate(badge.issuedAt)}</p>
                    <p className="mt-1 text-[11px]">
                      Scan only on EduLife OS attendance session pages. This
                      badge does not capture health data.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
