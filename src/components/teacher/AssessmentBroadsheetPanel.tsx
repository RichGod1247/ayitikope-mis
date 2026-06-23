//src/components/teacher/AssessmentBroadsheetPanel.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type ClassroomPick = {
  id: string;
  name: string;
  grade?: string | null;
  arm?: string | null;
};

type PolicyComponent = {
  code: string;
  label: string;
  kind: string;
  maxScore: number;
  weightPercent: number;
  required: boolean;
  orderIndex: number;
};

type GradeScale = {
  grade: string;
  minPercent: number;
  maxPercent: number;
  label: string;
  remark: string;
  reportPhrase: string | null;
  orderIndex: number;
};

type BroadsheetEvidenceCandidate = {
  itemId: string;
  itemTitle: string;
  itemStatus: string;
  score: number;
  maxScore: number;
  normalizedScore: number;
  weightedScore: number;
  weightPercent: number;
  comment: string | null;
  readonly: boolean;
};

type BroadsheetCell = {
  componentCode: string;
  itemId: string | null;
  score: number | null;
  maxScore: number;
  weightedScore: number | null;
  weightPercent: number;
  missing: boolean;
  readonly: boolean;
  comment: string | null;
  evidenceCount: number;
  candidateItemCount: number;
  selectedEvidence: BroadsheetEvidenceCandidate | null;
  evidenceCandidates: BroadsheetEvidenceCandidate[];
};

type BroadsheetRow = {
  studentId: string;
  name: string;
  sex: string;
  cells: BroadsheetCell[];
  rawTotal: number;
  rawMaxTotal: number;
  weightedTotal: number;
  totalPercent: number | null;
  grade: string | null;
  gradeLabel: string | null;
  remark: string | null;
  position: number | null;
  missingRequiredCount: number;
  missingOptionalCount: number;
  complete: boolean;
};

type BroadsheetComponent = {
  code: string;
  label: string;
  kind: string;
  maxScore: number;
  weightPercent: number;
  required: boolean;
  orderIndex: number;
  itemId: string | null;
  itemTitle: string | null;
  itemStatus: string | null;
  itemCount: number;
};

type BroadsheetReadiness = {
  status: "READY" | "BLOCKED";
  score: number;
  learnerCount: number;
  componentCount: number;
  requiredComponentCount: number;
  totalRequiredCells: number;
  missingRequiredCells: number;
  missingOptionalCells: number;
  blockedReasons: string[];
};

type SubjectBroadsheet = {
  subject: string;
  components: BroadsheetComponent[];
  rows: BroadsheetRow[];
  readiness: BroadsheetReadiness;
};

type BroadsheetOk = {
  ok: true;
  classroom: ClassroomPick | null;
  term: string;
  academicYear: string;
  access: {
    scopeSource?: string | null;
    allowedSubjects?: string[] | null;
  };
  policy: {
    id: string | null;
    name: string;
    levelBand: string;
    gradeScale: GradeScale[];
    components: PolicyComponent[];
  };
  broadsheets: SubjectBroadsheet[];
  readiness: {
    status: "READY" | "BLOCKED";
    subjectCount: number;
    blockedSubjectCount: number;
    learnerCount: number;
    score: number;
    blockedReasons: string[];
  };
};

type BroadsheetErr = {
  ok: false;
  error: string;
};

type BroadsheetResponse = BroadsheetOk | BroadsheetErr;

type Props = {
  classroomId: string;
  term: string;
  academicYear: string;
  subjectOptions: string[];
  currentSubject: string;
  onCreateEvidenceItem?: (args: CreateEvidenceItemArgs) => void;
};

type CreateEvidenceItemArgs = {
  subject: string;
  componentCode: string;
  componentLabel: string;
  maxScore: number;
  weightPercent: number;
  required: boolean;
};

type ComponentStats = {
  scoredCells: number;
  missingCells: number;
  requiredMissingCells: number;
  totalCells: number;
  hasMultipleItems: boolean;
  hasMultipleScoredEvidence: boolean;
  complete: boolean;
};

const card =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const panel = "rounded-2xl border border-white/10 bg-[#08111C]/85";
const input =
  "rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-[12px] text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20";
