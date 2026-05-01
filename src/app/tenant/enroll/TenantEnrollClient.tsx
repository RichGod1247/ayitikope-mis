//src/app/tenant/enroll/TenantEnrollClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Lookup = {
  ok: true;
  schoolName: string | null;
  reservedSchoolCode: string;
  reservedSlug: string;
  contactEmail: string;
  contactPhoneNorm: string | null;
  expiresAt: string;
  remainingSeconds: number;
};

type EnrollResult = {
  ok: true;
  tenantId: string;
  userId: string;
  slug: string;
  schoolCode: string;
  status: "PENDING" | "ACTIVE";
  autoActivateAfterHours: number;
  autoActivateAt: string;
  portalUrl: string;
  next: string;
};

function clean(v: string | null | undefined) {
  return String(v ?? "").trim();
}

export default function TenantEnrollClient() {
  const sp = useSearchParams();
  const token = useMemo(() => clean(sp.get("token") || sp.get("invite")), [sp]);

  const [loading, setLoading] = useState(true);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [tenantName, setTenantName] = useState("");
  const [emisCode, setEmisCode] = useState("");
  const [gpsAddress, setGpsAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [circuit, setCircuit] = useState("");
  const [region, setRegion] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const [password, setPassword] = useState("");
  const [onlinePaymentsPreference, setOnlinePaymentsPreference] =
    useState<"NO" | "YES">("NO");

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<EnrollResult | null>(null);

  useEffect(() => {
    async function run() {
      setLoading(true);
      setErr(null);
      setLookup(null);
      setDone(null);

      if (!token) {
        setErr("Missing invite token. Please use the link you received.");
        setLoading(false);
        return;
      }

      try {
        const r = await fetch(
          `/api/tenant-bootstrap/lookup?token=${encodeURIComponent(token)}`,
          { cache: "no-store" }
        );
        const j = await r.json().catch(() => ({} as Record<string, unknown>));

        if (!r.ok || !j || j.ok !== true) {
          setErr(
            typeof j === "object" && j && "error" in j
              ? String(j.error)
              : `Invalid or expired invite (${r.status}).`
          );
          setLoading(false);
          return;
        }

        const data = j as unknown as Lookup;
        setLookup(data);
        setTenantName(String(data.schoolName || "").trim());
      } catch {
        setErr("Network/server error while loading invite. Try again.");
      } finally {
        setLoading(false);
      }
    }

    void run();
  }, [token]);

  async function submit() {
    setErr(null);
    setDone(null);

    if (!lookup) return;

    if (!tenantName.trim()) {
      setErr("School name is required.");
      return;
    }

    if (!password || password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);

    try {
      const r = await fetch("/api/tenant/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inviteToken: token,

          tenantName: tenantName.trim(),
          emisCode: emisCode.trim() || null,
          gpsAddress: gpsAddress.trim() || null,
          district: district.trim() || null,
          circuit: circuit.trim() || null,
          region: region.trim() || null,

          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          phone: phone.trim() || null,

          email: lookup.contactEmail,
          password,

          onlinePaymentsPreference,
        }),
      });

      const j = await r.json().catch(() => ({} as Record<string, unknown>));

      if (!r.ok || !j || j.ok !== true) {
        const msg =
          typeof j === "object" && j
            ? String(
                (j as { message?: unknown; error?: unknown }).message ??
                  (j as { error?: unknown }).error ??
                  `Failed (${r.status}).`
              )
            : `Failed (${r.status}).`;

        setErr(msg);
        return;
      }

      setDone(j as unknown as EnrollResult);
    } catch {
      setErr("Network/server error submitting enrollment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="max-w-2xl mx-auto p-6 text-sm text-slate-700">
          Loading invite…
        </div>
      </main>
    );
  }

  if (err) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="max-w-2xl mx-auto p-6 space-y-3">
          <h1 className="text-xl font-semibold text-slate-900">
            School Enrollment
          </h1>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {err}
          </div>
        </div>
      </main>
    );
  }

  if (!lookup) return null;

  if (done) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">Submitted</h1>

          <div className="rounded-2xl border bg-white p-5 space-y-2">
            <div className="text-sm text-slate-700">
              School Code: <span className="font-mono">{done.schoolCode}</span>
            </div>

            <div className="text-sm text-slate-700">
              Status: <span className="font-semibold">{done.status}</span>
            </div>

            <div className="text-sm text-slate-700">
              Auto-activation: if not approved within{" "}
              <b>{done.autoActivateAfterHours}</b> hours, it becomes ACTIVE on
              the first system touch after:{" "}
              <span className="font-mono">
                {new Date(done.autoActivateAt).toLocaleString()}
              </span>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              Online fee payments are optional. Your school can enable them later
              from the admin dashboard when ready.
            </div>

            <div className="pt-3 text-sm text-slate-700">
              Next:
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>
                  Go to <span className="font-mono">{done.next}</span> and sign
                  in with your email.
                </li>
                <li>
                  If still pending, you’ll see the pending screen until approved
                  or auto-activated after the window.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <header className="space-y-2">
          <div className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-800">
            EduLife OS · School Enrollment
          </div>

          <h1 className="text-xl font-semibold text-slate-900">
            Enroll your school
          </h1>

          <p className="text-sm text-slate-600">
            This invite expires soon. Complete the form and submit once.
          </p>
        </header>

        <section className="rounded-2xl border bg-white p-5 space-y-2">
          <div className="text-sm text-slate-700">
            School Code:{" "}
            <span className="font-mono">{lookup.reservedSchoolCode}</span>
          </div>

          <div className="text-sm text-slate-700">
            Reserved Slug:{" "}
            <span className="font-mono">{lookup.reservedSlug}</span>
          </div>

          <div className="text-xs text-slate-500">
            Expires: {new Date(lookup.expiresAt).toLocaleString()} • Remaining ~
            {Math.floor(lookup.remainingSeconds / 60)} min
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">
            School details
          </h2>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                School name
              </label>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                EMIS code (optional)
              </label>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={emisCode}
                onChange={(e) => setEmisCode(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                District
              </label>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Circuit
              </label>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={circuit}
                onChange={(e) => setCircuit(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Region
              </label>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                GhanaPost GPS address
              </label>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={gpsAddress}
                onChange={(e) => setGpsAddress(e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">
            School Admin account
          </h2>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                First name
              </label>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Last name
              </label>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Email (locked to invite)
              </label>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm bg-slate-50"
                value={lookup.contactEmail}
                disabled
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Phone (optional)
              </label>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 0553690424"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Password
              </label>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Minimum 8 characters.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Parent online fee payments
          </h2>

          <p className="text-sm text-slate-600">
            Would your school like to use EduLife OS later for parents to pay
            fees online into the school’s own account?
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setOnlinePaymentsPreference("NO")}
              className={`rounded-xl border px-4 py-3 text-left text-sm ${
                onlinePaymentsPreference === "NO"
                  ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <b>No, not now</b>
              <br />
              We want to complete enrollment first.
            </button>

            <button
              type="button"
              onClick={() => setOnlinePaymentsPreference("YES")}
              className={`rounded-xl border px-4 py-3 text-left text-sm ${
                onlinePaymentsPreference === "YES"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <b>Yes, we are interested</b>
              <br />
              We want EduLife OS to help with parent fee payments.
            </button>
          </div>

          {onlinePaymentsPreference === "YES" ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              After approval, your school admin dashboard will guide you through
              secure bank account setup. You will choose your bank by name; EduLife
              OS will handle the Paystack bank code behind the scenes.
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit enrollment"}
          </button>
        </section>
      </div>
    </main>
  );
}