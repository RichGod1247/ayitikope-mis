"use client";

import React, { useState } from "react";

type Resp =
  | { ok: true; tenant: { name: string; schoolCode: string; status: string }; next: { signInUrl: string } }
  | { ok: false; error: string };

export default function EnrollPage() {
  const [schoolName, setSchoolName] = useState("");
  const [emisCode, setEmisCode] = useState("");
  const [gpsAddress, setGpsAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [circuit, setCircuit] = useState("");
  const [region, setRegion] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ code: string; signInUrl: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSuccess(null);

    if (!schoolName.trim()) return setErr("School name is required.");
    if (!firstName.trim() || !lastName.trim()) return setErr("Admin first and last name are required.");
    if (!password || password.length < 8) return setErr("Password must be at least 8 characters.");

    setLoading(true);
    try {
      const res = await fetch("/api/tenants/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          school: { name: schoolName, emisCode, gpsAddress, district, circuit, region },
          admin: { firstName, lastName, phone, email, password },
        }),
      });

      const data = (await res.json().catch(() => ({}))) as Resp;
      if (!res.ok || !data.ok) {
        setErr((data as any)?.error || "Could not create school.");
        return;
      }

      setSuccess({ code: data.tenant.schoolCode, signInUrl: data.next.signInUrl });
    } catch (e: any) {
      setErr(e?.message || "Network/server error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-5">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">Enroll your school</h1>
          <p className="text-sm text-slate-600">
            Create a school workspace (tenant) + first admin. Status starts as <b>PENDING</b>.
          </p>
        </header>

        {err && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {err}
          </div>
        )}

        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 space-y-2">
            <div className="text-sm text-emerald-900">
              ✅ School created. Your school code is:
            </div>
            <div className="text-2xl font-mono font-semibold text-emerald-900">
              {success.code}
            </div>
            <div className="text-sm text-emerald-900">
              Next: sign in using your admin credentials.
            </div>
            <a
              href={success.signInUrl}
              className="inline-flex rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"
            >
              Go to Sign In
            </a>
            <p className="text-xs text-emerald-900/80">
              Note: tenant is PENDING until activated for pilot. You (super-admin) will flip it ACTIVE.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5 shadow-sm">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">School details</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="School name" value={schoolName} onChange={setSchoolName} required />
                <Field label="EMIS code (optional)" value={emisCode} onChange={setEmisCode} />
                <Field label="GhanaPostGPS (optional)" value={gpsAddress} onChange={setGpsAddress} placeholder="e.g. GA-183-8164" />
                <Field label="District (optional)" value={district} onChange={setDistrict} />
                <Field label="Circuit (optional)" value={circuit} onChange={setCircuit} />
                <Field label="Region (optional)" value={region} onChange={setRegion} />
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">First admin</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="First name" value={firstName} onChange={setFirstName} required />
                <Field label="Last name" value={lastName} onChange={setLastName} required />
                <Field label="Phone (optional)" value={phone} onChange={setPhone} placeholder="+233..." />
                <Field label="Email (optional)" value={email} onChange={setEmail} placeholder="admin@school.com" />
                <Field label="Password" value={password} onChange={setPassword} required type="password" />
              </div>
            </section>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading ? "Creating…" : "Create school"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="space-y-1 text-sm">
      <div className="text-[11px] font-medium text-slate-700">
        {props.label} {props.required ? <span className="text-red-600">*</span> : null}
      </div>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-slate-900"
      />
    </label>
  );
}