const button =
  "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] font-semibold text-[#F7F4ED] transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50";

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function subjectKey(v: unknown) {
  return clean(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function sameSubject(a: unknown, b: unknown) {
  return subjectKey(a) === subjectKey(b);
}

function safeJson<T>(raw: unknown): T | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as T;
}

function formatPct(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${Number(v).toFixed(1)}%`;
}

function formatScore(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return Number(v).toFixed(1).replace(/\.0$/, "");
}

function readinessClass(status: string) {
  return status === "READY"
    ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-100"
    : "border-amber-300/20 bg-amber-400/12 text-amber-100";
}

function cellClass(cell: BroadsheetCell) {
  if (cell.missing) return "bg-amber-400/10 text-amber-100";
  if (cell.readonly) return "bg-indigo-400/10 text-indigo-100";
  return "bg-white/[0.03] text-[#F7F4ED]";
}

function itemStatusChip(status: string | null | undefined) {
  const s = clean(status).toUpperCase();

  if (s === "LOCKED") {
    return {
      label: "LOCKED",
      className: "border-rose-300/20 bg-rose-400/12 text-rose-100",
    };
  }

  if (s === "PUBLISHED") {
    return {
      label: "PUBLISHED",
      className: "border-amber-300/20 bg-amber-400/12 text-amber-100",
    };
  }

  if (s === "DRAFT") {
    return {
      label: "DRAFT",
      className: "border-emerald-300/20 bg-emerald-400/12 text-emerald-100",
    };
  }

  return {
    label: "NO ITEM",
    className: "border-white/10 bg-white/[0.04] text-[#AEB6C4]",
  };
}

function componentCells(sheet: SubjectBroadsheet, componentCode: string) {
  return sheet.rows
    .map((row) => row.cells.find((cell) => cell.componentCode === componentCode))
    .filter((cell): cell is BroadsheetCell => !!cell);
}

function componentStats(
  sheet: SubjectBroadsheet,
  component: BroadsheetComponent
): ComponentStats {
  const cells = componentCells(sheet, component.code);
  const missingCells = cells.filter((cell) => cell.missing).length;
  const scoredCells = cells.length - missingCells;
  const hasMultipleScoredEvidence = cells.some(
    (cell) => cell.evidenceCandidates.length > 1
  );

  return {
    scoredCells,
    missingCells,
    requiredMissingCells: component.required ? missingCells : 0,
    totalCells: cells.length,
    hasMultipleItems: Number(component.itemCount ?? 0) > 1,
    hasMultipleScoredEvidence,
    complete: component.required
      ? Number(component.itemCount ?? 0) > 0 && missingCells === 0
      : Number(component.itemCount ?? 0) > 0 && missingCells === 0,
  };
}

function componentToneClass(component: BroadsheetComponent, stats: ComponentStats) {
  if (component.required && Number(component.itemCount ?? 0) === 0) {
    return "border-rose-300/20 bg-rose-400/10";
  }

  if (component.required && stats.missingCells > 0) {
    return "border-amber-300/20 bg-amber-400/10";
  }

  if (stats.complete) {
    return "border-emerald-300/20 bg-emerald-400/10";
  }

  return "border-white/10 bg-white/[0.04]";
}

function componentAction(component: BroadsheetComponent, stats: ComponentStats) {
  if (component.required && Number(component.itemCount ?? 0) === 0) {
    return `Create ${component.label} evidence item.`;
  }

  if (Number(component.itemCount ?? 0) === 0) {
    return "Optional component has no item yet.";
  }

  if (stats.missingCells > 0) {
    return `Enter ${stats.missingCells} missing learner score${
      stats.missingCells === 1 ? "" : "s"
    }.`;
  }

  if (stats.hasMultipleScoredEvidence) {
    return "Multiple scored evidences found. Highest normalized evidence is selected.";
  }

  if (stats.hasMultipleItems) {
    return "Multiple items exist. Representative item is shown; learner cells show selected evidence.";
  }

  return "Complete.";
}

function componentStatusLabel(component: BroadsheetComponent, stats: ComponentStats) {
  if (component.required && Number(component.itemCount ?? 0) === 0) return "Missing item";
  if (stats.missingCells > 0) return "Needs scores";
  if (stats.complete) return "Complete";
  if (!component.required && Number(component.itemCount ?? 0) === 0) return "Optional";
  return "Review";
}

function selectedCandidateMark(
  candidate: BroadsheetEvidenceCandidate,
  selected: BroadsheetEvidenceCandidate | null
) {
  return selected?.itemId === candidate.itemId ? "✓" : "•";
}

function EvidenceTrace(props: {
  cell: BroadsheetCell;
  component: BroadsheetComponent | undefined;
  compact?: boolean;
}) {
  const { cell, component, compact } = props;
  const selected = cell.selectedEvidence;

  if (cell.missing) {
    return (
      <div className="mt-1 space-y-0.5 text-[10px] leading-relaxed text-[#8F98A8]">
        <div>
          {cell.candidateItemCount > 0
            ? `${cell.candidateItemCount} item${
                cell.candidateItemCount === 1 ? "" : "s"
              } exist, but this learner has no saved score.`
            : "No assessment item feeds this component yet."}
        </div>
        {component?.required ? (
          <div className="font-semibold text-amber-100">Required for readiness.</div>
        ) : (
          <div>Optional component.</div>
        )}
      </div>
    );
  }

  if (!selected) {
    return null;
  }

  return (
    <div className="mt-1 space-y-0.5 text-[10px] leading-relaxed text-[#8F98A8]">
      <div>
        Raw:{" "}
        <span className="font-semibold text-[#F7F4ED]">
          {formatScore(selected.score)} / {formatScore(selected.maxScore)}
        </span>
      </div>
      <div>
        Normalized:{" "}
        <span className="font-semibold text-[#F7F4ED]">
          {formatScore(selected.normalizedScore)} / {formatScore(cell.maxScore)}
        </span>
      </div>
      <div>
        Weighted:{" "}
        <span className="font-semibold text-[#F7F4ED]">
          {formatScore(selected.weightedScore)} / {formatScore(cell.weightPercent)}
        </span>
      </div>

      {selected.comment ? (
        <div className="text-[#AEB6C4]">Comment: {selected.comment}</div>
      ) : null}

      {cell.evidenceCount > 1 ? (
        <div className="font-semibold text-indigo-100">
          Selected highest of {cell.evidenceCount} scored evidences.
        </div>
      ) : null}

      {!compact && cell.evidenceCandidates.length > 1 ? (
        <details className="mt-1 rounded-lg border border-white/10 bg-black/10 px-2 py-1 text-left">
          <summary className="cursor-pointer text-[10px] font-semibold text-[#C9CDD6]">
            Candidate trace
          </summary>

          <div className="mt-1 space-y-1">
            {cell.evidenceCandidates.slice(0, 4).map((candidate) => {
              const chip = itemStatusChip(candidate.itemStatus);

              return (
                <div
                  key={candidate.itemId}
                  className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[#C9CDD6]">
                      {selectedCandidateMark(candidate, selected)} {candidate.itemTitle}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${chip.className}`}
                    >
                      {chip.label}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[#8F98A8]">
                    Raw {formatScore(candidate.score)}/{formatScore(candidate.maxScore)}
                    {" • "}Norm {formatScore(candidate.normalizedScore)}
                    {" • "}W {formatScore(candidate.weightedScore)}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export default function AssessmentBroadsheetPanel(props: Props) {
  const {
  classroomId,
  term,
  academicYear,
  subjectOptions,
  currentSubject,
  onCreateEvidenceItem,
} = props;

  const [subject, setSubject] = useState("");
  const [data, setData] = useState<BroadsheetOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [learnerQuery, setLearnerQuery] = useState("");

  useEffect(() => {
    setSubject((prev) => {
      const current = clean(currentSubject);

      if (current) {
        const matchedCurrent =
          subjectOptions.find((s) => sameSubject(s, current)) || current;

        if (!sameSubject(prev, matchedCurrent)) {
          return matchedCurrent;
        }

        return prev || matchedCurrent;
      }

      if (prev && subjectOptions.some((s) => sameSubject(s, prev))) {
        return subjectOptions.find((s) => sameSubject(s, prev)) || prev;
      }

      return subjectOptions[0] ?? "";
    });
  }, [currentSubject, subjectOptions]);

  async function loadBroadsheet() {
    if (!classroomId) {
      setData(null);
      setError("No classroom selected.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        classroomId,
        term,
        academicYear,
      });

      if (clean(subject)) params.set("subject", clean(subject));

      const res = await fetch(`/api/teacher/assessment/broadsheet?${params.toString()}`, {
        cache: "no-store",
      });

      const raw = await res.json().catch(() => null);
      const json = safeJson<BroadsheetResponse>(raw);

      if (!json) {
        setData(null);
        setError(`Invalid broadsheet response. HTTP ${res.status}`);
        return;
      }

      if (!res.ok || !json.ok) {
        setData(null);
        setError(
          (json as BroadsheetErr).error ||
            `Failed to load broadsheet. HTTP ${res.status}`
        );
        return;
      }

      setData(json);
    } catch {
      setData(null);
      setError("Failed to load broadsheet.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBroadsheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId, term, academicYear, subject]);

  const sheet =
    data?.broadsheets?.find((s) => sameSubject(s.subject, subject)) ??
    data?.broadsheets?.[0] ??
    null;

  const filteredRows = useMemo(() => {
    const q = clean(learnerQuery).toLowerCase();
    const rows = sheet?.rows ?? [];
    if (!q) return rows;
    return rows.filter((row) => clean(row.name).toLowerCase().includes(q));
  }, [sheet, learnerQuery]);

  const componentSummaries = useMemo(() => {
    if (!sheet) return [];

    return sheet.components.map((component) => ({
      component,
      stats: componentStats(sheet, component),
    }));
  }, [sheet]);

  const actionItems = useMemo(() => {
    if (!sheet) return [];

    const actions: string[] = [];

    for (const { component, stats } of componentSummaries) {
      if (component.required && Number(component.itemCount ?? 0) === 0) {
        actions.push(`Missing ${component.label}: create assessment item.`);
        continue;
      }

      if (component.required && stats.missingCells > 0) {
        actions.push(
          `${component.label}: enter ${stats.missingCells} missing learner score${
            stats.missingCells === 1 ? "" : "s"
          }.`
        );
      }
    }

    if (sheet.readiness.missingRequiredCells > 0) {
      actions.push(
        `${sheet.readiness.missingRequiredCells} required learner score cell${
          sheet.readiness.missingRequiredCells === 1 ? "" : "s"
        } still block readiness.`
      );
    }

    if (actions.length === 0 && sheet.readiness.status === "READY") {
      actions.push("All required evidence is ready for review.");
    }

    return Array.from(new Set(actions));
  }, [sheet, componentSummaries]);

  return (
    <div className={card}>
      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-semibold text-[#F7F4ED]">Broadsheet view</div>
          <div className="mt-1 text-[11px] text-[#AEB6C4]">
            Teacher working broadsheet: DRAFT scores are visible here. Final report release
            governance can apply stricter publish/lock rules later.
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={input}
          >
            {subjectOptions.length === 0 ? (
              <option value="">No subject</option>
            ) : (
              subjectOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))
            )}
          </select>

          <button
            type="button"
            onClick={loadBroadsheet}
            disabled={loading}
            className={button}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {error ? (
          <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-[12px] text-rose-100">
            {error}
          </div>
        ) : null}

        {loading && !data ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-6 text-sm text-[#C9CDD6]">
            Loading broadsheet…
          </div>
        ) : null}

        {data ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <MiniStat
                label="Overall readiness"
                value={`${data.readiness.score}%`}
                tone={data.readiness.status}
              />
              <MiniStat
                label="Subjects"
                value={String(data.readiness.subjectCount)}
                tone="NEUTRAL"
              />
              <MiniStat
                label="Learners"
                value={String(data.readiness.learnerCount)}
                tone="NEUTRAL"
              />
              <MiniStat label="Policy" value={data.policy.levelBand} tone="NEUTRAL" />
            </div>

            <div className={panel + " p-3"}>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[12px] font-semibold text-[#F7F4ED]">
                    {sheet?.subject || subject || "Subject"}
                  </div>
                  {subject && sheet?.subject && !sameSubject(subject, sheet.subject) ? (
                    <div className="mt-1 text-[10px] text-amber-100">
                      Showing {sheet.subject} because no broadsheet was returned for{" "}
                      {subject}.
                    </div>
                  ) : null}
                  <div className="mt-0.5 text-[11px] text-[#AEB6C4]">
                    Policy: {data.policy.name} • {term} • {academicYear}
                  </div>
                </div>

                <span
                  className={[
                    "inline-flex w-fit rounded-full border px-3 py-1 text-[11px] font-semibold",
                    readinessClass(sheet?.readiness.status ?? data.readiness.status),
                  ].join(" ")}
                >
                  {sheet?.readiness.status ?? data.readiness.status}{" "}
                  {sheet?.readiness.score ?? data.readiness.score}%
                </span>
              </div>

              {sheet ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <MiniStat
                    label="Required cells"
                    value={String(sheet.readiness.totalRequiredCells)}
                    tone="NEUTRAL"
                  />
                  <MiniStat
                    label="Missing required"
                    value={String(sheet.readiness.missingRequiredCells)}
                    tone={sheet.readiness.missingRequiredCells > 0 ? "BLOCKED" : "READY"}
                  />
                  <MiniStat
                    label="Missing optional"
                    value={String(sheet.readiness.missingOptionalCells)}
                    tone="NEUTRAL"
                  />
                  <MiniStat
                    label="Required components"
                    value={String(sheet.readiness.requiredComponentCount)}
                    tone="NEUTRAL"
                  />
                </div>
              ) : null}

              {(sheet?.readiness.blockedReasons?.length ?? 0) > 0 ? (
                <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/12 px-3 py-2 text-[11px] text-amber-100">
                  <div className="font-semibold">Readiness blockers</div>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {(sheet?.readiness.blockedReasons ?? []).slice(0, 6).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {sheet ? (
              <>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.65fr)]">
                  <div className={panel + " p-3"}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[12px] font-semibold text-[#F7F4ED]">
                          Component evidence map
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#AEB6C4]">
                          Shows which assessment item feeds each required component.
                        </div>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-[#C9CDD6]">
                        {sheet.components.length} components
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {componentSummaries.map(({ component, stats }) => {
                        const chip = itemStatusChip(component.itemStatus);

                        return (
                          <div
                            key={component.code}
                            className={
                              "rounded-2xl border px-3 py-3 " +
                              componentToneClass(component, stats)
                            }
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[12px] font-semibold text-[#F7F4ED]">
                                    {component.label}
                                  </span>
                                  {component.required ? (
                                    <span className="rounded-full border border-amber-300/20 bg-amber-400/12 px-2 py-0.5 text-[9px] font-semibold text-amber-100">
                                      REQUIRED
                                    </span>
                                  ) : (
                                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold text-[#AEB6C4]">
                                      OPTIONAL
                                    </span>
                                  )}
                                </div>

                                <div className="mt-1 truncate text-[11px] text-[#C9CDD6]">
                                  {component.itemTitle || "No assessment item yet"}
                                </div>
                              </div>

                              <span
                                className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${chip.className}`}
                              >
                                {chip.label}
                              </span>
                            </div>

                            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] text-[#AEB6C4]">
                              <div>
                                <div>Items</div>
                                <div className="text-sm font-semibold text-[#F7F4ED]">
                                  {component.itemCount ?? 0}
                                </div>
                              </div>
                              <div>
                                <div>Scored</div>
                                <div className="text-sm font-semibold text-[#F7F4ED]">
                                  {stats.scoredCells}/{stats.totalCells}
                                </div>
                              </div>
                              <div>
                                <div>Weight</div>
                                <div className="text-sm font-semibold text-[#F7F4ED]">
                                  {formatScore(component.weightPercent)}%
                                </div>
                              </div>
                            </div>

                            <div className="mt-2 rounded-xl border border-white/10 bg-black/10 px-2 py-2 text-[10px] text-[#C9CDD6]">
  <div className="font-semibold text-[#F7F4ED]">
    {componentStatusLabel(component, stats)}
  </div>
  <div className="mt-0.5">{componentAction(component, stats)}</div>
</div>

{onCreateEvidenceItem && Number(component.itemCount ?? 0) === 0 ? (
  <button
    type="button"
    onClick={() =>
      onCreateEvidenceItem({
        subject: sheet.subject,
        componentCode: component.code,
        componentLabel: component.label,
        maxScore: component.maxScore,
        weightPercent: component.weightPercent,
        required: component.required,
      })
    }
    className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-[#E8C96A]/35 bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-3 py-2 text-[11px] font-semibold text-[#071A3D] shadow-[0_12px_34px_rgba(212,175,55,0.18)] transition hover:brightness-105"
  >
    Create {component.label}
  </button>
) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className={panel + " p-3"}>
                    <div className="text-[12px] font-semibold text-[#F7F4ED]">
                      Next action map
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#AEB6C4]">
                      What the teacher must fix before the broadsheet is trusted.
                    </div>

                    <div className="mt-3 space-y-2">
                      {actionItems.slice(0, 8).map((action) => (
                        <div
                          key={action}
                          className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-[#C9CDD6]"
                        >
                          {action}
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 rounded-xl border border-indigo-300/20 bg-indigo-400/12 px-3 py-2 text-[11px] text-indigo-100">
                      DRAFT items count for teacher working readiness. Final parent/report
                      release can later demand PUBLISHED or LOCKED evidence.
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="text-[11px] text-[#C9CDD6]">
                    Showing{" "}
                    <span className="font-semibold text-[#F7F4ED]">
                      {filteredRows.length}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-[#F7F4ED]">
                      {sheet?.rows.length ?? 0}
                    </span>{" "}
                    learners
                  </div>

                  <input
                    value={learnerQuery}
                    onChange={(e) => setLearnerQuery(e.target.value)}
                    placeholder="Search learner…"
                    className={input + " md:w-72"}
                  />
                </div>
              </>
            ) : null}

            {!sheet ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.04] px-4 py-6 text-center text-[12px] text-[#C9CDD6]">
                No broadsheet returned for this subject.
              </div>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {filteredRows.map((row) => (
                    <div key={row.studentId} className={panel + " p-3"}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[#F7F4ED]">
                            {row.name}
                          </div>
                          <div className="text-[11px] text-[#AEB6C4]">
                            Position: {row.position ?? "—"} • Grade: {row.grade ?? "—"}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[10px] text-[#8F98A8]">Total</div>
                          <div className="text-sm font-semibold text-[#F7F4ED]">
                            {formatPct(row.totalPercent)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2">
                        {row.cells.map((cell) => {
                          const component = sheet.components.find(
                            (c) => c.code === cell.componentCode
                          );
                          const selected = cell.selectedEvidence;
                          const chip = itemStatusChip(
                            selected?.itemStatus ?? component?.itemStatus ?? null
                          );

                          return (
                            <div
                              key={cell.componentCode}
                              className={"rounded-xl border border-white/10 px-3 py-2 " + cellClass(cell)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="text-[10px] font-semibold">
                                    {component?.label ?? cell.componentCode}
                                  </div>
                                  <div className="mt-1 text-sm font-semibold">
                                    {cell.missing
                                      ? "Missing"
                                      : `${formatScore(cell.score)} / ${formatScore(
                                          cell.maxScore
                                        )}`}
                                  </div>
                                </div>

                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${chip.className}`}
                                >
                                  {chip.label}
                                </span>
                              </div>

                              {selected ? (
                                <div className="mt-1 truncate text-[10px] text-[#AEB6C4]">
                                  Item: {selected.itemTitle}
                                </div>
                              ) : component?.itemTitle ? (
                                <div className="mt-1 truncate text-[10px] text-[#AEB6C4]">
                                  Item: {component.itemTitle}
                                </div>
                              ) : null}

                              <EvidenceTrace cell={cell} component={component} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className={panel + " hidden overflow-hidden md:block"}>
                  <div className="max-h-[620px] overflow-auto">
                    <table className="min-w-full border-separate border-spacing-0 text-sm">
                      <thead className="sticky top-0 z-10 bg-[#0B1422] text-[#C9CDD6]">
                        <tr>
                          <th className="border-b border-white/10 px-4 py-3 text-left font-semibold">
                            Learner
                          </th>

                          {sheet.components.map((component) => {
                            const stats = componentStats(sheet, component);
                            const chip = itemStatusChip(component.itemStatus);

                            return (
                              <th
                                key={component.code}
                                className="min-w-[190px] border-b border-white/10 px-3 py-3 text-center font-semibold"
                              >
                                <div>{component.label}</div>
                                <div className="mt-0.5 text-[10px] font-normal text-[#8F98A8]">
                                  {component.weightPercent}% • Max {component.maxScore}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${chip.className}`}
                                  >
                                    {chip.label}
                                  </span>
                                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold text-[#AEB6C4]">
                                    {stats.scoredCells}/{stats.totalCells} scored
                                  </span>
                                </div>
                                <div className="mt-1 truncate text-[10px] font-normal text-[#8F98A8]">
                                  {component.itemTitle || "No item"}
                                </div>
                              </th>
                            );
                          })}

                          <th className="border-b border-white/10 px-3 py-3 text-center font-semibold">
                            Total
                          </th>
                          <th className="border-b border-white/10 px-3 py-3 text-center font-semibold">
                            Grade
                          </th>
                          <th className="border-b border-white/10 px-3 py-3 text-center font-semibold">
                            Position
                          </th>
                          <th className="border-b border-white/10 px-3 py-3 text-center font-semibold">
                            Missing
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredRows.map((row, idx) => (
                          <tr
                            key={row.studentId}
                            className={idx % 2 ? "bg-white/[0.03]" : "bg-transparent"}
                          >
                            <td className="sticky left-0 z-[1] border-b border-white/10 bg-[#08111C] px-4 py-3 align-top">
                              <div className="font-semibold text-[#F7F4ED]">{row.name}</div>
                              <div className="text-[11px] text-[#8F98A8]">
                                {row.sex || "—"} •{" "}
                                {row.complete ? "Complete" : "Incomplete"}
                              </div>
                            </td>

                            {row.cells.map((cell) => {
                              const component = sheet.components.find(
                                (c) => c.code === cell.componentCode
                              );
                              const selected = cell.selectedEvidence;
                              const chip = itemStatusChip(
                                selected?.itemStatus ?? component?.itemStatus ?? null
                              );

                              return (
                                <td
                                  key={`${row.studentId}-${cell.componentCode}`}
                                  className="border-b border-white/10 px-3 py-3 text-center align-top"
                                >
                                  <div
                                    className={
                                      "rounded-lg px-2 py-1 text-[12px] font-semibold " +
                                      cellClass(cell)
                                    }
                                  >
                                    {cell.missing
                                      ? "Missing"
                                      : `${formatScore(cell.score)} / ${formatScore(
                                          cell.maxScore
                                        )}`}
                                  </div>

                                  <div className="mt-1 flex justify-center">
                                    <span
                                      className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${chip.className}`}
                                    >
                                      {chip.label}
                                    </span>
                                  </div>

                                  {selected ? (
                                    <div className="mt-1 truncate text-[10px] text-[#AEB6C4]">
                                      {selected.itemTitle}
                                    </div>
                                  ) : null}

                                  <EvidenceTrace cell={cell} component={component} />
                                </td>
                              );
                            })}

                            <td className="border-b border-white/10 px-3 py-3 text-center align-top font-semibold text-[#F7F4ED]">
                              {formatPct(row.totalPercent)}
                              <div className="mt-1 text-[10px] font-normal text-[#8F98A8]">
                                W: {formatScore(row.weightedTotal)}
                              </div>
                            </td>

                            <td className="border-b border-white/10 px-3 py-3 text-center align-top">
                              <div className="font-semibold text-[#F7F4ED]">
                                {row.grade ?? "—"}
                              </div>
                              <div className="text-[10px] text-[#8F98A8]">
                                {row.gradeLabel ?? row.remark ?? ""}
                              </div>
                            </td>

                            <td className="border-b border-white/10 px-3 py-3 text-center align-top font-semibold text-[#F7F4ED]">
                              {row.position ?? "—"}
                            </td>

                            <td className="border-b border-white/10 px-3 py-3 text-center align-top">
                              {row.missingRequiredCount > 0 ? (
                                <span className="rounded-full border border-amber-300/20 bg-amber-400/12 px-2 py-1 text-[11px] font-semibold text-amber-100">
                                  {row.missingRequiredCount}
                                </span>
                              ) : (
                                <span className="rounded-full border border-emerald-300/20 bg-emerald-400/12 px-2 py-1 text-[11px] font-semibold text-emerald-100">
                                  0
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function MiniStat(props: {
  label: string;
  value: string;
  tone: "READY" | "BLOCKED" | "NEUTRAL";
}) {
  const tone =
    props.tone === "READY"
      ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-100"
      : props.tone === "BLOCKED"
        ? "border-amber-300/20 bg-amber-400/12 text-amber-100"
        : "border-white/10 bg-white/[0.04] text-[#C9CDD6]";

  return (
    <div className={"rounded-2xl border px-3 py-3 " + tone}>
      <div className="text-[11px] font-semibold">{props.label}</div>
      <div className="mt-1 text-xl font-semibold text-[#F7F4ED]">
        {props.value}
      </div>
    </div>
  );
}