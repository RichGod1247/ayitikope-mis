"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Props = {
  nextUrl: string; // where to go after sign-in
};

type Mode = "signin" | "signup";

export default function TeacherPortalGatewayClient({ nextUrl }: Props) {
  const router = useRouter();

  const next = useMemo(() => {
    return nextUrl && nextUrl.startsWith("/") ? nextUrl : "/teacher/dashboard";
  }, [nextUrl]);

  const [mode, setMode] = useState<Mode>("signin");

  // Sign in
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loadingIn, setLoadingIn] = useState(false);

  // Sign up
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [staffId, setStaffId] = useState("");
  const [onboardingCode, setOnboardingCode] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [loadingUp, setLoadingUp] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const tiles = [
    {
      title: "Lesson Notes Studio",
      subtitle: "Plan · Generate · Submit · Print",
      desc: "Create NaCCA-aligned lesson notes, attach media, and submit for review — ready for print.",
      pill: "NaCCA-ready",
      cls: "from-emerald-50 to-white border-emerald-200",
      pillCls: "bg-emerald-100 text-emerald-900",
      icon: "📘",
    },
    {
      title: "Assessments & Reports",
      subtitle: "Scores · Insights · Term summaries",
      desc: "Record class scores, track performance, and generate clean term dashboards and reports.",
      pill: "Performance",
      cls: "from-indigo-50 to-white border-indigo-200",
      pillCls: "bg-indigo-100 text-indigo-900",
      icon: "📊",
    },
    {
      title: "Attendance & Daily Work",
      subtitle: "Fast register + smart follow-ups",
      desc: "Mark attendance quickly and keep class records consistent — with structured daily flow.",
      pill: "Speed",
      cls: "from-sky-50 to-white border-sky-200",
      pillCls: "bg-sky-100 text-sky-900",
      icon: "✅",
    },
    {
      title: "Curriculum Explorer",
      subtitle: "Strands → Indicators → Exemplars",
      desc: "Browse official curriculum details so lesson planning stays accurate and effortless.",
      pill: "Official",
      cls: "from-zinc-50 to-white border-zinc-200",
      pillCls: "bg-zinc-100 text-zinc-900",
      icon: "🧭",
    },
    {
      title: "Wellbeing & Health",
      subtitle: "Care that’s trackable",
      desc: "Support learners with structured wellbeing/health notes — consistent, audit-friendly records.",
      pill: "Care",
      cls: "from-rose-50 to-white border-rose-200",
      pillCls: "bg-rose-100 text-rose-900",
      icon: "🫶",
    },
    {
      title: "Communication Support",
      subtitle: "Stay connected with ease",
      desc: "Get built-in support that helps you stay reachable and consistent with parent communication.",
      pill: "Support",
      cls: "from-amber-50 to-white border-amber-200",
      pillCls: "bg-amber-100 text-amber-950",
      icon: "📶",
    },
  ];

  async function handleSignIn() {
    setError(null);
    setOk(null);

    const id = identifier.trim();
    if (!id || !password) {
      setError("Enter your Staff ID/Email and password.");
      return;
    }

    setLoadingIn(true);
    try {
      const res = await signIn("credentials", {
        redirect: false,
        identifier: id,
        password,
        callbackUrl: next,
      });

      if (!res || res.error) {
        setError(res?.error || "Sign in failed. Check your details and try again.");
        return;
      }

      setOk("Welcome back. Taking you to your dashboard…");
      router.push(res.url || next);
      router.refresh();
    } finally {
      setLoadingIn(false);
    }
  }

  async function handleSignUp() {
    setError(null);
    setOk(null);

    if (!fullName.trim() || !email.trim() || !signupPassword) {
      setError("Enter your name, email, and password.");
      return;
    }

    setLoadingUp(true);
    try {
      const res = await fetch("/api/auth/teacher-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName.trim(),
          email: email.trim(),
          staffId: staffId.trim() || null,
          onboardingCode: onboardingCode.trim() || null,
          password: signupPassword,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as any;

      if (!res.ok || data?.ok === false) {
        setError(data?.error || "Could not create account. Please try again.");
        return;
      }

      setOk("Account created. Signing you in…");

      const res2 = await signIn("credentials", {
        redirect: false,
        identifier: staffId.trim() || email.trim(),
        password: signupPassword,
        callbackUrl: next,
      });

      if (!res2 || res2.error) {
        setOk(null);
        setError(res2?.error || "Account created. Please sign in.");
        setMode("signin");
        return;
      }

      router.push(res2.url || next);
      router.refresh();
    } finally {
      setLoadingUp(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gradient-to-b from-sky-50/70 via-white to-sky-50/40">
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-start">
          {/* LEFT: Warm welcome + tiles */}
          <section className="space-y-5">
            <div className="rounded-3xl border border-sky-100 bg-white/85 shadow-sm backdrop-blur px-5 py-5 md:px-7 md:py-6">
              <div className="flex items-center gap-3">
                <Image
                  src="/logo.png"
                  alt="EduLife OS"
                  width={48}
                  height={48}
                  className="rounded-2xl"
                  priority
                />
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-sky-600">
                    EduLife OS · Teacher Gateway
                  </div>
                  <h1 className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-sky-950">
                    Welcome, Teacher. 🌿
                  </h1>
                </div>
              </div>

              <p className="mt-3 text-sm md:text-base text-slate-700 leading-relaxed">
                You’re not just “logging in”. You’re stepping into a calm workspace built to
                help you teach with clarity, move faster without stress, and keep every record
                tidy — the kind of system that makes a great teacher feel supported.
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-[11px] md:text-xs">
                <span className="inline-flex items-center rounded-full bg-sky-50 text-sky-900 border border-sky-100 px-3 py-1 font-medium">
                  Secure access
                </span>
                <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-900 border border-emerald-100 px-3 py-1 font-medium">
                  Lesson notes ready-to-print
                </span>
                <span className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-900 border border-indigo-100 px-3 py-1 font-medium">
                  Assessments & dashboards
                </span>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white/85 shadow-sm backdrop-blur px-5 py-5 md:px-7 md:py-6">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base md:text-lg font-semibold text-slate-900">
                  What’s waiting inside
                </h2>
                <div className="text-[11px] md:text-xs text-slate-500">
                  Sign in to unlock your full teacher workspace
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {tiles.map((t) => (
                  <div
                    key={t.title}
                    className={cx(
                      "rounded-3xl border bg-gradient-to-b p-4 shadow-[0_1px_6px_rgba(15,23,42,0.06)]",
                      t.cls
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                          <span className="text-lg">{t.icon}</span>
                          {t.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          {t.subtitle}
                        </div>
                      </div>

                      <span
                        className={cx(
                          "shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold border border-white/60",
                          t.pillCls
                        )}
                      >
                        {t.pill}
                      </span>
                    </div>

                    <p className="mt-3 text-xs md:text-sm text-slate-700 leading-relaxed">
                      {t.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* RIGHT: Bank-grade auth card */}
          <section>
            <div className="rounded-[28px] border border-zinc-200 bg-white shadow-sm overflow-hidden">
              <div className="p-6 border-b border-zinc-200 bg-gradient-to-b from-zinc-50 to-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Image
                      src="/logo.png"
                      alt="EduLife OS"
                      width={40}
                      height={40}
                      className="rounded-2xl"
                      priority
                    />
                    <div>
                      <div className="text-lg font-extrabold text-zinc-900">
                        {mode === "signin" ? "Sign in" : "Create account"}
                      </div>
                      <div className="text-sm text-zinc-600">
                        {mode === "signin"
                          ? "Access your teacher dashboard securely."
                          : "Get started in minutes — then head straight to your dashboard."}
                      </div>
                    </div>
                  </div>

                  <div className="flex rounded-2xl border border-zinc-200 bg-white p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setOk(null);
                        setMode("signin");
                      }}
                      className={cx(
                        "h-9 px-3 rounded-xl text-xs font-semibold transition",
                        mode === "signin"
                          ? "bg-black text-white"
                          : "text-zinc-700 hover:bg-zinc-50"
                      )}
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setOk(null);
                        setMode("signup");
                      }}
                      className={cx(
                        "h-9 px-3 rounded-xl text-xs font-semibold transition",
                        mode === "signup"
                          ? "bg-black text-white"
                          : "text-zinc-700 hover:bg-zinc-50"
                      )}
                    >
                      Sign up
                    </button>
                  </div>
                </div>

                {(error || ok) && (
                  <div
                    className={cx(
                      "mt-4 rounded-2xl px-3 py-2 text-xs border",
                      error
                        ? "border-red-200 bg-red-50 text-red-800"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800"
                    )}
                  >
                    {error ?? ok}
                  </div>
                )}
              </div>

              <div className="p-6">
                {mode === "signin" ? (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-700">
                        Staff ID or Email
                      </label>
                      <input
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="e.g. TCH-024 or teacher@school.com"
                        autoComplete="username"
                        className="w-full h-12 rounded-2xl border border-zinc-300 bg-white px-4 text-sm outline-none shadow-sm focus:border-black focus:ring-1 focus:ring-black"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-700">
                        Password
                      </label>
                      <input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        type="password"
                        autoComplete="current-password"
                        className="w-full h-12 rounded-2xl border border-zinc-300 bg-white px-4 text-sm outline-none shadow-sm focus:border-black focus:ring-1 focus:ring-black"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleSignIn}
                      disabled={loadingIn}
                      className="w-full h-12 rounded-2xl bg-black text-white text-sm font-semibold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {loadingIn ? "Signing in…" : "Continue → Teacher Dashboard"}
                    </button>

                    <div className="text-[11px] text-zinc-500">
                      After sign-in you’ll go to:{" "}
                      <span className="font-semibold text-zinc-700">{next}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-700">
                        Full name
                      </label>
                      <input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Ama Mensah"
                        autoComplete="name"
                        className="w-full h-12 rounded-2xl border border-zinc-300 bg-white px-4 text-sm outline-none shadow-sm focus:border-black focus:ring-1 focus:ring-black"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-700">
                        Email
                      </label>
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="teacher@school.com"
                        autoComplete="email"
                        className="w-full h-12 rounded-2xl border border-zinc-300 bg-white px-4 text-sm outline-none shadow-sm focus:border-black focus:ring-1 focus:ring-black"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-700">
                          Staff ID (optional)
                        </label>
                        <input
                          value={staffId}
                          onChange={(e) => setStaffId(e.target.value)}
                          placeholder="e.g. TCH-024"
                          className="w-full h-12 rounded-2xl border border-zinc-300 bg-white px-4 text-sm outline-none shadow-sm focus:border-black focus:ring-1 focus:ring-black"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-700">
                          Onboarding code (if required)
                        </label>
                        <input
                          value={onboardingCode}
                          onChange={(e) => setOnboardingCode(e.target.value)}
                          placeholder="Provided by admin"
                          className="w-full h-12 rounded-2xl border border-zinc-300 bg-white px-4 text-sm outline-none shadow-sm focus:border-black focus:ring-1 focus:ring-black"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-700">
                        Password
                      </label>
                      <input
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        placeholder="Create a strong password"
                        type="password"
                        autoComplete="new-password"
                        className="w-full h-12 rounded-2xl border border-zinc-300 bg-white px-4 text-sm outline-none shadow-sm focus:border-black focus:ring-1 focus:ring-black"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleSignUp}
                      disabled={loadingUp}
                      className="w-full h-12 rounded-2xl bg-black text-white text-sm font-semibold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {loadingUp ? "Creating account…" : "Create account → Dashboard"}
                    </button>
                  </div>
                )}
              </div>

              <div className="px-6 pb-6">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[11px] text-zinc-600">
                  Your account is protected. You’ll access teacher menus only after successful sign-in.
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
