// src/components/HeadteacherReportsClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Classroom = {
  id: string;
  name: string;
  grade?: string | null;
  arm?: string | null;
};

type Props = {
  classrooms: Classroom[];
  defaultTerm: string;
  defaultAcademicYear: string;
};

type ClassTermSummaryResponse = {
  ok: boolean;
  error?: string;
  tenantId?: string;
  classroomId?: string;
  term?: string;
  academicYear?: string;
  subjects?: string[];
  students?: {
    id: string;
    firstName: string;
    lastName: string;
    totalScore: number;
    maxTotalScore: number;
    scoresBySubject: Record<string, number>;
  }[];
  message?: string;
};

type SummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ClassTermSummaryResponse };

type StreamMode = "single" | "multi";

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeStageBucket(raw: unknown): string | null {
  const compact = cleanStr(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) return null;

  let m =
    compact.match(/^KG([12])(?:[A-Z].*)?$/) ||
    compact.match(/^KINDERGARTEN([12])(?:[A-Z].*)?$/);
  if (m) return `KG ${m[1]}`;

  m = compact.match(/^(PRIMARY|PRI|P)([1-6])(?:[A-Z].*)?$/);
  if (m) return `PRIMARY ${m[2]}`;

  m = compact.match(/^(BASIC|B)([1-9])(?:[A-Z].*)?$/);
  if (m) {
    const n = Number(m[2]);
    if (n >= 1 && n <= 6) return `PRIMARY ${n}`;
    if (n === 7) return "JHS 1";
    if (n === 8) return "JHS 2";
    if (n === 9) return "JHS 3";
  }

  m = compact.match(/^JHS([1-3])(?:[A-Z].*)?$/);
  if (m) return `JHS ${m[1]}`;

  return null;
}

function getStageBucketForClassroom(c: Classroom) {
  return normalizeStageBucket(c.grade) ?? normalizeStageBucket(c.name);
}

function hasDuplicateStageBuckets(list: Classroom[]) {
  const seen = new Set<string>();
  for (const c of list) {
    const bucket = getStageBucketForClassroom(c);
    if (!bucket) continue;
    if (seen.has(bucket)) return true;
    seen.add(bucket);
  }
  return false;
}

function fullClassLabel(c: Classroom) {
  const name = cleanStr(c.name);
  const grade = cleanStr(c.grade);
  const arm = cleanStr(c.arm);

  if (name && grade) {
    const same = name.toUpperCase() === grade.toUpperCase();
    if (same) return `${name}${arm ? ` ${arm}` : ""}`;
    return `${name} (${grade}${arm ? ` ${arm}` : ""})`;
  }

  if (name) return `${name}${arm ? ` ${arm}` : ""}`;
  if (grade) return `${grade}${arm ? ` ${arm}` : ""}`;

  return "Class";
}

function singleStreamLabel(c: Classroom) {
  return getStageBucketForClassroom(c) || fullClassLabel(c);
}

function pickSingleStreamRepresentative(
  group: Classroom[],
  preferredClassroomId: string | null
) {
  const preferred = group.find((x) => x.id === preferredClassroomId) ?? null;

  if (preferred && !cleanStr(preferred.arm)) {
    return preferred;
  }

  const armLess = group
    .filter((x) => !cleanStr(x.arm))
    .sort((a, b) => fullClassLabel(a).localeCompare(fullClassLabel(b)));

  if (armLess.length > 0) {
    return armLess[0];
  }

  return (
    preferred ??
    [...group].sort((a, b) => fullClassLabel(a).localeCompare(fullClassLabel(b)))[0]
  );
}

function buildSingleStreamClassrooms(
  list: Classroom[],
  preferredClassroomId: string | null
): Classroom[] {
  const orderedBuckets = [
    "KG 1",
    "KG 2",
    "PRIMARY 1",
    "PRIMARY 2",
    "PRIMARY 3",
    "PRIMARY 4",
    "PRIMARY 5",
    "PRIMARY 6",
    "JHS 1",
    "JHS 2",
    "JHS 3",
  ] as const;

  const grouped = new Map<string, Classroom[]>();
  const others: Classroom[] = [];

  for (const c of list) {
    const bucket = getStageBucketForClassroom(c);
    if (!bucket) {
      others.push(c);
      continue;
    }

    const arr = grouped.get(bucket) ?? [];
    arr.push(c);
    grouped.set(bucket, arr);
  }

  const picked: Classroom[] = [];

  for (const bucket of orderedBuckets) {
    const group = grouped.get(bucket) ?? [];
    if (!group.length) continue;
    picked.push(pickSingleStreamRepresentative(group, preferredClassroomId));
  }

  return [
    ...picked,
    ...others.sort((a, b) => fullClassLabel(a).localeCompare(fullClassLabel(b))),
  ];
}

