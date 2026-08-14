"use client";

import { Fragment, useRef, useState } from "react";

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
  return `${Math.round(Math.max(0, Math.min(100, value)))}%`;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function scoreTone(score: number | null | undefined, notApplicable: boolean) {
  if (notApplicable) return "bg-slate-200 text-slate-900";
  switch (score) {
    case 1:
      return "bg-rose-100 text-rose-950";
    case 2:
      return "bg-orange-100 text-orange-950";
    case 3:
      return "bg-amber-100 text-amber-950";
    case 4:
      return "bg-cyan-100 text-cyan-950";
    case 5:
      return "bg-emerald-100 text-emerald-950";
    default:
      return "bg-white text-slate-700";
  }
}

function sectionSummary(section: MaskedFormSection) {
  let rawScore = 0;
  let applicableMaximum = section.items.reduce(
    (sum, item) => sum + item.itemMaxScore,
    0,
  );
  let notApplicableItems = 0;

  for (const item of section.items) {
    if (item.notApplicable) {
      notApplicableItems += 1;
      applicableMaximum -= item.itemMaxScore;
      continue;
    }
    if (item.score != null) rawScore += item.score;
  }

  return { rawScore, applicableMaximum, notApplicableItems };
}

function totalRawScore(sections: MaskedFormSection[]) {
  return sections.reduce(
    (sum, section) => sum + sectionSummary(section).rawScore,
    0,
  );
}

