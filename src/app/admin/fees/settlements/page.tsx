// src/app/admin/fees/settlements/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  PaymentIntentStatus,
  PaymentProvider,
  PaymentStatus,
  RefundStatus,
  SettlementAccountStatus,
  SettlementPayoutStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settlement Reporting | Admin | EduLife OS",
};

const PENDING_REFUND_STATUSES: RefundStatus[] = [
  RefundStatus.REQUESTED,
  RefundStatus.APPROVED,
  RefundStatus.PROCESSING,
];

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

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function classLabel(
  classroom?: { name: string | null; grade: string | null; arm: string | null } | null
) {
  if (!classroom) return "Class unavailable";
  return classroom.name || [classroom.grade, classroom.arm].filter(Boolean).join(" ") || "Class";
}

function statusClass(status: string | null | undefined) {
  const s = String(status ?? "").toUpperCase();

  if (["ACTIVE", "SUCCESS", "SUCCEEDED", "PAID", "PROCESSED", "COMPLETED"].includes(s)) {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }

  if (["PENDING", "AUTHORIZED", "REQUESTED", "APPROVED", "PROCESSING"].includes(s)) {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }

  if (["FAILED", "DISABLED", "CANCELLED", "EXPIRED", "REVERSED", "DEAD"].includes(s)) {
    return "border-red-300 bg-red-50 text-red-800";
  }

  return "border-zinc-300 bg-zinc-50 text-zinc-700";
}

