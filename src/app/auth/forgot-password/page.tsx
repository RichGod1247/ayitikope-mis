"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import FormLogo from "@/components/FormLogo";

type RequestState = "idle" | "loading" | "success" | "error";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<RequestState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setState("error");
      setMessage("Enter the email address registered on your staff account.");
      return;
    }

    setState("loading");
    setMessage(null);

    try {
      const response = await fetch("/api/auth/password-recovery/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({ email: normalized }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        setState("error");
        setMessage(
          payload.message ??
            "We could not process that request right now. Please try again shortly."
        );
        return;
      }

      setState("success");
      setMessage(
        payload.message ??
          "If an account can use this recovery method, we sent password reset instructions."
      );
    } catch {
      setState("error");
      setMessage("Network error. Check your connection and try again.");
    }
  }

  return (
    <main className="os-auth-shell flex min-h-screen items-center justify-center px-4 py-8">
      <section className="os-auth-card w-full max-w-md rounded-[30px] p-5 sm:p-7">
        <FormLogo subtitle="Secure staff password recovery" />

        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
            Staff account
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[#F7F4ED]">
            Reset your password
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#C9CDD6]">
            Enter the email address registered on your EduLife OS staff account.
            For privacy, the response does not reveal whether an account exists.
          </p>
        </div>

        {message ? (
          <div
            className={
              state === "success"
                ? "mb-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm leading-6 text-emerald-50"
                : "os-error-banner mb-4 rounded-2xl px-4 py-3 text-sm"
            }
          >
            {message}
          </div>
        ) : null}

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <label className="os-label">Registered email</label>
            <input
              className="os-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@school.com"
              maxLength={254}
              required
            />
          </div>

          <button
            type="submit"
            disabled={state === "loading"}
            className="os-btn-primary w-full px-4 py-3 text-sm"
          >
            {state === "loading" ? "Sending instructions..." : "Send reset instructions"}
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-[#C9CDD6]">
          Remembered your password?{" "}
          <Link
            href="/auth/signin"
            className="font-semibold text-[#E8C96A] hover:text-white"
          >
            Back to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
