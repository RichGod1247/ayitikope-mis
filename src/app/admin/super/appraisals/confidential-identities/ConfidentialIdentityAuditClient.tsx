"use client";

import { useEffect, useMemo, useState } from "react";

type CycleSummary = {
  cycleId: string;
  workflow: "HEADTEACHER_STAFF_FEEDBACK" | "DIRECTOR_FEEDBACK";
  status: string;
  instrumentTitle: string;
  targetLabel: string;
  jurisdictionLabel: string;
  finalizedResponses: number;
};

type RespondentSummary = {
  respondentKey: string;
  label: string;
  contextLabel: string;
  responseStatus: "FINALIZED";
};

type RespondentList = {
  cycle: CycleSummary;
  respondents: RespondentSummary[];
};

type RevealResult = {
  outcome: "REVEALED";
  cycle: CycleSummary;
  respondent: {
    label: string;
    contextLabel: string;
  };
  identity: {
    displayName: string;
    email: string;
    role: string;
    schoolName: string | null;
  };
  audit: {
    recorded: true;
    purpose:
      | "ACCOUNTABILITY_REVIEW"
      | "INVESTIGATION"
      | "SUPPORT"
      | "LEGAL_COMPLIANCE";
    createdAt: string;
  };
};

const PURPOSES = [
  ["ACCOUNTABILITY_REVIEW", "Accountability review"],
  ["INVESTIGATION", "Investigation"],
  ["SUPPORT", "Support"],
  ["LEGAL_COMPLIANCE", "Legal / compliance"],
] as const;

function messageFromError(value: unknown) {
  if (!value || typeof value !== "object") return "The request could not be completed.";
  const error = String((value as { error?: unknown }).error ?? "").trim();
  return error || "The request could not be completed.";
}

