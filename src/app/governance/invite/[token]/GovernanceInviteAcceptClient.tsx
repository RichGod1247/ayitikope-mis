// src/app/governance/invite/[token]/GovernanceInviteAcceptClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type InspectOk = {
  ok: true;
  invite: {
    id: string;
    email: string;
    emailMasked: string;
    phone: string | null;
    role: string;
    expiresAt: string;
    zone: {
      id: string;
      name: string;
      type: string;
      level: number;
      parent: { id: string; name: string } | null;
    };
  };
};

type InspectBad = {
  ok: false;
  error: string;
};

type InspectResp = InspectOk | InspectBad;

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function roleLabel(role: string) {
  if (role === "SISSO") return "SISO";
  if (role === "CIRCUIT_SUPERVISOR") return "Circuit Supervisor";
  if (role === "DISTRICT_DIRECTOR") return "District Director";
  if (role === "DISTRICT_MIS_OFFICER") return "District MIS/Data Officer";
  if (role === "DISTRICT_SHEP_OFFICER") return "District SHEP/Health Officer";
  if (role === "DISTRICT_ASSESSMENT_OFFICER") return "District Assessment Officer";
  if (role === "REGIONAL_VIEWER") return "Regional Viewer";
  return role.replaceAll("_", " ");
}

export default function GovernanceInviteAcceptClient({ token }: { token: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [inspect, setInspect] = useState<InspectResp | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [topError, setTopError] = useState("");

  const invite = inspect && inspect.ok ? inspect.invite : null;

  const expiresLabel = useMemo(() => {
    if (!invite?.expiresAt) return "";
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(invite.expiresAt));
    } catch {
      return invite.expiresAt;
    }
  }, [invite?.expiresAt]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setTopError("");

      try {
        const res = await fetch(`/api/governance/invite/inspect?token=${encodeURIComponent(token)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const data = (await res.json().catch(() => null)) as InspectResp | null;
        if (cancelled) return;

        if (!data) {
          setInspect({ ok: false, error: "INVALID_SERVER_RESPONSE" });
          return;
        }

        setInspect(data);

        if (data.ok) {
          setEmail(data.invite.email);
          setPhone(data.invite.phone ?? "");
        }
      } catch {
        if (!cancelled) setInspect({ ok: false, error: "NETWORK_ERROR" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function acceptInvite() {
    setTopError("");

    const emailClean = clean(email);
    const passwordClean = clean(password);
    const confirmClean = clean(confirmPassword);

    if (!emailClean) {
      setTopError("Enter your official email address.");
      return;
    }

    if (passwordClean.length < 8) {
      setTopError("Password must be at least 8 characters.");
      return;
    }

    if (passwordClean !== confirmClean) {
      setTopError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/governance/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          token,
          email: emailClean,
          name: clean(name),
          phone: clean(phone),
          password: passwordClean,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok: true; signInUrl: string; destination: string }
        | { ok: false; error: string }
        | null;

      if (!data) {
        setTopError("Invalid server response. Please try again.");
        return;
      }

      if (!data.ok) {
        if (data.error === "EXISTING_USER_PASSWORD_MISMATCH") {
          setTopError("This email already has an account. Enter the existing password to link this assignment.");
          return;
        }

        if (data.error === "EMAIL_MISMATCH") {
          setTopError("This invite belongs to a different email address.");
          return;
        }

        if (data.error === "INVALID_OR_EXPIRED_INVITE") {
          setTopError("This invite is invalid, expired, or already used.");
          return;
        }

        setTopError(data.error || "Could not accept invite.");
        return;
      }

      router.push(data.signInUrl);
    } catch {
      setTopError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#05070B] px-4 py-8 text-[#F7F4ED]">
      <section className="mx-auto flex min-h-[80vh] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-6 md:grid-cols-[1fr_1.1fr]">
          <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(27,102,209,0.25),transparent_38%),rgba(255,255,255,0.04)] p-6 shadow-2xl shadow-black/30">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#E8C96A]">
              EduLife OS Governance
            </p>

            <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              Accept your governance invitation
            </h1>

            <p className="mt-3 text-sm leading-6 text-[#C9CDD6]">
              This invite gives you jurisdiction-based access. You will see only the schools assigned
              to your circuit or district.
            </p>

            <div className="mt-6 rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 p-4 text-sm text-[#E8C96A]">
              Authority is assigned, accepted, and audited. No officer can self-claim district or
              circuit power.
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30">
            {loading ? (
              <div>
                <h2 className="text-xl font-bold">Checking invitation…</h2>
                <p className="mt-2 text-sm text-[#C9CDD6]">Please wait while we verify your invite.</p>
              </div>
            ) : !inspect?.ok ? (
              <div>
                <h2 className="text-xl font-bold">Invite unavailable</h2>
                <p className="mt-2 text-sm text-[#C9CDD6]">
                  This governance invite is invalid, expired, revoked, or already accepted.
                </p>
                <p className="mt-4 rounded-2xl border border-white/10 bg-[#05070B]/70 p-3 text-xs text-[#C9CDD6]">
                  Error: {inspect?.error ?? "UNKNOWN"}
                </p>
              </div>
            ) : invite ? (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8C96A]">
                    Invitation details
                  </p>
                  <h2 className="mt-2 text-2xl font-bold">{roleLabel(invite.role)}</h2>
                  <p className="mt-1 text-sm text-[#C9CDD6]">
                    {invite.zone.name}
                    {invite.zone.parent?.name ? ` · ${invite.zone.parent.name}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-[#C9CDD6]">Expires: {expiresLabel}</p>
                </div>

                <div className="grid gap-4">
                  <label className="block">
                    <span className="text-sm font-medium text-[#C9CDD6]">Official email</span>
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#05070B] px-3 text-sm text-[#F7F4ED] outline-none focus:border-[#D4AF37]/70"
                      placeholder={invite.emailMasked}
                      autoComplete="email"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-[#C9CDD6]">Full name</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#05070B] px-3 text-sm text-[#F7F4ED] outline-none focus:border-[#D4AF37]/70"
                      placeholder="Your full name"
                      autoComplete="name"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-[#C9CDD6]">Phone</span>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#05070B] px-3 text-sm text-[#F7F4ED] outline-none focus:border-[#D4AF37]/70"
                      placeholder="+233..."
                      autoComplete="tel"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-[#C9CDD6]">Password</span>
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#05070B] px-3 text-sm text-[#F7F4ED] outline-none focus:border-[#D4AF37]/70"
                      type="password"
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-[#C9CDD6]">Confirm password</span>
                    <input
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#05070B] px-3 text-sm text-[#F7F4ED] outline-none focus:border-[#D4AF37]/70"
                      type="password"
                      placeholder="Repeat password"
                      autoComplete="new-password"
                    />
                  </label>
                </div>

                {topError ? (
                  <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                    {topError}
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={submitting}
                  onClick={acceptInvite}
                  className="h-11 w-full rounded-xl bg-[#D4AF37] px-4 text-sm font-bold text-[#05070B] transition hover:bg-[#E8C96A] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Accepting…" : "Accept invitation"}
                </button>

                <p className="text-xs leading-5 text-[#C9CDD6]">
                  After accepting, you will sign in and land on the correct circuit or district
                  dashboard.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}