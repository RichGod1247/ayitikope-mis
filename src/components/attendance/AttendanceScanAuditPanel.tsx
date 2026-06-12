//src/components/attendance/AttendanceScanAuditPanel.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ScanStatus = "ACCEPTED" | "DUPLICATE" | "REJECTED";

type ScanAuditItem = {
  id: string;
  createdAt: string | null;
  source: string;
  status: ScanStatus;
  attendanceStatus: string | null;
  reason: string | null;
  credential: {
    kind: string;
    badgeId: string | null;
    tokenHint: string | null;
    issuedAt: string | null;
    revokedAt: string | null;
  };
  session: {
    id: string;
    date: string;
    isClosed: boolean;
    certifiedAt: string | null;
  };
  classroom: {
    id: string;
    label: string;
  };
  student: {
    id: string;
    name: string;
  } | null;
  scannedBy: {
    id: string;
    label: string;
  };
};

type ScanAuditResponse =
  | {
      ok: true;
      date: string;
      privacy: {
        rawQrPayloadExposed: boolean;
        rawTokenHashExposed: boolean;
        parentDataExposed: boolean;
        healthDataExposed: boolean;
        note: string;
      };
      summary: {
        total: number;
        accepted: number;
        duplicate: number;
        rejected: number;
        returned: number;
        take: number;
      };
      items: ScanAuditItem[];
    }
  | {
      ok: false;
      error: string;
    };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function time(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(d);
}

function statusClass(status: ScanStatus) {
  if (status === "ACCEPTED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "DUPLICATE") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-rose-200 bg-rose-50 text-rose-700";
}

function statCard(label: string, value: number, helper: string) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-slate-950">{fmt(value)}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
    </div>
  );
}

async function readJson<T>(res: Response, label: string): Promise<T> {
  const raw = await res.text();

  if (!raw.trim()) {
    throw new Error(`${label} returned an empty response (${res.status}).`);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${label} returned invalid JSON (${res.status}).`);
  }
}

export default function AttendanceScanAuditPanel({
  classroomId,
  date,
  endpoint,
  title = "QR scan audit",
  description = "Operational evidence for QR attendance scans. Raw QR secrets and token hashes are never shown.",
  showClassroom = true,
}: {
  classroomId?: string | null;
  date?: string | null;
  endpoint: string;
  title?: string;
  description?: string;
  showClassroom?: boolean;
}) {
  const [localDate, setLocalDate] = useState(date || todayISO());
  const [data, setData] = useState<ScanAuditResponse | null>(null);
  const [status, setStatus] = useState<"ALL" | ScanStatus>("ALL");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const effectiveDate = date || localDate;

  useEffect(() => {
    if (date) setLocalDate(date);
  }, [date]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("date", effectiveDate || todayISO());
    params.set("take", "80");
    params.set("status", status);

    if (classroomId) params.set("classroomId", classroomId);

    return params.toString();
  }, [classroomId, effectiveDate, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`${endpoint}?${query}`, {
        cache: "no-store",
      });

      const json = await readJson<ScanAuditResponse>(res, "QR scan audit");

      if (!res.ok || !json.ok) {
        throw new Error(json.ok ? `HTTP ${res.status}` : json.error);
      }

      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load QR scan audit.");
    } finally {
      setLoading(false);
    }
  }, [endpoint, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = data?.ok ? data.summary : null;
  const items = data?.ok ? data.items : [];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 text-slate-950 shadow-sm md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-indigo-700">
            EduLife OS · Evidence
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight md:text-2xl">
            {title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {description}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {!date ? (
            <input
              type="date"
              value={localDate}
              onChange={(e) => setLocalDate(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 shadow-sm outline-none [color-scheme:light]"
            />
          ) : null}

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "ALL" | ScanStatus)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 shadow-sm outline-none [color-scheme:light]"
          >
            <option value="ALL">All scans</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="DUPLICATE">Duplicate</option>
            <option value="REJECTED">Rejected</option>
          </select>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl border border-slate-300 bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          {err}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {statCard("Total scans", summary?.total ?? 0, "All QR scan attempts")}
        {statCard(
          "Accepted",
          summary?.accepted ?? 0,
          "Marked or confirmed present",
        )}
        {statCard(
          "Duplicates",
          summary?.duplicate ?? 0,
          "Already scanned or already marked",
        )}
        {statCard(
          "Rejected",
          summary?.rejected ?? 0,
          "Revoked, wrong class, or invalid",
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-xs leading-5 text-indigo-900">
        <b>Privacy guard:</b>{" "}
        {data?.ok
          ? data.privacy.note
          : "This panel is designed to show operational evidence only, not raw QR secrets, child health data, parent contact data, or location tracking."}
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Learner</th>
                {showClassroom ? <th className="px-4 py-3">Class</th> : null}
                <th className="px-4 py-3">Scanned by</th>
                <th className="px-4 py-3">Badge hint</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 bg-white">
              {loading && !items.length ? (
                <tr>
                  <td
                    className="px-4 py-6 text-slate-500"
                    colSpan={showClassroom ? 7 : 6}
                  >
                    Loading scan audit…
                  </td>
                </tr>
              ) : null}

              {!loading && !items.length ? (
                <tr>
                  <td
                    className="px-4 py-6 text-slate-500"
                    colSpan={showClassroom ? 7 : 6}
                  >
                    No QR scans found for this date/filter.
                  </td>
                </tr>
              ) : null}

              {items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {time(item.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${statusClass(
                        item.status,
                      )}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {item.student?.name ?? "Unresolved learner"}
                    {item.attendanceStatus ? (
                      <div className="mt-1 text-xs font-medium text-slate-500">
                        Attendance: {item.attendanceStatus}
                      </div>
                    ) : null}
                  </td>
                  {showClassroom ? (
                    <td className="px-4 py-3 text-slate-700">
                      {item.classroom.label}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 text-slate-700">
                    {item.scannedBy.label}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">
                    {item.credential.tokenHint ?? "—"}
                  </td>
                  <td className="max-w-[360px] px-4 py-3 text-slate-600">
                    {item.reason ?? "—"}
                    {item.credential.revokedAt ? (
                      <div className="mt-1 text-xs font-semibold text-rose-600">
                        Badge was revoked: {time(item.credential.revokedAt)}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
