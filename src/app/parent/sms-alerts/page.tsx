// src/app/parent/sms-alerts/page.tsx
"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SmsCategory = "MOCK_RESULTS_RELEASE" | "TERM_RESULTS_RELEASE" | "GENERAL";

type SmsRecord = {
  id: string;
  category: SmsCategory;
  source:
    | "MockResultsReleaseNotifyRecipient"
    | "ResultsReleaseNotifyRecipient"
    | "SmsLog";
  phone: string;
  title: string;
  message: string;
  status: string;
  channel: string;
  createdAt: string;
  students: Array<{ id: string; name: string; classroomName: string | null }>;
  release?: {
    type: "MOCK" | "TERM_REPORT";
    title: string;
    term: string | null;
    academicYear: string | null;
    releasedAt: string | null;
    smsNotifiedAt?: string | null;
    releaseSnapshotHash?: string | null;
    mockExamSessionId?: string | null;
  };
  provider?: {
    providerMessageId: string | null;
    providerStatus: number | null;
    providerStatusDescription: string | null;
  };
};

type SmsHistoryResponse =
  | {
      ok: true;
      tenantId: string;
      tenantName: string;
      guardianPhone: string;
      linkedStudents: Array<{ id: string; name: string; classroomName: string | null }>;
      count: number;
      totalAvailable: number;
      records: SmsRecord[];
    }
  | {
      ok: false;
      error: string;
    };

type FetchState = "idle" | "loading" | "loaded" | "error";

const shellCard =
  "rounded-[28px] border border-white/10 bg-white/[0.045] shadow-[0_20px_80px_rgba(0,0,0,0.22)] backdrop-blur";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function categoryLabel(category: SmsCategory) {
  switch (category) {
    case "MOCK_RESULTS_RELEASE":
      return "Mock readiness";
    case "TERM_RESULTS_RELEASE":
      return "Term report";
    default:
      return "School SMS";
  }
}

function categoryClass(category: SmsCategory) {
  switch (category) {
    case "MOCK_RESULTS_RELEASE":
      return "border-[#D4AF37]/30 bg-[#D4AF37]/12 text-[#F7F4ED]";
    case "TERM_RESULTS_RELEASE":
      return "border-sky-300/25 bg-sky-400/12 text-sky-100";
    default:
      return "border-white/15 bg-white/[0.06] text-[#D7DCE5]";
  }
}

function statusClass(status: string) {
  const s = status.toUpperCase();

  if (s.includes("FAIL") || s.includes("DEAD")) {
    return "border-rose-300/25 bg-rose-400/12 text-rose-100";
  }

  if (s.includes("PENDING") || s.includes("PROCESS")) {
    return "border-amber-300/25 bg-amber-400/12 text-amber-100";
  }

  return "border-emerald-300/25 bg-emerald-400/12 text-emerald-100";
}

function studentText(record: SmsRecord) {
  if (!record.students.length) return "Linked learner";
  if (record.students.length === 1) return record.students[0].name;
  return `${record.students[0].name} + ${record.students.length - 1} more`;
}

