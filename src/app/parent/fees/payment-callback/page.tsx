// src/app/parent/fees/payment-callback/page.tsx
// Paystack redirects here after checkout. We show a status page while the
// webhook processes. The webhook (not this page) creates the actual payment record.
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function CallbackContent() {
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref") ?? "";
  const trxref = searchParams.get("trxref") ?? "";

  const displayRef = ref || trxref;

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-sky-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-2xl border border-emerald-200 bg-white shadow-lg px-8 py-8 space-y-5 text-center">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="h-8 w-8 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-zinc-900">Payment submitted</h1>
            <p className="text-sm text-zinc-600">
              Your payment has been submitted to Paystack. The school system will update your
              account balance within a few seconds once the confirmation arrives.
            </p>
          </div>

          {displayRef && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left">
              <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
                Transaction reference
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-zinc-900 break-all">
                {displayRef}
              </p>
              <p className="mt-1 text-[10px] text-zinc-500">
                Keep this reference as proof. The school receipt will be generated automatically.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-left space-y-1">
            <p className="text-[11px] font-semibold text-amber-900">What happens next?</p>
            <ul className="text-[11px] text-amber-800/90 space-y-1">
              <li>• Paystack confirms payment to EduLife OS</li>
              <li>• Your balance is updated automatically</li>
              <li>• A receipt is generated and linked to your child&apos;s account</li>
              <li>• You can view it under Payment Receipts</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <Link
              href="/parent/receipts"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-black"
            >
              View my receipts
            </Link>
            <Link
              href="/parent/overview"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Back to overview
            </Link>
          </div>
        </div>

        <p className="text-[10px] text-center text-zinc-500">
          If your balance does not update within 5 minutes, please contact the school office
          with your transaction reference.
        </p>
      </div>
    </main>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-zinc-500">Loading…</p>
      </main>
    }>
      <CallbackContent />
    </Suspense>
  );
}
