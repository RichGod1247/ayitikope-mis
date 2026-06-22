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

export default function AssessmentBroadsheetPanel(props: Props) {
  const { classroomId, term, academicYear, subjectOptions, currentSubject } = props;

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
        setError((json as BroadsheetErr).error || `Failed to load broadsheet. HTTP ${res.status}`);
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

  return (
    <div className={card}>
      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-semibold text-[#F7F4ED]">Broadsheet view</div>
          <div className="mt-1 text-[11px] text-[#AEB6C4]">
            Read-only policy-aware totals, grades, positions, and missing-score readiness.
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
              <MiniStat
                label="Policy"
                value={data.policy.levelBand}
                tone="NEUTRAL"
              />
            </div>

            <div className={panel + " p-3"}>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[12px] font-semibold text-[#F7F4ED]">
                    {sheet?.subject || subject || "Subject"}
                  </div>
                  {subject && sheet?.subject && !sameSubject(subject, sheet.subject) ? (
  <div className="mt-1 text-[10px] text-amber-100">
    Showing {sheet.subject} because no broadsheet was returned for {subject}.
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
                  {sheet?.readiness.status ?? data.readiness.status}
                  {" "}
                  {sheet?.readiness.score ?? data.readiness.score}%
                </span>
              </div>

              {(sheet?.readiness.blockedReasons?.length ?? 0) > 0 ? (
                <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/12 px-3 py-2 text-[11px] text-amber-100">
                  <div className="font-semibold">Release blockers</div>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {(sheet?.readiness.blockedReasons ?? []).slice(0, 6).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="text-[11px] text-[#C9CDD6]">
                Showing{" "}
                <span className="font-semibold text-[#F7F4ED]">{filteredRows.length}</span>{" "}
                of{" "}
                <span className="font-semibold text-[#F7F4ED]">{sheet?.rows.length ?? 0}</span>{" "}
                learners
              </div>

              <input
                value={learnerQuery}
                onChange={(e) => setLearnerQuery(e.target.value)}
                placeholder="Search learner…"
                className={input + " md:w-72"}
              />
            </div>

            {!sheet ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.04] px-4 py-6 text-center text-[12px] text-[#C9CDD6]">
                No broadsheet returned for this subject.
              </div>
            ) : (
              <>
                <div className="md:hidden space-y-3">
                  {filteredRows.map((row) => (
                    <div key={row.studentId} className={panel + " p-3"}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[#F7F4ED]">{row.name}</div>
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

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {row.cells.map((cell) => {
                          const component = sheet.components.find((c) => c.code === cell.componentCode);
                          return (
                            <div
                              key={cell.componentCode}
                              className={"rounded-xl border border-white/10 px-3 py-2 " + cellClass(cell)}
                            >
                              <div className="text-[10px] font-semibold">
                                {component?.label ?? cell.componentCode}
                              </div>
                              <div className="mt-1 text-sm font-semibold">
                                {cell.missing ? "Missing" : `${formatScore(cell.score)} / ${formatScore(cell.maxScore)}`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className={panel + " hidden overflow-hidden md:block"}>
                  <div className="max-h-[560px] overflow-auto">
                    <table className="min-w-full border-separate border-spacing-0 text-sm">
                      <thead className="sticky top-0 z-10 bg-[#0B1422] text-[#C9CDD6]">
                        <tr>
                          <th className="border-b border-white/10 px-4 py-3 text-left font-semibold">
                            Learner
                          </th>

                          {sheet.components.map((component) => (
                            <th
                              key={component.code}
                              className="border-b border-white/10 px-3 py-3 text-center font-semibold"
                            >
                              <div>{component.label}</div>
                              <div className="mt-0.5 text-[10px] font-normal text-[#8F98A8]">
                                {component.weightPercent}% • Max {component.maxScore}
                              </div>
                            </th>
                          ))}

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
                          <tr key={row.studentId} className={idx % 2 ? "bg-white/[0.03]" : "bg-transparent"}>
                            <td className="sticky left-0 z-[1] border-b border-white/10 bg-[#08111C] px-4 py-3 align-top">
                              <div className="font-semibold text-[#F7F4ED]">{row.name}</div>
                              <div className="text-[11px] text-[#8F98A8]">
                                {row.sex || "—"} • {row.complete ? "Complete" : "Incomplete"}
                              </div>
                            </td>

                            {row.cells.map((cell) => (
                              <td
                                key={`${row.studentId}-${cell.componentCode}`}
                                className="border-b border-white/10 px-3 py-3 text-center align-top"
                              >
                                <div className={"rounded-lg px-2 py-1 text-[12px] font-semibold " + cellClass(cell)}>
                                  {cell.missing
                                    ? "Missing"
                                    : `${formatScore(cell.score)} / ${formatScore(cell.maxScore)}`}
                                </div>
                                {cell.weightedScore != null ? (
                                  <div className="mt-1 text-[10px] text-[#8F98A8]">
                                    W: {formatScore(cell.weightedScore)}
                                  </div>
                                ) : null}
                              </td>
                            ))}

                            <td className="border-b border-white/10 px-3 py-3 text-center align-top font-semibold text-[#F7F4ED]">
                              {formatPct(row.totalPercent)}
                            </td>

                            <td className="border-b border-white/10 px-3 py-3 text-center align-top">
                              <div className="font-semibold text-[#F7F4ED]">{row.grade ?? "—"}</div>
                              <div className="text-[10px] text-[#8F98A8]">{row.gradeLabel ?? row.remark ?? ""}</div>
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
      <div className="mt-1 text-xl font-semibold text-[#F7F4ED]">{props.value}</div>
    </div>
  );
}