// src/app/(auth)/signup/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type Phase = "KG" | "PRIMARY" | "JHS";
type AccessMethod = "INVITE" | "ONBOARDING";

type FieldErrors = Record<string, string>;

type ApiFail = { ok: false; error?: string; fieldErrors?: FieldErrors | null };
type ApiOk = { ok: true; portalUrl?: string; tenantId?: string; userId?: string };
type ApiResp = ApiFail | ApiOk;

type JhsRow = {
  subject: string;
  classes: Record<"JHS 1" | "JHS 2" | "JHS 3", boolean>;
};

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function cleanEmail(v: unknown) {
  return String(v ?? "").toLowerCase().trim();
}

function cleanPhone(v: unknown) {
  const raw = cleanStr(v).replace(/\s+/g, "");
  let p = raw.replace(/[^\d+]/g, "");
  if (!p) return "";
  if (p.startsWith("0") && p.length === 10) p = `+233${p.slice(1)}`;
  if (p.startsWith("233") && !p.startsWith("+233")) p = `+${p}`;
  return p;
}

function parseRedirect(sp: URLSearchParams) {
  const v =
    sp.get("redirectTo") ||
    sp.get("redirect") ||
    sp.get("callbackUrl") ||
    sp.get("callback") ||
    "";
  return cleanStr(v);
}

function extractInvite(sp: URLSearchParams) {
  return (
    cleanStr(sp.get("invite")) ||
    cleanStr(sp.get("token")) ||
    cleanStr(sp.get("inviteToken")) ||
    ""
  );
}