function riskClass(level: "critical" | "warning" | "good") {
  if (level === "critical") return "border-red-300 bg-red-50 text-red-900";
  if (level === "warning") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-emerald-300 bg-emerald-50 text-emerald-900";
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

function refundLifecycleText(status: RefundStatus | string | null | undefined) {
  const s = String(status ?? "").toUpperCase();

  if (s === "REQUESTED") return "Refund requested";
  if (s === "APPROVED") return "Approved by school";
  if (s === "PROCESSING") return "Sent to Paystack";
  if (s === "SUCCEEDED") return "Processed and reflected";
  if (s === "FAILED") return "Failed";
  if (s === "CANCELLED") return "Cancelled";
  return "No refund activity";
}

export default async function AdminFeesSettlementsPage() {
  const auth = await requireServerUserContext({
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.tenantId) redirect("/login");

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
    paystackRefundSucceeded,
    paystackRefundPending,
    recentTransactions,
    recentPaystackRefunds,
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

    prisma.feeRefund.aggregate({
      where: {
        tenantId,
        provider: PaymentProvider.PAYSTACK,
        status: RefundStatus.SUCCEEDED,
      },
      _sum: { amountPesewas: true },
      _count: { id: true },
    }),

    prisma.feeRefund.aggregate({
      where: {
        tenantId,
        provider: PaymentProvider.PAYSTACK,
        status: { in: PENDING_REFUND_STATUSES },
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
            status: true,
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
            id: true,
            amountPesewas: true,
            method: true,
            reference: true,
            channel: true,
            status: true,
            paidAt: true,
            receipt: {
              select: {
                id: true,
                receiptNumber: true,
                status: true,
              },
            },
            refunds: {
              select: {
                id: true,
                amountPesewas: true,
                status: true,
                reason: true,
                providerReference: true,
                providerRefundReference: true,
                requestedAt: true,
                approvedAt: true,
                processingAt: true,
                processedAt: true,
                failedAt: true,
                cancelledAt: true,
              },
              orderBy: { createdAt: "desc" },
            },
            invoice: {
              select: {
                term: true,
                academicYear: true,
                student: {
                  select: {
                    firstName: true,
                    lastName: true,
                    guardianName: true,
                    guardianPhoneNorm: true,
                    classroom: {
                      select: { name: true, grade: true, arm: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),

    prisma.feeRefund.findMany({
      where: {
        tenantId,
        provider: PaymentProvider.PAYSTACK,
      },
      select: {
        id: true,
        amountPesewas: true,
        status: true,
        reason: true,
        providerReference: true,
        providerRefundReference: true,
        requestedAt: true,
        approvedAt: true,
        processingAt: true,
        processedAt: true,
        failedAt: true,
        cancelledAt: true,
        feePayment: {
          select: {
            id: true,
            amountPesewas: true,
            reference: true,
            method: true,
            channel: true,
            receipt: {
              select: {
                id: true,
                receiptNumber: true,
                status: true,
              },
            },
            invoice: {
              select: {
                term: true,
                academicYear: true,
                student: {
                  select: {
                    firstName: true,
                    lastName: true,
                    guardianName: true,
                    guardianPhoneNorm: true,
                    classroom: {
                      select: { name: true, grade: true, arm: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 40,
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
    settlementAccounts.find(
      (account) => account.isPrimary && account.status === SettlementAccountStatus.ACTIVE
    ) ??
    settlementAccounts.find((account) => account.status === SettlementAccountStatus.ACTIVE) ??
    settlementAccounts[0] ??
    null;

  const activeAccounts = settlementAccounts.filter(
    (account) => account.status === SettlementAccountStatus.ACTIVE
  );

  const grossPaystackPesewas = totalOnlineTransactions._sum.amountPesewas ?? 0;
  const succeededRefundPesewas = paystackRefundSucceeded._sum.amountPesewas ?? 0;
  const pendingRefundPesewas = paystackRefundPending._sum.amountPesewas ?? 0;
  const netPaystackRetainedPesewas = Math.max(0, grossPaystackPesewas - succeededRefundPesewas);

  const riskFlags: {
    level: "critical" | "warning" | "good";
    title: string;
    detail: string;
  }[] = [];

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

  if ((paystackRefundPending._count.id ?? 0) > 0) {
    riskFlags.push({
      level: "warning",
      title: "Refunds still pending or processing",
      detail: `${paystackRefundPending._count.id} Paystack refund(s) are not final yet. Do not treat gross collection as retained revenue.`,
    });
  }

  if ((payoutAll._count.id ?? 0) === 0) {
    riskFlags.push({
      level: "warning",
      title: "No payout records yet",
      detail:
        "EduLife OS can currently verify payment routing and refund deductions, but no payout/transfer event has been recorded yet.",
    });
  }

  if ((payoutFailed._count.id ?? 0) > 0) {
    riskFlags.push({
      level: "critical",
      title: "Failed or reversed payout records exist",
      detail: `${payoutFailed._count.id} payout record(s) need finance review.`,
    });
  }

  if (riskFlags.length === 0) {
    riskFlags.push({
      level: "good",
      title: "Settlement routing and refund state look healthy",
      detail:
        "Online payments, routing, and refund state are consistent. Bank statement reconciliation remains a separate control.",
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
              Read-only settlement visibility for Paystack routing, refund exposure, net
              retained online collections, payout events, and settlement-account readiness.
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
              href="/admin/fees/refunds"
              className="inline-flex h-10 items-center rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Refunds
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
            <p className="text-[11px] text-zinc-500">Gross Paystack received</p>
            <p className="mt-1 text-xl font-bold text-zinc-950">
              {formatCedis(grossPaystackPesewas)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {totalOnlineTransactions._count.id} successful transaction(s)
            </p>
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <p className="text-[11px] text-red-700">Succeeded Paystack refunds</p>
            <p className="mt-1 text-xl font-bold text-red-950">
              {formatCedis(succeededRefundPesewas)}
            </p>
            <p className="mt-1 text-xs text-red-700">
              {paystackRefundSucceeded._count.id} completed refund(s)
            </p>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
            <p className="text-[11px] text-blue-700">Net retained online</p>
            <p className="mt-1 text-xl font-bold text-blue-950">
              {formatCedis(netPaystackRetainedPesewas)}
            </p>
            <p className="mt-1 text-xs text-blue-700">
              Gross Paystack minus succeeded refunds
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-[11px] text-amber-700">Pending refund exposure</p>
            <p className="mt-1 text-xl font-bold text-amber-950">
              {formatCedis(pendingRefundPesewas)}
            </p>
            <p className="mt-1 text-xs text-amber-700">
              {paystackRefundPending._count.id} requested, approved, or processing
            </p>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <p className="text-[11px] text-emerald-700">Routed through settlement</p>
            <p className="mt-1 text-xl font-bold text-emerald-900">
              {formatCedis(routedOnlineTransactions._sum.amountPesewas)}
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              {routedOnlineTransactions._count.id} transaction(s)
            </p>
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <p className="text-[11px] text-red-700">Unrouted online payments</p>
            <p className="mt-1 text-xl font-bold text-red-900">
              {formatCedis(unroutedOnlineTransactions._sum.amountPesewas)}
            </p>
            <p className="mt-1 text-xs text-red-700">
              {unroutedOnlineTransactions._count.id} transaction(s)
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] text-zinc-500">Pending checkout intents</p>
            <p className="mt-1 text-xl font-bold text-zinc-950">
              {formatCedis(pendingIntents._sum.amountPesewas)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {pendingIntents._count.id} pending / authorized
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] text-zinc-500">Failed checkout intents</p>
            <p className="mt-1 text-xl font-bold text-zinc-950">
              {formatCedis(failedIntents._sum.amountPesewas)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {failedIntents._count.id} failed / cancelled / expired
            </p>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] text-zinc-500">Recorded Paystack payouts</p>
            <p className="mt-1 text-xl font-bold text-zinc-950">
              {formatCedis(payoutAll._sum.amountPesewas)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{payoutAll._count.id} payout record(s)</p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <p className="text-[11px] text-emerald-700">Paid payouts</p>
            <p className="mt-1 text-xl font-bold text-emerald-950">
              {formatCedis(payoutPaid._sum.amountPesewas)}
            </p>
            <p className="mt-1 text-xs text-emerald-700">{payoutPaid._count.id} paid</p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-[11px] text-amber-700">Pending payouts</p>
            <p className="mt-1 text-xl font-bold text-amber-950">
              {formatCedis(payoutPending._sum.amountPesewas)}
            </p>
            <p className="mt-1 text-xs text-amber-700">
              {payoutPending._count.id} pending / processing
            </p>
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <p className="text-[11px] text-red-700">Failed payouts</p>
            <p className="mt-1 text-xl font-bold text-red-950">
              {formatCedis(payoutFailed._sum.amountPesewas)}
            </p>
            <p className="mt-1 text-xs text-red-700">
              {payoutFailed._count.id} failed / reversed
            </p>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {riskFlags.map((flag) => (
            <div
              key={`${flag.level}-${flag.title}`}
              className={`rounded-2xl border p-4 shadow-sm ${riskClass(flag.level)}`}
            >
              <p className="text-sm font-semibold">{flag.title}</p>
              <p className="mt-1 text-xs leading-5">{flag.detail}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-1 border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-semibold text-zinc-950">Settlement accounts</h2>
            <p className="text-xs text-zinc-500">
              Account ownership, approval trail, Paystack subaccount code, and operational status.
            </p>
          </div>

          {settlementAccounts.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">No settlement account is configured yet.</p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {settlementAccounts.map((account) => (
                <article
                  key={account.id}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-950">
                        {account.accountName ?? "Account name unavailable"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {account.bankName || "Bank unavailable"} · ****
                        {account.accountNumberLast4 || "----"}
                      </p>
                      <p className="mt-1 break-all font-mono text-[11px] text-zinc-500">
                        {account.providerSubaccountCode || "No provider subaccount"}
                      </p>
                    </div>

                    <span
                      className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(
                        account.status
                      )}`}
                    >
                      {account.status}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-zinc-500">Requested by</p>
                      <p className="font-semibold text-zinc-900">{actorName(account.requestedBy)}</p>
                    </div>

                    <div className="rounded-xl bg-white p-3">
                      <p className="text-zinc-500">Approved by</p>
                      <p className="font-semibold text-zinc-900">{actorName(account.approvedBy)}</p>
                    </div>

                    <div className="rounded-xl bg-white p-3">
                      <p className="text-zinc-500">Approved at</p>
                      <p className="font-semibold text-zinc-900">
                        {formatDateTime(account.approvedAt)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white p-3">
                      <p className="text-zinc-500">Currency</p>
                      <p className="font-semibold text-zinc-900">{account.currency}</p>
                    </div>
                  </div>

                  {account.disableReason && (
                    <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                      Disabled: {account.disableReason}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-950">
              Recent Paystack routing and refund truth
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Each row shows original payment, settlement linkage, refund exposure, and net retained.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Transaction</th>
                  <th className="px-3 py-2 text-left font-medium">Learner</th>
                  <th className="px-3 py-2 text-right font-medium">Gross</th>
                  <th className="px-3 py-2 text-right font-medium">Refunded</th>
                  <th className="px-3 py-2 text-right font-medium">Pending</th>
                  <th className="px-3 py-2 text-right font-medium">Net retained</th>
                  <th className="px-3 py-2 text-left font-medium">Settlement account</th>
                  <th className="px-3 py-2 text-left font-medium">Evidence</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-100">
                {recentTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-zinc-500">
                      No Paystack transactions found.
                    </td>
                  </tr>
                ) : (
                  recentTransactions.map((tx) => {
                    const refunds = tx.feePayment?.refunds ?? [];
                    const succeededRefunds = refunds.filter(
                      (refund) => refund.status === RefundStatus.SUCCEEDED
                    );
                    const pendingRefunds = refunds.filter((refund) =>
                      PENDING_REFUND_STATUSES.includes(refund.status)
                    );

                    const refundedPesewas = succeededRefunds.reduce(
                      (sum, refund) => sum + refund.amountPesewas,
                      0
                    );
                    const pendingPesewas = pendingRefunds.reduce(
                      (sum, refund) => sum + refund.amountPesewas,
                      0
                    );
                    const netPesewas = Math.max(0, tx.amountPesewas - refundedPesewas);

                    const student = tx.feePayment?.invoice.student;
                    const learnerName =
                      fullName(student?.firstName, student?.lastName) || "Learner unavailable";
                    const account = tx.paymentIntent?.settlementAccount;

                    return (
                      <tr key={tx.id} className="align-top">
                        <td className="px-3 py-3">
                          <p className="break-all font-mono text-[11px] font-semibold text-zinc-900">
                            {tx.providerReference}
                          </p>
                          <p className="mt-1 text-[10px] text-zinc-500">
                            {tx.channel ?? "channel unavailable"} ·{" "}
                            {formatDateTime(tx.providerPaidAt ?? tx.createdAt)}
                          </p>
                          <p className="mt-1 text-[10px] text-zinc-500">
                            Gateway status: {tx.status}
                          </p>
                        </td>

                        <td className="px-3 py-3">
                          <p className="font-semibold text-zinc-900">{learnerName}</p>
                          <p className="text-[10px] text-zinc-500">
                            {classLabel(student?.classroom)} ·{" "}
                            {tx.feePayment?.invoice.term ?? "—"}{" "}
                            {tx.feePayment?.invoice.academicYear ?? ""}
                          </p>
                          <p className="text-[10px] text-zinc-500">
                            Guardian: {student?.guardianName ?? "—"}
                          </p>
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-zinc-900">
                          {formatCedis(tx.amountPesewas)}
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-red-700">
                          {formatCedis(refundedPesewas)}
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-amber-700">
                          {formatCedis(pendingPesewas)}
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-blue-900">
                          {formatCedis(netPesewas)}
                        </td>

                        <td className="px-3 py-3">
                          {account ? (
                            <>
                              <p className="font-semibold text-zinc-900">
                                {account.accountName ?? "Account name unavailable"}
                              </p>
                              <p className="text-[10px] text-zinc-500">
                                {account.bankName ?? "Bank unavailable"} · ****
                                {account.accountNumberLast4 ?? "----"}
                              </p>
                              <p className="break-all font-mono text-[10px] text-zinc-500">
                                {account.providerSubaccountCode ?? "No subaccount code"}
                              </p>
                              <span
                                className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(
                                  account.status
                                )}`}
                              >
                                {account.status}
                              </span>
                            </>
                          ) : (
                            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700">
                              Not linked
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <p className="text-[10px] text-zinc-500">
                            Receipt: {tx.feePayment?.receipt?.receiptNumber ?? "—"}
                          </p>
                          <p className="text-[10px] text-zinc-500">
                            Receipt status: {tx.feePayment?.receipt?.status ?? "—"}
                          </p>

                          {refunds.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {refunds.map((refund) => (
                                <div key={refund.id} className="rounded-lg bg-zinc-50 p-2">
                                  <p className="font-semibold text-zinc-800">
                                    {refundLifecycleText(refund.status)} ·{" "}
                                    {formatCedis(refund.amountPesewas)}
                                  </p>
                                  <p className="break-all font-mono text-[10px] text-zinc-500">
                                    Refund ref: {refund.providerRefundReference ?? "—"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-950">Refund lifecycle visibility</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Paystack refunds remain visible until final success, failure, or cancellation.
            </p>

            <div className="mt-4 space-y-3">
              {recentPaystackRefunds.length === 0 ? (
                <p className="text-xs text-zinc-500">No Paystack refunds found.</p>
              ) : (
                recentPaystackRefunds.slice(0, 14).map((refund) => {
                  const student = refund.feePayment.invoice.student;
                  const learnerName =
                    fullName(student?.firstName, student?.lastName) || "Learner unavailable";

                  return (
                    <article
                      key={refund.id}
                      className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-950">
                            {learnerName}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {refund.feePayment.receipt?.receiptNumber ?? "Receipt unavailable"}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {refundLifecycleText(refund.status)}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-bold text-zinc-950">
                            {formatCedis(refund.amountPesewas)}
                          </p>
                          <span
                            className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(
                              refund.status
                            )}`}
                          >
                            {refund.status}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 text-[11px] md:grid-cols-2">
                        <p className="rounded-xl bg-white p-2">
                          Requested: {formatDateTime(refund.requestedAt)}
                        </p>
                        <p className="rounded-xl bg-white p-2">
                          Approved: {formatDateTime(refund.approvedAt)}
                        </p>
                        <p className="rounded-xl bg-white p-2">
                          Sent: {formatDateTime(refund.processingAt)}
                        </p>
                        <p className="rounded-xl bg-white p-2">
                          Processed: {formatDateTime(refund.processedAt)}
                        </p>
                      </div>

                      <p className="mt-2 break-all font-mono text-[10px] text-zinc-500">
                        Paystack refund ref: {refund.providerRefundReference ?? "—"}
                      </p>
                      <p className="mt-1 break-all font-mono text-[10px] text-zinc-500">
                        Payment ref: {refund.providerReference ?? refund.feePayment.reference ?? "—"}
                      </p>
                    </article>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-950">Recent payout records</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Payout tracking is separate from receipt truth. Refunds reduce retained collection
              truth even before payout records exist.
            </p>

            <div className="mt-4 space-y-3">
              {recentPayouts.length === 0 ? (
                <p className="text-xs text-zinc-500">No payout records found yet.</p>
              ) : (
                recentPayouts.map((payout) => (
                  <article
                    key={payout.id}
                    className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-zinc-950">
                          {formatCedis(payout.amountPesewas)}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {payout.provider} · {payout.currency}
                        </p>
                        <p className="mt-1 break-all font-mono text-[10px] text-zinc-500">
                          {payout.providerReference ||
                            payout.providerTransferCode ||
                            payout.providerTransferId ||
                            "No provider reference"}
                        </p>
                      </div>

                      <span
                        className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(
                          payout.status
                        )}`}
                      >
                        {payout.status}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                      <p>Created: {formatDateTime(payout.createdAt)}</p>
                      <p>Updated: {formatDateTime(payout.updatedAt)}</p>
                      <p>Paid: {formatDateTime(payout.paidAt)}</p>
                      <p>Failed: {formatDateTime(payout.failedAt)}</p>
                    </div>

                    {payout.settlementAccount && (
                      <p className="mt-2 text-xs text-zinc-500">
                        Account: {payout.settlementAccount.accountName ?? "—"} ·{" "}
                        {payout.settlementAccount.bankName ?? "—"} · ****
                        {payout.settlementAccount.accountNumberLast4 ?? "----"}
                      </p>
                    )}

                    {payout.failureReason && (
                      <p className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                        Failure: {payout.failureReason}
                      </p>
                    )}
                  </article>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600">
          <p className="font-semibold text-zinc-900">Bank-grade settlement rule</p>
          <p className="mt-1">
            This page must never treat gross Paystack payment as final retained revenue after
            refunds. Use net retained online collection as the truth, and use refund lifecycle
            state to explain temporary differences between Paystack, ledger, receipts, and parent
            visibility.
          </p>
        </section>
      </div>
    </main>
  );
}