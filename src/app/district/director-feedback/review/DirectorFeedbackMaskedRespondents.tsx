"use client";

import { useState } from "react";

type MaskedSummary = {
  maskedRespondentKey: string;
  maskedLabel: string;
};

type MaskedFormItem = {
  itemKey: string;
  itemLabel: string;
  itemOrder: number;
  itemMaxScore: number;
  isRequired: boolean;
  score: number | null;
  notApplicable: boolean;
  answered: boolean;
};

type MaskedFormSection = {
  sectionKey: string;
  sectionTitle: string;
  description: string | null;
  sectionOrder: number;
  sectionMaxScore: number;
  percentage: number | null;
  items: MaskedFormItem[];
};

type ListResult = {
  mode: "LIST";
  cycleId: string;
  cycleStatus: string;
  circuit: {
    circuitZoneId: string;
    circuitName: string;
    finalizedResponses: number;
    threshold: number;
  };
  respondents: MaskedSummary[];
  evidence: {
    aggregateVersion: number;
    aggregateSourceFingerprint: string;
    maskingMode: "POST_CLOSURE_HASH_ORDER";
  };
};

type FormResult = {
  mode: "FORM";
  cycleId: string;
  cycleStatus: string;
  circuit: ListResult["circuit"];
  respondent: {
    maskedRespondentKey: string;
    maskedLabel: string;
    responseProofFingerprint: string;
  };
  officialForm: {
    documentTitle: string;
    directorateName: string | null;
    instructions: string | null;
    scale: {
      minimum: number;
      maximum: number;
      allowNotApplicable: boolean;
    };
    overallPercentage: number | null;
    sections: MaskedFormSection[];
  };
  evidence: ListResult["evidence"];
};

type ApiResponse =
  | {
      ok: true;
      reqId: string;
      result: ListResult | FormResult;
    }
  | {
      ok: false;
      reqId?: string;
      error: string;
    };

