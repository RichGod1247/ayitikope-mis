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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
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

const surfaceClass =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-xs text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20";

const labelClass = "block text-[11px] font-medium text-[#C9CDD6]";

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
      <div className={`${surfaceClass} px-4 py-4 md:px-5 md:py-5`}>
        <div className="grid gap-3 md:grid-cols-3 md:items-end">
          <div className="space-y-1.5">
            <label className={labelClass}>Class</label>

            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className={inputClass}
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
              <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-[#AEB6C4]">
                <input
                  type="checkbox"
                  checked={streamMode === "multi"}
                  onChange={(e) =>
                    setStreamMode(e.target.checked ? "multi" : "single")
                  }
                  className="h-4 w-4 rounded border-white/15 bg-[#07111F] accent-[#D4AF37]"
                />
                Show multistream classes
              </label>
            ) : null}

            {visibleClassrooms.length === 0 && (
              <p className="mt-1 text-[10px] text-rose-200">
                No classrooms found for this school. Please create classrooms and
                assign learners first.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Term</label>
            <select
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className={inputClass}
            >
              <option value="1st Term">1st Term</option>
              <option value="2nd Term">2nd Term</option>
              <option value="3rd Term">3rd Term</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Academic year</label>
            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className={inputClass}
              placeholder="e.g. 2025/2026"
            />
          </div>
        </div>

        <p className="mt-3 text-[10px] text-[#8F98A8]">
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
      <div className="rounded-[24px] border border-sky-300/20 bg-sky-400/10 px-4 py-3 text-[11px] text-sky-100 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
        Loading class term report…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-[24px] border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-[11px] text-rose-100 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
        {state.message}
      </div>
    );
  }

  const data = state.data;
  const subjects = data.subjects || [];
  const students = data.students || [];

  if (students.length === 0) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-4 text-[#F7F4ED] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <p className="text-[11px] font-semibold text-[#F7F4ED]">
          No learners or assessment data yet
        </p>
        <p className="mt-1 max-w-xl text-[11px] text-[#C9CDD6]">
          {data.message ||
            "Either this class has no learners assigned yet, or no assessment items/scores have been recorded for the selected term and year."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl overflow-x-auto">
      <p className="mb-2 text-[11px] font-semibold text-[#F7F4ED]">
        Class term report grid
      </p>
      <p className="mb-3 max-w-xl text-[10px] text-[#C9CDD6]">
        Each row is a learner. Each subject shows the total score across all
        recorded assessments for that subject in this term.
      </p>

      <table className="min-w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            <th className="px-2 py-2 text-left font-semibold text-[#E8C96A]">
              Learner
            </th>
            {subjects.map((subj) => (
              <th
                key={subj}
                className="px-2 py-2 text-left font-semibold text-[#E8C96A]"
              >
                {subj}
              </th>
            ))}
            <th className="px-2 py-2 text-left font-semibold text-[#E8C96A]">
              Total
            </th>
            <th className="px-2 py-2 text-left font-semibold text-[#E8C96A]">
              Max
            </th>
            <th className="px-2 py-2 text-left font-semibold text-[#E8C96A]">
              Report
            </th>
          </tr>
        </thead>

        <tbody>
          {students.map((s, idx) => {
            const zebra = idx % 2 === 1 ? "bg-white/[0.03]" : "bg-transparent";

            const href = `/headteacher/reports/student-report?studentId=${encodeURIComponent(
              s.id
            )}&term=${encodeURIComponent(
              term
            )}&academicYear=${encodeURIComponent(academicYear)}`;

            return (
              <tr key={s.id} className={zebra}>
                <td className="px-2 py-2 text-[#F7F4ED]">
                  <span className="font-semibold">
                    {s.firstName} {s.lastName}
                  </span>
                </td>
                {subjects.map((subj) => {
                  const val = s.scoresBySubject[subj] ?? 0;
                  return (
                    <td key={subj} className="px-2 py-2 text-[#D7DCE5]">
                      {val}
                    </td>
                  );
                })}
                <td className="px-2 py-2 font-semibold text-[#F7F4ED]">
                  {s.totalScore}
                </td>
                <td className="px-2 py-2 text-[#AEB6C4]">
                  {s.maxTotalScore}
                </td>
                <td className="px-2 py-2">
                  <Link
                    href={href}
                    className="inline-flex items-center rounded-lg border border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-2.5 py-1 text-[10px] font-semibold text-[#071A3D] shadow-[0_14px_40px_rgba(212,175,55,0.18)] hover:brightness-105"
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