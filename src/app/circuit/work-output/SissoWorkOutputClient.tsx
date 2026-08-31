"use client";

import { useEffect, useMemo, useState } from "react";

type SchoolOption = {
  schoolId: string;
  schoolName: string;
  schoolCode: string | null;
  currentTerm: string | null;
  currentAcademicYear: string | null;
  currentCycleConfigured: boolean;
};

type RosterClass = {
  classroomId: string;
  classLabel: string;
  scopeLevel: string | null;
  subjects: string[];
};

type RosterTeacher = {
  userId: string;
  name: string;
  classes: RosterClass[];
};

type WorkOutputTypeCount = {
  key: string;
  label: string;
  count: number;
  scoredItemCount: number;
  scoredEntries: number;
  averagePercent: number | null;
};

type WorkOutputCountSummary = {
  itemCount: number;
  scoredItemCount: number;
  scoredEntries: number;
  typeCounts: WorkOutputTypeCount[];
};

type WorkOutputItemSummary = {
  id: string;
  title: string;
  type: string;
  typeLabel: string;
  maxScore: number;
  date: string | null;
  scoresCount: number;
  classAveragePercent: number | null;
};

type WorkOutputProgressPoint = {
  itemId: string;
  title: string;
  type: string;
  typeLabel: string;
  date: string | null;
  score: number;
  maxScore: number;
  percent: number | null;
};

type WorkOutputLearnerProgression = {
  studentId: string;
  name: string;
  points: WorkOutputProgressPoint[];
};

type WorkOutputLesson = WorkOutputCountSummary & {
  lessonDeliveryId: string;
  lessonNoteId: string | null;
  lessonTitle: string | null;
  subject: string;
  dateTaught: string;
  items: WorkOutputItemSummary[];
  progression: {
    assessmentCount: number;
    learnersTracked: number;
    learnersWithRepeatedPractice: number;
    averageFirstPercent: number | null;
    averageLatestPercent: number | null;
    averageChangePercent: number | null;
    learners: WorkOutputLearnerProgression[];
  };
};

type DeliverySummary = {
  id: string;
  subject: string;
  lessonTitle: string | null;
  lessonNoteId: string | null;
  dateTaught: string | null;
  assessmentCount: number;
  scoredAssessmentCount: number;
  types: Array<{
    key: string;
    label: string;
    count: number;
  }>;
};

type WorkOutputResponse = {
  ok: true;
  stage: "WORK_OUTPUT";
  school: {
    schoolId: string;
    schoolName: string;
    schoolCode: string | null;
  };
  term: string;
  academicYear: string;
  teacher: {
    userId: string;
    name: string;
  };
  classroom: {
    classroomId: string;
    classLabel: string;
    scopeLevel: string | null;
  };
  subject: string;
  deliveries: DeliverySummary[];
  workOutput: {
    term: WorkOutputCountSummary;
    lesson: WorkOutputLesson | null;
    legacyUnlinked: WorkOutputCountSummary;
  };
};

type SchoolsResponse = {
  ok: true;
  stage: "SCHOOLS";
  schools: SchoolOption[];
};

type RosterResponse = {
  ok: true;
  stage: "ROSTER";
  school: {
    schoolId: string;
    schoolName: string;
    schoolCode: string | null;
  };
  term: string;
  academicYear: string;
  teachers: RosterTeacher[];
};

type ApiResponse = SchoolsResponse | RosterResponse | WorkOutputResponse;

const card =
  "rounded-2xl border border-white/10 bg-[#07111F]/90 shadow-[0_18px_50px_rgba(0,0,0,0.18)]";

const field =
  "w-full rounded-xl border border-white/10 bg-[#08111C] px-3 py-2.5 text-[12px] text-[#F7F4ED] outline-none transition focus:border-emerald-300/40";

const primaryButton =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-400/15 px-4 py-2 text-[12px] font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButton =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-[12px] font-semibold text-[#E8EBF0] transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Date not recorded";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date not recorded";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function shortTypeLabel(type: string) {
  const key = clean(type).toUpperCase();

  if (key === "EXERCISE") return "Ex.";
  if (key === "HOMEWORK") return "H/W";
  if (key === "QUIZ") return "Quiz";
  if (key === "CLASS_TEST") return "C/T";
  if (key === "GROUP_WORK") return "G/W";
  if (key === "PROJECT") return "Proj.";
  if (key === "PRACTICAL") return "Prac.";
  if (key === "EXAM") return "Exam";
  return "Other";
}

