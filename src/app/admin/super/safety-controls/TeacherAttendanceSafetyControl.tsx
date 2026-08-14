"use client";

import { useCallback, useEffect, useState } from "react";

type FeatureState = {
  key: string;
  enabled: boolean;
  configured: boolean;
  storageAvailable: boolean;
  reason: string | null;
  updatedAt: string | null;
};

type ResponseShape =
  | { ok: true; outcome?: "UPDATED" | "UNCHANGED"; state: FeatureState }
  | { ok: false; error: string };

function dateLabel(value: string | null) {
  if (!value) return "No recorded change yet";

  try {
    return new Intl.DateTimeFormat("en-GH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Accra",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function TeacherAttendanceSafetyControl() {
  const [state, setState] = useState<FeatureState | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        "/api/admin/super/platform-features/teacher-attendance",
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );

      const json = (await res.json().catch(() => null)) as ResponseShape | null;

      if (!res.ok || !json?.ok) {
        setState(null);
        setError(
          json && !json.ok
            ? json.error
            : `Failed to load safety control (${res.status}).`,
        );
        return;
      }

      setState(json.state);
    } catch {
      setState(null);
      setError("Network/server error while loading the safety control.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeState(nextEnabled: boolean) {
    const trimmedReason = reason.trim();

    if (trimmedReason.length < 12) {
      setError("Enter a clear reason of at least 12 characters.");
      return;
    }

    const confirmed = window.confirm(
      nextEnabled
        ? "Activate Teacher Attendance across EduLife OS? Headteachers will be able to use the staff register and governance officers will again receive certified Teacher Attendance signals."
        : "Deactivate Teacher Attendance across EduLife OS? Headteacher Teacher Attendance actions and governance Teacher Attendance/risk visibility will be blocked. Historical records will be preserved.",
    );

    if (!confirmed) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(
        "/api/admin/super/platform-features/teacher-attendance",
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            enabled: nextEnabled,
            reason: trimmedReason,
            confirm: true,
          }),
        },
      );

      const json = (await res.json().catch(() => null)) as ResponseShape | null;

      if (!res.ok || !json?.ok) {
        setError(
          json && !json.ok
            ? json.error
            : `Safety-control change failed (${res.status}).`,
        );
        return;
      }

      setState(json.state);
      setReason("");
      setNotice(
        json.state.enabled
          ? "Teacher Attendance is now active."
          : "Teacher Attendance is now safely deactivated.",
      );
    } catch {
      setError("Network/server error while changing the safety control.");
    } finally {
      setSaving(false);
    }
  }

  const enabled = state?.enabled === true;
  const storageAvailable = state?.storageAvailable !== false;

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.10)] md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-950">
              Teacher Attendance
            </h2>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold ${
                enabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              {loading ? "Checking…" : enabled ? "ACTIVE" : "OFF · PROTECTED"}
            </span>
          </div>

          <p className="mt-3 text-sm leading-7 text-slate-700">
            Keep this OFF until the municipality has the human safeguards,
            appeal processes, supervision standards, and fair-use procedures
            needed to prevent attendance data from becoming an automatic
            disciplinary weapon. Student Attendance is not affected.
          </p>

          <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              Historical Teacher Attendance records are preserved.
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              Governance Teacher Attendance and absenteeism risk are blocked while OFF.
            </div>
          </div>

          {state ? (
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Last recorded state: {dateLabel(state.updatedAt)}
              {state.reason ? ` · ${state.reason}` : ""}
            </p>
          ) : null}

          {!storageAvailable ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Safety-control storage is unavailable. Teacher Attendance remains
              fail-closed OFF. Apply/verify the reviewed platform-feature schema
              before attempting activation.
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {notice}
            </div>
          ) : null}
        </div>

        <div className="w-full rounded-[24px] border border-slate-200 bg-slate-50 p-4 lg:max-w-md">
          <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
            Reason for this change
          </label>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, 500))}
            rows={4}
            placeholder={
              enabled
                ? "Why should Teacher Attendance be deactivated now?"
                : "What safeguards are now in place to justify activation?"
            }
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 outline-none focus:border-slate-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            Required · 12–500 characters · retained in the audit trail.
          </p>

          <button
            type="button"
            disabled={loading || saving || !storageAvailable}
            onClick={() => void changeState(!enabled)}
            className={`mt-4 min-h-11 w-full rounded-2xl px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              enabled
                ? "border border-red-300 bg-red-50 text-red-800 hover:bg-red-100"
                : "bg-slate-950 text-white hover:bg-slate-800"
            }`}
          >
            {saving
              ? "Saving safely…"
              : enabled
                ? "Deactivate Teacher Attendance"
                : "Activate Teacher Attendance"}
          </button>
        </div>
      </div>
    </section>
  );
}