function totalOfficialMaximum(sections: MaskedFormSection[]) {
  return sections.reduce((sum, section) => sum + section.sectionMaxScore, 0);
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
  const formRef = useRef<HTMLDivElement | null>(null);

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
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
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
              onClick={() => void loadForm(respondent.maskedRespondentKey)}
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
        <div ref={formRef} className="mt-5 scroll-mt-24">
          <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-[#E8C96A]/25 bg-[#0A1628] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#E8C96A]">
                {form.respondent.maskedLabel}
              </div>
              <h4 className="mt-1 text-lg font-bold">
                Complete finalized appraisal form
              </h4>
              <p className="mt-1 text-xs leading-5 text-[#C9CDD6]">
                This randomized label does not identify a Headteacher, school,
                contact, exact submission time or submission position.
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

          <section className="overflow-hidden rounded-[28px] border border-slate-300 bg-white text-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="overflow-x-auto">
              <div className="min-w-[1120px]">
                <div className="border-b-2 border-slate-950 px-6 py-5 text-center">
                  <div className="text-sm font-black uppercase tracking-[0.08em]">
                    {form.officialForm.directorateName ?? "Education Directorate"}
                  </div>
                  <div className="mt-2 text-xl font-black uppercase">
                    {form.officialForm.documentTitle}
                  </div>
                </div>

                <table className="w-full border-collapse text-[12px] leading-5">
                  <thead>
                    <tr className="bg-slate-100">
                      <th
                        rowSpan={2}
                        className="w-[64px] border border-slate-700 px-2 py-2 text-center font-black"
                      >
                        S/N
                      </th>
                      <th
                        rowSpan={2}
                        className="border border-slate-700 px-3 py-2 text-center font-black uppercase"
                      >
                        <div>Behavioural Competence</div>
                        <div className="mt-1 text-[10px] font-semibold normal-case tracking-normal">
                          [1—Very poor] [2—Poor] [3—Acceptable] [4—Good] [5—Very Good]
                        </div>
                      </th>
                      <th
                        colSpan={6}
                        className="border border-slate-700 px-2 py-2 text-center font-black"
                      >
                        SCORE
                      </th>
                      <th
                        rowSpan={2}
                        className="w-[92px] border border-slate-700 px-2 py-2 text-center font-black"
                      >
                        FINAL SCORE
                      </th>
                    </tr>
                    <tr className="bg-slate-100">
                      {["N/A", "1", "2", "3", "4", "5"].map((label) => (
                        <th
                          key={label}
                          className="w-[48px] border border-slate-700 px-1 py-2 text-center font-black"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {form.officialForm.sections.map((section) => {
                      const summary = sectionSummary(section);

                      return (
                        <Fragment key={section.sectionKey}>
                          <tr className="bg-[#304C6E] text-white">
                            <td className="border border-white/25 px-2 py-2 text-center font-black">
                              {section.sectionOrder}.0
                            </td>
                            <td className="border border-white/25 px-3 py-2 font-black uppercase">
                              {section.sectionTitle}
                            </td>
                            <td colSpan={7} className="border border-white/25" />
                          </tr>

                          {section.items.map((item) => {
                            const finalScore = item.notApplicable
                              ? "N/A"
                              : item.score == null
                                ? "—"
                                : String(item.score);

                            return (
                              <tr
                                key={`${section.sectionKey}:${item.itemKey}`}
                                className="bg-white"
                              >
                                <td className="border border-slate-500 px-2 py-2 text-center font-bold">
                                  {item.itemKey}
                                </td>
                                <td className="border border-slate-500 px-3 py-2 align-top">
                                  {item.itemLabel}
                                </td>
                                <td
                                  className={cx(
                                    "border border-slate-500 px-1 py-2 text-center font-black",
                                    item.notApplicable
                                      ? scoreTone(item.score, true)
                                      : "bg-white text-slate-300",
                                  )}
                                >
                                  {item.notApplicable ? "✓" : ""}
                                </td>
                                {[1, 2, 3, 4, 5].map((score) => {
                                  const selected =
                                    !item.notApplicable && item.score === score;
                                  return (
                                    <td
                                      key={`${section.sectionKey}:${item.itemKey}:${score}`}
                                      className={cx(
                                        "border border-slate-500 px-1 py-2 text-center font-black",
                                        selected
                                          ? scoreTone(item.score, false)
                                          : "bg-white text-slate-300",
                                      )}
                                    >
                                      {selected ? "✓" : ""}
                                    </td>
                                  );
                                })}
                                <td
                                  className={cx(
                                    "border border-slate-500 px-2 py-2 text-center font-black",
                                    scoreTone(item.score, item.notApplicable),
                                  )}
                                >
                                  {finalScore}
                                </td>
                              </tr>
                            );
                          })}

                          <tr className="bg-slate-100">
                            <td
                              colSpan={8}
                              className="border border-slate-700 px-3 py-2 text-right font-black uppercase"
                            >
                              TOTAL SCORE (OUT OF {section.sectionMaxScore})
                            </td>
                            <td className="border border-slate-700 px-2 py-2 text-center font-black">
                              {summary.rawScore}
                            </td>
                          </tr>

                          <tr className="bg-slate-100">
                            <td
                              colSpan={8}
                              className="border border-slate-700 px-3 py-2 text-right font-black uppercase"
                            >
                              PERCENTAGE SCORE = (TOTAL SCORE / {summary.notApplicableItems > 0
                                ? `${summary.applicableMaximum} APPLICABLE MAXIMUM`
                                : section.sectionMaxScore}) × 100
                            </td>
                            <td className="border border-slate-700 px-2 py-2 text-center font-black">
                              {percentage(section.percentage)}
                            </td>
                          </tr>

                          {summary.notApplicableItems > 0 ? (
                            <tr className="bg-amber-50">
                              <td
                                colSpan={9}
                                className="border border-slate-500 px-3 py-1.5 text-right text-[10px] font-semibold text-slate-700"
                              >
                                {summary.notApplicableItems} N/A item(s) excluded from the digital percentage denominator.
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}

                    <tr className="bg-indigo-50">
                      <td
                        colSpan={8}
                        className="border border-slate-700 px-3 py-2 text-right font-black uppercase"
                      >
                        OVERALL PERCENTAGE (1.0 + 2.0 + 3.0 + 4.0 + 5.0 + 6.0 + 7.0) ÷ 7
                      </td>
                      <td className="border border-slate-700 px-2 py-2 text-center font-black">
                        {percentage(form.officialForm.overallPercentage)}
                      </td>
                    </tr>

                    <tr className="bg-white">
                      <td className="border border-slate-700 px-2 py-3" />
                      <td colSpan={8} className="border border-slate-700 px-3 py-3">
                        <span className="font-black">General Comment(s):</span>{" "}
                        <span className="text-slate-600">
                          Not enabled in this workflow.
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="grid grid-cols-2 border-t-2 border-slate-950 bg-cyan-50 text-sm">
                  <div className="border-r border-slate-700 px-5 py-4">
                    <div className="font-black uppercase">Total Score</div>
                    <div className="mt-1 text-xl font-black">
                      {totalRawScore(form.officialForm.sections)} /{" "}
                      {totalOfficialMaximum(form.officialForm.sections)}
                    </div>
                  </div>
                  <div className="px-5 py-4 text-right">
                    <div className="font-black uppercase">Overall Percentage</div>
                    <div className="mt-1 text-xl font-black">
                      {percentage(form.officialForm.overallPercentage)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