export default function ConfidentialIdentityAuditClient() {
  const [cycles, setCycles] = useState<CycleSummary[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [respondents, setRespondents] = useState<RespondentSummary[]>([]);
  const [respondentKey, setRespondentKey] = useState("");
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number][0]>(
    "ACCOUNTABILITY_REVIEW",
  );
  const [reason, setReason] = useState("");
  const [revealed, setRevealed] = useState<RevealResult | null>(null);
  const [loadingCycles, setLoadingCycles] = useState(true);
  const [loadingRespondents, setLoadingRespondents] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCycle = useMemo(
    () => cycles.find((cycle) => cycle.cycleId === cycleId) ?? null,
    [cycleId, cycles],
  );

  const selectedRespondent = useMemo(
    () =>
      respondents.find((respondent) => respondent.respondentKey === respondentKey) ??
      null,
    [respondentKey, respondents],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadCycles() {
      setLoadingCycles(true);
      setError(null);

      try {
        const response = await fetch(
          "/api/admin/super/appraisals/confidential-identities",
          {
            credentials: "include",
            cache: "no-store",
            headers: {
              Accept: "application/json",
            },
          },
        );

        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; cycles?: CycleSummary[]; error?: string }
          | null;

        if (!response.ok || !body?.ok || !Array.isArray(body.cycles)) {
          throw new Error(messageFromError(body));
        }

        if (!cancelled) {
          setCycles(body.cycles);
          setCycleId(body.cycles[0]?.cycleId ?? "");
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Failed to load confidential cycles.");
        }
      } finally {
        if (!cancelled) setLoadingCycles(false);
      }
    }

    void loadCycles();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    setRespondents([]);
    setRespondentKey("");
    setRevealed(null);

    if (!cycleId) return () => undefined;

    async function loadRespondents() {
      setLoadingRespondents(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/admin/super/appraisals/confidential-identities?cycleId=${encodeURIComponent(
            cycleId,
          )}`,
          {
            credentials: "include",
            cache: "no-store",
            headers: {
              Accept: "application/json",
            },
          },
        );

        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; result?: RespondentList; error?: string }
          | null;

        if (!response.ok || !body?.ok || !body.result) {
          throw new Error(messageFromError(body));
        }

        if (!cancelled) {
          setRespondents(body.result.respondents);
          setRespondentKey(body.result.respondents[0]?.respondentKey ?? "");
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Failed to load masked respondents.");
        }
      } finally {
        if (!cancelled) setLoadingRespondents(false);
      }
    }

    void loadRespondents();

    return () => {
      cancelled = true;
    };
  }, [cycleId]);

  async function revealIdentity() {
    setError(null);
    setRevealed(null);

    const cleanReason = reason.trim();

    if (!cycleId || !respondentKey) {
      setError("Choose one confidential cycle and one masked respondent.");
      return;
    }

    if (cleanReason.length < 12 || cleanReason.length > 500) {
      setError("Enter a clear reason of 12–500 characters.");
      return;
    }

    const confirmed = window.confirm(
      `Reveal the identity behind ${selectedRespondent?.label ?? "this respondent"}? This exceptional access is permanently audited.`,
    );

    if (!confirmed) return;

    setRevealing(true);

    try {
      const response = await fetch(
        "/api/admin/super/appraisals/confidential-identities",
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            cycleId,
            respondentKey,
            purpose,
            reason: cleanReason,
            confirm: true,
          }),
        },
      );

      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; result?: RevealResult; error?: string }
        | null;

      if (!response.ok || !body?.ok || !body.result) {
        throw new Error(messageFromError(body));
      }

      setRevealed(body.result);
      setReason("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Identity reveal failed closed.");
    } finally {
      setRevealing(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-rose-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.10)] md:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-700">
          EduLife OS · Confidential Identity Audit
        </p>
        <h1 className="mt-2 text-2xl font-black text-slate-950 md:text-3xl">
          Exceptional respondent identity access
        </h1>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-700">
          Ordinary appraisal review remains anonymous. This Superadmin-only workspace
          reveals one finalized confidential respondent at a time only after a stated
          purpose, written reason, explicit confirmation, and committed audit record.
        </p>
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold leading-6 text-rose-900">
          Do not use this workspace for curiosity, ranking, retaliation, bulk discovery,
          or routine management. No export or browser persistence is provided.
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">1. Choose masked evidence</h2>

          <label className="mt-5 block text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
            Confidential cycle
          </label>
          <select
            value={cycleId}
            onChange={(event) => setCycleId(event.target.value)}
            disabled={loadingCycles || cycles.length === 0}
            className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
          >
            {cycles.length === 0 ? (
              <option value="">
                {loadingCycles ? "Loading confidential cycles…" : "No eligible confidential cycle"}
              </option>
            ) : null}
            {cycles.map((cycle) => (
              <option key={cycle.cycleId} value={cycle.cycleId}>
                {cycle.targetLabel} · {cycle.jurisdictionLabel} · {cycle.finalizedResponses} finalized
              </option>
            ))}
          </select>

          {selectedCycle ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="font-bold text-slate-950">{selectedCycle.instrumentTitle}</div>
              <div className="mt-1">
                {selectedCycle.workflow === "DIRECTOR_FEEDBACK"
                  ? "Director confidential Headteacher feedback"
                  : "Headteacher confidential Teacher feedback"}
                {" · "}
                {selectedCycle.status}
              </div>
            </div>
          ) : null}

          <label className="mt-5 block text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
            Masked respondent
          </label>
          <select
            value={respondentKey}
            onChange={(event) => {
              setRespondentKey(event.target.value);
              setRevealed(null);
            }}
            disabled={loadingRespondents || respondents.length === 0}
            className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
          >
            {respondents.length === 0 ? (
              <option value="">
                {loadingRespondents ? "Loading masked respondents…" : "No eligible masked respondent"}
              </option>
            ) : null}
            {respondents.map((respondent) => (
              <option key={respondent.respondentKey} value={respondent.respondentKey}>
                {respondent.contextLabel} · {respondent.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">2. Justify exceptional access</h2>

          <label className="mt-5 block text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
            Purpose
          </label>
          <select
            value={purpose}
            onChange={(event) =>
              setPurpose(event.target.value as (typeof PURPOSES)[number][0])
            }
            className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
          >
            {PURPOSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <label className="mt-5 block text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
            Reason
          </label>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={5}
            placeholder="Explain why revealing this one respondent is necessary."
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900"
          />
          <div className="mt-1 text-xs text-slate-500">Required · 12–500 characters · permanently audited</div>

          <button
            type="button"
            onClick={() => void revealIdentity()}
            disabled={revealing || !cycleId || !respondentKey}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {revealing ? "Recording audit before reveal…" : "Reveal this respondent identity"}
          </button>

          {error ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-semibold text-rose-800">
              {error}
            </div>
          ) : null}
        </div>
      </section>

      {revealed ? (
        <section className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">
                Audited identity reveal
              </p>
              <h2 className="mt-1 text-xl font-black text-emerald-950">
                {revealed.respondent.contextLabel} · {revealed.respondent.label}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setRevealed(null)}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-black text-emerald-900"
            >
              Hide identity
            </button>
          </div>

          <dl className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-200 bg-white p-4">
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Name</dt>
              <dd className="mt-1 text-base font-black text-slate-950">{revealed.identity.displayName}</dd>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-white p-4">
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Role</dt>
              <dd className="mt-1 text-base font-black text-slate-950">{revealed.identity.role}</dd>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-white p-4">
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Email</dt>
              <dd className="mt-1 break-all text-sm font-bold text-slate-950">{revealed.identity.email}</dd>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-white p-4">
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">School</dt>
              <dd className="mt-1 text-sm font-bold text-slate-950">{revealed.identity.schoolName ?? "Not applicable"}</dd>
            </div>
          </dl>

          <div className="mt-4 rounded-2xl border border-emerald-300 bg-white px-4 py-3 text-xs font-semibold leading-6 text-emerald-950">
            Audit committed · {revealed.audit.purpose} · {new Date(revealed.audit.createdAt).toLocaleString()}
          </div>
        </section>
      ) : null}
    </div>
  );
}