function percentage(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function scoreLabel(item: MaskedFormItem) {
  if (item.notApplicable) return "N/A";
  if (item.score == null) return "Not answered";
  return `${item.score} / ${item.itemMaxScore}`;
}

function friendlyError(code: string) {
  switch (code) {
    case "DIRECTOR_FEEDBACK_CIRCUIT_NOT_DISCLOSED":
    case "DIRECTOR_FEEDBACK_CIRCUIT_THRESHOLD_NOT_MET":
      return "This circuit has not independently met the privacy threshold.";
    case "DIRECTOR_FEEDBACK_MASKED_MUNICIPAL_THRESHOLD_NOT_MET":
      return "The municipal response threshold was not met, so individual forms remain protected.";
    case "DIRECTOR_FEEDBACK_MASKED_REVIEW_NOT_AVAILABLE":
      return "Begin the audited private review before opening masked forms.";
    case "DIRECTOR_FEEDBACK_MASKED_RESPONDENT_NOT_FOUND":
      return "That masked form is no longer available. Reload the protected list.";
    case "DIRECTOR_FEEDBACK_MASKED_SOURCE_COUNT_MISMATCH":
      return "The sealed evidence count does not match the protected forms. Review has been blocked safely.";
    case "DIRECTOR_FEEDBACK_MASKED_SCOPE_FORBIDDEN":
      return "This protected form does not belong to your Director account.";
    case "UNAUTHORIZED":
    case "GOVERNANCE_FORBIDDEN":
      return "Your Director session is not authorized for this protected form.";
    default:
      return "The protected masked forms could not load. Check the connection and try again.";
  }
}

export default function DirectorFeedbackMaskedRespondents(props: {
  cycleId: string;
  circuitZoneId: string;
  circuitName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingFormKey, setLoadingFormKey] = useState<string | null>(null);
  const [list, setList] = useState<ListResult | null>(null);
  const [form, setForm] = useState<FormResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function endpoint(maskedRespondentKey?: string) {
    const query = new URLSearchParams({
      cycleId: props.cycleId,
      circuitZoneId: props.circuitZoneId,
    });
    if (maskedRespondentKey) {
      query.set("maskedRespondentKey", maskedRespondentKey);
    }
    return `/api/district/director-feedback/review/respondents?${query.toString()}`;
  }

  async function loadList() {
    if (!navigator.onLine) {
      setError("You are offline. Reconnect before loading masked forms.");
      return;
    }

    setExpanded(true);
    setLoadingList(true);
    setError(null);

    try {
      const response = await fetch(endpoint(), {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as
        | ApiResponse
        | null;

      if (!response.ok || !payload?.ok || payload.result.mode !== "LIST") {
        setError(
          friendlyError(
            payload && !payload.ok
              ? payload.error
              : "FAILED_TO_LOAD_MASKED_RESPONDENTS",
          ),
        );
        return;
      }

      setList(payload.result);
      setForm(null);
    } catch {
      setError("The protected masked list could not load. Check the connection.");
    } finally {
      setLoadingList(false);
    }
  }

  async function loadForm(maskedRespondentKey: string) {
    if (!navigator.onLine) {
      setError("You are offline. Reconnect before opening a masked form.");
      return;
    }

    setLoadingFormKey(maskedRespondentKey);
    setError(null);

    try {
      const response = await fetch(endpoint(maskedRespondentKey), {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as
        | ApiResponse
        | null;

      if (!response.ok || !payload?.ok || payload.result.mode !== "FORM") {
        setError(
          friendlyError(
            payload && !payload.ok
              ? payload.error
              : "FAILED_TO_LOAD_MASKED_RESPONSE_FORM",
          ),
        );
        return;
      }

      setForm(payload.result);
    } catch {
      setError("The protected masked form could not load. Check the connection.");
    } finally {
      setLoadingFormKey(null);
    }
  }

  function closeProtectedView() {
    setExpanded(false);
    setList(null);
    setForm(null);
    setError(null);
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => void loadList()}
        className="mt-4 min-h-11 w-full rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-2.5 text-sm font-bold text-cyan-50 transition hover:bg-cyan-400/15 sm:w-auto"
      >
        View masked responses
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-[#06101F] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#57D6C4]">
            Protected individual forms
          </div>
          <h4 className="mt-1 font-bold">{props.circuitName}</h4>
          <p className="mt-2 text-xs leading-5 text-[#C9CDD6]">
            Labels are generated after closure in cryptographic hash order. They
            do not follow submission order and cannot reveal names or schools.
          </p>
        </div>
        <button
          type="button"
          onClick={closeProtectedView}
          className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-[#F7F4ED] hover:bg-white/10"
        >
          Close protected view
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-300/25 bg-rose-400/10 p-3 text-xs leading-5 text-rose-100">
          {error}
        </div>
      ) : null}

      {loadingList ? (
        <div className="mt-4 text-sm text-[#C9CDD6]">
          Loading protected masked labels…
        </div>
      ) : list ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {list.respondents.map((respondent) => (
            <button
              key={respondent.maskedRespondentKey}
              type="button"
              disabled={loadingFormKey !== null}
              onClick={() =>
                void loadForm(respondent.maskedRespondentKey)
              }
              className="min-h-12 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-bold text-[#F7F4ED] hover:bg-white/10 disabled:opacity-55"
            >
              {loadingFormKey === respondent.maskedRespondentKey
                ? "Opening safely…"
                : respondent.maskedLabel}
            </button>
          ))}
        </div>
      ) : null}

      {form ? (
        <div className="mt-5 rounded-2xl border border-[#E8C96A]/25 bg-[#0A1628] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#E8C96A]">
                {form.respondent.maskedLabel}
              </div>
              <h4 className="mt-1 text-lg font-bold">
                Complete finalized appraisal form
              </h4>
              <p className="mt-1 text-xs text-[#C9CDD6]">
                Response proof {form.respondent.responseProofFingerprint}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-center">
              <div className="text-[10px] uppercase tracking-[0.12em] text-emerald-100/75">
                Overall
              </div>
              <div className="mt-1 text-2xl font-bold text-emerald-50">
                {percentage(form.officialForm.overallPercentage)}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
            This form contains scores only. It excludes the respondent&apos;s
            name, school, contact details, exact submission time and submission
            position.
          </div>

          <div className="mt-4 space-y-3">
            {form.officialForm.sections.map((section) => (
              <details
                key={section.sectionKey}
                className="group rounded-2xl border border-white/10 bg-[#06101F] open:border-[#E8C96A]/35"
              >
                <summary className="cursor-pointer list-none p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8F98A8]">
                        Section {section.sectionOrder}
                      </div>
                      <div className="mt-1 text-sm font-bold leading-6">
                        {section.sectionTitle}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-bold text-[#E8C96A]">
                        {percentage(section.percentage)}
                      </div>
                      <span className="text-lg text-[#C9CDD6] group-open:rotate-180">
                        ⌄
                      </span>
                    </div>
                  </div>
                </summary>

                <div className="space-y-2 border-t border-white/10 p-4">
                  {section.items.map((item) => (
                    <div
                      key={item.itemKey}
                      className="rounded-xl border border-white/8 bg-[#0A1628] p-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[#E8C96A]">
                            {item.itemKey}
                          </div>
                          <div className="mt-1 text-sm leading-6 text-[#F7F4ED]">
                            {item.itemLabel}
                          </div>
                        </div>
                        <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-[#F7F4ED]">
                          {scoreLabel(item)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
