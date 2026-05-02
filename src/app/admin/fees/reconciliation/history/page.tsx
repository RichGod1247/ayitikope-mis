// src/app/admin/fees/reconciliation/history/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reconciliation History | Admin | EduLife OS",
};

type SearchParams = Promise<{
  batchId?: string;
  status?: string;
}>;

function formatCedis(pesewas: number | null | undefined) {
  const value = typeof pesewas === "number" ? pesewas : 0;
  const sign = value < 0 ? "-" : "";
  return `${sign}GHS ${(Math.abs(value) / 100).toFixed(2)}`;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: string) {
  if (status === "CLOSED" || status === "CLEAN") {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }

  if (status === "HAS_EXCEPTIONS" || status === "OPEN") {
    return "border-red-300 bg-red-50 text-red-800";
  }

  return "border-blue-300 bg-blue-50 text-blue-800";
}

function severityClass(severity: string) {
  if (severity === "CRITICAL") return "border-red-300 bg-red-50 text-red-800";
  if (severity === "HIGH") return "border-orange-300 bg-orange-50 text-orange-800";
  if (severity === "MEDIUM") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-blue-300 bg-blue-50 text-blue-800";
}

function exceptionStatusClass(status: string) {
  if (status === "RESOLVED") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "DISMISSED") return "border-zinc-300 bg-zinc-50 text-zinc-700";
  if (status === "INVESTIGATING") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-red-300 bg-red-50 text-red-800";
}

function kindLabel(kind: string) {
  const map: Record<string, string> = {
    MISSING_LEDGER_ENTRY: "Missing ledger entry",
    PAYMENT_WITHOUT_RECEIPT: "Payment without receipt",
    RECEIPT_WITHOUT_PAYMENT: "Receipt without payment",
    DUPLICATE_PROVIDER_REFERENCE: "Duplicate provider reference",
    AMOUNT_MISMATCH: "Amount mismatch",
    UNMATCHED_PROVIDER_EVENT: "Unmatched provider event",
    OVERPAYMENT: "Overpayment",
    UNKNOWN: "Unknown issue",
  };

  return map[kind] ?? kind.replaceAll("_", " ").toLowerCase();
}

function actorName(user?: {
  name: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
} | null) {
  if (!user) return "System";

  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.name ||
    user.email ||
    "System"
  );
}