function lessonClassAveragePercent(items: WorkOutputItemSummary[]) {
  const values = items
    .map((item) => item.classAveragePercent)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value)
    );

  if (!values.length) return null;

  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)
  );
}

function buildItemLabels(items: WorkOutputItemSummary[]) {
  const counts = new Map<string, number>();
  const labels = new Map<
    string,
    {
      type: string;
      typeLabel: string;
      label: string;
    }
  >();

  for (const item of items) {
    const next = (counts.get(item.type) ?? 0) + 1;
    counts.set(item.type, next);
    labels.set(item.id, {
      type: item.type,
      typeLabel: item.typeLabel,
      label: `${shortTypeLabel(item.type)} ${next}`,
    });
  }

  return labels;
}

function buildProgressionGroups(
  learner: WorkOutputLearnerProgression,
  items: WorkOutputItemSummary[]
) {
  const labels = buildItemLabels(items);
  const groups = new Map<
    string,
    {
      type: string;
      typeLabel: string;
      points: Array<{
        itemId: string;
        label: string;
        percent: number | null;
      }>;
    }
  >();

  for (const point of learner.points) {
    const label = labels.get(point.itemId);
    const type = label?.type ?? point.type;
    const typeLabel = label?.typeLabel ?? point.typeLabel;
    const current = groups.get(type) ?? {
      type,
      typeLabel,
      points: [],
    };

    current.points.push({
      itemId: point.itemId,
      label: label?.label ?? shortTypeLabel(point.type),
      percent: point.percent,
    });

    groups.set(type, current);
  }

  return [...groups.values()];
}

async function readJson(res: Response) {
  return (await res.json().catch(() => ({}))) as
    | ApiResponse
    | {
        ok?: false;
        error?: string;
        message?: string;
      };
}

