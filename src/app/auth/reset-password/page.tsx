"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import FormLogo from "@/components/FormLogo";

type ResetState =
  | "reading-link"
  | "ready"
  | "loading"
  | "success"
  | "error";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function readFragmentToken() {
  if (typeof window === "undefined") return "";

  const raw = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  const params = new URLSearchParams(raw);
  return String(params.get("token") ?? "").trim();
}

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 4.3A10.6 10.6 0 0 1 12 4c5.3 0 9 4.2 10 6.5a3.8 3.8 0 0 1 0 3c-.4.9-1.1 2-2.1 3" />
      <path d="M6.6 6.6C4.2 8 2.7 10.2 2 11.5a3.8 3.8 0 0 0 0 3C3 16.8 6.7 21 12 21c1.4 0 2.7-.3 3.8-.7" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [state, setState] = useState<ResetState>("reading-link");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const recoveredToken = readFragmentToken();

    // Remove the recovery secret from the visible URL immediately. It remains
    // only in this page's in-memory state until the reset request completes.
    window.history.replaceState(null, "", "/auth/reset-password");

    if (!TOKEN_RE.test(recoveredToken)) {
      setState("error");
      setMessage("This recovery link is invalid or expired. Request a new link.");
      return;
    }

    setToken(recoveredToken);
    setState("ready");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!TOKEN_RE.test(token)) {
      setState("error");
      setMessage("This recovery link is invalid or expired. Request a new link.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setState("error");
      setMessage("The passwords do not match.");
      return;
    }

    if (newPassword !== newPassword.trim()) {
      setState("error");
      setMessage("Password cannot start or end with spaces.");
      return;
    }

    if (newPassword.length < 12 || newPassword.length > 128) {
      setState("error");
      setMessage("Use a password between 12 and 128 characters.");
      return;
    }

    setState("loading");
    setMessage(null);

    try {
      const response = await fetch("/api/auth/password-recovery/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          token,
          newPassword,
          confirmPassword,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        if (payload.error === "INVALID_OR_EXPIRED_RECOVERY") {
          setToken("");
        }

        setState("error");
        setMessage(
          payload.message ??
            "This recovery link could not be used. Request a new link and try again."
        );
        return;
      }

      setToken("");
      setNewPassword("");
      setConfirmPassword("");
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setState("success");
      setMessage(
        payload.message ??
          "Password updated. Sign in again with your new password."
      );
    } catch {
      setState("error");
      setMessage("Network error. Check your connection and try again.");
    }
  }

  const linkReady = state !== "reading-link" && TOKEN_RE.test(token);
  const confirmStarted = confirmPassword.length > 0;
  const passwordsMatch = confirmStarted && newPassword === confirmPassword;
  const passwordsMismatch = confirmStarted && !passwordsMatch;

  return (
    <main className="os-auth-shell flex min-h-screen items-center justify-center px-4 py-8">
      <section className="os-auth-card w-full max-w-md rounded-[30px] p-5 sm:p-7">
        <FormLogo subtitle="One-time staff credential recovery" />

        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
            Secure reset
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[#F7F4ED]">
            Choose a new password
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#C9CDD6]">
            Use 12–128 characters. After the reset, existing staff sign-in
            sessions are no longer trusted and must authenticate again.
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

        {state === "success" ? (
          <Link
            href="/auth/signin"
            className="os-btn-primary block w-full px-4 py-3 text-center text-sm"
          >
            Sign in with new password
          </Link>
        ) : linkReady ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="new-password" className="os-label">
                New password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  className="os-input pr-12"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={12}
                  maxLength={128}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((current) => !current)}
                  aria-label={
                    showNewPassword ? "Hide new password" : "Show new password"
                  }
                  aria-pressed={showNewPassword}
                  title={
                    showNewPassword ? "Hide new password" : "Show new password"
                  }
                  className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-[#C9CDD6] transition hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8C96A]"
                >
                  <PasswordVisibilityIcon visible={showNewPassword} />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirm-new-password" className="os-label">
                Confirm new password
              </label>
              <div className="relative">
                <input
                  id="confirm-new-password"
                  className="os-input pr-12"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={12}
                  maxLength={128}
                  required
                  aria-describedby="confirm-password-status"
                  aria-invalid={passwordsMismatch}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  aria-label={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                  aria-pressed={showConfirmPassword}
                  title={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                  className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-[#C9CDD6] transition hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8C96A]"
                >
                  <PasswordVisibilityIcon visible={showConfirmPassword} />
                </button>
              </div>

              <div
                id="confirm-password-status"
                className="min-h-5"
                aria-live="polite"
                aria-atomic="true"
              >
                {passwordsMatch ? (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                    <span aria-hidden="true">✓</span>
                    <span>Passwords match</span>
                  </p>
                ) : passwordsMismatch ? (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-200">
                    <span aria-hidden="true">✕</span>
                    <span>Passwords do not match</span>
                  </p>
                ) : null}
              </div>
            </div>

            <button
              type="submit"
              disabled={state === "loading"}
              className="os-btn-primary w-full px-4 py-3 text-sm"
            >
              {state === "loading" ? "Updating password..." : "Update password"}
            </button>
          </form>
        ) : state === "reading-link" ? (
          <p className="text-center text-sm text-[#C9CDD6]">
            Checking recovery link...
          </p>
        ) : (
          <Link
            href="/auth/forgot-password"
            className="os-btn-primary block w-full px-4 py-3 text-center text-sm"
          >
            Request a new recovery link
          </Link>
        )}

        {state !== "success" ? (
          <div className="mt-5 text-center text-xs text-[#C9CDD6]">
            <Link
              href="/auth/signin"
              className="font-semibold text-[#E8C96A] hover:text-white"
            >
              Back to sign in
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