function resolveInitialSingleStreamClassId(
  classrooms: Classroom[],
  requestedClassroomId: string | null
) {
  if (!classrooms.length) return "";

  if (!requestedClassroomId) {
    return buildSingleStreamClassrooms(classrooms, null)[0]?.id ?? classrooms[0].id;
  }

  const requested = classrooms.find((c) => c.id === requestedClassroomId);
  if (!requested) {
    return buildSingleStreamClassrooms(classrooms, null)[0]?.id ?? classrooms[0].id;
  }

  const bucket = getStageBucketForClassroom(requested);
  if (!bucket) return requested.id;

  const group = classrooms.filter((c) => getStageBucketForClassroom(c) === bucket);
  return pickSingleStreamRepresentative(group, requestedClassroomId).id;
}

export function HeadteacherReportsClient({
  classrooms,
  defaultTerm,
  defaultAcademicYear,
}: Props) {
  const searchParams = useSearchParams();

  const initialSelectedClassId = useMemo(() => {
    return resolveInitialSingleStreamClassId(
      classrooms,
      searchParams.get("classroomId")
    );
  }, [classrooms, searchParams]);

  const initialTerm = searchParams.get("term") ?? defaultTerm;
  const initialAcademicYear =
    searchParams.get("academicYear") ?? defaultAcademicYear;

  const [selectedClassId, setSelectedClassId] =
    useState<string>(initialSelectedClassId);
  const [term, setTerm] = useState<string>(initialTerm);
  const [academicYear, setAcademicYear] =
    useState<string>(initialAcademicYear);
  const [streamMode, setStreamMode] = useState<StreamMode>("single");

  const [state, setState] = useState<SummaryState>({
    status: "idle",
  });

  const canToggleMultiStream = useMemo(() => {
    return hasDuplicateStageBuckets(classrooms);
  }, [classrooms]);

  const visibleClassrooms = useMemo(() => {
    if (!canToggleMultiStream) return classrooms;
    if (streamMode === "multi") return classrooms;
    return buildSingleStreamClassrooms(classrooms, selectedClassId || null);
  }, [classrooms, canToggleMultiStream, streamMode, selectedClassId]);

  useEffect(() => {
    if (!visibleClassrooms.length) {
      if (selectedClassId) setSelectedClassId("");
      return;
    }

    if (visibleClassrooms.some((c) => c.id === selectedClassId)) return;

    const current = classrooms.find((c) => c.id === selectedClassId);
    const currentBucket = current ? getStageBucketForClassroom(current) : null;

    if (currentBucket) {
      const sameBucketVisible = visibleClassrooms.find(
        (c) => getStageBucketForClassroom(c) === currentBucket
      );
      if (sameBucketVisible) {
        setSelectedClassId(sameBucketVisible.id);
        return;
      }
    }

    setSelectedClassId(visibleClassrooms[0].id);
  }, [visibleClassrooms, classrooms, selectedClassId]);

  useEffect(() => {
    if (!selectedClassId || !term || !academicYear) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;

    async function load() {
      setState({ status: "loading" });

      try {
        const params = new URLSearchParams({
          classroomId: selectedClassId,
          term,
          academicYear,
        });

        const res = await fetch(
          `/api/headteacher/reports/class-term-summary?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const json: ClassTermSummaryResponse = await res.json().catch(() => ({
          ok: false,
          error: "Invalid JSON from server",
        }));

        if (cancelled) return;

        if (!res.ok || !json.ok) {
          setState({
            status: "error",
            message:
              json.error ||
              "Could not load class term summary. Please try again.",
          });
          return;
        }

        setState({
          status: "ready",
          data: json,
        });
      } catch {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            "Network error while loading class term summary. Please check your connection and try again.",
        });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedClassId, term, academicYear]);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3 md:items-end">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-700">
              Class
            </label>

            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {visibleClassrooms.length === 0 ? (
                <option value="">No classes found</option>
              ) : (
                visibleClassrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {streamMode === "single"
                      ? singleStreamLabel(c)
                      : fullClassLabel(c)}
                  </option>
                ))
              )}
            </select>

            {canToggleMultiStream ? (
              <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={streamMode === "multi"}
                  onChange={(e) =>
                    setStreamMode(e.target.checked ? "multi" : "single")
                  }
                />
                Show multistream classes
              </label>
            ) : null}

            {visibleClassrooms.length === 0 && (
              <p className="mt-1 text-[10px] text-red-700">
                No classrooms found for this school. Please create classrooms and
                assign learners first.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-700">
              Term
            </label>
            <select
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="1st Term">1st Term</option>
              <option value="2nd Term">2nd Term</option>
              <option value="3rd Term">3rd Term</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-700">
              Academic year
            </label>
            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="e.g. 2025/2026"
            />
          </div>
        </div>

        <p className="mt-2 text-[10px] text-slate-500">
          Use this grid to study learner-by-learner term performance, then open
          the full learner report where needed.
        </p>
      </div>

      <ClassTermSummaryView
        state={state}
        term={term}
        academicYear={academicYear}
      />
    </section>
  );
}

function ClassTermSummaryView({
  state,
  term,
  academicYear,
}: {
  state: SummaryState;
  term: string;
  academicYear: string;
}) {
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-[11px] text-emerald-900 shadow-sm">
        Loading class term report…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50/70 px-4 py-3 text-[11px] text-red-900 shadow-sm">
        {state.message}
      </div>
    );
  }

  const data = state.data;
  const subjects = data.subjects || [];
  const students = data.students || [];

  if (students.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-[11px] font-semibold text-slate-900">
          No learners or assessment data yet
        </p>
        <p className="mt-1 text-[11px] text-slate-600 max-w-xl">
          {data.message ||
            "Either this class has no learners assigned yet, or no assessment items/scores have been recorded for the selected term and year."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm overflow-x-auto">
      <p className="mb-2 text-[11px] font-semibold text-slate-900">
        Class term report grid
      </p>
      <p className="mb-3 max-w-xl text-[10px] text-slate-600">
        Each row is a learner. Each subject shows the total score across all
        recorded assessments for that subject in this term.
      </p>

      <table className="min-w-full text-[11px] border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-2 py-1 text-left font-semibold text-slate-600">
              Learner
            </th>
            {subjects.map((subj) => (
              <th
                key={subj}
                className="px-2 py-1 text-left font-semibold text-slate-600"
              >
                {subj}
              </th>
            ))}
            <th className="px-2 py-1 text-left font-semibold text-slate-600">
              Total
            </th>
            <th className="px-2 py-1 text-left font-semibold text-slate-600">
              Max
            </th>
            <th className="px-2 py-1 text-left font-semibold text-slate-600">
              Report
            </th>
          </tr>
        </thead>

        <tbody>
          {students.map((s, idx) => {
            const zebra = idx % 2 === 1 ? "bg-slate-50/60" : "bg-white";

            const href = `/headteacher/reports/student-report?studentId=${encodeURIComponent(
              s.id
            )}&term=${encodeURIComponent(
              term
            )}&academicYear=${encodeURIComponent(academicYear)}`;

            return (
              <tr key={s.id} className={zebra}>
                <td className="px-2 py-1 text-slate-900">
                  <span className="font-semibold">
                    {s.firstName} {s.lastName}
                  </span>
                </td>
                {subjects.map((subj) => {
                  const val = s.scoresBySubject[subj] ?? 0;
                  return (
                    <td key={subj} className="px-2 py-1 text-slate-800">
                      {val}
                    </td>
                  );
                })}
                <td className="px-2 py-1 font-semibold text-slate-900">
                  {s.totalScore}
                </td>
                <td className="px-2 py-1 text-slate-600">
                  {s.maxTotalScore}
                </td>
                <td className="px-2 py-1 text-slate-600">
                  <Link
                    href={href}
                    className="inline-flex items-center rounded-lg border border-emerald-600 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50"
                  >
                    View report
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}