function ParentSmsAlertsInner() {
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [records, setRecords] = useState<SmsRecord[]>([]);
  const [tenantName, setTenantName] = useState("School");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [linkedStudents, setLinkedStudents] = useState<
    Array<{ id: string; name: string; classroomName: string | null }>
  >([]);

  async function loadSmsHistory() {
    try {
      setFetchState("loading");
      setErrorMessage(null);

      const res = await fetch("/api/parent/sms/history?limit=50", {
        credentials: "include",
        cache: "no-store",
      });

      const json = (await res.json().catch(() => null)) as SmsHistoryResponse | null;

      if (!res.ok || !json?.ok) {
        setFetchState("error");
        setErrorMessage(
          json && "error" in json
            ? json.error
            : `Failed to load SMS alerts. HTTP ${res.status}`,
        );
        return;
      }

      setTenantName(json.tenantName || "School");
      setGuardianPhone(json.guardianPhone || "");
      setLinkedStudents(json.linkedStudents || []);
      setRecords(json.records || []);
      setFetchState("loaded");
    } catch (err) {
      console.error("[ParentSmsAlertsPage] Error loading SMS history", err);
      setFetchState("error");
      setErrorMessage("Something went wrong while loading your SMS alerts.");
    }
  }

  useEffect(() => {
    void loadSmsHistory();
  }, []);

  const counts = useMemo(() => {
    return records.reduce(
      (acc, record) => {
        acc.total += 1;
        if (record.category === "MOCK_RESULTS_RELEASE") acc.mock += 1;
        if (record.category === "TERM_RESULTS_RELEASE") acc.term += 1;
        if (record.status.toUpperCase().includes("FAIL")) acc.failed += 1;
        return acc;
      },
      { total: 0, mock: 0, term: 0, failed: 0 },
    );
  }, [records]);

  return (
    <main className="min-h-screen bg-[#06101F] text-[#F7F4ED]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-6 lg:px-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.22),transparent_28%),linear-gradient(135deg,#071A3D,#0B1220_58%,#07111F)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.28)] md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-[#E8C96A]">
                Parent Portal • Notification Proof
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">
                SMS alerts history
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
                View recent school SMS notifications sent to your verified parent phone,
                including released Mock readiness and term report notices.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/parent-portal"
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-semibold text-[#F7F4ED] transition hover:bg-white/10"
              >
                Parent portal
              </Link>

              <Link
                href="/parent/mock-readiness"
                className="inline-flex items-center justify-center rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/12 px-3 py-2 text-[12px] font-semibold text-[#F7F4ED] transition hover:bg-[#D4AF37]/18"
              >
                Mock readiness
              </Link>

              <button
                type="button"
                onClick={() => loadSmsHistory()}
                disabled={fetchState === "loading"}
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-semibold text-[#F7F4ED] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {fetchState === "loading" ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <div className={`${shellCard} px-4 py-4`}>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#8F98A8]">
              Total alerts
            </div>
            <div className="mt-2 text-2xl font-semibold text-white">{counts.total}</div>
          </div>

          <div className={`${shellCard} px-4 py-4`}>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#8F98A8]">
              Mock release
            </div>
            <div className="mt-2 text-2xl font-semibold text-[#E8C96A]">{counts.mock}</div>
          </div>

          <div className={`${shellCard} px-4 py-4`}>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#8F98A8]">
              Term report
            </div>
            <div className="mt-2 text-2xl font-semibold text-sky-100">{counts.term}</div>
          </div>

          <div className={`${shellCard} px-4 py-4`}>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#8F98A8]">
              Failed
            </div>
            <div className="mt-2 text-2xl font-semibold text-rose-100">{counts.failed}</div>
          </div>
        </section>

        <section className={`${shellCard} px-4 py-4`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-white">{tenantName}</div>
              <div className="mt-1 text-[12px] text-[#AEB6C4]">
                Verified phone: {guardianPhone || "Parent session phone"}
              </div>
            </div>

            <div className="text-[12px] text-[#AEB6C4]">
              Linked learner{linkedStudents.length === 1 ? "" : "s"}:{" "}
              <span className="text-[#F7F4ED]">
                {linkedStudents.length
                  ? linkedStudents.map((student) => student.name).join(", ")
                  : "Loading..."}
              </span>
            </div>
          </div>
        </section>

        {fetchState === "error" && errorMessage ? (
          <section className="rounded-[24px] border border-rose-300/20 bg-rose-400/10 px-4 py-4 text-sm text-rose-100">
            {errorMessage}
          </section>
        ) : null}

        {fetchState === "loading" ? (
          <section className={`${shellCard} px-5 py-12 text-center text-sm text-[#AEB6C4]`}>
            Loading SMS alerts...
          </section>
        ) : null}

        {fetchState === "loaded" ? (
          <section className={`${shellCard} overflow-hidden`}>
            <div className="border-b border-white/10 px-4 py-4">
              <h2 className="text-base font-semibold text-white">Recent SMS alerts</h2>
              <p className="mt-1 text-[12px] text-[#AEB6C4]">
                Most recent messages appear first. This is parent-visible proof of
                notifications sent.
              </p>
            </div>

            {records.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-[#AEB6C4]">
                No SMS alerts were found for this verified parent phone yet.
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {records.map((record) => (
                  <article key={record.id} className="px-4 py-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${categoryClass(
                              record.category,
                            )}`}
                          >
                            {categoryLabel(record.category)}
                          </span>

                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClass(
                              record.status,
                            )}`}
                          >
                            {record.status || "SENT"}
                          </span>

                          <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-[#C9CDD6]">
                            {record.channel || "SMS"}
                          </span>
                        </div>

                        <h3 className="mt-3 text-sm font-semibold text-white">{record.title}</h3>

                        <p className="mt-2 text-[12px] leading-5 text-[#D7DCE5]">
                          {record.message || "No message text available."}
                        </p>

                        <div className="mt-3 grid gap-2 text-[11px] text-[#AEB6C4] md:grid-cols-2">
                          <div>
                            Learner:{" "}
                            <span className="font-semibold text-[#F7F4ED]">
                              {studentText(record)}
                            </span>
                          </div>

                          <div>
                            Sent:{" "}
                            <span className="font-semibold text-[#F7F4ED]">
                              {formatDateTime(record.createdAt)}
                            </span>
                          </div>

                          {record.release ? (
                            <>
                              <div>
                                Release:{" "}
                                <span className="font-semibold text-[#F7F4ED]">
                                  {record.release.title}
                                </span>
                              </div>

                              <div>
                                Period:{" "}
                                <span className="font-semibold text-[#F7F4ED]">
                                  {[record.release.term, record.release.academicYear]
                                    .filter(Boolean)
                                    .join(" • ") || "—"}
                                </span>
                              </div>
                            </>
                          ) : null}
                        </div>

                        {record.release?.releaseSnapshotHash ? (
                          <div className="mt-3 break-all rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 font-mono text-[10px] text-[#AEB6C4]">
                            Snapshot hash: {record.release.releaseSnapshotHash}
                          </div>
                        ) : null}
                      </div>

                      <div className="shrink-0 text-left text-[11px] text-[#8F98A8] md:text-right">
                        <div>{record.source}</div>

                        {record.provider?.providerMessageId ? (
                          <div className="mt-1 max-w-[220px] truncate">
                            Provider ID: {record.provider.providerMessageId}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}

export default function ParentSmsAlertsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#06101F] text-[#F7F4ED]">
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 lg:px-8">
            <div className={`${shellCard} px-5 py-12 text-center text-sm text-[#AEB6C4]`}>
              Loading SMS alerts...
            </div>
          </div>
        </main>
      }
    >
      <ParentSmsAlertsInner />
    </Suspense>
  );
}