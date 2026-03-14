// src/app/auth/signup/page.tsx
"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import FormLogo from "@/components/FormLogo";

type Phase = "KG" | "PRIMARY" | "JHS";
type AccessMethod = "INVITE" | "INVITE_CODE" | "ONBOARDING";
type RolePick = "TEACHER" | "HEADTEACHER";

type FieldErrors = Record<string, string>;

type ApiFail = { ok: false; error?: string; fieldErrors?: FieldErrors | null };
type ApiOk = { ok: true; portalUrl?: string; tenantId?: string; userId?: string };
type ApiResp = ApiFail | ApiOk;

type JhsRow = {
  subject: string;
  subjectSlug: string | null;
  classes: Record<"JHS 1" | "JHS 2" | "JHS 3", boolean>;
};

type SearchParamsLike = { get: (key: string) => string | null };

type SubjectOption = {
  name: string;
  slug?: string | null;
  phase?: string | null;
  level?: string | null;
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

function parseRedirect(sp: SearchParamsLike) {
  const v = sp.get("redirectTo") || sp.get("redirect") || sp.get("callbackUrl") || sp.get("callback") || "";
  return cleanStr(v);
}

function extractInvite(sp: SearchParamsLike) {
  return cleanStr(sp.get("invite")) || cleanStr(sp.get("token")) || cleanStr(sp.get("inviteToken")) || "";
}

function extractInviteCode(sp: SearchParamsLike) {
  return cleanStr(sp.get("code") || sp.get("inviteCode") || "");
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

const KG_PRIMARY_LEVELS = ["KG 1", "KG 2", "Basic 1", "Basic 2", "Basic 3", "Basic 4", "Basic 5", "Basic 6"];

const JHS_SUBJECTS_FALLBACK: SubjectOption[] = [
  { name: "Mathematics" },
  { name: "English Language" },
  { name: "Integrated Science" },
  { name: "Social Studies" },
  { name: "RME" },
  { name: "Computing" },
  { name: "French" },
  { name: "Ghanaian Language" },
  { name: "Creative Arts" },
  { name: "Physical Education" },
  { name: "Career Technology" },
];

function uniqByName(items: SubjectOption[]) {
  const seen = new Set<string>();
  const out: SubjectOption[] = [];
  for (const it of items) {
    const n = cleanStr(it?.name);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...it, name: n });
  }
  return out;
}

function sortByName(items: SubjectOption[]) {
  return items.slice().sort((a, b) => a.name.localeCompare(b.name));
}

function SignupSkeleton() {
  return (
    <main className="os-auth-shell flex items-center justify-center px-4 py-10">
      <div className="os-auth-card mx-auto w-full max-w-3xl rounded-[32px] p-6">
        <div className="os-skeleton-line h-6 w-40" />
        <div className="os-skeleton-line mt-4 h-10 w-full" />
        <div className="os-skeleton-line mt-3 h-10 w-full" />
        <div className="os-skeleton-line mt-3 h-10 w-full" />
        <div className="os-skeleton-line mt-3 h-40 w-full" />
      </div>
    </main>
  );
}

type InspectOk = {
  ok: true;
  tenant: { id: string; name: string; schoolCode: string | null };
  roleName: string;
  expiresAt: string;
  remaining: number;
};
type InspectFail = { ok: false; error: string; retryAfterSeconds?: number };

function SignupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const qp = useMemo(() => {
    const sp = searchParams;
    const inviteToken = extractInvite(sp);
    const inviteCode = extractInviteCode(sp);
    const tenantId = cleanStr(sp.get("tenantId") || sp.get("tenant") || sp.get("school") || "");
    const onboardingCode = cleanStr(sp.get("onboardingCode") || "");
    const redirect = parseRedirect(sp);
    return { inviteToken, inviteCode, tenantId, onboardingCode, redirect };
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

  const [rolePick, setRolePick] = useState<RolePick>("TEACHER");
  const [headteacherTeaches, setHeadteacherTeaches] = useState(false);

  const [phase, setPhase] = useState<Phase>("PRIMARY");
  const [classLevel, setClassLevel] = useState(KG_PRIMARY_LEVELS[2]);

  const [tenantId, setTenantId] = useState(qp.tenantId);
  const [onboardingCode, setOnboardingCode] = useState(qp.onboardingCode);
  const [inviteToken, setInviteToken] = useState(qp.inviteToken);
  const [inviteCode, setInviteCode] = useState(qp.inviteCode);

  const [accessMethod, setAccessMethod] = useState<AccessMethod>(
    qp.inviteToken ? "INVITE" : qp.inviteCode ? "INVITE_CODE" : "ONBOARDING"
  );

  const [additionalDutiesText, setAdditionalDutiesText] = useState("");

  const [jhsRows, setJhsRows] = useState<JhsRow[]>([
    { subject: "", subjectSlug: null, classes: { "JHS 1": false, "JHS 2": false, "JHS 3": false } },
  ]);

  const redirectTo = useMemo(() => (qp.redirect ? qp.redirect : "/app"), [qp.redirect]);

  const [jhsSubjectOptions, setJhsSubjectOptions] = useState<SubjectOption[]>(
    sortByName(uniqByName(JHS_SUBJECTS_FALLBACK))
  );
  const [subjectsLoadedFromDb, setSubjectsLoadedFromDb] = useState(false);

  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspect, setInspect] = useState<InspectOk | InspectFail | null>(null);

  const showTeachingScope = useMemo(() => {
    if (rolePick === "TEACHER") return true;
    return headteacherTeaches;
  }, [rolePick, headteacherTeaches]);

  useEffect(() => {
    if (phase !== "JHS") return;

    const ctrl = new AbortController();
    async function load() {
      try {
        const res = await fetch("/api/public/curriculum-subjects?phase=JHS", {
          method: "GET",
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        if (!res.ok) {
          setSubjectsLoadedFromDb(false);
          setJhsSubjectOptions(sortByName(uniqByName(JHS_SUBJECTS_FALLBACK)));
          return;
        }

        const data = (await res.json().catch(() => null)) as any;
        const itemsRaw = Array.isArray(data?.items) ? data.items : Array.isArray(data?.subjects) ? data.subjects : [];

        const items: SubjectOption[] = itemsRaw
          .map((x: any) => ({
            name: cleanStr(x?.name),
            slug: x?.slug ? cleanStr(x.slug) : null,
            phase: x?.phase ? cleanStr(x.phase) : null,
            level: x?.level ? cleanStr(x.level) : null,
          }))
          .filter((x: SubjectOption) => !!x.name);

        const canonical = sortByName(uniqByName(items));
        if (canonical.length) {
          setJhsSubjectOptions(canonical);
          setSubjectsLoadedFromDb(true);
        } else {
          setSubjectsLoadedFromDb(false);
          setJhsSubjectOptions(sortByName(uniqByName(JHS_SUBJECTS_FALLBACK)));
        }
      } catch {
        setSubjectsLoadedFromDb(false);
        setJhsSubjectOptions(sortByName(uniqByName(JHS_SUBJECTS_FALLBACK)));
      }
    }

    load();
    return () => ctrl.abort();
  }, [phase]);

  useEffect(() => {
    if (accessMethod !== "INVITE_CODE") return;

    const code = cleanStr(inviteCode);
    if (!code) {
      setInspect(null);
      return;
    }

    const ctrl = new AbortController();
    async function run() {
      setInspectLoading(true);
      try {
        const r = await fetch(`/api/auth/invite-codes/inspect?code=${encodeURIComponent(code)}`, {
          method: "GET",
          cache: "no-store",
          signal: ctrl.signal,
        });
        const j = (await r.json().catch(() => null)) as any;
        if (!j) {
          setInspect({ ok: false, error: "INVALID_RESPONSE" });
          return;
        }
        setInspect(j);
      } catch {
        setInspect({ ok: false, error: "NETWORK_ERROR" });
      } finally {
        setInspectLoading(false);
      }
    }

    run();
    return () => ctrl.abort();
  }, [accessMethod, inviteCode]);

  useEffect(() => {
    if (accessMethod !== "INVITE_CODE") return;
    const ok = inspect && (inspect as any).ok === true ? (inspect as InspectOk) : null;
    if (!ok) return;

    const rn = String(ok.roleName || "").toUpperCase();
    if (rn === "TEACHER") {
      setRolePick("TEACHER");
      setHeadteacherTeaches(false);
    } else if (rn === "HEADTEACHER") {
      setRolePick("HEADTEACHER");
      setHeadteacherTeaches(false);
    }
  }, [accessMethod, inspect]);

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
    if (cleanStr(password).length > 0 && cleanStr(password).length < 8) fe.password = "Password must be at least 8 characters.";

    if (accessMethod === "INVITE") {
      if (!cleanStr(inviteToken)) fe.inviteToken = "Invite token is required.";
    } else if (accessMethod === "INVITE_CODE") {
      if (!cleanStr(inviteCode)) fe.inviteCode = "Onboarding code is required.";
      if (inspect && (inspect as any).ok === false) fe.inviteCode = "Invalid or expired onboarding code.";
      if (!inspect) fe.inviteCode = "Enter a code to validate.";

      const ok = inspect && (inspect as any).ok === true ? (inspect as InspectOk) : null;
      if (ok && String(ok.roleName).toUpperCase() === "PARENT") {
        fe.inviteCode = "This code is for Parent onboarding. Use the Parent signup flow.";
      }
    } else {
      if (!cleanStr(tenantId)) fe.tenantId = "School code (tenant) is required.";
      if (!cleanStr(onboardingCode)) fe.onboardingCode = "Onboarding code is required.";
      if (rolePick !== "TEACHER") fe.rolePick = "Tenant + Code onboarding is teacher-only.";
    }

    if (showTeachingScope) {
      if (!phase) fe.phase = "Phase is required.";

      if (phase === "KG" || phase === "PRIMARY") {
        if (!cleanStr(classLevel)) fe.classLevel = "Class level is required.";
      } else {
        const anyValid = jhsRows.some((r) => {
          const subj = cleanStr(r.subject);
          const classes = Object.entries(r.classes).filter(([, v]) => v).map(([k]) => k);
          return subj && classes.length > 0;
        });
        if (!anyValid) fe.jhsAssignments = "Add at least one subject and class selection.";
      }
    }

    setFieldErrors(fe);
    return Object.keys(fe).length === 0;
  }

  function buildJhsAssignments() {
    return jhsRows
      .map((r) => {
        const subject = cleanStr(r.subject);
        const subjectSlug = r.subjectSlug ? cleanStr(r.subjectSlug) : null;
        const classes = Object.entries(r.classes).filter(([, v]) => v).map(([k]) => k);
        return { subject, subjectSlug, classes };
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
      additionalDuties: parseCommaList(additionalDutiesText),
      redirectTo,
      teaches: rolePick === "HEADTEACHER" ? !!headteacherTeaches : true,
    };

    if (showTeachingScope) {
      payload.phase = phase;
      if (phase === "KG" || phase === "PRIMARY") payload.classLevel = normalizeClassLevel(classLevel);
      else payload.jhsAssignments = buildJhsAssignments();
    }

    if (accessMethod === "INVITE") payload.inviteToken = cleanStr(inviteToken);
    else if (accessMethod === "INVITE_CODE") payload.inviteCode = cleanStr(inviteCode);
    else {
      payload.tenantId = cleanStr(tenantId);
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

      const portalUrl = (data as ApiOk).portalUrl || `/auth/signin?callbackUrl=${encodeURIComponent(redirectTo)}`;
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
      { subject: "", subjectSlug: null, classes: { "JHS 1": false, "JHS 2": false, "JHS 3": false } },
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

  function updateJhsSubject(idx: number, name: string) {
    const chosen = jhsSubjectOptions.find((s) => s.name === name) || null;
    setJhsRows((prev) =>
      prev.map((r, i) =>
        i === idx
          ? { ...r, subject: name, subjectSlug: chosen?.slug ? String(chosen.slug) : null }
          : r
      )
    );
  }

  function setMethod(m: AccessMethod) {
    setAccessMethod(m);
    clearErrors();
  }

  const selectedSubjects = useMemo(() => {
    return new Set(jhsRows.map((r) => cleanStr(r.subject).toLowerCase()).filter(Boolean));
  }, [jhsRows]);

  const inspectOk = inspect && (inspect as any).ok === true ? (inspect as InspectOk) : null;
  const roleLockedByCode = accessMethod === "INVITE_CODE" && !!inspectOk;

  return (
    <main className="os-auth-shell px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[0.82fr_1.18fr]">
        <section className="os-auth-brand hidden rounded-[32px] p-8 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#E8C96A]/25 bg-white/6 px-4 py-2 text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
              Staff Onboarding
            </div>

            <h1 className="mt-8 text-4xl font-semibold leading-tight text-[#F7F4ED]">
              Create your EduLife OS account with the right school access.
            </h1>

            <p className="mt-5 max-w-lg text-sm leading-8 text-[#C9CDD6]">
              Use your invite, onboarding code, or teacher onboarding path to enter the platform
              with the correct role, school scope, and teaching assignment.
            </p>
          </div>

          <div className="grid gap-3">
            {[
              "Role-aware onboarding",
              "School-scoped staff identity",
              "Teaching scope where required",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#E5E8EF]"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="os-auth-card rounded-[32px] p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <FormLogo subtitle="Create your staff account and continue into your school workspace." />
            </div>

            <Link
              href={`/auth/signin?callbackUrl=${encodeURIComponent(redirectTo)}`}
              className="os-btn-secondary inline-flex items-center justify-center px-4 py-2 text-sm"
            >
              Already have an account? Sign in
            </Link>
          </div>

          {topError ? (
            <div className="os-error-banner mt-2 rounded-2xl px-4 py-3 text-sm">
              {topError}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="mt-6 space-y-6">
            <section className="os-section-card rounded-[24px] p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                Identity
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="os-label">First Name</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="os-input"
                    placeholder="e.g. Kwame"
                  />
                  {fieldErrors.firstName ? <p className="text-xs text-red-300">{fieldErrors.firstName}</p> : null}
                </div>

                <div className="space-y-2">
                  <label className="os-label">Last Name</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="os-input"
                    placeholder="e.g. Mensah"
                  />
                  {fieldErrors.lastName ? <p className="text-xs text-red-300">{fieldErrors.lastName}</p> : null}
                </div>

                <div className="space-y-2">
                  <label className="os-label">Staff ID (School-scoped)</label>
                  <input
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value)}
                    className="os-input"
                    placeholder="e.g. AYI-0142"
                  />
                  {fieldErrors.staffId ? <p className="text-xs text-red-300">{fieldErrors.staffId}</p> : null}
                  <p className="os-helper">This ID is unique within your school tenant.</p>
                </div>

                <div className="space-y-2">
                  <label className="os-label">Email</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="os-input"
                    placeholder="name@school.com"
                  />
                  {fieldErrors.email ? <p className="text-xs text-red-300">{fieldErrors.email}</p> : null}
                </div>

                <div className="space-y-2">
                  <label className="os-label">Phone</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="os-input"
                    placeholder="+233..."
                  />
                  {fieldErrors.phone ? <p className="text-xs text-red-300">{fieldErrors.phone}</p> : null}
                </div>

                <div className="space-y-2">
                  <label className="os-label">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="os-input"
                    placeholder="Minimum 8 characters"
                  />
                  {fieldErrors.password ? <p className="text-xs text-red-300">{fieldErrors.password}</p> : null}
                </div>
              </div>
            </section>

            <section className="os-section-card rounded-[24px] p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                Role
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="os-label">What’s your role?</label>
                  <select
                    value={rolePick}
                    onChange={(e) => setRolePick(e.target.value as RolePick)}
                    disabled={roleLockedByCode}
                    className="os-input"
                  >
                    <option value="TEACHER">Teacher</option>
                    <option value="HEADTEACHER">Headteacher</option>
                  </select>
                  {fieldErrors.rolePick ? <p className="text-xs text-red-300">{fieldErrors.rolePick}</p> : null}
                  <p className="os-helper">
                    {roleLockedByCode
                      ? "Locked by onboarding code role."
                      : "Role is enforced server-side by the invite or onboarding code."}
                  </p>
                </div>

                {rolePick === "HEADTEACHER" ? (
                  <div className="flex items-end">
                    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#E5E8EF]">
                      <input
                        type="checkbox"
                        checked={headteacherTeaches}
                        onChange={(e) => setHeadteacherTeaches(e.target.checked)}
                        className="os-check"
                      />
                      <span>Do you teach? If yes, set teaching scope below.</span>
                    </label>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="os-section-card rounded-[24px] p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                Access Method
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#E5E8EF]">
                  <input
                    type="radio"
                    name="accessMethod"
                    checked={accessMethod === "INVITE"}
                    onChange={() => setMethod("INVITE")}
                    className="os-radio"
                  />
                  Invite Link
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#E5E8EF]">
                  <input
                    type="radio"
                    name="accessMethod"
                    checked={accessMethod === "INVITE_CODE"}
                    onChange={() => setMethod("INVITE_CODE")}
                    className="os-radio"
                  />
                  Onboarding Code
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#E5E8EF]">
                  <input
                    type="radio"
                    name="accessMethod"
                    checked={accessMethod === "ONBOARDING"}
                    onChange={() => setMethod("ONBOARDING")}
                    className="os-radio"
                  />
                  Tenant + Code
                </label>
              </div>

              <div className="mt-4">
                {accessMethod === "INVITE" ? (
                  <div className="space-y-2">
                    <label className="os-label">Invite Token / Link</label>
                    <input
                      value={inviteToken}
                      onChange={(e) => setInviteToken(e.target.value)}
                      className="os-input"
                      placeholder="Paste invite link or token"
                    />
                    {fieldErrors.inviteToken ? <p className="text-xs text-red-300">{fieldErrors.inviteToken}</p> : null}
                  </div>
                ) : accessMethod === "INVITE_CODE" ? (
                  <div className="space-y-2">
                    <label className="os-label">Onboarding Code</label>
                    <input
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      className="os-input"
                      placeholder="HT-.... / TC-...."
                    />
                    {fieldErrors.inviteCode ? <p className="text-xs text-red-300">{fieldErrors.inviteCode}</p> : null}

                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-6 text-[#C9CDD6]">
                      {inspectLoading ? (
                        <span>Validating code…</span>
                      ) : inspectOk ? (
                        <span>
                          School: <span className="font-semibold text-[#F7F4ED]">{inspectOk.tenant.name}</span>{" "}
                          <span className="text-[#AEB6C4]">({inspectOk.tenant.schoolCode || "—"})</span> • Role:{" "}
                          <span className="font-semibold text-[#F7F4ED]">{inspectOk.roleName}</span> • Remaining uses:{" "}
                          <span className="font-semibold text-[#F7F4ED]">{inspectOk.remaining}</span>
                        </span>
                      ) : inspect && (inspect as any).ok === false ? (
                        <span className="text-red-300">Invalid or expired code.</span>
                      ) : (
                        <span>Enter a code to validate.</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="os-label">School Code / Tenant</label>
                      <input
                        value={tenantId}
                        onChange={(e) => setTenantId(e.target.value)}
                        className="os-input"
                        placeholder="Tenant ID or school slug/code"
                      />
                      {fieldErrors.tenantId ? <p className="text-xs text-red-300">{fieldErrors.tenantId}</p> : null}
                    </div>

                    <div className="space-y-2">
                      <label className="os-label">Onboarding Code</label>
                      <input
                        value={onboardingCode}
                        onChange={(e) => setOnboardingCode(e.target.value)}
                        className="os-input"
                        placeholder="TCH-XXXXXXX"
                      />
                      {fieldErrors.onboardingCode ? <p className="text-xs text-red-300">{fieldErrors.onboardingCode}</p> : null}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {showTeachingScope ? (
              <section className="os-section-card rounded-[24px] p-5">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                  Teaching Scope
                </h2>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="os-label">Phase</label>
                    <select
                      value={phase}
                      onChange={(e) => setPhase(e.target.value as Phase)}
                      className="os-input"
                    >
                      <option value="KG">KG</option>
                      <option value="PRIMARY">PRIMARY</option>
                      <option value="JHS">JHS</option>
                    </select>
                    {fieldErrors.phase ? <p className="text-xs text-red-300">{fieldErrors.phase}</p> : null}
                  </div>

                  {phase === "KG" || phase === "PRIMARY" ? (
                    <div className="space-y-2">
                      <label className="os-label">Class Level</label>
                      <select
                        value={classLevel}
                        onChange={(e) => setClassLevel(e.target.value)}
                        className="os-input"
                      >
                        {KG_PRIMARY_LEVELS.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </select>
                      {fieldErrors.classLevel ? <p className="text-xs text-red-300">{fieldErrors.classLevel}</p> : null}
                    </div>
                  ) : null}
                </div>

                {phase === "JHS" ? (
                  <div className="mt-5 rounded-[22px] border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-[#F7F4ED]">JHS Subject Assignments</p>
                        <p className="os-helper">
                          Select subjects from the canonical list.
                          {subjectsLoadedFromDb ? " Loaded from DB." : " Using safe fallback list."}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={addJhsRow}
                        className="os-btn-secondary px-4 py-2 text-sm"
                      >
                        + Add Subject
                      </button>
                    </div>

                    {fieldErrors.jhsAssignments ? (
                      <p className="mt-3 text-xs text-red-300">{fieldErrors.jhsAssignments}</p>
                    ) : null}

                    <div className="mt-4 space-y-3">
                      {jhsRows.map((row, idx) => {
                        const current = cleanStr(row.subject).toLowerCase();

                        return (
                          <div key={idx} className="rounded-[22px] border border-white/10 bg-[#0C1730] p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 flex-1 space-y-2">
                                <label className="os-label">Subject</label>
                                <select
                                  value={row.subject}
                                  onChange={(e) => updateJhsSubject(idx, e.target.value)}
                                  className="os-input"
                                >
                                  <option value="">Select subject…</option>
                                  {jhsSubjectOptions.map((s) => {
                                    const key = s.name.toLowerCase();
                                    const alreadyPicked = selectedSubjects.has(key) && key !== current;
                                    return (
                                      <option key={s.name} value={s.name} disabled={alreadyPicked}>
                                        {s.name}
                                      </option>
                                    );
                                  })}
                                </select>
                                {fieldErrors[`jhsSubject_${idx}`] ? (
                                  <p className="text-xs text-red-300">{fieldErrors[`jhsSubject_${idx}`]}</p>
                                ) : null}
                              </div>

                              <button
                                type="button"
                                onClick={() => removeJhsRow(idx)}
                                disabled={jhsRows.length <= 1}
                                className="os-btn-secondary px-4 py-2 text-xs disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                              {(["JHS 1", "JHS 2", "JHS 3"] as const).map((c) => (
                                <label
                                  key={c}
                                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#E5E8EF]"
                                >
                                  <input
                                    type="checkbox"
                                    checked={row.classes[c]}
                                    onChange={() => toggleJhsClass(idx, c)}
                                    className="os-check"
                                  />
                                  {c}
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="os-section-card rounded-[24px] p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
                Additional Duties
              </h2>
              <div className="mt-4 space-y-2">
                <label className="os-label">Optional</label>
                <textarea
                  value={additionalDutiesText}
                  onChange={(e) => setAdditionalDutiesText(e.target.value)}
                  className="os-input min-h-[110px] resize-y"
                  placeholder="e.g. Sports Master, ICT Coordinator (separate with commas or new lines)"
                />
              </div>
            </section>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="os-helper">After signup you’ll be redirected to sign in.</p>

              <button
                type="submit"
                disabled={submitting}
                className="os-btn-primary px-6 py-3 text-sm"
              >
                {submitting ? "Creating account..." : "Create Account"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupSkeleton />}>
      <SignupInner />
    </Suspense>
  );
}