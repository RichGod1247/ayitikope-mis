// src/components/parent/ParentMockReadinessClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type ChildRow = {
  id: string;
  name: string;
  classroomId: string | null;
  classroomName: string | null;
};

type ReleaseStatus = {
  ok: boolean;
  released: boolean;
  student?: {
    id: string;
    name: string;
    classroomId: string | null;
    classroom?: {
      id: string;
      name: string | null;
      grade: string | null;
      arm: string | null;
    } | null;
  };
  latestRelease?: {
    id: string;
    mockExamSessionId: string;
    academicYear: string;
    term: string | null;
    mockNumber: number;
    mockLabel: string;
    title: string;
    readinessStatus: string;
    readinessScore: number;
    parentVisible: boolean;
    releasedAt: string;
    releasedByName: string | null;
    releaseSnapshotHash: string;
    smsNotifiedAt: string | null;
  } | null;
  releases?: ReleaseStatus["latestRelease"][];
  error?: string;
  message?: string;
};

type SubjectScore = {
  subject: string;
  canonicalSubject?: string;
  score: number | null;
  grade: number | null;
  gradeLabel: string | null;
  remark: string | null;
  nextGrade?: number | null;
  pointsToNextGrade?: number | null;
};

type ReadinessResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  release?: {
    id: string;
    releasedAt: string;
    releasedByName: string | null;
    readinessStatus: string;
    readinessScore: number;
    releaseSnapshotHash: string;
    releaseMode: string | null;
    smsNotifiedAt: string | null;
  };
  session?: {
    id: string;
    academicYear: string;
    term: string | null;
    mockNumber: number;
    mockLabel: string;
    title: string;
  };
  student?: {
    id: string;
    name: string;
    classroom?: {
      id: string;
      name: string | null;
      grade: string | null;
      arm: string | null;
    } | null;
  };
  summary?: {
    classAverageScore: number | null;
    classAveragePlacementAggregate: number | null;
    classPlacementReadyCount: number;
    classTotalStudents: number;
    completionPercent: number;
  };
  readiness?: {
    raw: {
      code: string;
      label: string;
      action: string;
    };
    parent: {
      code: string;
      label: string;
      message: string;
      homeSupport: string;
    };
  };
  aggregates?: {
    school: {
      ok: boolean;
      aggregate: number | null;
      missingSubjects: string[];
      usedSubjects?: string[];
    };
    placement: {
      ok: boolean;
      aggregate: number | null;
      missingSubjects: string[];
      usedSubjects?: string[];
      selectedElectives?: string[];
    };
  };
  scores?: {
    averageScore: number | null;
    scoredSubjectCount: number;
    missingSubjectCount: number;
    subjects: SubjectScore[];
  };
  strongestSubjects?: SubjectScore[];
  weakestSubjects?: SubjectScore[];
  parentHomeSupport?: string;
  recommendedAction?: string;
};

const shellCard =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const panelCard = "rounded-2xl border border-white/10 bg-[#08111C]/85";
const softPanel = "rounded-2xl border border-white/10 bg-white/[0.04]";
const darkInput =
  "w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-[12px] text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20";
const darkButton =
  "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-semibold text-[#F7F4ED] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";

function cleanStr(value: unknown) {
  return String(value ?? "").trim();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatNumber(value: number | null | undefined, suffix = "") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return `${n.toFixed(Number.isInteger(n) ? 0 : 1)}${suffix}`;
}

function safeArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function childName(row: any) {
  return (
    cleanStr(row?.name) ||
    cleanStr(row?.studentName) ||
    cleanStr(row?.fullName) ||
    [row?.firstName, row?.lastName].filter(Boolean).join(" ").trim() ||
    cleanStr(row?.student?.name) ||
    [row?.student?.firstName, row?.student?.lastName].filter(Boolean).join(" ").trim() ||
    "Learner"
  );
}

function normalizeChild(row: any): ChildRow | null {
  const id =
    cleanStr(row?.id) ||
    cleanStr(row?.studentId) ||
    cleanStr(row?.student?.id);

  if (!id) return null;

  const classroom = row?.classroom ?? row?.student?.classroom ?? null;

  return {
    id,
    name: childName(row),
    classroomId:
      cleanStr(row?.classroomId) ||
      cleanStr(row?.student?.classroomId) ||
      cleanStr(classroom?.id) ||
      null,
    classroomName:
      cleanStr(classroom?.name) ||
      cleanStr(row?.classroomName) ||
      cleanStr(row?.className) ||
      null,
  };
}

