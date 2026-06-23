//src/components/headteacher/HeadteacherMockOverviewClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ClassroomRow = {
  id: string;
  name: string | null;
  grade: string | null;
  arm: string | null;
  label?: string;
};

type MockSession = {
  id: string;
  classroomId: string;
  academicYear: string;
  term: string | null;
  mockNumber: number;
  mockLabel: string;
  title: string;
  status: string;
  date: string | null;
};

type ReadinessBand = {
  code: string;
  label: string;
  tone: string;
  action: string;
};

type SubjectSummary = {
  itemId: string;
  subject: string;
  canonicalSubject: string;
  title: string;
  maxScore: number;
  status: string;
  scoredCount: number;
  missingCount: number;
  averageScore: number | null;
  averageGrade: number | null;
};

type StudentRow = {
  studentId: string;
  name: string;
  scoredSubjectCount: number;
  missingSubjectCount: number;
  averageScore: number | null;
  schoolAggregate: {
    ok: boolean;
    aggregate: number | null;
    missingSubjects: string[];
    reason: string | null;
  };
  placementAggregate: {
    ok: boolean;
    aggregate: number | null;
    missingSubjects: string[];
    reason: string | null;
  };
  readiness: ReadinessBand;
};

type Broadsheet = {
  session: MockSession;
  classroom: ClassroomRow | null;
  summary: {
    totalStudents: number;
    totalSubjects: number;
    possibleCells: number;
    scoredCells: number;
    missingCells: number;
    completionPercent: number;
    schoolAggregateReadyCount: number;
    placementReadyCount: number;
    classAveragePlacementAggregate: number | null;
    classReadiness: ReadinessBand;
    readinessCounts: Record<string, number>;
  };
  subjectSummaries: SubjectSummary[];
  weakestSubjects: SubjectSummary[];
  topSubjects: SubjectSummary[];
  students: StudentRow[];
  warnings: {
    aggregateMayBeIncomplete: boolean;
    message: string | null;
  };
};

type OverviewOk = {
  ok: true;
  classrooms: ClassroomRow[];
  selectedClassroomId: string | null;
  selectedClassroom: ClassroomRow | null;
  sessions: MockSession[];
  selectedSessionId: string | null;
  broadsheet: Broadsheet | null;
  warning?: string;
};

type OverviewErr = {
  ok: false;
  error: string;
  message?: string;
};

type OverviewResponse = OverviewOk | OverviewErr;

const shellCard =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const panelCard = "rounded-2xl border border-white/10 bg-[#08111C]/85";
const softPanel = "rounded-2xl border border-white/10 bg-white/[0.04]";
const darkInput =
  "w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-[12px] text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20";
const darkButton =
  "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-semibold text-[#F7F4ED] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";
const goldButton =
  "inline-flex items-center justify-center rounded-xl border border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-[12px] font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50";

function cleanStr(value: unknown) {
  return String(value ?? "").trim();
}

function safeObject(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object" && !Array.isArray(raw);
}

function getError(raw: unknown, fallback: string) {
  if (!safeObject(raw)) return fallback;
  return cleanStr(raw.message) || cleanStr(raw.error) || fallback;
}

async function readJson(res: Response): Promise<OverviewResponse | null> {
  const raw: unknown = await res.json().catch(() => null);
  if (!safeObject(raw)) return null;
  return raw as OverviewResponse;
}

function normalizeLevelToken(raw: unknown): string | null {
  const s = cleanStr(raw).toUpperCase().replace(/\s+/g, " ");
  if (!s) return null;

  let m =
    s.match(/^JHS\s*([1-3])$/) ||
    s.match(/^JHS([1-3])$/) ||
    s.match(/^J\.?H\.?S\.?\s*([1-3])$/);

  if (m) return `JHS${m[1]}`;

  m =
    s.match(/^BASIC\s*([7-9])$/) ||
    s.match(/^BASIC([7-9])$/) ||
    s.match(/^B\s*([7-9])$/) ||
    s.match(/^B([7-9])$/);

  if (m) return `JHS${Number(m[1]) - 6}`;

  return null;
}

function isJhs3Classroom(c: ClassroomRow) {
  return normalizeLevelToken(c.grade) === "JHS3" || normalizeLevelToken(c.name) === "JHS3";
}

