"use client";

import { useMemo, useState, type ChangeEvent } from "react";

type JsonRecord = Record<string, unknown>;

type EvidenceValue = {
  percentage: number | null;
  notApplicable: boolean;
};

type ComparisonItem = {
  id: string;
  key: string;
  label: string;
  sectionKey: string;
  sectionTitle: string;
  staff: EvidenceValue;
  supervisory: EvidenceValue;
  difference: number | null;
};

type ComparisonSection = {
  key: string;
  title: string;
  order: number;
  staffPercentage: number | null;
  supervisoryPercentage: number | null;
  difference: number | null;
};

type ReviewView = {
  reviewId: string;
  cycleStatus: string;
  reviewStage: number | null;
  headteacherName: string;
  schoolName: string;
  overallStaffPercentage: number | null;
  overallSupervisoryPercentage: number | null;
  overallDifference: number | null;
  sections: ComparisonSection[];
  items: ComparisonItem[];
};

type DecisionMode = "RETURN" | "HOLD" | "RELEASE";

const API_BASE = "/api/district/headteacher-appraisals";

const BBC_REVIEW_POLICY = Object.freeze({
  audience: "DISTRICT_DIRECTOR",
  presentation: "ONE_COMPARISON_AT_A_TIME",
  expectedSections: 4,
  expectedItems: 34,
  backgroundPollingAllowed: false,
  persistentBrowserStorageAllowed: false,
  respondentIdentitiesIncluded: false,
  individualStaffResponsesIncluded: false,
  reviewerMayRewriteScores: false,
  notificationSeedingIncluded: true,
  providerDeliveryIncluded: false,
});

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 10) / 10;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed * 10) / 10;
  }

  return null;
}

function boolean(value: unknown): boolean {
  return value === true;
}

function pick(source: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (key in source) return source[key];
  }
  return undefined;
}

function nested(source: JsonRecord, paths: string[][]): unknown {
  for (const path of paths) {
    let current: unknown = source;
    let valid = true;

    for (const key of path) {
      const currentRecord = record(current);
      if (!(key in currentRecord)) {
        valid = false;
        break;
      }
      current = currentRecord[key];
    }

    if (valid) return current;
  }

  return undefined;
}

function unwrapPayload(value: unknown): JsonRecord {
  const root = record(value);

  for (const key of ["result", "data", "reviewPackage", "package"]) {
    const candidate = record(root[key]);
    if (Object.keys(candidate).length > 0) return candidate;
  }

  return root;
}

function evidenceValue(
  source: JsonRecord,
  percentageKeys: string[],
  notApplicableKeys: string[],
): EvidenceValue {
  return {
    percentage: numberOrNull(pick(source, percentageKeys)),
    notApplicable: boolean(pick(source, notApplicableKeys)),
  };
}

