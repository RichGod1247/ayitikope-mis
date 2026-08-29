"use client";

import { useMemo, useState } from "react";

type EnrollmentStatus = "NOT_ENROLLED" | "INVITED" | "ENROLLED" | "OPTED_OUT";

type Enrollment = {
  status: EnrollmentStatus;
  policyVersion: number | null;
  consentedAt: string | null;
  optedOutAt: string | null;
  lastInvitationSentAt: string | null;
  invitationCount: number;
};

type StudentRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  phoneAvailable: boolean;
  classroom: { name: string | null; grade: string | null; arm: string | null } | null;
  essentialAlerts: Enrollment;
};

type StaffRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  phoneAvailable: boolean;
  essentialAlerts: Enrollment;
};

type Audience = "GUARDIANS" | "STAFF";

type Counts = {
  enabled: number;
  invited: number;
  stopped: number;
  notEnrolled: number;
  phoneNeeded: number;
};

function countsFor(rows: Array<{ phoneAvailable: boolean; essentialAlerts: Enrollment }>): Counts {
  return {
    enabled: rows.filter((row) => row.essentialAlerts.status === "ENROLLED").length,
    invited: rows.filter((row) => row.essentialAlerts.status === "INVITED").length,
    stopped: rows.filter((row) => row.essentialAlerts.status === "OPTED_OUT").length,
    notEnrolled: rows.filter((row) => row.essentialAlerts.status === "NOT_ENROLLED").length,
    phoneNeeded: rows.filter((row) => !row.phoneAvailable).length,
  };
}

function statusLabel(enrollment: Enrollment) {
  if (enrollment.status === "INVITED" && !enrollment.lastInvitationSentAt) return "Needs resend";
  if (enrollment.status === "ENROLLED") return "Enabled";
  if (enrollment.status === "INVITED") return "Invited";
  if (enrollment.status === "OPTED_OUT") return "Stopped";
  return "Not enrolled";
}

function statusClass(status: EnrollmentStatus) {
  if (status === "ENROLLED") return "border-emerald-300/20 bg-emerald-400/12 text-emerald-100";
  if (status === "INVITED") return "border-amber-300/20 bg-amber-400/12 text-amber-100";
  if (status === "OPTED_OUT") return "border-white/10 bg-white/5 text-[#C9CDD6]";
  return "border-sky-300/20 bg-sky-400/10 text-sky-100";
}

