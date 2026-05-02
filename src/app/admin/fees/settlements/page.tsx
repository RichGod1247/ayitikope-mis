// src/app/admin/fees/settlements/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  PaymentIntentStatus,
  PaymentProvider,
  PaymentStatus,
  SettlementAccountStatus,
  SettlementPayoutStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settlement Reporting | Admin | EduLife OS",
};

function formatCedis(pesewas: number | null | undefined) {
  const value = typeof pesewas === "number" ? pesewas : 0;
  const sign = value < 0 ? "-" : "";
  return `${sign}GHS ${(Math.abs(value) / 100).toFixed(2)}`;
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: string) {
  if (["ACTIVE", "SUCCESS", "PAID"].includes(status)) {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }

  if (["PENDING", "AUTHORIZED", "PROCESSING"].includes(status)) {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }

  if (["FAILED", "DISABLED", "CANCELLED", "EXPIRED", "REVERSED"].includes(status)) {
    return "border-red-300 bg-red-50 text-red-800";
  }

  return "border-zinc-300 bg-zinc-50 text-zinc-700";
}

function actorName(user?: {
  name: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
} | null) {
  if (!user) return "—";

  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.name ||
    user.email ||
    "—"
  );
}

export default async function AdminFeesSettlementsPage() {
  const auth = await requireServerUserContext({
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.tenantId) {
    redirect("/login");
  }

  const tenantId = auth.tenantId;

  const [
    settlementAccounts,
    totalOnlineTransactions,
    routedOnlineTransactions,
    unroutedOnlineTransactions,
    pendingIntents,
    failedIntents,
    payoutAll,
    payoutPaid,
    payoutPending,
    payoutFailed,
    recentTransactions,
    recentPayouts,
  ] = await Promise.all([
    prisma.tenantSettlementAccount.findMany({
      where: { tenantId },
      select: {
        id: true,
        provider: true,
        providerSubaccountCode: true,
        bankCode: true,
        bankName: true,
        accountName: true,
        accountNumberLast4: true,
        currency: true,
        status: true,
        isPrimary: true,
        approvedAt: true,
        disabledAt: true,
        disableReason: true,
        createdAt: true,
        updatedAt: true,
        requestedBy: {
          select: {
            name: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        approvedBy: {
          select: {
            name: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    }),

    prisma.paymentTransaction.aggregate({
      where: {
        tenantId,
        provider: PaymentProvider.PAYSTACK,
        status: PaymentStatus.SUCCESS,
      },
      _sum: { amountPesewas: true },
      _count: { id: true },
    }),

    prisma.paymentTransaction.aggregate({
      where: {
        tenantId,
        provider: PaymentProvider.PAYSTACK,
        status: PaymentStatus.SUCCESS,
        paymentIntent: {
          settlementAccountId: { not: null },
        },
      },
      _sum: { amountPesewas: true },
      _count: { id: true },
    }),

    prisma.paymentTransaction.aggregate({
      where: {
        tenantId,
        provider: PaymentProvider.PAYSTACK,
        status: PaymentStatus.SUCCESS,
        OR: [
          { paymentIntentId: null },
          {
            paymentIntent: {
              settlementAccountId: null,
            },
          },
        ],
      },
      _sum: { amountPesewas: true },
      _count: { id: true },
    }),

    prisma.paymentIntent.aggregate({
      where: {
        tenantId,
        provider: PaymentProvider.PAYSTACK,
        status: {
          in: [PaymentIntentStatus.PENDING, PaymentIntentStatus.AUTHORIZED],
        },
      },
      _sum: { amountPesewas: true },
      _count: { id: true },
    }),

    prisma.paymentIntent.aggregate({
      where: {
        tenantId,
        provider: PaymentProvider.PAYSTACK,
        status: {
          in: [
            PaymentIntentStatus.FAILED,
            PaymentIntentStatus.CANCELLED,
            PaymentIntentStatus.EXPIRED,
          ],
        },
      },
      _sum: { amountPesewas: true },
      _count: { id: true },
    }),

    prisma.settlementPayout.aggregate({
      where: { tenantId },
      _sum: { amountPesewas: true },
      _count: { id: true },
    }),

    prisma.settlementPayout.aggregate({
      where: {
        tenantId,
        status: SettlementPayoutStatus.PAID,
      },
      _sum: { amountPesewas: true },
      _count: { id: true },
    }),

    prisma.settlementPayout.aggregate({
      where: {
        tenantId,
        status: {
          in: [SettlementPayoutStatus.PENDING, SettlementPayoutStatus.PROCESSING],
        },
      },
      _sum: { amountPesewas: true },
      _count: { id: true },
    }),

    prisma.settlementPayout.aggregate({
      where: {
        tenantId,
        status: {
          in: [SettlementPayoutStatus.FAILED, SettlementPayoutStatus.REVERSED],
        },
      },
      _sum: { amountPesewas: true },
      _count: { id: true },
    }),

    prisma.paymentTransaction.findMany({
      where: {
        tenantId,
        provider: PaymentProvider.PAYSTACK,
      },
      select: {
        id: true,
        providerReference: true,
        providerTransactionId: true,
        amountPesewas: true,
        status: true,
        channel: true,
        providerPaidAt: true,
        createdAt: true,
        paymentIntent: {
          select: {
            providerReference: true,
            settlementAccount: {
              select: {
                providerSubaccountCode: true,
                bankName: true,
                accountName: true,
                accountNumberLast4: true,
                status: true,
              },
            },
          },
        },
        feePayment: {
          select: {
            receipt: {
              select: {
                id: true,
                receiptNumber: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),

    prisma.settlementPayout.findMany({
      where: { tenantId },
      select: {
        id: true,
        provider: true,
        providerTransferCode: true,
        providerTransferId: true,
        providerRecipientCode: true,
        providerReference: true,
        amountPesewas: true,
        currency: true,
        status: true,
        paidAt: true,
        failedAt: true,
        reversedAt: true,
        failureReason: true,
        createdAt: true,
        updatedAt: true,
        settlementAccount: {
          select: {
            providerSubaccountCode: true,
            bankName: true,
            accountName: true,
            accountNumberLast4: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const primaryAccount =
    settlementAccounts.find((account) => account.isPrimary && account.status === "ACTIVE") ??
    settlementAccounts.find((account) => account.status === "ACTIVE") ??
    settlementAccounts[0] ??
    null;

  const activeAccounts = settlementAccounts.filter(
    (account) => account.status === SettlementAccountStatus.ACTIVE
  );

  const riskFlags: { level: "critical" | "warning" | "good"; title: string; detail: string }[] = [];

  if (!primaryAccount) {
    riskFlags.push({
      level: "critical",
      title: "No settlement account configured",
      detail:
        "Online payment routing cannot be trusted until a Paystack settlement account exists.",
    });
  } else if (primaryAccount.status !== SettlementAccountStatus.ACTIVE) {
    riskFlags.push({
      level: "critical",
      title: "Primary settlement account is not active",
      detail: `Current status is ${primaryAccount.status}. Online payment routing should be reviewed.`,
    });
  }

  if (primaryAccount && !primaryAccount.providerSubaccountCode) {
    riskFlags.push({
      level: "critical",
      title: "Missing Paystack subaccount code",
      detail:
        "The school account exists locally but does not have a Paystack subaccount code.",
    });
  }

  if (settlementAccounts.length > 1 && activeAccounts.length > 1) {
    riskFlags.push({
      level: "warning",
      title: "Multiple active settlement accounts",
      detail:
        "Multiple active accounts can confuse routing. Confirm which account should be primary.",
    });
  }

  if ((unroutedOnlineTransactions._count.id ?? 0) > 0) {
    riskFlags.push({
      level: "warning",
      title: "Successful online payments without settlement account link",
      detail: `${unroutedOnlineTransactions._count.id} successful Paystack transaction(s) are not linked to a settlement account through their payment intent.`,
    });
  }

  if ((payoutAll._count.id ?? 0) === 0) {
    riskFlags.push({
      level: "warning",
      title: "No payout records yet",
      detail:
        "EduLife OS can currently verify payment routing, but no payout/transfer event has been recorded yet.",
    });
  }

  if ((payoutFailed._count.id ?? 0) > 0) {
    riskFlags.push({
      level: "critical",
      title: "Failed or reversed payout records exist",
      detail: `${payoutFailed._count.id} payout record(s) need finance review.`,
    });
  }

  const hasOnlyGood =
    riskFlags.length === 0 ||
    riskFlags.every((flag) => flag.level !== "critical" && flag.level !== "warning");

  if (hasOnlyGood) {
    riskFlags.push({
      level: "good",
      title: "Settlement routing and payout records look healthy",
      detail:
        "Paystack routing and payout records are present. Independent bank-statement confirmation is still a separate control.",
    });
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:py-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              EduLife OS · Settlement Governance
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 md:text-3xl">
              Settlement Reporting
            </h1>
            <p className="max-w-3xl text-sm text-zinc-600">
              Read-only settlement visibility for Paystack routing, payout events, subaccount
              readiness, and payment-to-settlement linkage.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/fees/online-payments"
              className="inline-flex h-10 items-center rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Online payments
            </Link>
            <Link
              href="/admin/fees/audit"
              className="inline-flex h-10 items-center rounded-xl bg-zinc-950 px-4 text-xs font-semibold text-white hover:bg-black"
            >
              Audit trail
            </Link>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] text-zinc-500">Successful online payments</p>
            <p className="mt-1 text-xl font-bold text-zinc-950">
              {formatCedis(totalOnlineTransactions._sum.amountPesewas)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {totalOnlineTransactions._count.id} transaction(s)
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <p className="text-[11px] text-emerald-700">Routed through settlement</p>
            <p className="mt-1 text-xl font-bold text-emerald-900">
              {formatCedis(routedOnlineTransactions._sum.amountPesewas)}
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              {routedOnlineTransactions._count.id} transaction(s)
            </p>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
            <p className="text-[11px] text-blue-700">Recorded Paystack payouts</p>
            <p className="mt-1 text-xl font-bold text-blue-900">
              {formatCedis(payoutAll._sum.amountPesewas)}
            </p>
            <p className="mt-1 text-xs text-blue-700">{payoutAll._count.id} payout(s)</p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <p className="text-[11px] text-emerald-700">Processed payouts</p>
            <p className="mt-1 text-xl font-bold text-emerald-900">
              {formatCedis(payoutPaid._sum.amountPesewas)}
            </p>
            <p className="mt-1 text-xs text-emerald-700">{payoutPaid._count.id} paid</p>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-[11px] text-amber-700">Pending/authorized intents</p>
            <p className="mt-1 text-xl font-bold text-amber-900">
              {formatCedis(pendingIntents._sum.amountPesewas)}
            </p>
            <p className="mt-1 text-xs text-amber-700">{pendingIntents._count.id} intent(s)</p>
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <p className="text-[11px] text-red-700">Failed/expired intents</p>
            <p className="mt-1 text-xl font-bold text-red-900">
              {formatCedis(failedIntents._sum.amountPesewas)}
            </p>
            <p className="mt-1 text-xs text-red-700">{failedIntents._count.id} intent(s)</p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-[11px] text-amber-700">Pending/processing payouts</p>
            <p className="mt-1 text-xl font-bold text-amber-900">
              {formatCedis(payoutPending._sum.amountPesewas)}
            </p>
            <p className="mt-1 text-xs text-amber-700">{payoutPending._count.id} payout(s)</p>
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <p className="text-[11px] text-red-700">Failed/reversed payouts</p>
            <p className="mt-1 text-xl font-bold text-red-900">
              {formatCedis(payoutFailed._sum.amountPesewas)}
            </p>
            <p className="mt-1 text-xs text-red-700">{payoutFailed._count.id} payout(s)</p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-950">
                Primary settlement identity
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Account numbers are never exposed here. Only last four digits are displayed.
              </p>

              {!primaryAccount ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  Settlement account not configured.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(
                        primaryAccount.status
                      )}`}
                    >
                      {primaryAccount.status}
                    </span>

                    {primaryAccount.isPrimary && (
                      <span className="rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-[10px] font-bold text-zinc-700">
                        PRIMARY
                      </span>
                    )}

                    <span className="rounded-full border border-blue-300 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-800">
                      {primaryAccount.provider}
                    </span>
                  </div>

                  <div className="grid gap-3 text-sm">
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-[11px] text-zinc-500">Paystack subaccount</p>
                      <p className="mt-1 break-all font-mono text-xs font-semibold text-zinc-950">
                        {primaryAccount.providerSubaccountCode ?? "Not available"}
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-zinc-200 p-3">
                        <p className="text-[11px] text-zinc-500">Bank</p>
                        <p className="mt-1 font-semibold text-zinc-950">
                          {primaryAccount.bankName ?? "—"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-zinc-200 p-3">
                        <p className="text-[11px] text-zinc-500">Account last four</p>
                        <p className="mt-1 font-semibold text-zinc-950">
                          {primaryAccount.accountNumberLast4
                            ? `•••• ${primaryAccount.accountNumberLast4}`
                            : "—"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-200 p-3">
                      <p className="text-[11px] text-zinc-500">Account name</p>
                      <p className="mt-1 font-semibold text-zinc-950">
                        {primaryAccount.accountName ?? "—"}
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-zinc-200 p-3">
                        <p className="text-[11px] text-zinc-500">Requested by</p>
                        <p className="mt-1 font-semibold text-zinc-950">
                          {actorName(primaryAccount.requestedBy)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-zinc-200 p-3">
                        <p className="text-[11px] text-zinc-500">Approved by</p>
                        <p className="mt-1 font-semibold text-zinc-950">
                          {actorName(primaryAccount.approvedBy)}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-zinc-200 p-3">
                        <p className="text-[11px] text-zinc-500">Created</p>
                        <p className="mt-1 font-semibold text-zinc-950">
                          {formatDateTime(primaryAccount.createdAt)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-zinc-200 p-3">
                        <p className="text-[11px] text-zinc-500">Approved</p>
                        <p className="mt-1 font-semibold text-zinc-950">
                          {formatDateTime(primaryAccount.approvedAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-950">Settlement risk flags</h2>

              <div className="mt-4 space-y-3">
                {riskFlags.map((flag) => (
                  <div
                    key={flag.title}
                    className={`rounded-xl border p-3 ${
                      flag.level === "critical"
                        ? "border-red-200 bg-red-50 text-red-900"
                        : flag.level === "warning"
                          ? "border-amber-200 bg-amber-50 text-amber-900"
                          : "border-emerald-200 bg-emerald-50 text-emerald-900"
                    }`}
                  >
                    <p className="text-sm font-semibold">{flag.title}</p>
                    <p className="mt-1 text-xs">{flag.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-950">Recent payout records</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Payout events recorded from Paystack transfer/webhook data.
              </p>
            </div>

            {recentPayouts.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500">
                No payout records yet. Next step is webhook ingestion for Paystack transfer events.
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {recentPayouts.map((payout) => (
                  <article key={payout.id} className="p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(
                              payout.status
                            )}`}
                          >
                            {payout.status}
                          </span>
                          <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800">
                            {payout.provider}
                          </span>
                        </div>

                        <p className="mt-2 text-sm font-semibold text-zinc-950">
                          {formatCedis(payout.amountPesewas)}
                        </p>

                        <p className="mt-1 break-all font-mono text-[11px] text-zinc-500">
                          {payout.providerTransferCode ??
                            payout.providerReference ??
                            payout.providerTransferId ??
                            "No provider reference"}
                        </p>
                      </div>

                      <div className="text-xs text-zinc-500 md:text-right">
                        <p>Created: {formatDateTime(payout.createdAt)}</p>
                        <p>Paid: {formatDateTime(payout.paidAt)}</p>
                        <p>Failed: {formatDateTime(payout.failedAt)}</p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">
                      <p className="font-semibold text-zinc-800">
                        {payout.settlementAccount?.accountName ?? "No settlement account linked"}
                      </p>
                      <p className="mt-1 text-zinc-500">
                        {payout.settlementAccount?.bankName ?? "—"} ·{" "}
                        {payout.settlementAccount?.accountNumberLast4
                          ? `•••• ${payout.settlementAccount.accountNumberLast4}`
                          : "—"}
                      </p>
                      {payout.failureReason && (
                        <p className="mt-2 text-red-700">Failure: {payout.failureReason}</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-950">Recent Paystack routing</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Read-only view of recent online transactions and their settlement-account linkage.
            </p>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="p-6 text-sm text-zinc-500">No Paystack transactions found.</div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {recentTransactions.map((tx) => {
                const settlement = tx.paymentIntent?.settlementAccount;
                const receipt = tx.feePayment?.receipt;

                return (
                  <article key={tx.id} className="p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(
                              tx.status
                            )}`}
                          >
                            {tx.status}
                          </span>

                          {settlement ? (
                            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">
                              ROUTED
                            </span>
                          ) : (
                            <span className="rounded-full border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-800">
                              UNROUTED
                            </span>
                          )}

                          {receipt && (
                            <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800">
                              RECEIPTED
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-sm font-semibold text-zinc-950">
                          {formatCedis(tx.amountPesewas)}
                        </p>

                        <p className="mt-1 break-all font-mono text-[11px] text-zinc-500">
                          {tx.providerReference}
                        </p>
                      </div>

                      <div className="text-xs text-zinc-500 md:text-right">
                        <p>{tx.channel ?? "No channel"}</p>
                        <p>{formatDateTime(tx.providerPaidAt ?? tx.createdAt)}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Bank-grade boundary</p>
          <p className="mt-1 text-xs">
            This page can verify EduLife OS routing and Paystack payout records. Final independent
            bank-credit proof requires a future bank-statement reconciliation layer.
          </p>
        </section>
      </div>
    </main>
  );
}