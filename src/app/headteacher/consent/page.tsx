"use client";

import { useEffect, useMemo, useState } from "react";

const STATUS_LABEL: Record<string, string> = {
  NOT_ENROLLED: "Not enrolled",
  INVITED: "Invitation sent",
  ENROLLED: "Enabled",
  OPTED_OUT: "Stopped by recipient",
};

type Enrollment = {
  status: "NOT_ENROLLED" | "INVITED" | "ENROLLED" | "OPTED_OUT";
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

function statusClasses(status: Enrollment["status"]) {
  if (status === "ENROLLED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "OPTED_OUT") return "border-zinc-200 bg-zinc-50 text-zinc-700";
  if (status === "INVITED") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}


function enrollmentLabel(enrollment: Enrollment) {
  if (enrollment.status === "INVITED" && !enrollment.lastInvitationSentAt) {
    return "Needs resend";
  }
  return STATUS_LABEL[enrollment.status];
}

function fullName(first: string | null, last: string | null) {
  return [first, last].filter(Boolean).join(" ").trim() || "Learner";
}

export default function EssentialAlertsPage() {
  const [tab, setTab] = useState<"parents" | "staff">("parents");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<Audience | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [studentsRes, staffRes] = await Promise.all([
        fetch("/api/consent/students/list", { cache: "no-store" }),
        fetch("/api/consent/teachers/list", { cache: "no-store" }),
      ]);
      const [studentsJson, staffJson] = await Promise.all([
        studentsRes.json().catch(() => ({})),
        staffRes.json().catch(() => ({})),
      ]);

      if (!studentsRes.ok || studentsJson?.ok === false) {
        throw new Error(studentsJson?.error || "Could not load parent alert status.");
      }
      if (!staffRes.ok || staffJson?.ok === false) {
        throw new Error(staffJson?.error || "Could not load staff alert status.");
      }

      setStudents(Array.isArray(studentsJson?.items) ? studentsJson.items : []);
      setStaff(Array.isArray(staffJson?.items) ? staffJson.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Essential Alerts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const parentCounts = useMemo(() => {
    const enrolled = students.filter((row) => row.essentialAlerts.status === "ENROLLED").length;
    const invited = students.filter((row) => row.essentialAlerts.status === "INVITED").length;
    const optedOut = students.filter((row) => row.essentialAlerts.status === "OPTED_OUT").length;
    const withoutPhone = students.filter((row) => !row.phoneAvailable).length;
    return { enrolled, invited, optedOut, withoutPhone };
  }, [students]);

  const staffCounts = useMemo(() => {
    const enrolled = staff.filter((row) => row.essentialAlerts.status === "ENROLLED").length;
    const invited = staff.filter((row) => row.essentialAlerts.status === "INVITED").length;
    const optedOut = staff.filter((row) => row.essentialAlerts.status === "OPTED_OUT").length;
    const withoutPhone = staff.filter((row) => !row.phoneAvailable).length;
    return { enrolled, invited, optedOut, withoutPhone };
  }, [staff]);

  async function sendInvitations(audience: Audience) {
    const label = audience === "GUARDIANS" ? "parents/guardians" : "teachers and headteachers";
    if (!window.confirm(`Send Essential School Alerts invitations to eligible ${label}?\n\nPeople who already enabled alerts, opted out, or were invited in the last 24 hours will be skipped.`)) {
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Invitation send failed.");

      setMessage(
        `Processed ${data?.count ?? 0}. Sent ${data?.sent ?? 0}; skipped ${data?.skipped ?? 0}; failed ${data?.failed ?? 0}.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invitation send failed.");
    } finally {
      setSending(null);
    }
  }

  const activeCounts = tab === "parents" ? parentCounts : staffCounts;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
          EduLife OS · Essential School Alerts
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Useful SMS, chosen by the recipient</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Parents can enable attendance, fees/payment and released-result alerts. Teachers and Headteachers can enable lesson-note and official appraisal alerts. No advertising.
        </p>

        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">
          <strong>Parent offer:</strong> first school term free. Any future paid continuation requires at least 14 days&apos; notice and is never charged automatically. Health consent is separate.
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("parents")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === "parents" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
          >
            Parents
          </button>
          <button
            type="button"
            onClick={() => setTab("staff")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === "staff" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
          >
            Teachers & Headteachers
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl bg-emerald-50 p-3"><div className="text-xl font-bold text-emerald-800">{activeCounts.enrolled}</div><div className="text-xs text-emerald-700">Enabled</div></div>
          <div className="rounded-xl bg-amber-50 p-3"><div className="text-xl font-bold text-amber-800">{activeCounts.invited}</div><div className="text-xs text-amber-700">Invited</div></div>
          <div className="rounded-xl bg-zinc-50 p-3"><div className="text-xl font-bold text-zinc-800">{activeCounts.optedOut}</div><div className="text-xs text-zinc-600">Stopped</div></div>
          <div className="rounded-xl bg-rose-50 p-3"><div className="text-xl font-bold text-rose-800">{activeCounts.withoutPhone}</div><div className="text-xs text-rose-700">Phone needed</div></div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void sendInvitations(tab === "parents" ? "GUARDIANS" : "STAFF")}
            disabled={sending !== null}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? "Sending invitations…" : tab === "parents" ? "Invite parents" : "Invite staff"}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <p className="mt-3 text-xs leading-5 text-slate-500">
          You send invitations; the parent or staff member makes the choice. EduLife OS does not let school staff silently manufacture Essential Alerts consent.
        </p>
      </section>

      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}

      <section className="space-y-2">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading…</div>
        ) : tab === "parents" ? (
          students.length ? students.map((row) => (
            <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-bold text-slate-950">{fullName(row.firstName, row.lastName)}</div>
                  <div className="mt-1 text-sm text-slate-600">Guardian: {row.guardianName || "—"}</div>
                  <div className="text-xs text-slate-500">{row.guardianPhone || "No guardian phone on record"}</div>
                </div>
                <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${statusClasses(row.essentialAlerts.status)}`}>
                  {enrollmentLabel(row.essentialAlerts)}
                </span>
              </div>
              {row.essentialAlerts.lastInvitationSentAt ? (
                <div className="mt-2 text-xs text-slate-500">Last invitation: {new Date(row.essentialAlerts.lastInvitationSentAt).toLocaleString()}</div>
              ) : null}
            </article>
          )) : <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No active learners found.</div>
        ) : staff.length ? staff.map((row) => (
          <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-bold text-slate-950">{row.name || row.email || "Staff member"}</div>
                <div className="mt-1 text-sm text-slate-600">{row.role.replace(/_/g, " ")}</div>
                <div className="text-xs text-slate-500">{row.phoneAvailable ? "SMS contact available" : "Phone needed"}</div>
              </div>
              <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${statusClasses(row.essentialAlerts.status)}`}>
                {enrollmentLabel(row.essentialAlerts)}
              </span>
            </div>
            {row.essentialAlerts.lastInvitationSentAt ? (
              <div className="mt-2 text-xs text-slate-500">Last invitation: {new Date(row.essentialAlerts.lastInvitationSentAt).toLocaleString()}</div>
            ) : null}
          </article>
        )) : <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No eligible Teacher/Headteacher accounts found.</div>}
      </section>
    </div>
  );
}