function flattenCandidates(value: unknown, out: any[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenCandidates(item, out);
    return out;
  }

  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;

    const hasStudentShape =
      row.id ||
      row.studentId ||
      (row.student && typeof row.student === "object");

    const hasNameShape =
      row.name ||
      row.studentName ||
      row.fullName ||
      row.firstName ||
      row.lastName ||
      row.student;

    if (hasStudentShape && hasNameShape) out.push(row);

    for (const key of [
      "children",
      "students",
      "data",
      "items",
      "rows",
      "results",
      "wards",
    ]) {
      if (key in row) flattenCandidates(row[key], out);
    }
  }

  return out;
}

function readinessClass(code: string) {
  const c = cleanStr(code).toUpperCase();

  if (["STRONG", "GOOD", "READY", "COMPETITIVE"].some((x) => c.includes(x))) {
    return "border-emerald-300/20 bg-emerald-400/12 text-emerald-100";
  }

  if (["SUPPORT", "RISK", "CRITICAL"].some((x) => c.includes(x))) {
    return "border-rose-300/20 bg-rose-400/12 text-rose-100";
  }

  if (["INCOMPLETE", "MONITOR", "DEVELOPING"].some((x) => c.includes(x))) {
    return "border-amber-300/20 bg-amber-400/12 text-amber-100";
  }

  return "border-white/10 bg-white/[0.04] text-[#C9CDD6]";
}

