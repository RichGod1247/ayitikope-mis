// src/app/parent/fees/ParentFeesClient.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Child = {
  id: string;
  name: string;
  classroom?: { id: string; name: string } | null;
};

type InvoiceLine = {
  id: string;
  category: string;
  description: string;
  amountPesewas: number;
  waivedPesewas: number;
};

type PaymentItem = {
  id: string;
  amountPesewas: number;
  method: string | null;
  reference: string | null;
  channel: string | null;
  paidAt: string;
  receipt: {
    id: string;
    receiptNumber: string;
    issuedAt: string;
  } | null;
};

type InvoiceItem = {
  id: string;
  status: string;
  dueDate: string | null;
  issuedAt: string;
  note: string | null;
  totalBilledPesewas: number;
  totalWaivedPesewas: number;
  totalPaidPesewas: number;
  balancePesewas: number;
  lines: InvoiceLine[];
  payments: PaymentItem[];
};

type FeesSummary = {
  totalBilledPesewas: number;
  totalWaivedPesewas: number;
  totalPaidPesewas: number;
  balancePesewas: number;
  invoiceCount: number;
  paymentCount: number;
  lastPaymentDate: string | null;
  lastPaymentAmountPesewas: number | null;
  canPayOnline: boolean;
  payableInvoiceId: string | null;
  payableInvoiceBalancePesewas: number;
  note: string;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  studentId?: string;
  studentName?: string;
  term?: string;
  academicYear?: string;
  summary?: FeesSummary;
  invoices?: InvoiceItem[];
  paymentHistory?: PaymentItem[];
};

type ChildrenResponse = {
  ok: boolean;
  students?: Child[];
  error?: string;
};

type PayInitResponse = {
  ok: boolean;
  error?: string;
  authorization_url?: string;
};

function formatCedis(pesewas: number | null | undefined): string {
  const value = typeof pesewas === "number" ? pesewas : 0;
  return `GHS ${(value / 100).toFixed(2)}`;
}

function parseCedisToPesewas(raw: string): number {
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return NaN;

  const number = Number(cleaned);
  if (!Number.isFinite(number)) return NaN;

  return Math.round(number * 100);
}

function humanDate(iso: string | null | undefined): string {
  if (!iso) return "Not available";

  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "Not available";
  }
}

function friendlyError(code?: string) {
  const map: Record<string, string> = {
    STUDENT_ID_REQUIRED: "Please select a learner.",
    TERM_REQUIRED: "Please select a term.",
    ACADEMIC_YEAR_REQUIRED: "Please enter the academic year.",
    STUDENT_NOT_FOUND: "This learner could not be found.",
    FORBIDDEN_STUDENT: "This learner is not linked to your parent account.",
    PAYMENT_AMOUNT_INVALID: "Enter a valid amount to pay.",
    PAYMENT_EXCEEDS_BALANCE: "The amount is more than the payable balance.",
    INVOICE_NOT_FOUND: "No payable invoice was found for this term.",
    INVOICE_ALREADY_CLEARED: "This learner's fees are already fully settled.",
    PAYMENT_SERVICE_NOT_CONFIGURED:
      "Online payment is not fully configured yet. Please contact the school.",
    PAYMENT_GATEWAY_FAILED:
      "The payment provider could not start the payment. Please try again.",
  };

  return map[code ?? ""] ?? "Something went wrong. Please try again.";
}