function itemFromRecord(
  value: unknown,
  index: number,
  fallbackSectionKey = "",
  fallbackSectionTitle = "",
): ComparisonItem {
  const item = record(value);
  const staff = record(
    pick(item, ["staff", "staffFeedback", "staffEvidence", "aggregate"]),
  );
  const supervisory = record(
    pick(item, ["supervisory", "supervisoryEvidence", "assessment"]),
  );

  const sectionKey =
    text(pick(item, ["sectionKey", "sectionCode"])) || fallbackSectionKey;
  const sectionTitle =
    text(pick(item, ["sectionTitle", "sectionLabel"])) ||
    fallbackSectionTitle ||
    sectionKey ||
    "Section";

  const staffValue = Object.keys(staff).length
    ? evidenceValue(
        staff,
        ["percentage", "value", "averagePercentage"],
        ["notApplicable", "isNotApplicable", "na"],
      )
    : evidenceValue(
        item,
        [
          "staffPercentage",
          "staffAveragePercentage",
          "staffFeedbackPercentage",
          "aggregatePercentage",
        ],
        ["staffNotApplicable", "staffIsNotApplicable"],
      );

  const supervisoryValue = Object.keys(supervisory).length
    ? evidenceValue(
        supervisory,
        ["percentage", "value", "scorePercentage"],
        ["notApplicable", "isNotApplicable", "na"],
      )
    : evidenceValue(
        item,
        [
          "supervisoryPercentage",
          "assessmentPercentage",
          "governancePercentage",
        ],
        ["supervisoryNotApplicable", "assessmentNotApplicable"],
      );

  const comparisonState = text(pick(item, ["comparisonState"]));
  if (
    comparisonState === "STAFF_ALL_NOT_APPLICABLE" ||
    numberOrNull(pick(item, ["staffApplicableResponses"])) === 0
  ) {
    staffValue.notApplicable = true;
  }
  if (comparisonState === "SUPERVISORY_NOT_APPLICABLE") {
    supervisoryValue.notApplicable = true;
  }

  const difference =
    numberOrNull(
      pick(item, [
        "difference",
        "differencePercentagePoints",
        "percentagePointDifference",
        "supervisoryMinusStaffPercentagePoints",
        "delta",
      ]),
    ) ??
    (staffValue.percentage !== null && supervisoryValue.percentage !== null
      ? Math.round(
          (supervisoryValue.percentage - staffValue.percentage) * 10,
        ) / 10
      : null);

  const key =
    text(pick(item, ["itemKey", "key", "code"])) ||
    `${sectionKey || "ITEM"}-${index + 1}`;

  return {
    id: text(pick(item, ["itemId", "id"])) || key,
    key,
    label:
      text(pick(item, ["label", "itemLabel", "title", "prompt"])) ||
      `Review item ${index + 1}`,
    sectionKey,
    sectionTitle,
    staff: staffValue,
    supervisory: supervisoryValue,
    difference,
  };
}

function sectionFromRecord(value: unknown, index: number): ComparisonSection {
  const section = record(value);
  const staff = record(
    pick(section, ["staff", "staffFeedback", "staffEvidence", "aggregate"]),
  );
  const supervisory = record(
    pick(section, ["supervisory", "supervisoryEvidence", "assessment"]),
  );

  const staffPercentage =
    numberOrNull(
      pick(staff, ["percentage", "averagePercentage", "value"]),
    ) ??
    numberOrNull(
      pick(section, [
        "staffPercentage",
        "staffAveragePercentage",
        "staffFeedbackPercentage",
        "aggregatePercentage",
      ]),
    );

  const supervisoryPercentage =
    numberOrNull(
      pick(supervisory, ["percentage", "value", "scorePercentage"]),
    ) ??
    numberOrNull(
      pick(section, [
        "supervisoryPercentage",
        "assessmentPercentage",
        "governancePercentage",
      ]),
    );

  const key =
    text(pick(section, ["sectionKey", "key", "code"])) ||
    `SECTION-${index + 1}`;

  return {
    key,
    title:
      text(pick(section, ["sectionTitle", "title", "label"])) ||
      `Section ${index + 1}`,
    order:
      numberOrNull(pick(section, ["sectionOrder", "order"])) ?? index + 1,
    staffPercentage,
    supervisoryPercentage,
    difference:
      numberOrNull(
        pick(section, [
          "difference",
          "differencePercentagePoints",
          "percentagePointDifference",
          "supervisoryMinusStaffPercentagePoints",
          "delta",
        ]),
      ) ??
      (staffPercentage !== null && supervisoryPercentage !== null
        ? Math.round((supervisoryPercentage - staffPercentage) * 10) / 10
        : null),
  };
}

