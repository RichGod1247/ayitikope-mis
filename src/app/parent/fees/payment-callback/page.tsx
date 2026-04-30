// src/app/parent/fees/payment-callback/page.tsx
"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type VerifyState =
  | { status: "idle" }
  | { status: "verifying" }
  | { status: "success"; message: string }
  | { status: "pending"; message: string }
  | { status: "error"; message: string };

function stateMessage(state: VerifyState): string {
  if (state.status === "idle") {
    return "Preparing to verify your payment.";
  }

  if (state.status === "verifying") {
    return "Checking Paystack confirmation and updating your school account.";
  }

  return state.message;
}

function CallbackContent() {
  const searchParams = useSearchParams();

  const reference = useMemo(() => {
    return (
      searchParams.get("reference") ||
      searchParams.get("trxref") ||
      searchParams.get("ref") ||
      ""
    ).trim();
  }, [searchParams]);

  const [state, setState] = useState<VerifyState>({ status: "idle" });

  async function verifyPayment() {
    if (!reference) {
      setState({
        status: "error",
        message: "No transaction reference was found in the callback URL.",
      });
      return;
    }

    setState({ status: "verifying" });

    try {
      const res = await fetch("/api/parent/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ reference }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.ok) {
        setState({
          status: "success",
          message:
            "Payment confirmed. Your balance and receipt have been updated.",
        });
        return;
      }

      if (res.status === 202 || data?.pending) {
        setState({
          status: "pending",
          message:
            "Paystack has not confirmed this payment yet. Please check again shortly.",
        });
        return;
      }

      setState({
        status: "error",
        message:
          data?.error ||
          "We could not confirm this payment yet. Please contact the school office with your reference.",
      });
    } catch {
      setState({
        status: "error",
        message:
          "Network error while confirming payment. Please try again shortly.",
      });
    }
  }

  useEffect(() => {
    verifyPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  const isSuccess = state.status === "success";
  const isPending = state.status === "pending" || state.status === "verifying";
  const isError = state.status === "error";

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-sky-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-2xl border border-emerald-200 bg-white shadow-lg px-8 py-8 space-y-5 text-center">
          <div className="flex justify-center">
            <div
              className={[
                "h-16 w-16 rounded-full flex items-center justify-center",
                isSuccess
                  ? "bg-emerald-100 text-emerald-700"
                  : isError
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700",
              ].join(" ")}
            >
              {isSuccess ? (
                <svg
                  className="h-8 w-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : isError ? (
                <span className="text-2xl font-black">!</span>
              ) : (
                <span className="text-2xl font-black">…</span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-zinc-900">
              {isSuccess
                ? "Payment confirmed"
                : isError
                  ? "Payment needs attention"
                  : isPending
                    ? "Confirming payment"
                    : "Payment verification"}
            </h1>

            <p className="text-sm text-zinc-600">{stateMessage(state)}</p>
          </div>

          {reference && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left">
              <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
                Transaction reference
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-zinc-900 break-all">
                {reference}
              </p>
              <p className="mt-1 text-[10px] text-zinc-500">
                Keep this reference as proof.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-left space-y-1">
            <p className="text-[11px] font-semibold text-amber-900">
              What happens now?
            </p>
            <ul className="text-[11px] text-amber-800/90 space-y-1">
              <li>• EduLife OS verifies your reference with Paystack</li>
              <li>• Your balance is updated only after confirmation</li>
              <li>• A receipt is generated after successful confirmation</li>
              <li>• You can view receipts from the parent portal</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            {!isSuccess && (
              <button
                type="button"
                disabled={state.status === "verifying"}
                onClick={verifyPayment}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
              >
                {state.status === "verifying" ? "Checking…" : "Check again"}
              </button>
            )}

            <Link
              href="/parent/receipts"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800"
            >
              View my receipts
            </Link>

            <Link
              href="/parent/fees"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Back to fees
            </Link>
          </div>
        </div>

        <p className="text-[10px] text-center text-zinc-500">
          If your balance does not update after confirmation, contact the school
          office with your transaction reference.
        </p>
      </div>
    </main>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <p className="text-sm text-zinc-500">Loading…</p>
        </main>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}