export default function ParentFeesClient() {
  const [children, setChildren] = useState<Child[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(true);
  const [childrenError, setChildrenError] = useState<string | null>(null);

  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [term, setTerm] = useState("1st Term");
  const [academicYear, setAcademicYear] = useState("2025/2026");

  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const [data, setData] = useState<FeesSummary | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [paymentAmountCedis, setPaymentAmountCedis] = useState("");

  const [meta, setMeta] = useState<{
    studentName: string | null;
    studentId: string | null;
  }>({
    studentName: null,
    studentId: null,
  });

  useEffect(() => {
    let alive = true;

    setChildrenLoading(true);
    setChildrenError(null);

    fetch("/api/parent/children", { cache: "no-store" })
      .then((r) => r.json().catch(() => ({})))
      .then((j: ChildrenResponse) => {
        if (!alive) return;

        if (!j.ok) {
          setChildrenError(
            j.error || "Could not load your children. Please sign in again."
          );
          return;
        }

        const list = Array.isArray(j.students) ? j.students : [];
        setChildren(list);

        if (list.length === 1) {
          setSelectedStudentId(list[0].id);
        }
      })
      .catch(() => {
        if (!alive) return;
        setChildrenError("Network error loading your children. Please try again.");
      })
      .finally(() => {
        if (alive) setChildrenLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  async function loadFees(e?: FormEvent) {
    e?.preventDefault();

    setError(null);
    setPayError(null);
    setData(null);
    setInvoices([]);
    setPayments([]);
    setPaymentAmountCedis("");

    if (!selectedStudentId) {
      setError("Please select a learner.");
      return;
    }

    try {
      setLoading(true);

      const url = new URL("/api/parent/fees/summary", window.location.origin);
      url.searchParams.set("studentId", selectedStudentId);
      url.searchParams.set("term", term);
      url.searchParams.set("academicYear", academicYear);

      const res = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
      });

      const json = (await res.json()) as ApiResponse;

      if (!res.ok || !json.ok) {
        setError(friendlyError(json.error));
        return;
      }

      if (!json.summary) {
        setError("No fee summary was returned for this learner.");
        return;
      }

      setData(json.summary);
      setInvoices(Array.isArray(json.invoices) ? json.invoices : []);
      setPayments(Array.isArray(json.paymentHistory) ? json.paymentHistory : []);
      setMeta({
        studentName: json.studentName || null,
        studentId: json.studentId || selectedStudentId,
      });

      if (json.summary.payableInvoiceBalancePesewas > 0) {
        setPaymentAmountCedis(
          (json.summary.payableInvoiceBalancePesewas / 100).toFixed(2)
        );
      }
    } catch {
      setError("Network or server error while loading fees. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function startOnlinePayment() {
    setPayError(null);

    if (!selectedStudentId) {
      setPayError("Please select a learner first.");
      return;
    }

    if (!data || data.balancePesewas <= 0) {
      setPayError("There is no outstanding balance to pay.");
      return;
    }

    const amountPesewas = parseCedisToPesewas(paymentAmountCedis);

    if (!Number.isFinite(amountPesewas) || amountPesewas <= 0) {
      setPayError("Enter a valid amount to pay.");
      return;
    }

    if (amountPesewas > data.payableInvoiceBalancePesewas) {
      setPayError(
        `This payment can be up to ${formatCedis(
          data.payableInvoiceBalancePesewas
        )} for the next outstanding invoice.`
      );
      return;
    }

    try {
      setPaying(true);

      const res = await fetch("/api/parent/payments/init", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          studentId: selectedStudentId,
          term,
          academicYear,
          amountPesewas,
        }),
      });

      const json = (await res.json()) as PayInitResponse;

      if (!res.ok || !json.ok || !json.authorization_url) {
        setPayError(friendlyError(json.error));
        return;
      }

      window.location.href = json.authorization_url;
    } catch {
      setPayError("Could not start online payment. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  const effectiveBalance = data?.balancePesewas ?? 0;
  const isSettled = Boolean(data && effectiveBalance <= 0);

  const lineItems = useMemo(
    () => invoices.flatMap((inv) => inv.lines.map((line) => ({ ...line, invoiceId: inv.id }))),
    [invoices]
  );

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8 space-y-6">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-900">
            EduLife OS - Parent Fees
          </div>

          <div className="grid gap-4 md:grid-cols-[1.7fr_1fr] items-start">
            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">
                Fees and payments
              </h1>
              <p className="text-xs md:text-sm text-zinc-600 max-w-xl">
                See what was billed, why it was billed, what has been paid, what remains,
                and your receipt history.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold text-emerald-900">Parent trust rule</p>
              <p className="mt-1 text-[11px] text-emerald-900/80">
                No surprise fees. No hidden balance. Every payment must lead to a receipt.
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 md:px-5 md:py-5 shadow-sm">
          {childrenLoading && (
            <p className="text-xs text-zinc-500">Loading your children...</p>
          )}

          {childrenError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {childrenError}
            </div>
          )}

          {!childrenLoading && !childrenError && (
            <form
              onSubmit={loadFees}
              className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
            >
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-zinc-700">
                    Select learner
                  </label>

                  {children.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-2">
                      No children found. Contact the school to confirm your phone number.
                    </p>
                  ) : (
                    <select
                      value={selectedStudentId}
                      onChange={(e) => {
                        setSelectedStudentId(e.target.value);
                        setData(null);
                        setInvoices([]);
                        setPayments([]);
                        setError(null);
                        setPayError(null);
                      }}
                      className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="">Choose learner...</option>
                      {children.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.classroom ? ` - ${c.classroom.name}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-zinc-700">
                    Term
                  </label>
                  <select
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="1st Term">1st Term</option>
                    <option value="2nd Term">2nd Term</option>
                    <option value="3rd Term">3rd Term</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-zinc-700">
                    Academic year
                  </label>
                  <input
                    type="text"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="e.g. 2025/2026"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !selectedStudentId || children.length === 0}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white shadow-sm hover:bg-black disabled:opacity-50"
              >
                {loading ? "Loading..." : "View fees"}
              </button>
            </form>
          )}

          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          )}
        </section>

        {data ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  Term fee truth
                </h2>
                <p className="text-xs text-zinc-500">
                  Learner:{" "}
                  <span className="font-semibold text-zinc-700">
                    {meta.studentName}
                  </span>{" "}
                  - {term} {academicYear}
                </p>
              </div>
              <Link
                href="/parent/receipts"
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
              >
                View all receipts
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-[11px] font-medium text-amber-800">
                  Total billed
                </p>
                <p className="mt-1 text-xl font-semibold text-amber-950">
                  {formatCedis(data.totalBilledPesewas)}
                </p>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4">
                <p className="text-[11px] font-medium text-blue-800">
                  Waived / support
                </p>
                <p className="mt-1 text-xl font-semibold text-blue-950">
                  {formatCedis(data.totalWaivedPesewas)}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                <p className="text-[11px] font-medium text-emerald-800">
                  Paid
                </p>
                <p className="mt-1 text-xl font-semibold text-emerald-950">
                  {formatCedis(data.totalPaidPesewas)}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4">
                <p className="text-[11px] font-medium text-zinc-700">
                  Balance
                </p>
                <p
                  className={`mt-1 text-xl font-semibold ${
                    isSettled ? "text-emerald-900" : "text-zinc-950"
                  }`}
                >
                  {formatCedis(data.balancePesewas)}
                </p>
              </div>
            </div>

            {!isSettled && data.canPayOnline && (
              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Pay online
                  </h3>
                  <p className="mt-1 text-xs text-zinc-600">
                    You may pay in parts. The next payable invoice balance is{" "}
                    <span className="font-semibold">
                      {formatCedis(data.payableInvoiceBalancePesewas)}
                    </span>
                    .
                  </p>
                </div>

                <div className="flex flex-col gap-2 md:flex-row md:items-end">
                  <div className="space-y-1 md:w-52">
                    <label className="text-[11px] font-medium text-zinc-700">
                      Amount to pay
                    </label>
                    <input
                      value={paymentAmountCedis}
                      onChange={(e) => setPaymentAmountCedis(e.target.value)}
                      className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      placeholder="e.g. 50.00"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setPaymentAmountCedis(
                        (data.payableInvoiceBalancePesewas / 100).toFixed(2)
                      )
                    }
                    className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                  >
                    Pay full invoice
                  </button>

                  <button
                    type="button"
                    onClick={startOnlinePayment}
                    disabled={paying}
                    className="h-10 rounded-xl bg-zinc-900 px-5 text-xs font-semibold text-white hover:bg-black disabled:opacity-50"
                  >
                    {paying ? "Starting payment..." : "Continue to Paystack"}
                  </button>
                </div>

                {payError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {payError}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-900">
                Why this amount is owed
              </h3>

              {lineItems.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-500">
                  No invoice line items were found. The school may still be using a legacy invoice total.
                </p>
              ) : (
                <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 text-zinc-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Fee item</th>
                        <th className="px-3 py-2 font-medium">Category</th>
                        <th className="px-3 py-2 font-medium text-right">
                          Amount
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          Waived
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {lineItems.map((line) => (
                        <tr key={line.id}>
                          <td className="px-3 py-2 text-zinc-800">
                            {line.description}
                          </td>
                          <td className="px-3 py-2 text-zinc-500">
                            {line.category}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-zinc-900">
                            {formatCedis(line.amountPesewas)}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-600">
                            {formatCedis(line.waivedPesewas)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-900">
                Payment history
              </h3>

              {payments.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-500">
                  No payment has been recorded for this learner in the selected term.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs"
                    >
                      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-semibold text-zinc-900">
                            {formatCedis(payment.amountPesewas)}
                          </p>
                          <p className="text-zinc-500">
                            {payment.method ?? "payment"} - {humanDate(payment.paidAt)}
                          </p>
                          {payment.reference && (
                            <p className="mt-1 font-mono text-[10px] text-zinc-500 break-all">
                              Ref: {payment.reference}
                            </p>
                          )}
                        </div>

                        {payment.receipt ? (
                          <Link
                            href={`/parent/receipts/${payment.receipt.id}`}
                            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[11px] font-medium text-zinc-800 hover:bg-zinc-100"
                          >
                            Receipt {payment.receipt.receiptNumber}
                          </Link>
                        ) : (
                          <span className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
                            Receipt pending
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-xs text-zinc-600">
              {data.note}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-5 text-xs text-zinc-500">
            Select a learner and term, then tap{" "}
            <span className="font-semibold">View fees</span>. This page will show
            the exact charges, payments, balance, and receipts.
          </section>
        )}
      </div>
    </main>
  );
}