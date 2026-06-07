// src/app/apply/school/SchoolApplicationClient.tsx
"use client";

import { useMemo, useState } from "react";

type SchoolSector = "PUBLIC" | "PRIVATE";

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
export default function SchoolApplicationClient() {
  const [schoolName, setSchoolName] = useState("");
  const [schoolSector, setSchoolSector] = useState<SchoolSector>("PUBLIC");
  const [officialId, setOfficialId] = useState("");
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [circuit, setCircuit] = useState("");
  const [gpsAddress, setGpsAddress] = useState("");

  const [applicantName, setApplicantName] = useState("");
  const [applicantTitle, setApplicantTitle] = useState("Headteacher");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      schoolName.trim().length >= 3 &&
      officialId.trim().length >= 2 &&
      applicantName.trim().length >= 2 &&
      email.trim().includes("@")
    );
  }, [applicantName, email, officialId, schoolName]);

  async function submit() {
    setMsg(null);
    setSubmittedId(null);

    if (!canSubmit) {
      setMsg("Complete school name, official ID, applicant name, and valid email.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/onboarding/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          type: "SCHOOL",
          schoolName: schoolName.trim(),
          schoolSector,
          officialId: officialId.trim(),
          region: region.trim() || undefined,
          district: district.trim() || undefined,
          circuit: circuit.trim() || undefined,
          gpsAddress: gpsAddress.trim() || undefined,
          applicantName: applicantName.trim(),
          applicantTitle: applicantTitle.trim() || undefined,
          email: email.trim(),
          phone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
          source: "PUBLIC_SCHOOL_APPLICATION_FORM",
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
          EduLife OS Application
        </p>
        <h1 className="mt-3 text-2xl font-bold text-slate-950">
          Apply to onboard your school
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Submit your school details once. EduLife OS will review the application
          and send an official enrollment invite if approved.
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
          <Field label="School name">
            <input className={inputClass} value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
          </Field>

          <Field label="School sector">
            <select className={inputClass} value={schoolSector} onChange={(e) => setSchoolSector(e.target.value as SchoolSector)}>
              <option value="PUBLIC">Public School</option>
              <option value="PRIVATE">Private School</option>
            </select>
          </Field>

          <Field label={schoolSector === "PRIVATE" ? "EMIS / NaSIA / registration code" : "EMIS code"}>
            <input className={inputClass} value={officialId} onChange={(e) => setOfficialId(e.target.value)} />
          </Field>

          <Field label="GPS address">
            <input className={inputClass} value={gpsAddress} onChange={(e) => setGpsAddress(e.target.value)} />
          </Field>

          <Field label="Region">
            <input className={inputClass} value={region} onChange={(e) => setRegion(e.target.value)} />
          </Field>

          <Field label="District / Municipality">
            <input className={inputClass} value={district} onChange={(e) => setDistrict(e.target.value)} />
          </Field>

          <Field label="Circuit">
            <input className={inputClass} value={circuit} onChange={(e) => setCircuit(e.target.value)} />
          </Field>

          <Field label="Applicant name">
            <input className={inputClass} value={applicantName} onChange={(e) => setApplicantName(e.target.value)} />
          </Field>

          <Field label="Applicant title">
            <input className={inputClass} value={applicantTitle} onChange={(e) => setApplicantTitle(e.target.value)} />
          </Field>

          <Field label="Email">
            <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>

          <Field label="Phone">
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            className={textareaClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Tell us why your school wants to join EduLife OS."
          />
        </Field>

        <button
          type="button"
          disabled={loading}
          onClick={() => void submit()}
          className="h-10 rounded-xl border border-black bg-black px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {loading ? "Submitting…" : "Submit school application"}
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