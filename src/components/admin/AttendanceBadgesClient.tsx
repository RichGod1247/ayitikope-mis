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
  if (state === "ACTIVE") return "Active seal";
  if (state === "REVOKED") return "Retired / compromised";
  return "No seal";
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
        "Register seal classroom list",
      );

      if (!res.ok || !data.ok) {
        throw new Error(
          data.error || "Could not load register seal classrooms.",
        );
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
        e instanceof Error
          ? e.message
          : "Could not load register seal classrooms.",
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

      const data = await readJson<BadgeListResponse>(
        res,
        "Register seal control",
      );

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not load register seals.");
      }

      setRows(data.items ?? []);
      setSummary(data.summary);
      setTenantName(data.tenant?.name || "School");
      setSchoolCode(data.tenant?.schoolCode ?? null);
      setClassroomLabel(data.classroom?.label || selectedClass?.label || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load register seals.");
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
          label: "Learner Register Seal",
          revokeExisting: true,
        }),
      });

      const data = await readJson<IssueResponse>(res, "Issue register seal");

      if (
        !res.ok ||
        !data.ok ||
        !data.qrPayload ||
        !data.badge ||
        !data.student
      ) {
        throw new Error(data.error || "Could not issue register seal.");
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
        `${data.student.name} register seal issued. Print it now; the raw QR secret will not be stored.`,
      );
      await loadBadges();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not issue register seal.");
    } finally {
      setBusyStudentId(null);
    }
  }

  async function revokeBadge(row: BadgeListItem) {
    if (!row.activeBadgeId) return;

    const confirmed = window.confirm(
      `Retire or compromise the active register seal for ${row.student.name}? The old printed seal will stop working.`,
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
          reason: "Retired or compromised from register seal operations page.",
        }),
      });

      const data = await readJson<RevokeResponse>(res, "Retire register seal");

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not retire register seal.");
      }

      setMsg(`${row.student.name} register seal retired.`);
      setPrintBadges((prev) =>
        prev.filter((item) => item.studentId !== row.student.id),
      );
      await loadBadges();
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "Could not retire register seal.",
      );
    } finally {
      setBusyBadgeId(null);
    }
  }

  function printQueuedBadges() {
    if (!printBadges.length) {
      setErr("Issue or reissue at least one register seal before printing.");
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
              Learner Register Seals
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#AEB7C7]">
              Issue, reissue, retire, and print learner register seals for
              attendance. A seal marks attendance only. It does not expose a
              learner’s name to the public, and it never carries health data,
              fees, results, parent contacts, home address, or location data.
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
              Print Seals ({printBadges.length})
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
            Active seals
          </p>
          <p className="mt-2 text-3xl font-bold text-emerald-100">
            {summary?.activeBadges ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
            Retired / compromised
          </p>
          <p className="mt-2 text-3xl font-bold text-amber-100">
            {summary?.revokedOnly ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8F98A8]">
            No seal
          </p>
          <p className="mt-2 text-3xl font-bold text-[#F7F4ED]">
            {summary?.noBadge ?? 0}
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-[28px] border border-[#D4AF37]/20 bg-[#D4AF37]/10 p-5 shadow-2xl shadow-black/20">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8C96A]">
            Register seal lifecycle guide
          </p>
          <h2 className="mt-2 text-lg font-bold text-[#F7F4ED]">
            How to manage a learner register seal
          </h2>

          <div className="mt-4 grid gap-3 text-sm leading-6 text-[#D8DEE8]">
            <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <p className="font-bold text-[#F7F4ED]">Reprint</p>
              <p className="mt-1 text-[#AEB7C7]">
                Use reprint when the same learner needs another physical copy:
                damaged uniform, new uniform, faded print, or multiple approved
                uniforms.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <p className="font-bold text-[#F7F4ED]">Reissue</p>
              <p className="mt-1 text-[#AEB7C7]">
                Use reissue when the old seal should stop working: exposed seal,
                suspected misuse, wrong print, lost card, or compromised copy.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <p className="font-bold text-[#F7F4ED]">Retire</p>
              <p className="mt-1 text-[#AEB7C7]">
                Retire the seal when a learner leaves the school, transfers out,
                or when the school no longer wants that seal accepted.
              </p>
            </div>
          </div>

          <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm leading-6 text-emerald-100">
            Promotion does not require a new public identity. The school record
            changes inside EduLife OS; the seal remains an attendance register
            tool, not a public learner profile.
          </p>
        </div>

        <div className="rounded-[28px] border border-emerald-400/20 bg-emerald-400/10 p-5 shadow-2xl shadow-black/20">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
            Attendance backup operating rules
          </p>
          <h2 className="mt-2 text-lg font-bold text-[#F7F4ED]">
            How to use register seals responsibly
          </h2>

          <ul className="mt-4 space-y-3 text-sm leading-6 text-[#D8DEE8]">
            <li>
              ✅ Use manual attendance as the primary attendance truth. Register
              seals are a fast backup, not a replacement for teacher
              responsibility.
            </li>
            <li>
              ✅ Scan register seals only inside an official EduLife OS
              attendance session.
            </li>
            <li>
              ✅ Keep printed seals privacy-safe. They must not show learner
              name, class, guardian contact, health data, fees, results, home
              address, or location.
            </li>
            <li>
              ✅ Use the scan audit when reviewing attendance evidence. It hides
              raw QR payloads, token hashes, parent data, health data, and
              location data.
            </li>
          </ul>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#F7F4ED]">
              Learner register seal control
            </h2>
            <p className="text-sm text-[#8F98A8]">
              Reissue creates a new private attendance seal and retires the old
              one when it is replaced, damaged, exposed, or compromised.
            </p>
          </div>
        </div>

        {loadingRows ? (
          <div className="rounded-2xl border border-white/10 bg-[#07111F]/80 px-4 py-10 text-center text-sm text-[#C9CDD6]">
            Loading register seal control…
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
                      Register seal
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
                              {revoking ? "Retiring…" : "Retire"}
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
          title="Class register seal scan audit"
          description="Shows register seal scan evidence for the selected class. This view hides raw QR payloads, token hashes, parent contact data, health data, and location data."
          showClassroom={false}
        />
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#F7F4ED]">
              Register seal print queue
            </h2>
            <p className="text-sm text-[#8F98A8]">
              Only newly issued register seals appear here. Print before leaving
              this page. The physical seal must not display learner name, class,
              guardian, health, fees, results, home address, or location data.
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
            No register seals waiting to print.
          </div>
        ) : (
          <div id="attendance-badge-print-area" className="mt-5">
            <div className="hidden print:block">
              <h1 className="text-xl font-bold">
                EduLife OS Attendance Register seal
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
                        alt="Learner Register Seal QR"
                        className="h-28 w-28"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#D4AF37] print:text-gray-600">
                        Learner Register Seal
                      </p>
                      <h3 className="mt-1 text-base font-extrabold leading-tight">
                        Attendance register use only
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-[#AEB7C7] print:text-gray-600">
                        This seal contains no learner name, class, parent
                        contact, health, fees, results, home address, or
                        location data.
                      </p>
                      <p className="mt-2 text-xs font-semibold">
                        {badge.schoolName}
                      </p>
                      {badge.schoolCode ? (
                        <p className="text-[11px] text-[#8F98A8] print:text-gray-500">
                          School code: {badge.schoolCode}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-[#AEB7C7] print:border-gray-200 print:bg-gray-50 print:text-gray-700">
                    <p>
                      Seal hint:{" "}
                      <span className="font-bold">
                        {badge.tokenHint || "—"}
                      </span>
                    </p>
                    <p>Issued: {fmtDate(badge.issuedAt)}</p>
                    <p className="mt-1 text-[11px]">
                      Authorized staff scan this seal only inside an EduLife OS
                      attendance session. It marks attendance only and does not
                      track the learner.
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