function formatNumber(value: number | null | undefined, suffix = "") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return `${n.toFixed(Number.isInteger(n) ? 0 : 1)}${suffix}`;
}

function readinessClass(code: string) {
  const c = cleanStr(code).toUpperCase();

  if (c.includes("READY") || c === "EXCELLENT" || c === "COMPETITIVE") {
    return "border-emerald-300/20 bg-emerald-400/12 text-emerald-100";
  }

  if (c.includes("RISK") || c === "CRITICAL") {
    return "border-rose-300/20 bg-rose-400/12 text-rose-100";
  }

  if (c === "DEVELOPING" || c === "READY_MONITOR" || c === "MODERATE") {
    return "border-amber-300/20 bg-amber-400/12 text-amber-100";
  }

  return "border-white/10 bg-white/[0.04] text-[#C9CDD6]";
}

function MetricCard(props: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className={softPanel + " p-4"}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-[#8F98A8]">{props.label}</div>
      <div className="mt-2 text-2xl font-semibold text-[#F7F4ED]">{props.value}</div>
      {props.hint ? <div className="mt-1 text-[11px] text-[#AEB6C4]">{props.hint}</div> : null}
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
          <div className="text-sm font-semibold text-[#F7F4ED]">{props.title}</div>
          {props.subtitle ? <div className="mt-0.5 text-[11px] text-[#AEB6C4]">{props.subtitle}</div> : null}
        </div>
        {props.right ? <div className="shrink-0">{props.right}</div> : null}
      </div>
      <div className="px-4 py-4">{props.children}</div>
    </div>
  );
}

export default function HeadteacherMockOverviewClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [classrooms, setClassrooms] = useState<ClassroomRow[]>([]);
  const [classroomId, setClassroomId] = useState("");
  const [showMultiStream, setShowMultiStream] = useState(false);

  const [sessions, setSessions] = useState<MockSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [academicYear, setAcademicYear] = useState("");

  const [broadsheet, setBroadsheet] = useState<Broadsheet | null>(null);

  const allJhs3Classrooms = useMemo(() => classrooms.filter(isJhs3Classroom), [classrooms]);

  const visibleClassrooms = useMemo(() => {
    if (showMultiStream) return allJhs3Classrooms;
    const single = allJhs3Classrooms.filter((c) => !cleanStr(c.arm));
    return single.length > 0 ? single : allJhs3Classrooms;
  }, [allJhs3Classrooms, showMultiStream]);

  const canToggleMultiStream = allJhs3Classrooms.some((c) => cleanStr(c.arm));

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) ?? null,
    [sessions, sessionId]
  );

  async function loadOverview(args?: {
    nextClassroomId?: string;
    nextSessionId?: string;
    nextAcademicYear?: string;
  }) {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();

      const c = args?.nextClassroomId ?? classroomId;
      const s = args?.nextSessionId ?? sessionId;
      const y = args?.nextAcademicYear ?? academicYear;

      if (c) params.set("classroomId", c);
      if (s) params.set("sessionId", s);
      if (y) params.set("academicYear", y);

      const query = params.toString();
      const res = await fetch(
        `/api/headteacher/assessment/mock/overview${query ? `?${query}` : ""}`,
        { cache: "no-store" }
      );

      const json = await readJson(res);

      if (!json) {
        setError(`Invalid headteacher mock response. HTTP ${res.status}`);
        return;
      }

      if (!res.ok || !json.ok) {
        setError(getError(json, `Failed to load headteacher mock overview. HTTP ${res.status}`));
        return;
      }

      setClassrooms(json.classrooms ?? []);
      setClassroomId(json.selectedClassroomId ?? "");
      setSessions(json.sessions ?? []);
      setSessionId(json.selectedSessionId ?? "");
      setBroadsheet(json.broadsheet ?? null);

      if (!academicYear && json.broadsheet?.session?.academicYear) {
        setAcademicYear(json.broadsheet.session.academicYear);
      }
    } catch {
      setError("Failed to load headteacher mock overview.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!classroomId) return;
    if (!visibleClassrooms.some((c) => c.id === classroomId)) {
      const next = visibleClassrooms[0]?.id ?? "";
      if (next) {
        setClassroomId(next);
        setSessionId("");
        void loadOverview({ nextClassroomId: next, nextSessionId: "" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMultiStream, visibleClassrooms]);

  return (
    <main className="min-h-screen bg-[#06101F] text-[#F7F4ED]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 md:px-6 lg:px-8">
        <div className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.22),transparent_28%),linear-gradient(135deg,#071A3D,#0B1220_58%,#07111F)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.28)] md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-[#E8C96A]">
                Headteacher • BECE Mock Intelligence
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">
                JHS3 Mock overview
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
                View the full JHS3 Mock readiness picture across all subjects, learners,
                missing evidence, subject averages, and aggregate readiness.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/headteacher/assessment/overview" className={darkButton}>
                Assessment overview
              </Link>
              <Link href="/teacher/assessment/mock" className={darkButton}>
                Teacher Mock cockpit
              </Link>
              <button type="button" onClick={() => loadOverview()} disabled={loading} className={goldButton}>
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-[11px] font-semibold text-[#AEB6C4]">
                  JHS3 classroom
                </label>

                {canToggleMultiStream ? (
                  <button
                    type="button"
                    onClick={() => setShowMultiStream((v) => !v)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-[#C9CDD6] hover:bg-white/[0.08]"
                  >
                    {showMultiStream ? "Single-stream" : "Show streams"}
                  </button>
                ) : null}
              </div>

              <select
                value={classroomId}
                onChange={(e) => {
                  const next = e.target.value;
                  setClassroomId(next);
                  setSessionId("");
                  void loadOverview({ nextClassroomId: next, nextSessionId: "" });
                }}
                className={darkInput}
              >
                <option value="">Select JHS3</option>
                {visibleClassrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.label || classroom.name || "JHS3"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#AEB6C4]">
                Academic year filter
              </label>
              <input
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                onBlur={() =>
                  loadOverview({
                    nextClassroomId: classroomId,
                    nextSessionId: "",
                    nextAcademicYear: academicYear,
                  })
                }
                placeholder="Leave blank for all"
                className={darkInput}
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#AEB6C4]">
                Mock session
              </label>
              <select
                value={sessionId}
                onChange={(e) => {
                  const next = e.target.value;
                  setSessionId(next);
                  void loadOverview({ nextClassroomId: classroomId, nextSessionId: next });
                }}
                className={darkInput}
              >
                <option value="">Select session</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title} • {session.status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}
        </div>

        {!broadsheet ? (
          <div className={shellCard + " px-5 py-12 text-center text-sm text-[#AEB6C4]"}>
            {loading ? "Loading Mock overview..." : "No Mock session found for this JHS3 selection yet."}
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-5">
              <MetricCard label="Students" value={broadsheet.summary.totalStudents} hint="Active JHS3 learners" />
              <MetricCard label="Subjects" value={broadsheet.summary.totalSubjects} hint="All Mock columns" />
              <MetricCard
                label="Completion"
                value={formatNumber(broadsheet.summary.completionPercent, "%")}
                hint={`${broadsheet.summary.scoredCells}/${broadsheet.summary.possibleCells} cells`}
              />
              <MetricCard
                label="Placement-ready"
                value={broadsheet.summary.placementReadyCount}
                hint="Learners with full placement aggregate"
              />
              <div className={softPanel + " p-4"}>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#8F98A8]">
                  Class readiness
                </div>
                <div className={["mt-2 inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold", readinessClass(broadsheet.summary.classReadiness.code)].join(" ")}>
                  {broadsheet.summary.classReadiness.label}
                </div>
                <div className="mt-2 text-[11px] text-[#AEB6C4]">
                  {broadsheet.summary.classReadiness.action}
                </div>
              </div>
            </div>

            {broadsheet.warnings.message ? (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-[12px] text-amber-100">
                {broadsheet.warnings.message}
              </div>
            ) : null}

            <div className="grid gap-5 lg:grid-cols-2">
              <SectionCard title="Subject readiness" subtitle="Averages, missing scores, and strongest/weakest subjects.">
                <div className="grid gap-3 md:grid-cols-2">
                  {broadsheet.subjectSummaries.length === 0 ? (
                    <div className="text-sm text-[#AEB6C4]">No Mock subjects created yet.</div>
                  ) : (
                    broadsheet.subjectSummaries.map((summary) => (
                      <div key={summary.itemId} className={panelCard + " p-4"}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-[#F7F4ED]">{summary.subject}</div>
                            <div className="mt-1 text-[11px] text-[#8F98A8]">
                              {summary.scoredCount} scored • {summary.missingCount} missing
                            </div>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-[#C9CDD6]">
                            {summary.status}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <MetricCard label="Avg score" value={formatNumber(summary.averageScore)} />
                          <MetricCard label="Avg grade" value={formatNumber(summary.averageGrade)} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Leadership focus" subtitle="Where the headteacher should pay attention first.">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className={panelCard + " p-4"}>
                    <div className="text-sm font-semibold text-[#F7F4ED]">Weakest subjects</div>
                    <div className="mt-3 space-y-2">
                      {broadsheet.weakestSubjects.length === 0 ? (
                        <div className="text-[12px] text-[#AEB6C4]">Not enough subject evidence yet.</div>
                      ) : (
                        broadsheet.weakestSubjects.map((subject) => (
                          <div key={subject.itemId} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                            <div className="text-[12px] font-semibold text-[#F7F4ED]">{subject.subject}</div>
                            <div className="text-[11px] text-[#AEB6C4]">
                              Avg grade {formatNumber(subject.averageGrade)} • Avg score {formatNumber(subject.averageScore)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className={panelCard + " p-4"}>
                    <div className="text-sm font-semibold text-[#F7F4ED]">Strongest subjects</div>
                    <div className="mt-3 space-y-2">
                      {broadsheet.topSubjects.length === 0 ? (
                        <div className="text-[12px] text-[#AEB6C4]">Not enough subject evidence yet.</div>
                      ) : (
                        broadsheet.topSubjects.map((subject) => (
                          <div key={subject.itemId} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                            <div className="text-[12px] font-semibold text-[#F7F4ED]">{subject.subject}</div>
                            <div className="text-[11px] text-[#AEB6C4]">
                              Avg grade {formatNumber(subject.averageGrade)} • Avg score {formatNumber(subject.averageScore)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>

            <SectionCard title="Learner readiness broadsheet" subtitle="Placement-style aggregate stays incomplete until all required subjects exist.">
              <div className="overflow-auto rounded-2xl border border-white/10">
                <table className="min-w-[980px] w-full border-collapse text-left text-[12px]">
                  <thead className="bg-white/[0.05] text-[#AEB6C4]">
                    <tr>
                      <th className="border-b border-white/10 px-3 py-2">Learner</th>
                      <th className="border-b border-white/10 px-3 py-2">Scored subjects</th>
                      <th className="border-b border-white/10 px-3 py-2">Average</th>
                      <th className="border-b border-white/10 px-3 py-2">School agg.</th>
                      <th className="border-b border-white/10 px-3 py-2">Placement agg.</th>
                      <th className="border-b border-white/10 px-3 py-2">Readiness</th>
                      <th className="border-b border-white/10 px-3 py-2">Missing for placement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {broadsheet.students.map((student) => (
                      <tr key={student.studentId} className="border-b border-white/5">
                        <td className="px-3 py-2 font-semibold text-[#F7F4ED]">{student.name}</td>
                        <td className="px-3 py-2 text-[#C9CDD6]">
                          {student.scoredSubjectCount} scored • {student.missingSubjectCount} missing
                        </td>
                        <td className="px-3 py-2 text-[#C9CDD6]">{formatNumber(student.averageScore)}</td>
                        <td className="px-3 py-2 text-[#C9CDD6]">
                          {student.schoolAggregate.aggregate ?? "Incomplete"}
                        </td>
                        <td className="px-3 py-2 text-[#C9CDD6]">
                          {student.placementAggregate.aggregate ?? "Incomplete"}
                        </td>
                        <td className="px-3 py-2">
                          <span className={["inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold", readinessClass(student.readiness.code)].join(" ")}>
                            {student.readiness.code}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[#AEB6C4]">
                          {student.placementAggregate.missingSubjects?.length
                            ? student.placementAggregate.missingSubjects.join(", ")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </main>
  );
}