function buildReviewView(value: unknown): ReviewView {
  const source = unwrapPayload(value);
  const comparison = record(
    pick(source, [
      "comparison",
      "evidenceComparison",
      "comparisonPackage",
      "evidence",
    ]),
  );

  const currentReview = record(
    nested(source, [
      ["currentReview"],
      ["review"],
      ["reviewState"],
    ]),
  );

  const target = record(
    nested(source, [
      ["target"],
      ["subject"],
      ["headteacher"],
      ["cycle"],
    ]),
  );

  const overall = record(
    nested(comparison, [
      ["overall"],
      ["overallComparison"],
    ]),
  );

  const staffOverall =
    numberOrNull(
      pick(overall, [
        "staffPercentage",
        "staffAveragePercentage",
        "staffFeedbackPercentage",
        "aggregatePercentage",
      ]),
    ) ??
    numberOrNull(
      nested(source, [
        ["staffFeedback", "overallPercentage"],
        ["staffEvidence", "overallPercentage"],
        ["aggregate", "overallPercentage"],
      ]),
    );

  const supervisoryOverall =
    numberOrNull(
      pick(overall, [
        "supervisoryPercentage",
        "assessmentPercentage",
        "governancePercentage",
      ]),
    ) ??
    numberOrNull(
      nested(source, [
        ["supervisory", "overallPercentage"],
        ["supervisoryEvidence", "overallPercentage"],
        ["assessment", "overallPercentage"],
      ]),
    );

  const rawSections =
    array(
      pick(comparison, [
        "sections",
        "sectionComparisons",
        "sectionEvidence",
      ]),
    ).length > 0
      ? array(
          pick(comparison, [
            "sections",
            "sectionComparisons",
            "sectionEvidence",
          ]),
        )
      : array(
          nested(source, [
            ["comparison", "sections"],
            ["evidenceComparison", "sections"],
          ]),
        );

  const sections = rawSections
    .map(sectionFromRecord)
    .sort((left, right) => left.order - right.order);

  let rawItems = array(
    pick(comparison, ["items", "itemComparisons", "itemEvidence"]),
  );

  if (rawItems.length === 0) {
    rawItems = sections.flatMap((section) => {
      const original = rawSections.find((candidate) => {
        const valueRecord = record(candidate);
        const candidateKey = text(
          pick(valueRecord, ["sectionKey", "key", "code"]),
        );
        return candidateKey === section.key;
      });
      const originalRecord = record(original);
      return array(
        pick(originalRecord, ["items", "itemComparisons", "itemEvidence"]),
      ).map((item) => ({
        ...record(item),
        sectionKey: section.key,
        sectionTitle: section.title,
      }));
    });
  }

  const items = rawItems.map((item, index) =>
    itemFromRecord(item, index),
  );

  const reviewId =
    text(pick(currentReview, ["reviewId", "id"])) ||
    text(pick(source, ["reviewId", "currentReviewId"]));

  const cycleStatus =
    text(pick(source, ["cycleStatus", "status"])) ||
    text(nested(source, [["cycle", "status"]])) ||
    "UNKNOWN";

  return {
    reviewId,
    cycleStatus,
    reviewStage:
      numberOrNull(pick(currentReview, ["stage", "reviewStage"])) ??
      numberOrNull(pick(source, ["reviewStage", "currentReviewStage"])),
    headteacherName:
      text(
        pick(target, [
          "headteacherName",
          "targetName",
          "name",
          "displayName",
        ]),
      ) ||
      text(pick(source, ["headteacherName", "targetName"])) ||
      "Headteacher",
    schoolName:
      text(pick(target, ["schoolName", "tenantName"])) ||
      text(pick(source, ["schoolName", "targetSchoolName"])) ||
      "School",
    overallStaffPercentage: staffOverall,
    overallSupervisoryPercentage: supervisoryOverall,
    overallDifference:
      numberOrNull(
        pick(overall, [
          "difference",
          "differencePercentagePoints",
          "percentagePointDifference",
          "supervisoryMinusStaffPercentagePoints",
          "delta",
        ]),
      ) ??
      (staffOverall !== null && supervisoryOverall !== null
        ? Math.round((supervisoryOverall - staffOverall) * 10) / 10
        : null),
    sections,
    items,
  };
}