function studentName(student?: { firstName: string | null; lastName: string | null } | null) {
  if (!student) return "Unknown student";
  return [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || "Unknown student";
}

export default async function AdminReconciliationHistoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const auth = await requireServerUserContext({
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.tenantId) {
    redirect("/login");
  }

  const params = await searchParams;
  const tenantId = auth.tenantId;
  const selectedBatchId = String(params.batchId ?? "").trim();
  const selectedStatus = String(params.status ?? "").trim();

  const batchWhere = {
    tenantId,
    ...(selectedStatus ? { status: selectedStatus as never } : {}),
  };

  const batches = await prisma.reconciliationBatch.findMany({
    where: batchWhere,
    select: {
      id: true,
      provider: true,
      batchDate: true,
      status: true,
      expectedPesewas: true,
      actualPesewas: true,
      deltaPesewas: true,
      notes: true,
      createdAt: true,
      closedAt: true,
      createdBy: {
        select: {
          name: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      exceptions: {
        select: {
          id: true,
          severity: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const selectedBatch =
    selectedBatchId.length > 0
      ? await prisma.reconciliationBatch.findFirst({
          where: {
            id: selectedBatchId,
            tenantId,
          },
          select: {
            id: true,
            provider: true,
            batchDate: true,
            status: true,
            expectedPesewas: true,
            actualPesewas: true,
            deltaPesewas: true,
            notes: true,
            createdAt: true,
            closedAt: true,
            createdBy: {
              select: {
                name: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            exceptions: {
              select: {
                id: true,
                kind: true,
                severity: true,
                status: true,
                providerReference: true,
                expectedPesewas: true,
                actualPesewas: true,
                deltaPesewas: true,
                description: true,
                resolutionNote: true,
                resolvedAt: true,
                createdAt: true,
                resolvedBy: {
                  select: {
                    name: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                  },
                },
                invoice: {
                  select: {
                    id: true,
                    term: true,
                    academicYear: true,
                    student: {
                      select: {
                        firstName: true,
                        lastName: true,
                      },
                    },
                  },
                },
              },
              orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
            },
          },
        })
      : null;

  const totalBatches = batches.length;
  const exceptionBatches = batches.filter((b) => b.exceptions.length > 0).length;
  const openExceptionCount = batches.reduce(
    (sum, batch) =>
      sum +
      batch.exceptions.filter((ex) => ex.status === "OPEN" || ex.status === "INVESTIGATING")
        .length,
    0
  );

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:py-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              EduLife OS · Finance Governance
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 md:text-3xl">
              Reconciliation History
            </h1>
            <p className="max-w-3xl text-sm text-zinc-600">
              Read-only institutional memory of saved finance reconciliation batches, exceptions,
              closures, and resolution outcomes.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/fees/reconciliation"
              className="inline-flex h-10 items-center rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Live reconciliation
            </Link>
            <Link
              href="/admin/fees/audit"
              className="inline-flex h-10 items-center rounded-xl bg-zinc-950 px-4 text-xs font-semibold text-white hover:bg-black"
            >
              Audit trail
            </Link>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] text-zinc-500">Displayed batches</p>
            <p className="mt-1 text-xl font-bold text-zinc-950">{totalBatches}</p>
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <p className="text-[11px] text-red-700">Batches with exceptions</p>
            <p className="mt-1 text-xl font-bold text-red-900">{exceptionBatches}</p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-[11px] text-amber-700">Active exceptions</p>
            <p className="mt-1 text-xl font-bold text-amber-900">{openExceptionCount}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <form className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-700">Status</label>
              <select
                name="status"
                defaultValue={selectedStatus}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
              >
                <option value="">All statuses</option>
                <option value="OPEN">OPEN</option>
                <option value="CLEAN">CLEAN</option>
                <option value="HAS_EXCEPTIONS">HAS EXCEPTIONS</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>

            <button
              type="submit"
              className="h-10 self-end rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-black"
            >
              Filter
            </button>
          </form>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-950">Saved batches</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Newest first. Select a batch to inspect its exception history.
              </p>
            </div>

            {batches.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500">No reconciliation batches found.</div>
            ) : (
              <div className="max-h-[720px] divide-y divide-zinc-100 overflow-y-auto">
                {batches.map((batch) => {
                  const openCount = batch.exceptions.filter(
                    (ex) => ex.status === "OPEN" || ex.status === "INVESTIGATING"
                  ).length;
                  const criticalCount = batch.exceptions.filter(
                    (ex) => ex.severity === "CRITICAL"
                  ).length;

                  return (
                    <Link
                      key={batch.id}
                      href={`/admin/fees/reconciliation/history?batchId=${batch.id}${
                        selectedStatus ? `&status=${selectedStatus}` : ""
                      }`}
                      className={`block p-4 transition hover:bg-zinc-50 ${
                        selectedBatch?.id === batch.id ? "bg-zinc-50" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-950">
                            {formatDate(batch.batchDate)}
                          </p>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {batch.provider ?? "Provider"} · by {actorName(batch.createdBy)}
                          </p>
                        </div>

                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(
                            batch.status
                          )}`}
                        >
                          {batch.status.replaceAll("_", " ")}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-zinc-400">Expected</p>
                          <p className="font-semibold text-zinc-950">
                            {formatCedis(batch.expectedPesewas)}
                          </p>
                        </div>
                        <div>
                          <p className="text-zinc-400">Actual</p>
                          <p className="font-semibold text-zinc-950">
                            {formatCedis(batch.actualPesewas)}
                          </p>
                        </div>
                        <div>
                          <p className="text-zinc-400">Delta</p>
                          <p
                            className={`font-semibold ${
                              batch.deltaPesewas === 0 ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {formatCedis(batch.deltaPesewas)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold">
                        <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700">
                          Exceptions: {batch.exceptions.length}
                        </span>
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
                          Active: {openCount}
                        </span>
                        <span className="rounded-full bg-red-100 px-2 py-1 text-red-800">
                          Critical: {criticalCount}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-950">Batch detail</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Read-only exception and resolution history for the selected batch.
              </p>
            </div>

            {!selectedBatch ? (
              <div className="p-6 text-sm text-zinc-500">
                Select a reconciliation batch from the history list.
              </div>
            ) : (
              <div className="space-y-5 p-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-[11px] text-zinc-500">Status</p>
                    <p className="mt-1 font-semibold text-zinc-950">
                      {selectedBatch.status.replaceAll("_", " ")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-[11px] text-zinc-500">Created</p>
                    <p className="mt-1 font-semibold text-zinc-950">
                      {formatDateTime(selectedBatch.createdAt)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-[11px] text-zinc-500">Closed</p>
                    <p className="mt-1 font-semibold text-zinc-950">
                      {formatDateTime(selectedBatch.closedAt)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-[11px] text-zinc-500">Created by</p>
                    <p className="mt-1 font-semibold text-zinc-950">
                      {actorName(selectedBatch.createdBy)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-zinc-200 p-3">
                    <p className="text-[11px] text-zinc-500">Expected</p>
                    <p className="font-semibold text-zinc-950">
                      {formatCedis(selectedBatch.expectedPesewas)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 p-3">
                    <p className="text-[11px] text-zinc-500">Actual</p>
                    <p className="font-semibold text-zinc-950">
                      {formatCedis(selectedBatch.actualPesewas)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 p-3">
                    <p className="text-[11px] text-zinc-500">Delta</p>
                    <p
                      className={`font-semibold ${
                        selectedBatch.deltaPesewas === 0 ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {formatCedis(selectedBatch.deltaPesewas)}
                    </p>
                  </div>
                </div>

                {selectedBatch.notes && (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                    <p className="font-semibold text-zinc-800">Batch notes</p>
                    <p className="mt-1">{selectedBatch.notes}</p>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-semibold text-zinc-950">Exceptions</h3>

                  {selectedBatch.exceptions.length === 0 ? (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                      This batch had no exceptions.
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {selectedBatch.exceptions.map((ex) => (
                        <article key={ex.id} className="rounded-2xl border border-zinc-200 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="flex flex-wrap gap-2">
                                <span
                                  className={`rounded-full border px-2 py-1 text-[10px] font-bold ${severityClass(
                                    ex.severity
                                  )}`}
                                >
                                  {ex.severity}
                                </span>

                                <span
                                  className={`rounded-full border px-2 py-1 text-[10px] font-bold ${exceptionStatusClass(
                                    ex.status
                                  )}`}
                                >
                                  {ex.status}
                                </span>
                              </div>

                              <h4 className="mt-2 text-sm font-semibold text-zinc-950">
                                {kindLabel(ex.kind)}
                              </h4>

                              <p className="mt-1 text-xs text-zinc-600">{ex.description}</p>

                              <p className="mt-2 text-xs text-zinc-500">
                                {studentName(ex.invoice?.student)} · {ex.invoice?.term ?? "No term"} ·{" "}
                                {ex.invoice?.academicYear ?? "No academic year"}
                              </p>
                            </div>

                            <div className="text-right text-xs text-zinc-500">
                              <p>Delta: {formatCedis(ex.deltaPesewas)}</p>
                              <p className="break-all">{ex.providerReference ?? "No ref"}</p>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                              <p className="text-zinc-500">Expected</p>
                              <p className="font-semibold text-zinc-900">
                                {formatCedis(ex.expectedPesewas)}
                              </p>
                            </div>
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                              <p className="text-zinc-500">Actual</p>
                              <p className="font-semibold text-zinc-900">
                                {formatCedis(ex.actualPesewas)}
                              </p>
                            </div>
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                              <p className="text-zinc-500">Created</p>
                              <p className="font-semibold text-zinc-900">
                                {formatDateTime(ex.createdAt)}
                              </p>
                            </div>
                          </div>

                          {ex.resolutionNote && (
                            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                              <p className="font-semibold text-zinc-800">Resolution note</p>
                              <p className="mt-1">{ex.resolutionNote}</p>
                              <p className="mt-2 text-zinc-400">
                                {actorName(ex.resolvedBy)} · {formatDateTime(ex.resolvedAt)}
                              </p>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}