function MetricCard(props: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className={softPanel + " p-4"}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-[#8F98A8]">
        {props.label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-[#F7F4ED]">
        {props.value}
      </div>
      {props.hint ? (
        <div className="mt-1 text-[11px] text-[#AEB6C4]">{props.hint}</div>
      ) : null}
    </div>
  );
}

function SectionCard(props: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={shellCard}>
      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-semibold text-[#F7F4ED]">
            {props.title}
          </div>
          {props.subtitle ? (
            <div className="mt-0.5 text-[11px] text-[#AEB6C4]">
              {props.subtitle}
            </div>
          ) : null}
        </div>
        {props.right ? <div className="shrink-0">{props.right}</div> : null}
      </div>
      <div className="px-4 py-4">{props.children}</div>
    </div>
  );
}

async function readJson(res: Response) {
  return res.json().catch(() => null);
}

export default function ParentMockReadinessClient() {
  const searchParams = useSearchParams();
  const initialStudentId = cleanStr(searchParams.get("studentId"));

  const [children, setChildren] = useState<ChildRow[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId);
  const [loadingChildren, setLoadingChildren] = useState(true);

  const [releaseStatus, setReleaseStatus] = useState<ReleaseStatus | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);

  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedChild = useMemo(
    () => children.find((child) => child.id === selectedStudentId) ?? null,
    [children, selectedStudentId],
  );

  async function loadChildren() {
    setLoadingChildren(true);
    setError(null);

    const urls = [
      "/api/parent/my-children/list",
      "/api/parent/children",
      "/api/parents/my-children/list",
    ];

    const map = new Map<string, ChildRow>();

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          credentials: "include",
          cache: "no-store",
        });

        const json = await readJson(res);

        if (!res.ok || !json) continue;

        for (const raw of flattenCandidates(json)) {
          const child = normalizeChild(raw);
          if (child?.id) map.set(child.id, child);
        }
      } catch {
        // Try the next known parent child endpoint.
      }
    }

    const rows = Array.from(map.values());

    setChildren(rows);

    if (!selectedStudentId && rows[0]?.id) {
      setSelectedStudentId(rows[0].id);
    }

    setLoadingChildren(false);
  }

  async function loadReadiness(studentId: string) {
    if (!studentId) return;

    setLoadingReadiness(true);
    setError(null);
    setReleaseStatus(null);
    setReadiness(null);

    try {
      const releaseRes = await fetch(
        `/api/parent/assessment/mock/release-status?studentId=${encodeURIComponent(
          studentId,
        )}`,
        { credentials: "include", cache: "no-store" },
      );

      const releaseJson = (await readJson(releaseRes)) as ReleaseStatus | null;

      if (!releaseRes.ok || !releaseJson?.ok) {
        setError(
          releaseJson?.message ||
            releaseJson?.error ||
            `Failed to load Mock release status. HTTP ${releaseRes.status}`,
        );
        return;
      }

      setReleaseStatus(releaseJson);

      if (!releaseJson.released || !releaseJson.latestRelease) {
        setError(
          "No released Mock readiness is available for this learner yet.",
        );
        return;
      }

      const readinessRes = await fetch(
        `/api/parent/assessment/mock/readiness?studentId=${encodeURIComponent(
          studentId,
        )}&sessionId=${encodeURIComponent(
          releaseJson.latestRelease.mockExamSessionId,
        )}`,
        { credentials: "include", cache: "no-store" },
      );

      const readinessJson = (await readJson(readinessRes)) as ReadinessResponse | null;

      if (!readinessRes.ok || !readinessJson?.ok) {
        setError(
          readinessJson?.message ||
            readinessJson?.error ||
            `Failed to load Mock readiness. HTTP ${readinessRes.status}`,
        );
        return;
      }

      setReadiness(readinessJson);
    } catch {
      setError("Failed to load Mock readiness.");
    } finally {
      setLoadingReadiness(false);
    }
  }

  useEffect(() => {
    void loadChildren();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedStudentId) {
      void loadReadiness(selectedStudentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId]);

  return (
    <div className="space-y-5">
      <SectionCard
        title="Learner selection"
        subtitle="Only children linked to your verified parent phone can load Mock readiness."
        right={
          <button
            type="button"
            onClick={() => loadChildren()}
            disabled={loadingChildren}
            className={darkButton}
          >
            {loadingChildren ? "Refreshing..." : "Refresh children"}
          </button>
        }
      >
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#AEB6C4]">
              Child
            </label>

            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className={darkInput}
            >
              <option value="">Select child</option>
              {children.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.name}
                  {child.classroomName ? ` • ${child.classroomName}` : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={!selectedStudentId || loadingReadiness}
            onClick={() => loadReadiness(selectedStudentId)}
            className={darkButton}
          >
            {loadingReadiness ? "Loading..." : "Load readiness"}
          </button>
        </div>

        {!loadingChildren && children.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-[12px] text-amber-100">
            No linked child was found for this parent session. Confirm the
            guardian phone on the learner profile.
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-[12px] text-rose-100">
            {error}
          </div>
        ) : null}
      </SectionCard>

      {!readiness ? (
        <div className={shellCard + " px-5 py-12 text-center text-sm text-[#AEB6C4]"}>
          {loadingReadiness
            ? "Loading released Mock readiness..."
            : selectedChild
              ? "Select Load readiness to view the released Mock report."
              : "Select a child to begin."}
        </div>
      ) : (
        <>
          <SectionCard
            title={readiness.student?.name ?? selectedChild?.name ?? "Learner"}
            subtitle={`${readiness.session?.title ?? "Released Mock"} • Released ${formatDateTime(
              readiness.release?.releasedAt,
            )}`}
            right={
              <span
                className={[
                  "inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold",
                  readinessClass(readiness.readiness?.parent.code ?? ""),
                ].join(" ")}
              >
                {readiness.readiness?.parent.label ?? "Readiness"}
              </span>
            }
          >
            <div className="grid gap-3 md:grid-cols-4">
              <MetricCard
                label="Placement agg."
                value={
                  readiness.aggregates?.placement.aggregate ?? "Incomplete"
                }
                hint="English, Maths, Science, Social + best two"
              />

              <MetricCard
                label="School agg."
                value={readiness.aggregates?.school.aggregate ?? "Incomplete"}
                hint="School/Excel-style aggregate"
              />

              <MetricCard
                label="Average score"
                value={formatNumber(readiness.scores?.averageScore)}
                hint={`${readiness.scores?.scoredSubjectCount ?? 0} subjects scored`}
              />

              <MetricCard
                label="Class avg. agg."
                value={formatNumber(
                  readiness.summary?.classAveragePlacementAggregate,
                )}
                hint={`${readiness.summary?.classPlacementReadyCount ?? 0}/${readiness.summary?.classTotalStudents ?? 0} placement-ready`}
              />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-[12px] leading-5 text-emerald-100">
                <div className="font-semibold">What this means</div>
                <div className="mt-1">
                  {readiness.readiness?.parent.message}
                </div>
              </div>

              <div className="rounded-2xl border border-sky-300/15 bg-sky-400/10 px-4 py-3 text-[12px] leading-5 text-sky-100">
                <div className="font-semibold">Home support</div>
                <div className="mt-1">
                  {readiness.parentHomeSupport ||
                    readiness.readiness?.parent.homeSupport}
                </div>
              </div>
            </div>

            {readiness.recommendedAction ? (
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[12px] leading-5 text-[#C9CDD6]">
                <span className="font-semibold text-[#F7F4ED]">
                  School recommendation:{" "}
                </span>
                {readiness.recommendedAction}
              </div>
            ) : null}
          </SectionCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard
              title="Strengths to protect"
              subtitle="Subjects currently giving the learner the strongest advantage."
            >
              <div className="space-y-2">
                {safeArray(readiness.strongestSubjects).length === 0 ? (
                  <div className="text-[12px] text-[#AEB6C4]">
                    No strong-subject signal available yet.
                  </div>
                ) : (
                  readiness.strongestSubjects!.map((subject) => (
                    <div
                      key={`strong:${subject.subject}`}
                      className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-[12px] text-emerald-100"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{subject.subject}</span>
                        <span>
                          {formatNumber(subject.score)} •{" "}
                          {subject.gradeLabel ?? "—"}
                        </span>
                      </div>
                      {subject.remark ? (
                        <div className="mt-1 text-emerald-100/75">
                          {subject.remark}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Support areas"
              subtitle="Subjects where small consistent support can improve the next Mock."
            >
              <div className="space-y-2">
                {safeArray(readiness.weakestSubjects).length === 0 ? (
                  <div className="text-[12px] text-[#AEB6C4]">
                    No weak-subject signal available yet.
                  </div>
                ) : (
                  readiness.weakestSubjects!.map((subject) => (
                    <div
                      key={`weak:${subject.subject}`}
                      className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-100"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{subject.subject}</span>
                        <span>
                          {formatNumber(subject.score)} •{" "}
                          {subject.gradeLabel ?? "—"}
                        </span>
                      </div>
                      {subject.pointsToNextGrade != null &&
                      subject.nextGrade != null ? (
                        <div className="mt-1 text-amber-100/75">
                          {subject.pointsToNextGrade} mark(s) to Grade{" "}
                          {subject.nextGrade}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Subject scores"
            subtitle="Released Mock scores. These are parent-visible because the headteacher has released this sealed Mock."
          >
            <div className="overflow-auto rounded-2xl border border-white/10">
              <table className="min-w-[760px] w-full border-collapse text-left text-[12px]">
                <thead className="bg-white/[0.05] text-[#AEB6C4]">
                  <tr>
                    <th className="border-b border-white/10 px-3 py-2">
                      Subject
                    </th>
                    <th className="border-b border-white/10 px-3 py-2">
                      Score
                    </th>
                    <th className="border-b border-white/10 px-3 py-2">
                      Grade
                    </th>
                    <th className="border-b border-white/10 px-3 py-2">
                      Remark
                    </th>
                    <th className="border-b border-white/10 px-3 py-2">
                      Next improvement
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {safeArray(readiness.scores?.subjects).map((subject) => (
                    <tr
                      key={`${subject.subject}:${subject.gradeLabel}`}
                      className="border-b border-white/5"
                    >
                      <td className="px-3 py-2 font-semibold text-[#F7F4ED]">
                        {subject.subject}
                      </td>
                      <td className="px-3 py-2 text-[#C9CDD6]">
                        {formatNumber(subject.score)}
                      </td>
                      <td className="px-3 py-2 text-[#C9CDD6]">
                        {subject.gradeLabel ?? formatNumber(subject.grade)}
                      </td>
                      <td className="px-3 py-2 text-[#C9CDD6]">
                        {subject.remark ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[#AEB6C4]">
                        {subject.pointsToNextGrade != null &&
                        subject.nextGrade != null
                          ? `${subject.pointsToNextGrade} mark(s) to Grade ${subject.nextGrade}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            title="Release proof"
            subtitle="This protects the school and parent by showing that the report is approved, sealed, and traceable."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className={panelCard + " p-4"}>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#8F98A8]">
                  Released by
                </div>
                <div className="mt-2 text-sm font-semibold text-[#F7F4ED]">
                  {readiness.release?.releasedByName ?? "Headteacher/Admin"}
                </div>
                <div className="mt-1 text-[11px] text-[#AEB6C4]">
                  {formatDateTime(readiness.release?.releasedAt)}
                </div>
              </div>

              <div className={panelCard + " p-4"}>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#8F98A8]">
                  Snapshot hash
                </div>
                <div className="mt-2 break-all font-mono text-[11px] text-[#F7F4ED]">
                  {readiness.release?.releaseSnapshotHash ?? "—"}
                </div>
                <div className="mt-1 text-[11px] text-[#AEB6C4]">
                  Evidence seal reference
                </div>
              </div>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}