function formatPercentage(value: number | null) {
  return value === null ? "Not available" : `${value.toFixed(1)}%`;
}

function formatDifference(value: number | null) {
  if (value === null) return "Not comparable";
  if (value === 0) return "No difference";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} percentage points`;
}

function errorMessage(value: unknown, fallback: string) {
  const root = record(value);
  const detail = text(root.detail);
  const error = text(root.error);
  const message = text(root.message);
  return detail || message || error || fallback;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}

export default function HeadteacherDirectorReviewClient({
  initialCycleId,
}: {
  initialCycleId: string;
}) {
  const [cycleId, setCycleId] = useState(initialCycleId);
  const [reviewView, setReviewView] = useState<ReviewView | null>(null);
  const [rawPackage, setRawPackage] = useState<unknown>(null);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [decisionMode, setDecisionMode] =
    useState<DecisionMode | null>(null);
  const [reason, setReason] = useState("");
  const [releaseNote, setReleaseNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");

  const currentItem = reviewView?.items[currentItemIndex] ?? null;

  const sectionSummary = useMemo(() => {
    if (!reviewView) return [];
    return reviewView.sections;
  }, [reviewView]);

  function clearMessages() {
    setNotice("");
    setFailure("");
  }

  async function loadPackage() {
    const cleanCycleId = cycleId.trim();
    clearMessages();

    if (!cleanCycleId) {
      setFailure(
        "Open this workspace from a Headteacher appraisal record.",
      );
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(cleanCycleId)}/review-package`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        },
      );

      const data = await readJson(response);

      if (!response.ok) {
        setReviewView(null);
        setRawPackage(null);
        setFailure(
          errorMessage(
            data,
            "The review package is not ready. Start the review or try again.",
          ),
        );
        return;
      }

      const view = buildReviewView(data);
      setRawPackage(data);
      setReviewView(view);
      setCurrentItemIndex(0);
      setDecisionMode(null);
      setReason("");
      setReleaseNote("");
      setNotice("Review evidence loaded from the server.");
    } catch {
      setFailure(
        "Network interrupted. Nothing was changed. Check the connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function startReview() {
    const cleanCycleId = cycleId.trim();
    clearMessages();

    if (!cleanCycleId) {
      setFailure(
        "Open this workspace from a Headteacher appraisal record.",
      );
      return;
    }

    const confirmed = window.confirm(
      "Start the Director review now? This verifies both evidence streams and moves the appraisal into review.",
    );

    if (!confirmed) return;

    setBusy(true);

    try {
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(cleanCycleId)}/review-start`,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ confirm: true }),
        },
      );

      const data = await readJson(response);

      if (!response.ok) {
        setFailure(
          errorMessage(data, "The review could not be started."),
        );
        return;
      }

      setNotice("Director review started. Load the evidence package.");
      await loadPackage();
    } catch {
      setFailure(
        "Network interrupted. The server will safely reject duplicate review starts. Load the package to confirm the current state.",
      );
    } finally {
      setBusy(false);
    }
  }

  function openDecision(mode: DecisionMode) {
    clearMessages();
    setDecisionMode(mode);
    setReason("");
    setReleaseNote("");
  }

  async function submitDecision() {
    if (!reviewView) return;

    const cleanCycleId = cycleId.trim();
    const reviewId = reviewView.reviewId.trim();

    if (!cleanCycleId || !reviewId) {
      setFailure(
        "The current review reference is missing. Reload the evidence package.",
      );
      return;
    }

    if (
      (decisionMode === "RETURN" || decisionMode === "HOLD") &&
      reason.trim().length < 3
    ) {
      setFailure("Write a clear reason of at least 3 characters.");
      return;
    }

    const confirmationText =
      decisionMode === "RETURN"
        ? "Return this supervisory assessment for a correction revision?"
        : decisionMode === "HOLD"
          ? "Hold this appraisal and create the next Director review stage?"
          : "Release this appraisal as the official Headteacher result?";

    if (!window.confirm(confirmationText)) return;

    setBusy(true);
    clearMessages();

    try {
      const isRelease = decisionMode === "RELEASE";
      const endpoint = isRelease ? "release" : "return-hold";
      const body = isRelease
        ? {
            reviewId,
            note: releaseNote.trim() || null,
            confirm: true,
          }
        : {
            reviewId,
            decision: decisionMode,
            note: reason.trim(),
            confirm: true,
          };

      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(cleanCycleId)}/${endpoint}`,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      const data = await readJson(response);

      if (!response.ok) {
        const responseBody = record(data);
        if (
          text(responseBody.error) ===
            "HEADTEACHER_RELEASE_NOTIFICATION_SEEDING_RETRY_REQUIRED" &&
          boolean(responseBody.releaseCommitted)
        ) {
          setFailure(
            "The appraisal was released, but the Headteacher notification was not queued. Keep this page open and press Confirm official release again after the connection recovers. The release will not be duplicated.",
          );
          return;
        }

        setFailure(
          errorMessage(data, "The Director decision was not recorded."),
        );
        return;
      }

      const completed =
        decisionMode === "RETURN"
          ? "Assessment returned. The assessor must create a correction revision."
          : decisionMode === "HOLD"
            ? "Appraisal held. The next Director review stage is ready."
            : "Appraisal released. The Headteacher notification was queued safely.";

      setNotice(completed);
      setDecisionMode(null);
      setReason("");
      setReleaseNote("");

      if (decisionMode === "HOLD") {
        await loadPackage();
      } else {
        setReviewView(null);
        setRawPackage(data);
      }
    } catch {
      setFailure(
        "Network interrupted. Do not repeat the decision blindly. Load the evidence package to confirm the server state.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <header className="rounded-3xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
            Director workspace
          </p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">
            Headteacher appraisal review
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Compare staff feedback with the governance assessment.
            Review one item at a time. The Director cannot rewrite either
            evidence stream.
          </p>
        </header>

        {!initialCycleId ? (
          <section className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-5">
            <h2 className="text-lg font-black">Open from an appraisal record</h2>
            <p className="mt-2 text-sm leading-6 text-amber-100">
              This workspace requires a controlled Headteacher appraisal
              link containing the cycle reference.
            </p>
          </section>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-slate-900 p-5">
          <label
            htmlFor="cycle-id"
            className="block text-sm font-bold text-slate-200"
          >
            Appraisal reference
          </label>
          <input
            id="cycle-id"
            value={cycleId}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setCycleId(event.target.value)
            }
            readOnly={Boolean(initialCycleId)}
            className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-950 px-4 py-3 text-base font-semibold outline-none focus:border-amber-300"
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy || !cycleId.trim()}
              onClick={loadPackage}
              className="min-h-14 rounded-2xl bg-white px-5 py-3 text-base font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Please wait…" : "Load review package"}
            </button>
            <button
              type="button"
              disabled={busy || !cycleId.trim()}
              onClick={startReview}
              className="min-h-14 rounded-2xl border border-amber-300 bg-amber-300/10 px-5 py-3 text-base font-black text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start Director review
            </button>
          </div>

          <p className="mt-3 text-xs leading-5 text-slate-400">
            No background polling. Use “Load review package” after a
            weak-network interruption.
          </p>
        </section>

        {failure ? (
          <div
            role="alert"
            className="rounded-3xl border border-rose-400/40 bg-rose-400/10 p-5 text-sm font-semibold leading-6 text-rose-100"
          >
            {failure}
          </div>
        ) : null}

        {notice ? (
          <div
            role="status"
            className="rounded-3xl border border-emerald-400/40 bg-emerald-400/10 p-5 text-sm font-semibold leading-6 text-emerald-100"
          >
            {notice}
          </div>
        ) : null}

        {reviewView ? (
          <>
            <section className="rounded-3xl border border-white/10 bg-slate-900 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Current review
              </p>
              <h2 className="mt-2 text-xl font-black">
                {reviewView.headteacherName}
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                {reviewView.schoolName}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-950 p-4">
                  <p className="text-xs font-bold text-slate-400">
                    Cycle status
                  </p>
                  <p className="mt-1 text-lg font-black">
                    {reviewView.cycleStatus.replaceAll("_", " ")}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-950 p-4">
                  <p className="text-xs font-bold text-slate-400">
                    Review stage
                  </p>
                  <p className="mt-1 text-lg font-black">
                    {reviewView.reviewStage ?? "Current"}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-slate-900 p-5">
              <h2 className="text-xl font-black">Overall evidence</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <EvidenceCard
                  label="Staff feedback"
                  value={formatPercentage(
                    reviewView.overallStaffPercentage,
                  )}
                />
                <EvidenceCard
                  label="Supervisory assessment"
                  value={formatPercentage(
                    reviewView.overallSupervisoryPercentage,
                  )}
                />
                <EvidenceCard
                  label="Difference"
                  value={formatDifference(
                    reviewView.overallDifference,
                  )}
                />
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-400">
                Difference means supervisory percentage minus staff-feedback
                percentage. No combined appraisal score or automatic judgment
                is created.
              </p>
            </section>

            {sectionSummary.length > 0 ? (
              <section className="rounded-3xl border border-white/10 bg-slate-900 p-5">
                <h2 className="text-xl font-black">Four-section summary</h2>
                <div className="mt-4 space-y-3">
                  {sectionSummary.map((section) => (
                    <article
                      key={section.key}
                      className="rounded-2xl border border-white/10 bg-slate-950 p-4"
                    >
                      <p className="font-black">{section.title}</p>
                      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                        <p>
                          Staff:{" "}
                          <strong>
                            {formatPercentage(section.staffPercentage)}
                          </strong>
                        </p>
                        <p>
                          Supervisory:{" "}
                          <strong>
                            {formatPercentage(
                              section.supervisoryPercentage,
                            )}
                          </strong>
                        </p>
                        <p>
                          Difference:{" "}
                          <strong>
                            {formatDifference(section.difference)}
                          </strong>
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {currentItem ? (
              <section className="rounded-3xl border border-amber-300/30 bg-slate-900 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Item {currentItemIndex + 1} of {reviewView.items.length}
                  </p>
                  <p className="text-xs font-bold text-slate-400">
                    {currentItem.sectionTitle}
                  </p>
                </div>

                <h2 className="mt-3 text-xl font-black leading-8">
                  <span className="mr-2 text-amber-300">
                    {currentItem.key}
                  </span>
                  {currentItem.label}
                </h2>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <EvidenceCard
                    label="Staff feedback"
                    value={
                      currentItem.staff.notApplicable
                        ? "N/A"
                        : formatPercentage(currentItem.staff.percentage)
                    }
                  />
                  <EvidenceCard
                    label="Supervisory assessment"
                    value={
                      currentItem.supervisory.notApplicable
                        ? "N/A"
                        : formatPercentage(
                            currentItem.supervisory.percentage,
                          )
                    }
                  />
                </div>

                <div className="mt-3 rounded-2xl bg-slate-950 p-4">
                  <p className="text-xs font-bold text-slate-400">
                    Difference
                  </p>
                  <p className="mt-1 text-lg font-black">
                    {formatDifference(currentItem.difference)}
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={currentItemIndex === 0}
                    onClick={() =>
                      setCurrentItemIndex((current) =>
                        Math.max(0, current - 1),
                      )
                    }
                    className="min-h-14 rounded-2xl border border-white/20 px-4 py-3 text-base font-black disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={
                      currentItemIndex >= reviewView.items.length - 1
                    }
                    onClick={() =>
                      setCurrentItemIndex((current) =>
                        Math.min(
                          reviewView.items.length - 1,
                          current + 1,
                        ),
                      )
                    }
                    className="min-h-14 rounded-2xl bg-white px-4 py-3 text-base font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </section>
            ) : (
              <section className="rounded-3xl border border-white/10 bg-slate-900 p-5">
                <h2 className="text-xl font-black">
                  Item comparison unavailable
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  The server package did not provide item comparisons. No
                  decision is blocked silently; reload or inspect the API
                  response before release.
                </p>
              </section>
            )}

            <section className="rounded-3xl border border-white/10 bg-slate-900 p-5">
              <h2 className="text-xl font-black">Director decision</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Return preserves the assessment and requires a correction
                revision. Hold creates the next review stage. Release makes
                this the official result.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <DecisionButton
                  label="Return"
                  active={decisionMode === "RETURN"}
                  onClick={() => openDecision("RETURN")}
                />
                <DecisionButton
                  label="Hold"
                  active={decisionMode === "HOLD"}
                  onClick={() => openDecision("HOLD")}
                />
                <DecisionButton
                  label="Release"
                  active={decisionMode === "RELEASE"}
                  onClick={() => openDecision("RELEASE")}
                />
              </div>

              {decisionMode === "RETURN" ||
              decisionMode === "HOLD" ? (
                <div className="mt-5">
                  <label
                    htmlFor="decision-reason"
                    className="block text-sm font-black"
                  >
                    {decisionMode === "RETURN"
                      ? "Reason for correction"
                      : "Reason for hold"}
                  </label>
                  <textarea
                    id="decision-reason"
                    value={reason}
                    maxLength={2000}
                    rows={5}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      setReason(event.target.value)
                    }
                    className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-950 px-4 py-3 text-base outline-none focus:border-amber-300"
                    placeholder="Write a clear reason."
                  />
                  <p className="mt-1 text-right text-xs text-slate-400">
                    {reason.length}/2000
                  </p>
                </div>
              ) : null}

              {decisionMode === "RELEASE" ? (
                <div className="mt-5">
                  <label
                    htmlFor="release-note"
                    className="block text-sm font-black"
                  >
                    Release note — optional
                  </label>
                  <textarea
                    id="release-note"
                    value={releaseNote}
                    maxLength={2000}
                    rows={4}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      setReleaseNote(event.target.value)
                    }
                    className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-950 px-4 py-3 text-base outline-none focus:border-amber-300"
                    placeholder="Leave blank when no note is needed."
                  />
                  <p className="mt-1 text-right text-xs text-slate-400">
                    {releaseNote.length}/2000
                  </p>
                </div>
              ) : null}

              {decisionMode ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={submitDecision}
                  className="mt-5 min-h-14 w-full rounded-2xl bg-amber-300 px-5 py-3 text-base font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy
                    ? "Recording decision…"
                    : decisionMode === "RETURN"
                      ? "Confirm return for correction"
                      : decisionMode === "HOLD"
                        ? "Confirm hold"
                        : "Confirm official release"}
                </button>
              ) : null}
            </section>
          </>
        ) : null}

        <footer className="rounded-3xl border border-white/10 bg-slate-900 p-5 text-xs leading-5 text-slate-400">
          Staff responses remain confidential. This workspace receives only
          the protected aggregate and the finalized supervisory evidence.
          Notifications are handled in a separate checkpoint.
          <span className="sr-only">
            {JSON.stringify(BBC_REVIEW_POLICY)}
            {rawPackage ? "server-package-loaded" : "server-package-empty"}
          </span>
        </footer>
      </div>
    </main>
  );
}

function EvidenceCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950 p-4">
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-black leading-6">{value}</p>
    </div>
  );
}

function DecisionButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "min-h-14 rounded-2xl border border-amber-300 bg-amber-300 px-4 py-3 text-base font-black text-slate-950"
          : "min-h-14 rounded-2xl border border-white/20 bg-slate-950 px-4 py-3 text-base font-black"
      }
    >
      {label}
    </button>
  );
}