function learnerName(row: StudentRow) {
  return [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || "Learner";
}

function staffName(row: StaffRow) {
  return row.name || row.email || "Staff member";
}

function classLabel(row: StudentRow) {
  if (!row.classroom) return "Unassigned";
  return [row.classroom.name, row.classroom.grade, row.classroom.arm ? `Arm ${row.classroom.arm}` : null]
    .filter(Boolean)
    .join(" · ");
}

export default function StudentEssentialAlertsCard() {
  const [tab, setTab] = useState<"parents" | "staff">("parents");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<Audience | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parentCounts = useMemo(() => countsFor(students), [students]);
  const staffCounts = useMemo(() => countsFor(staff), [staff]);
  const activeCounts = tab === "parents" ? parentCounts : staffCounts;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [studentsRes, staffRes] = await Promise.all([
        fetch("/api/consent/students/list", { cache: "no-store" }),
        fetch("/api/consent/teachers/list", { cache: "no-store" }),
      ]);
      const studentsJson = (await studentsRes.json().catch(() => null)) as
        | { ok?: boolean; error?: string; items?: StudentRow[] }
        | null;
      const staffJson = (await staffRes.json().catch(() => null)) as
        | { ok?: boolean; error?: string; items?: StaffRow[] }
        | null;

      if (!studentsRes.ok || studentsJson?.ok === false) {
        throw new Error(studentsJson?.error || "Could not load parent alert status.");
      }
      if (!staffRes.ok || staffJson?.ok === false) {
        throw new Error(staffJson?.error || "Could not load staff alert status.");
      }

      setStudents(Array.isArray(studentsJson?.items) ? studentsJson.items : []);
      setStaff(Array.isArray(staffJson?.items) ? staffJson.items : []);
      setLoaded(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load Essential Alerts.");
    } finally {
      setLoading(false);
    }
  }

  async function sendInvitations(audience: Audience) {
    const audienceLabel = audience === "GUARDIANS" ? "eligible parents/guardians" : "eligible teachers and headteachers";
    if (
      !window.confirm(
        `Send Essential School Alerts invitations to ${audienceLabel}?\n\nAlready-enabled, opted-out and recently invited recipients are skipped. The recipient makes the final choice.`,
      )
    ) {
      return;
    }

    setSending(audience);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/consent/campaign/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audience, limit: 300 }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            error?: string;
            count?: number;
            sent?: number;
            skipped?: number;
            failed?: number;
            learnersCovered?: number;
          }
        | null;

      if (!res.ok) throw new Error(data?.error || "Invitation send failed.");

      const coverage =
        audience === "GUARDIANS" && Number(data?.learnersCovered ?? 0) > 0
          ? ` Learners covered: ${Number(data?.learnersCovered ?? 0)}.`
          : "";
      setMessage(
        `Processed ${Number(data?.count ?? 0)}. Sent ${Number(data?.sent ?? 0)}; skipped ${Number(data?.skipped ?? 0)}; failed ${Number(data?.failed ?? 0)}.${coverage}`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invitation send failed.");
    } finally {
      setSending(null);
    }
  }

  const rows = tab === "parents" ? students : staff;

  return (
    <details
      className="rounded-2xl border border-sky-300/20 bg-sky-400/8 text-[#F7F4ED]"
      onToggle={(event) => {
        if (event.currentTarget.open && !loaded && !loading) void load();
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold marker:hidden">
        <span>Essential Alerts</span>
        <span className="text-xs font-normal text-sky-100/80">Parents · Teachers · Headteachers</span>
      </summary>

      <div className="border-t border-sky-300/15 p-3 sm:p-4">
        <p className="text-xs leading-5 text-[#C9CDD6]">
          School staff send invitations; the parent or staff member makes the choice. Existing wellbeing settings are not changed by Essential Alerts.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("parents")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              tab === "parents" ? "bg-sky-200 text-[#071A3D]" : "border border-white/10 bg-white/5 text-[#F7F4ED]"
            }`}
          >
            Parents / Guardians
          </button>
          <button
            type="button"
            onClick={() => setTab("staff")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              tab === "staff" ? "bg-sky-200 text-[#071A3D]" : "border border-white/10 bg-white/5 text-[#F7F4ED]"
            }`}
          >
            Teachers & Headteachers
          </button>
        </div>

        {loading && !loaded ? (
          <p className="mt-3 text-sm text-[#C9CDD6]">Loading Essential Alerts status…</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ["Enabled", activeCounts.enabled],
                ["Invited", activeCounts.invited],
                ["Not enrolled", activeCounts.notEnrolled],
                ["Stopped", activeCounts.stopped],
                ["Phone needed", activeCounts.phoneNeeded],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-white/10 bg-[#07111F]/80 px-3 py-2">
                  <div className="text-lg font-bold text-[#F7F4ED]">{value}</div>
                  <div className="text-[11px] text-[#AAB3C2]">{label}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void sendInvitations(tab === "parents" ? "GUARDIANS" : "STAFF")}
                disabled={sending !== null || loading}
                className="rounded-lg bg-sky-200 px-3 py-2 text-xs font-bold text-[#071A3D] disabled:opacity-60"
              >
                {sending
                  ? "Sending…"
                  : tab === "parents"
                    ? "Invite eligible parents"
                    : "Invite eligible staff"}
              </button>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-[#F7F4ED] disabled:opacity-60"
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </>
        )}

        {message ? (
          <div className="mt-3 rounded-lg border border-emerald-300/20 bg-emerald-400/12 px-3 py-2 text-xs text-emerald-100">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mt-3 rounded-lg border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-xs text-rose-100">
            {error}
          </div>
        ) : null}

        {loaded ? (
          <details className="mt-3 rounded-lg border border-white/10 bg-[#07111F]/60">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-[#D7DCE5] marker:hidden">
              View status list ({rows.length})
            </summary>
            <div className="max-h-80 space-y-1 overflow-auto border-t border-white/10 p-2">
              {tab === "parents"
                ? students.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-[#F7F4ED]">{learnerName(row)}</div>
                        <div className="truncate text-[11px] text-[#8F98A8]">
                          {classLabel(row)} · Guardian: {row.guardianName || "—"}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(row.essentialAlerts.status)}`}>
                        {row.phoneAvailable ? statusLabel(row.essentialAlerts) : "Phone needed"}
                      </span>
                    </div>
                  ))
                : staff.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-[#F7F4ED]">{staffName(row)}</div>
                        <div className="truncate text-[11px] text-[#8F98A8]">{row.role.replace(/_/g, " ")}</div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(row.essentialAlerts.status)}`}>
                        {row.phoneAvailable ? statusLabel(row.essentialAlerts) : "Phone needed"}
                      </span>
                    </div>
                  ))}
              {rows.length === 0 ? <p className="px-2 py-3 text-xs text-[#8F98A8]">No eligible records found.</p> : null}
            </div>
          </details>
        ) : null}
      </div>
    </details>
  );
}