export default function SissoWorkOutputClient() {
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [teachers, setTeachers] = useState<RosterTeacher[]>([]);

  const [schoolId, setSchoolId] = useState("");
  const [term, setTerm] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [teacherUserId, setTeacherUserId] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [subject, setSubject] = useState("");

  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [loadingOutput, setLoadingOutput] = useState(false);
  const [loadingLessonId, setLoadingLessonId] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<WorkOutputResponse | null>(null);
  const [showOutput, setShowOutput] = useState(false);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.schoolId === schoolId) ?? null,
    [schools, schoolId]
  );

  const selectedTeacher = useMemo(
    () => teachers.find((teacher) => teacher.userId === teacherUserId) ?? null,
    [teachers, teacherUserId]
  );

  const selectedClass = useMemo(
    () =>
      selectedTeacher?.classes.find(
        (classroom) => classroom.classroomId === classroomId
      ) ?? null,
    [selectedTeacher, classroomId]
  );

  const canView =
    !!schoolId &&
    !!term &&
    !!academicYear &&
    !!teacherUserId &&
    !!classroomId &&
    !!subject;

  useEffect(() => {
    void loadSchools();
    // Initial circuit-school discovery is intentionally one no-store request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSchools() {
    setLoadingSchools(true);
    setError(null);

    try {
      const res = await fetch("/api/circuit/assessment/work-output", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      const data = await readJson(res);

      if (!res.ok || !("ok" in data) || !data.ok || data.stage !== "SCHOOLS") {
        throw new Error(
          "message" in data && data.message
            ? data.message
            : "Could not load the schools in your circuit."
        );
      }

      setSchools(data.schools);

      if (data.schools.length === 1) {
        const only = data.schools[0];
        await chooseSchool(only.schoolId, data.schools);
      }
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load the schools in your circuit."
      );
    } finally {
      setLoadingSchools(false);
    }
  }

  async function chooseSchool(
    nextSchoolId: string,
    sourceSchools = schools
  ) {
    const school =
      sourceSchools.find((candidate) => candidate.schoolId === nextSchoolId) ??
      null;

    setSchoolId(nextSchoolId);
    setTeachers([]);
    setTeacherUserId("");
    setClassroomId("");
    setSubject("");
    setOutput(null);
    setShowOutput(false);
    setError(null);

    if (!school) {
      setTerm("");
      setAcademicYear("");
      return;
    }

    const nextTerm = school.currentTerm ?? "";
    const nextYear = school.currentAcademicYear ?? "";

    setTerm(nextTerm);
    setAcademicYear(nextYear);

    if (!nextTerm || !nextYear) {
      setError(
        "This school has no complete current term and academic year setting."
      );
      return;
    }

    await loadRoster(nextSchoolId, nextTerm, nextYear);
  }

  function applyRosterDefaults(nextTeachers: RosterTeacher[]) {
    const teacher = nextTeachers[0] ?? null;
    const classroom = teacher?.classes[0] ?? null;
    const nextSubject = classroom?.subjects[0] ?? "";

    setTeacherUserId(teacher?.userId ?? "");
    setClassroomId(classroom?.classroomId ?? "");
    setSubject(nextSubject);
  }

  async function loadRoster(
    nextSchoolId = schoolId,
    nextTerm = term,
    nextAcademicYear = academicYear
  ) {
    if (!nextSchoolId || !nextTerm || !nextAcademicYear) {
      setError("Choose a school, term, and academic year first.");
      return;
    }

    setLoadingRoster(true);
    setError(null);
    setTeachers([]);
    setTeacherUserId("");
    setClassroomId("");
    setSubject("");
    setOutput(null);
    setShowOutput(false);

    try {
      const params = new URLSearchParams({
        schoolId: nextSchoolId,
        term: nextTerm,
        academicYear: nextAcademicYear,
      });

      const res = await fetch(
        `/api/circuit/assessment/work-output?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        }
      );

      const data = await readJson(res);

      if (!res.ok || !("ok" in data) || !data.ok || data.stage !== "ROSTER") {
        throw new Error(
          "message" in data && data.message
            ? data.message
            : "Could not load recorded teaching evidence for this school."
        );
      }

      setTerm(data.term);
      setAcademicYear(data.academicYear);
      setTeachers(data.teachers);
      applyRosterDefaults(data.teachers);
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load recorded teaching evidence for this school."
      );
    } finally {
      setLoadingRoster(false);
    }
  }

  function chooseTeacher(nextTeacherUserId: string) {
    const teacher =
      teachers.find((candidate) => candidate.userId === nextTeacherUserId) ??
      null;
    const classroom = teacher?.classes[0] ?? null;

    setTeacherUserId(nextTeacherUserId);
    setClassroomId(classroom?.classroomId ?? "");
    setSubject(classroom?.subjects[0] ?? "");
    setOutput(null);
    setShowOutput(false);
  }

  function chooseClass(nextClassroomId: string) {
    const classroom =
      selectedTeacher?.classes.find(
        (candidate) => candidate.classroomId === nextClassroomId
      ) ?? null;

    setClassroomId(nextClassroomId);
    setSubject(classroom?.subjects[0] ?? "");
    setOutput(null);
    setShowOutput(false);
  }

  function chooseSubject(nextSubject: string) {
    setSubject(nextSubject);
    setOutput(null);
    setShowOutput(false);
  }

  async function loadWorkOutput(lessonDeliveryId?: string) {
    if (!canView) {
      setError("Choose the school, teacher, class, and subject first.");
      return;
    }

    if (lessonDeliveryId) {
      setLoadingLessonId(lessonDeliveryId);
    } else {
      setLoadingOutput(true);
    }

    setError(null);

    try {
      const params = new URLSearchParams({
        schoolId,
        term,
        academicYear,
        teacherUserId,
        classroomId,
        subject,
      });

      if (lessonDeliveryId) {
        params.set("lessonDeliveryId", lessonDeliveryId);
      }

      const res = await fetch(
        `/api/circuit/assessment/work-output?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        }
      );

      const data = await readJson(res);

      if (
        !res.ok ||
        !("ok" in data) ||
        !data.ok ||
        data.stage !== "WORK_OUTPUT"
      ) {
        throw new Error(
          "message" in data && data.message
            ? data.message
            : "Could not load Work Output."
        );
      }

      setOutput(data);
      setShowOutput(true);
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : "Could not load Work Output."
      );
    } finally {
      setLoadingOutput(false);
      setLoadingLessonId("");
    }
  }

  const nonZeroTypes =
    output?.workOutput.term.typeCounts.filter((bucket) => bucket.count > 0) ??
    [];

  const selectedLesson = output?.workOutput.lesson ?? null;

  const selectedLessonClassAverage = selectedLesson
    ? lessonClassAveragePercent(selectedLesson.items)
    : null;

  const selectedLessonItemLabels = selectedLesson
    ? buildItemLabels(selectedLesson.items)
    : new Map<string, { type: string; typeLabel: string; label: string }>();

  return (
    <section className="mx-auto w-full max-w-7xl px-3 pb-8 sm:px-5 lg:px-6">
      <div className={card + " overflow-hidden"}>
        <div className="border-b border-white/10 bg-gradient-to-r from-emerald-500/12 via-cyan-500/8 to-transparent px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                SISSO • Teacher Work Output
              </div>
              <h2 className="mt-1 text-lg font-semibold text-[#F7F4ED]">
                Review practice evidence
              </h2>
              <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[#AEB6C3]">
                Choose one school, teacher, class, and subject. Work Output is
                formative evidence for support, not a teacher ranking.
              </p>
            </div>

            <button
              type="button"
              className={secondaryButton}
              onClick={() => void loadSchools()}
              disabled={loadingSchools}
            >
              {loadingSchools ? "Loading schools…" : schools.length ? "Refresh schools" : "Load schools"}
            </button>
          </div>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          {schools.length === 0 && !loadingSchools ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-[11px] leading-5 text-[#AEB6C3]">
              Load the schools in your authorized circuit to begin.
            </div>
          ) : null}

          {schools.length > 0 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8F98A8]">
                    School
                  </span>
                  <select
                    className={field}
                    value={schoolId}
                    onChange={(event) =>
                      void chooseSchool(event.target.value)
                    }
                  >
                    <option value="">Choose school</option>
                    {schools.map((school) => (
                      <option key={school.schoolId} value={school.schoolId}>
                        {school.schoolName}
                        {school.schoolCode ? ` • ${school.schoolCode}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8F98A8]">
                      Term
                    </span>
                    <select
                      className={field}
                      value={term}
                      disabled={!schoolId}
                      onChange={(event) => {
                        setTerm(event.target.value);
                        setOutput(null);
                        setShowOutput(false);
                      }}
                    >
                      <option value="">Term</option>
                      <option value="1st Term">1st Term</option>
                      <option value="2nd Term">2nd Term</option>
                      <option value="3rd Term">3rd Term</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8F98A8]">
                      Academic year
                    </span>
                    <input
                      className={field}
                      value={academicYear}
                      disabled={!schoolId}
                      placeholder="2025/2026"
                      onChange={(event) => {
                        setAcademicYear(event.target.value);
                        setOutput(null);
                        setShowOutput(false);
                      }}
                    />
                  </label>
                </div>
              </div>

              {selectedSchool ? (
                <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] text-[#AEB6C3] sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    School current cycle:{" "}
                    <strong className="font-semibold text-[#F7F4ED]">
                      {selectedSchool.currentTerm || "Not set"} •{" "}
                      {selectedSchool.currentAcademicYear || "Not set"}
                    </strong>
                  </span>
                  <button
                    type="button"
                    className="font-semibold text-emerald-200 hover:text-emerald-100"
                    onClick={() => void loadRoster()}
                    disabled={loadingRoster || !term || !academicYear}
                  >
                    {loadingRoster ? "Loading term…" : "Load selected term"}
                  </button>
                </div>
              ) : null}

              {teachers.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8F98A8]">
                      Teacher
                    </span>
                    <select
                      className={field}
                      value={teacherUserId}
                      onChange={(event) => chooseTeacher(event.target.value)}
                    >
                      {teachers.map((teacher) => (
                        <option key={teacher.userId} value={teacher.userId}>
                          {teacher.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8F98A8]">
                      Class
                    </span>
                    <select
                      className={field}
                      value={classroomId}
                      onChange={(event) => chooseClass(event.target.value)}
                    >
                      {(selectedTeacher?.classes ?? []).map((classroom) => (
                        <option
                          key={classroom.classroomId}
                          value={classroom.classroomId}
                        >
                          {classroom.classLabel}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8F98A8]">
                      Subject
                    </span>
                    <select
                      className={field}
                      value={subject}
                      onChange={(event) => chooseSubject(event.target.value)}
                    >
                      {(selectedClass?.subjects ?? []).map((subjectOption) => (
                        <option key={subjectOption} value={subjectOption}>
                          {subjectOption}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : schoolId && !loadingRoster ? (
                <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/8 px-3 py-3 text-[11px] leading-5 text-cyan-100">
                  No recorded lesson delivery is available for this school in
                  the selected term yet.
                </div>
              ) : null}

              {teachers.length > 0 ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className={primaryButton}
                    disabled={!canView || loadingOutput}
                    onClick={() => {
                      if (showOutput && output) {
                        setShowOutput(false);
                        return;
                      }

                      if (output) {
                        setShowOutput(true);
                        return;
                      }

                      void loadWorkOutput();
                    }}
                  >
                    {loadingOutput
                      ? "Loading Work Output…"
                      : showOutput
                        ? "Hide Work Output"
                        : "View Work Output"}
                  </button>

                  {output ? (
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={loadingOutput}
                      onClick={() => void loadWorkOutput()}
                    >
                      Refresh evidence
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-3 text-[11px] leading-5 text-amber-100">
              {error}
            </div>
          ) : null}

          {showOutput && output ? (
            <div className="space-y-3 border-t border-white/10 pt-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                    Work Output
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[#F7F4ED]">
                    {output.teacher.name} • {output.classroom.classLabel}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#AEB6C3]">
                    {output.subject} • {output.term} • {output.academicYear}
                  </div>
                </div>

                <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                  <span className="text-xl font-semibold leading-none text-[#F7F4ED]">
                    {output.workOutput.term.itemCount}
                  </span>
                  <span className="text-[10px] leading-4 text-[#AEB6C3]">
                    lesson-linked
                    <br />
                    assessments
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8F98A8]">
                  Practice by type
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {nonZeroTypes.length > 0 ? (
                    nonZeroTypes.map((bucket) => (
                      <span
                        key={bucket.key}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#08111C] px-2.5 py-1.5 text-[10px] text-[#C9CDD6]"
                      >
                        <span>{bucket.label}</span>
                        <strong className="font-semibold text-[#F7F4ED]">
                          {bucket.count}
                        </strong>
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-[#8F98A8]">
                      No lesson-linked practice is recorded yet.
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold text-[#F7F4ED]">
                      Delivered lessons
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#8F98A8]">
                      Oldest to newest. Open one lesson to inspect learner progress.
                    </div>
                  </div>
                  <span className="rounded-full border border-white/10 bg-[#08111C] px-2 py-1 text-[10px] text-[#C9CDD6]">
                    {output.deliveries.length}
                  </span>
                </div>

                {output.deliveries.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {output.deliveries.map((delivery, index) => {
                      const active =
                        selectedLesson?.lessonDeliveryId === delivery.id;

                      return (
                        <button
                          key={delivery.id}
                          type="button"
                          className={[
                            "w-full rounded-xl border px-3 py-2.5 text-left transition",
                            active
                              ? "border-emerald-300/30 bg-emerald-400/10"
                              : "border-white/10 bg-[#08111C] hover:bg-white/[0.05]",
                          ].join(" ")}
                          disabled={loadingLessonId === delivery.id}
                          onClick={() => void loadWorkOutput(delivery.id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8F98A8]">
                                Lesson {index + 1} • {formatDate(delivery.dateTaught)}
                              </div>
                              <div className="mt-1 truncate text-[11px] font-semibold text-[#F7F4ED]">
                                {delivery.lessonTitle || delivery.subject}
                              </div>
                              {delivery.types.length > 0 ? (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {delivery.types.map((type) => (
                                    <span
                                      key={type.key}
                                      className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-[#AEB6C3]"
                                    >
                                      {type.label} {type.count}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            <div className="shrink-0 text-right">
                              <div className="text-sm font-semibold text-[#F7F4ED]">
                                {delivery.assessmentCount}
                              </div>
                              <div className="text-[9px] text-[#8F98A8]">
                                assessment{delivery.assessmentCount === 1 ? "" : "s"}
                              </div>
                              <div className="mt-1 text-[9px] text-emerald-200">
                                {delivery.scoredAssessmentCount} scored
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-white/10 px-3 py-3 text-[10px] text-[#8F98A8]">
                    No delivered lesson with Work Output is recorded for this subject yet.
                  </div>
                )}
              </div>

              {selectedLesson ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-[11px] font-semibold text-[#F7F4ED]">
                    Learner progress for this lesson
                  </div>
                  <div className="mt-1 text-[11px] leading-5 text-[#C9CDD6]">
                    {selectedLesson.lessonTitle || selectedLesson.subject}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#08111C] px-3 py-2.5">
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8F98A8]">
                        Class average
                      </div>
                      <div className="mt-0.5 text-[10px] text-[#AEB6C3]">
                        {selectedLesson.scoredItemCount} scored assessment
                        {selectedLesson.scoredItemCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="text-xl font-semibold text-[#F7F4ED]">
                      {formatPercent(selectedLessonClassAverage)}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8F98A8]">
                      Assessment records
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedLesson.items.map((item) => {
                        const label =
                          selectedLessonItemLabels.get(item.id)?.label ??
                          shortTypeLabel(item.type);

                        return (
                          <span
                            key={item.id}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-white/10 bg-[#08111C] px-2.5 py-1.5 text-[10px] text-[#C9CDD6]"
                          >
                            <strong className="shrink-0 font-semibold text-[#F7F4ED]">
                              {label}
                            </strong>
                            <span className="truncate">{item.title}</span>
                            <span className="shrink-0 text-emerald-200">
                              {formatPercent(item.classAveragePercent)}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {selectedLesson.progression.assessmentCount < 2 ? (
                    <div className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-3 text-[11px] leading-5 text-cyan-100">
                      One practice assessment is recorded for this lesson.
                      Learner progression becomes meaningful after another
                      assessment is given and scored.
                    </div>
                  ) : (
                    <details className="mt-3 rounded-xl border border-white/10 bg-[#08111C]">
                      <summary className="cursor-pointer px-3 py-3 text-[11px] font-semibold text-[#F7F4ED]">
                        View learner-by-learner progression
                      </summary>

                      <div className="space-y-2 border-t border-white/10 px-3 py-3">
                        {selectedLesson.progression.learners
                          .filter((learner) => learner.points.length > 0)
                          .map((learner) => {
                            const groups = buildProgressionGroups(
                              learner,
                              selectedLesson.items
                            );

                            return (
                              <div
                                key={learner.studentId}
                                className="rounded-xl border border-white/10 bg-[#06101C] px-3 py-2.5"
                              >
                                <div className="text-[11px] font-semibold text-[#F7F4ED]">
                                  {learner.name}
                                </div>

                                <div className="mt-2 space-y-2">
                                  {groups.map((group) => (
                                    <div
                                      key={group.type}
                                      className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2"
                                    >
                                      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8F98A8]">
                                        {group.typeLabel}
                                      </div>

                                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                        {group.points.map((point, index) => (
                                          <span
                                            key={point.itemId}
                                            className="inline-flex items-center gap-1.5"
                                          >
                                            {index > 0 ? (
                                              <span className="text-[10px] text-[#687386]">
                                                →
                                              </span>
                                            ) : null}

                                            <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-[#08111C] px-2 py-1 text-[10px]">
                                              <strong className="font-semibold text-[#C9CDD6]">
                                                {point.label}
                                              </strong>
                                              <span className="text-[#F7F4ED]">
                                                {formatPercent(point.percent)}
                                              </span>
                                            </span>
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/8 px-3 py-3 text-[11px] leading-5 text-cyan-100">
                  Open a delivered lesson above to inspect its assessment records
                  and learner progress.
                </div>
              )}

              {output.workOutput.legacyUnlinked.itemCount > 0 ? (
                <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-[10px] leading-5 text-amber-100">
                  {output.workOutput.legacyUnlinked.itemCount} older unlinked
                  assessment record
                  {output.workOutput.legacyUnlinked.itemCount === 1 ? "" : "s"}{" "}
                  remain preserved separately and are not counted as
                  lesson-linked Work Output.
                </div>
              ) : null}

              <div className="text-[10px] leading-5 text-[#8F98A8]">
                Use this evidence to support sufficient learner practice and
                follow progress. It must not be used to rank or punish teachers.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
