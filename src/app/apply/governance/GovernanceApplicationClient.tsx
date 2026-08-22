"use client";

import { useEffect, useMemo, useState } from "react";

type ZoneSummary = {
  id: string;
  name: string;
  code?: string | null;
  zoneType: { name: string; level: number };
  parentZone: { id: string; name: string } | null;
};

type Role =
  | "SISSO"
  | "CIRCUIT_SUPERVISOR"
  | "DISTRICT_DIRECTOR"
  | "HEAD_OF_SUPERVISION"
  | "BASIC_SCHOOL_COORDINATOR"
  | "DISTRICT_MIS_OFFICER"
  | "DISTRICT_SHEP_OFFICER"
  | "DISTRICT_ASSESSMENT_OFFICER"
  | "REGIONAL_VIEWER";

type ZonesResponse = {
  ok: boolean;
  zones?: ZoneSummary[];
  error?: string;
  message?: string;
};

type SubmitResponse = {
  ok: boolean;
  application?: {
    id: string;
    type: string;
    status: string;
    createdAt: string;
  };
  error?: string;
  message?: string;
  applicationId?: string;
  status?: string;
};

const inputClass =
  "h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

const textareaClass =
  "min-h-28 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

const roles: Array<{ value: Role; label: string }> = [
  { value: "SISSO", label: "SISSO" },
  { value: "DISTRICT_DIRECTOR", label: "District Director" },
  { value: "HEAD_OF_SUPERVISION", label: "Head of Supervision" },
  { value: "BASIC_SCHOOL_COORDINATOR", label: "Basic School Coordinator" },
  { value: "DISTRICT_MIS_OFFICER", label: "District MIS/Data Officer" },
  { value: "DISTRICT_SHEP_OFFICER", label: "District SHEP Officer" },
  { value: "DISTRICT_ASSESSMENT_OFFICER", label: "District Assessment Officer" },
  { value: "REGIONAL_VIEWER", label: "Regional Viewer" },
];

function expectedLevel(role: Role) {
  if (role === "SISSO" || role === "CIRCUIT_SUPERVISOR") return 1;
  if (
    role === "DISTRICT_DIRECTOR" ||
    role === "HEAD_OF_SUPERVISION" ||
    role === "BASIC_SCHOOL_COORDINATOR" ||
    role === "DISTRICT_MIS_OFFICER" ||
    role === "DISTRICT_SHEP_OFFICER" ||
    role === "DISTRICT_ASSESSMENT_OFFICER"
  ) {
    return 2;
  }
  return 3;
}

function zoneLabel(zone: ZoneSummary) {
  const parent = zone.parentZone ? ` • ${zone.parentZone.name}` : "";
  return `${zone.name} (${zone.zoneType.name})${parent}`;
}

export default function GovernanceApplicationClient() {
  const [zones, setZones] = useState<ZoneSummary[]>([]);
  const [role, setRole] = useState<Role>("SISSO");
  const [zoneId, setZoneId] = useState("");

  const [applicantName, setApplicantName] = useState("");
  const [applicantTitle, setApplicantTitle] = useState("SISSO");
  const [officialId, setOfficialId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [loadingZones, setLoadingZones] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const eligibleZones = useMemo(() => {
    const level = expectedLevel(role);
    return zones.filter((zone) => zone.zoneType.level === level);
  }, [role, zones]);

  const canSubmit = useMemo(() => {
    return (
      applicantName.trim().length >= 2 &&
      officialId.trim().length >= 2 &&
      email.trim().includes("@") &&
      Boolean(zoneId)
    );
  }, [applicantName, email, officialId, zoneId]);

  useEffect(() => {
    async function loadZones() {
      setLoadingZones(true);
      setMsg(null);

      try {
        const response = await fetch("/api/public/governance/zones", {
          cache: "no-store",
        });

        const data = (await response.json().catch(() => null)) as ZonesResponse | null;

        if (!response.ok || !data?.ok) {
          setZones([]);
          setMsg(data?.message || data?.error || `Failed to load zones (${response.status})`);
          return;
        }

        setZones(data.zones || []);
      } catch {
        setZones([]);
        setMsg("Network/server error loading governance zones.");
      } finally {
        setLoadingZones(false);
      }
    }

    void loadZones();
  }, []);

  useEffect(() => {
    setZoneId("");
    setApplicantTitle(roles.find((item) => item.value === role)?.label ?? role);
  }, [role]);

  async function submit() {
    setMsg(null);
    setSubmittedId(null);

    if (!canSubmit) {
      setMsg("Complete name, staff/official ID, valid email, and jurisdiction zone.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/onboarding/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          type: "GOVERNANCE_OFFICER",
          applicantName: applicantName.trim(),
          applicantTitle: applicantTitle.trim() || undefined,
          officialId: officialId.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          governanceRole: role,
          zoneId,
          title: applicantTitle.trim() || undefined,
          notes: notes.trim() || undefined,
          source: "PUBLIC_GOVERNANCE_APPLICATION_FORM",
        }),
      });

      const data = (await response.json().catch(() => null)) as SubmitResponse | null;

      if (!response.ok || !data?.ok) {
        setMsg(data?.message || data?.error || `Application failed (${response.status})`);
        return;
      }

      setSubmittedId(data.application?.id ?? null);
      setMsg("Application submitted successfully. EduLife OS will review and contact you.");
    } catch {
      setMsg("Network/server error submitting application.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
          EduLife OS Governance Application
        </p>
        <h1 className="mt-3 text-2xl font-bold text-slate-950">
          Apply for SISSO / directorate access
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Submit your details once. Superadmin will verify your jurisdiction and
          issue a governance officer invite if approved.
        </p>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-5">
        {msg ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
            {msg}
            {submittedId ? (
              <div className="mt-1 font-mono text-xs text-zinc-600">
                Application ID: {submittedId}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Applicant name">
            <input className={inputClass} value={applicantName} onChange={(e) => setApplicantName(e.target.value)} />
          </Field>

          <Field label="Role">
            <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {roles.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Title">
            <input className={inputClass} value={applicantTitle} onChange={(e) => setApplicantTitle(e.target.value)} />
          </Field>

          <Field label="Staff / official ID">
            <input className={inputClass} value={officialId} onChange={(e) => setOfficialId(e.target.value)} />
          </Field>

          <Field label="Email">
            <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>

          <Field label="Phone">
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>

          <Field label="Jurisdiction zone">
            <select
              className={inputClass}
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              disabled={loadingZones}
            >
              <option value="">
                {loadingZones ? "Loading zones…" : "Select zone"}
              </option>
              {eligibleZones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zoneLabel(zone)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            className={textareaClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any verification context or onboarding note."
          />
        </Field>

        <button
          type="button"
          disabled={loading}
          onClick={() => void submit()}
          className="h-10 rounded-xl border border-black bg-black px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {loading ? "Submitting…" : "Submit governance application"}
        </button>
      </section>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700">{props.label}</span>
      {props.children}
    </label>
  );
}