function parseCommaList(s: string) {
  return s
    .split(/[,\n]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeClassLevel(level: string) {
  return cleanStr(level);
}

const KG_PRIMARY_LEVELS = [
  "KG 1",
  "KG 2",
  "Basic 1",
  "Basic 2",
  "Basic 3",
  "Basic 4",
  "Basic 5",
  "Basic 6",
];

// Helpful datalist for JHS subjects (teacher can still type anything)
const COMMON_JHS_SUBJECTS = [
  "Mathematics",
  "English Language",
  "Integrated Science",
  "Social Studies",
  "RME",
  "Computing",
  "French",
  "Ghanaian Language",
  "Creative Arts",
  "Physical Education",
];

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const qp = useMemo(() => {
    const sp = searchParams;
    const inviteToken = extractInvite(sp);
    const tenantId = cleanStr(sp.get("tenantId") || sp.get("tenant") || sp.get("school") || "");
    const onboardingCode = cleanStr(sp.get("onboardingCode") || sp.get("code") || "");
    const redirect = parseRedirect(sp);
    return { inviteToken, tenantId, onboardingCode, redirect };
  }, [searchParams]);

  const [submitting, setSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [staffId, setStaffId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [phase, setPhase] = useState<Phase>("PRIMARY");
  const [classLevel, setClassLevel] = useState(KG_PRIMARY_LEVELS[2]); // Basic 1 default

  const [tenantId, setTenantId] = useState(qp.tenantId);
  const [onboardingCode, setOnboardingCode] = useState(qp.onboardingCode);
  const [inviteToken, setInviteToken] = useState(qp.inviteToken);

  // ✅ explicit toggle (bank-grade UX)
  const [accessMethod, setAccessMethod] = useState<AccessMethod>(
    qp.inviteToken ? "INVITE" : "ONBOARDING"
  );

  const [additionalDutiesText, setAdditionalDutiesText] = useState("");

  const [jhsRows, setJhsRows] = useState<JhsRow[]>([
    { subject: "", classes: { "JHS 1": false, "JHS 2": false, "JHS 3": false } },
  ]);

  const redirectTo = useMemo(() => (qp.redirect ? qp.redirect : "/teacher-portal"), [qp.redirect]);

  function clearErrors() {
    setTopError(null);
    setFieldErrors({});
  }

  function validateClientSide() {
    clearErrors();

    const fe: FieldErrors = {};
    const fn = cleanStr(firstName);
    const ln = cleanStr(lastName);
    const sid = cleanStr(staffId);
    const em = cleanEmail(email);
    const ph = cleanPhone(phone);

    if (!fn) fe.firstName = "First name is required.";
    if (!ln) fe.lastName = "Last name is required.";
    if (!sid) fe.staffId = "Staff ID is required.";
    if (!em) fe.email = "Email is required.";
    if (!ph) fe.phone = "Phone is required.";
    if (!cleanStr(password)) fe.password = "Password is required.";
    if (cleanStr(password).length > 0 && cleanStr(password).length < 8) {
      fe.password = "Password must be at least 8 characters.";
    }

    if (!phase) fe.phase = "Phase is required.";

    if (phase === "KG" || phase === "PRIMARY") {
      if (!cleanStr(classLevel)) fe.classLevel = "Class level is required.";
    } else {
      const anyValid = jhsRows.some((r) => {
        const subj = cleanStr(r.subject);
        const classes = Object.entries(r.classes)
          .filter(([, v]) => v)
          .map(([k]) => k);
        return subj && classes.length > 0;
      });
      if (!anyValid) fe.jhsAssignments = "Add at least one subject and class selection.";
    }

    if (accessMethod === "INVITE") {
      if (!cleanStr(inviteToken)) fe.inviteToken = "Invite token is required.";
    } else {
      if (!cleanStr(tenantId)) fe.tenantId = "School code (tenant) is required.";
      if (!cleanStr(onboardingCode)) fe.onboardingCode = "Onboarding code is required.";
    }

    setFieldErrors(fe);
    return Object.keys(fe).length === 0;
  }

  function buildJhsAssignments() {
    return jhsRows
      .map((r) => {
        const subject = cleanStr(r.subject);
        const classes = Object.entries(r.classes)
          .filter(([, v]) => v)
          .map(([k]) => k);
        return { subject, classes };
      })
      .filter((x) => x.subject && x.classes.length > 0);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const ok = validateClientSide();
    if (!ok) return;

    setSubmitting(true);
    setTopError(null);

    const payload: any = {
      firstName: cleanStr(firstName),
      lastName: cleanStr(lastName),
      staffId: cleanStr(staffId),
      email: cleanEmail(email),
      phone: cleanPhone(phone),
      password: cleanStr(password),
      phase,
      accessMethod, // helpful for audit/debug (server still validates)
      additionalDuties: parseCommaList(additionalDutiesText),
      redirectTo,
    };

    if (phase === "KG" || phase === "PRIMARY") {
      payload.classLevel = normalizeClassLevel(classLevel);
    } else {
      payload.jhsAssignments = buildJhsAssignments();
    }

    if (accessMethod === "INVITE") {
      payload.inviteToken = cleanStr(inviteToken);
    } else {
      payload.tenantId = cleanStr(tenantId); // can be tenantId OR slug/school code (server resolves)
      payload.onboardingCode = cleanStr(onboardingCode);
    }

    try {
      const res = await fetch("/api/auth/teacher-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => null)) as ApiResp | null;

      if (!data) {
        setTopError("Signup failed. Invalid server response.");
        return;
      }

      if (!data.ok) {
        setTopError(data.error || "Signup failed.");
        setFieldErrors((data.fieldErrors as FieldErrors) || {});
        return;
      }

      const portalUrl =
        (data as ApiOk).portalUrl || `/auth/signin?callbackUrl=${encodeURIComponent(redirectTo)}`;
      router.push(portalUrl);
    } catch {
      setTopError("Signup failed. Please check your internet and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function addJhsRow() {
    setJhsRows((prev) => [
      ...prev,
      { subject: "", classes: { "JHS 1": false, "JHS 2": false, "JHS 3": false } },
    ]);
  }

  function removeJhsRow(idx: number) {
    setJhsRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function toggleJhsClass(idx: number, key: "JHS 1" | "JHS 2" | "JHS 3") {
    setJhsRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        return { ...r, classes: { ...r.classes, [key]: !r.classes[key] } };
      })
    );
  }

  function updateJhsSubject(idx: number, v: string) {
    setJhsRows((prev) => prev.map((r, i) => (i === idx ? { ...r, subject: v } : r)));
  }

  function setMethod(m: AccessMethod) {
    setAccessMethod(m);
    clearErrors();
    // keep values, but avoid accidental cross-mode submission
    if (m === "INVITE") {
      // ok to keep inviteToken
    } else {
      // ok to keep tenantId/onboardingCode
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Teacher Signup</h1>
            <p className="text-sm text-gray-600 mt-1">
              Create your teacher account and lock your teaching scope (phase + class/subjects).
            </p>
          </div>
          <Link
            href={`/auth/signin?callbackUrl=${encodeURIComponent(redirectTo)}`}
            className="text-sm text-blue-600 hover:underline"
          >
            Already have an account? Sign in
          </Link>
        </div>

        {topError ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {topError}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-6 space-y-6">
          {/* Identity */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-800">Identity</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-700">First Name</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="e.g. Kwame"
                />
                {fieldErrors.firstName ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.firstName}</p>
                ) : null}
              </div>

              <div>
                <label className="text-sm text-gray-700">Last Name</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="e.g. Mensah"
                />
                {fieldErrors.lastName ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.lastName}</p>
                ) : null}
              </div>

              <div>
                <label className="text-sm text-gray-700">Staff ID (School-scoped)</label>
                <input
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="e.g. AYI-0142"
                />
                {fieldErrors.staffId ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.staffId}</p>
                ) : null}
                <p className="mt-1 text-xs text-gray-500">
                  This ID is unique within your school (tenant), not globally.
                </p>
              </div>

              <div>
                <label className="text-sm text-gray-700">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="name@school.com"
                />
                {fieldErrors.email ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>
                ) : null}
              </div>

              <div>
                <label className="text-sm text-gray-700">Phone</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="+233..."
                />
                {fieldErrors.phone ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.phone}</p>
                ) : null}
              </div>

              <div>
                <label className="text-sm text-gray-700">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Minimum 8 characters"
                />
                {fieldErrors.password ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
                ) : null}
                <p className="mt-1 text-xs text-gray-500">
                  If your account already exists, this must be your existing password.
                </p>
              </div>
            </div>
          </section>

          {/* Access Method (EXPLICIT TOGGLE) */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-800">Access Method</h2>

            <div className="rounded-lg border p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="accessMethod"
                    checked={accessMethod === "INVITE"}
                    onChange={() => setMethod("INVITE")}
                  />
                  Signup with Invite Link
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="accessMethod"
                    checked={accessMethod === "ONBOARDING"}
                    onChange={() => setMethod("ONBOARDING")}
                  />
                  Signup with Onboarding Code
                </label>
              </div>

              {accessMethod === "INVITE" ? (
                <div>
                  <label className="text-sm text-gray-700">Invite Token / Link</label>
                  <input
                    value={inviteToken}
                    onChange={(e) => setInviteToken(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder="Paste invite link or token"
                  />
                  {fieldErrors.inviteToken ? (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.inviteToken}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-gray-500">
                    Invite links are email-specific. Use the same email the school invited.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-700">School Code / Tenant</label>
                    <input
                      value={tenantId}
                      onChange={(e) => setTenantId(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder="Tenant ID or school slug"
                    />
                    {fieldErrors.tenantId ? (
                      <p className="mt-1 text-xs text-red-600">{fieldErrors.tenantId}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-gray-500">
                      You can enter tenantId or school slug/code (server resolves it).
                    </p>
                  </div>

                  <div>
                    <label className="text-sm text-gray-700">Onboarding Code</label>
                    <input
                      value={onboardingCode}
                      onChange={(e) => setOnboardingCode(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder="EDU-ABCDE-FGHIJ"
                    />
                    {fieldErrors.onboardingCode ? (
                      <p className="mt-1 text-xs text-red-600">{fieldErrors.onboardingCode}</p>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Teaching Scope */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-800">Teaching Scope</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-700">Phase</label>
                <select
                  value={phase}
                  onChange={(e) => setPhase(e.target.value as Phase)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white"
                >
                  <option value="KG">KG</option>
                  <option value="PRIMARY">PRIMARY</option>
                  <option value="JHS">JHS</option>
                </select>
                {fieldErrors.phase ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.phase}</p>
                ) : null}
              </div>

              {phase === "KG" || phase === "PRIMARY" ? (
                <div>
                  <label className="text-sm text-gray-700">Class Level</label>
                  <select
                    value={classLevel}
                    onChange={(e) => setClassLevel(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  >
                    {KG_PRIMARY_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.classLevel ? (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.classLevel}</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {phase === "JHS" ? (
              <div className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-700 font-medium">JHS Subject Assignments</p>
                  <button
                    type="button"
                    onClick={addJhsRow}
                    className="text-sm rounded-lg border px-3 py-1.5 hover:bg-gray-50"
                  >
                    + Add Subject
                  </button>
                </div>

                {fieldErrors.jhsAssignments ? (
                  <p className="text-xs text-red-600">{fieldErrors.jhsAssignments}</p>
                ) : null}

                <datalist id="jhs-subjects">
                  {COMMON_JHS_SUBJECTS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>

                <div className="space-y-3">
                  {jhsRows.map((row, idx) => (
                    <div key={idx} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <label className="text-xs text-gray-600">Subject</label>
                          <input
                            value={row.subject}
                            onChange={(e) => updateJhsSubject(idx, e.target.value)}
                            list="jhs-subjects"
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                            placeholder="e.g. Mathematics"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removeJhsRow(idx)}
                          disabled={jhsRows.length <= 1}
                          className="text-xs rounded-lg border px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {(["JHS 1", "JHS 2", "JHS 3"] as const).map((c) => (
                          <label key={c} className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={row.classes[c]}
                              onChange={() => toggleJhsClass(idx, c)}
                            />
                            {c}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {/* Additional duties */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-800">Additional Duties (optional)</h2>
            <textarea
              value={additionalDutiesText}
              onChange={(e) => setAdditionalDutiesText(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              rows={3}
              placeholder="e.g. Sports Master, ICT Coordinator (separate with commas or new lines)"
            />
          </section>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">After signup you’ll be redirected to sign in.</p>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
            >
              {submitting ? "Creating account..." : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
