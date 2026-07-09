//src/components/governance/GovernanceSchemeCoveragePanel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type SchemeStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED";
type StatusCounts = Record<SchemeStatus, number>;

type SchoolIdentity = {
  tenantId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector: string;
  circuitId: string | null;
  circuitName: string | null;
  districtId: string | null;
  districtName: string | null;
};

type SchemeRow = {
  id: string;
  subject: string;
  classroomName: string | null;
  term: string;
  academicYear: string;
  title: string | null;
  status: SchemeStatus;
  itemCount: number;
  submittedAt: string | null;
  approvedAt: string | null;
  returnedAt: string | null;
  reviewedAt: string | null;
  headteacherComment: string | null;
};

type TeacherCoverageRow = {
  tenantId: string;
  teacherUserId: string;
  teacherName: string;
  teacherEmail: string | null;
  school: SchoolIdentity;
  assignmentCount: number;
  assignments: Array<{
    kind: string;
    subject: string | null;
    classroomName: string | null;
    phase: string | null;
    level: string | null;
  }>;
  schemeCount: number;
  itemCount: number;
  statusCounts: StatusCounts;
  hasAnyScheme: boolean;
  hasApprovedScheme: boolean;
  needsFollowUp: boolean;
  followUpReason: string;
  latestSubmittedAt: string | null;
  latestApprovedAt: string | null;
  schemes: SchemeRow[];
};

type SchoolCoverageRow = {
  tenantId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector: string;
  circuitId: string | null;
  circuitName: string | null;
  districtId: string | null;
  districtName: string | null;
  currentTerm: string | null;
  currentAcademicYear: string | null;
  teachers: number;
  schemes: number;
  schemeItems: number;
  teachersWithAnyScheme: number;
  teachersWithApprovedScheme: number;
  teachersMissingAnyScheme: number;
  teachersMissingApprovedScheme: number;
  statusCounts: StatusCounts;
  coveragePct: number;
  approvedCoveragePct: number;
  latestSubmittedAt: string | null;
  latestApprovedAt: string | null;
  needsFollowUp: boolean;
  followUpReason: string;
};

type SchemeCoverageSummary = {
  schools: number;
  teachers: number;
  schemes: number;
  schemeItems: number;
  teachersWithAnyScheme: number;
  teachersWithApprovedScheme: number;
  teachersMissingAnyScheme: number;
  teachersMissingApprovedScheme: number;
  statusCounts: StatusCounts;
  coveragePct: number;
  approvedCoveragePct: number;
  latestSubmittedAt: string | null;
  latestApprovedAt: string | null;
  schoolsNeedingFollowUp: number;
};

type SchemeCoverageOverviewResponse =
  | {
      ok: true;
      mode: "overview";
      summary: SchemeCoverageSummary;
      circuits: Array<{
        circuitId: string | null;
        circuitName: string | null;
        districtId: string | null;
        districtName: string | null;
        schools: number;
        teachers: number;
        schemes: number;
        schemeItems: number;
        coveragePct: number;
        approvedCoveragePct: number;
        schoolsNeedingFollowUp: number;
        statusCounts: StatusCounts;
      }>;
      schools: SchoolCoverageRow[];
      followUpSchools: SchoolCoverageRow[];
      filters?: Record<string, unknown>;
    }
  | { ok: false; error: string };

type SchemeCoverageSchoolResponse =
  | {
      ok: true;
      mode: "school";
      school: SchoolCoverageRow | null;
      teachers: TeacherCoverageRow[];
      filters?: Record<string, unknown>;
    }
  | { ok: false; error: string };

type Props = {
  isDistrictView: boolean;
  isCircuitView: boolean;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function percentValue(value: unknown) {
  return `${Math.round(numberValue(value))}%`;
}

function compactDateTime(value?: string | null) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(d);
}

function statusCountsSafe(counts?: Partial<StatusCounts> | null): StatusCounts {
  return {
    DRAFT: numberValue(counts?.DRAFT),
    SUBMITTED: numberValue(counts?.SUBMITTED),
    APPROVED: numberValue(counts?.APPROVED),
    RETURNED: numberValue(counts?.RETURNED),
  };
}

function sectorLabel(value?: string | null) {
  if (value === "PRIVATE") return "Private";
  if (value === "PUBLIC") return "Public";
  return "Unspecified";
}

function sectorBadgeClass(value?: string | null) {
  if (value === "PRIVATE") {
    return "border-purple-300/25 bg-purple-400/10 text-purple-100";
  }

  if (value === "PUBLIC") {
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function statusBadgeClass(status: SchemeStatus) {
  if (status === "APPROVED") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  if (status === "SUBMITTED") return "border-sky-300/25 bg-sky-400/10 text-sky-100";
  if (status === "RETURNED") return "border-red-300/25 bg-red-500/10 text-red-100";
  return "border-amber-300/25 bg-amber-400/10 text-amber-100";
}

function toneClass(tone: "default" | "success" | "warning" | "danger" | "info") {
  if (tone === "success") return "border-emerald-300/20 bg-emerald-400/10";
  if (tone === "warning") return "border-amber-300/20 bg-amber-400/10";
  if (tone === "danger") return "border-red-300/20 bg-red-500/10";
  if (tone === "info") return "border-sky-300/20 bg-sky-500/10";
  return "border-white/10 bg-white/[0.04]";
}

function smallToneText(tone: "default" | "success" | "warning" | "danger" | "info") {
  if (tone === "success") return "text-emerald-100";
  if (tone === "warning") return "text-amber-100";
  if (tone === "danger") return "text-red-100";
  if (tone === "info") return "text-sky-100";
  return "text-slate-200";
}

function MiniStat({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string | number;
  helper?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <div className={cx("rounded-2xl border p-3", toneClass(tone))}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
      {helper ? (
        <p className={cx("mt-1 text-xs leading-5", smallToneText(tone))}>
          {helper}
        </p>
      ) : null}
    </div>
  );
}

function assignmentLabel(assignment: TeacherCoverageRow["assignments"][number]) {
  return [assignment.subject, assignment.classroomName, assignment.level, assignment.phase]
    .filter(Boolean)
    .join(" · ") || assignment.kind || "Assigned work";
}

function selectedSchoolName(school: SchoolCoverageRow | null, fallback: string | null) {
  return school?.schoolName || fallback || "Selected school";
}

export default function GovernanceSchemeCoveragePanel({
  isDistrictView,
  isCircuitView,
}: Props) {
  const [overview, setOverview] = useState<SchemeCoverageOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [schoolDetail, setSchoolDetail] = useState<SchemeCoverageSchoolResponse | null>(null);
  const [schoolLoading, setSchoolLoading] = useState(false);
  const [schoolError, setSchoolError] = useState<string | null>(null);
  const [selectedTeacherUserId, setSelectedTeacherUserId] = useState<string | null>(null);

  async function loadOverview() {
    setOverviewLoading(true);
    setOverviewError(null);

    try {
      const res = await fetch("/api/governance/schemes?mode=overview", {
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      const json = (await res.json().catch(() => null)) as SchemeCoverageOverviewResponse | null;

      if (!res.ok || !json?.ok) {
        setOverview(null);
        setOverviewError(json && !json.ok ? json.error : `Failed to load scheme coverage (${res.status})`);
        return;
      }

      setOverview(json);

      const firstSchool = json.followUpSchools[0] ?? json.schools[0] ?? null;
      setSelectedTenantId((current) => current ?? firstSchool?.tenantId ?? null);
    } catch {
      setOverview(null);
      setOverviewError("Network/server error while loading scheme coverage.");
    } finally {
      setOverviewLoading(false);
    }
  }

  async function loadSchool(tenantId: string) {
    setSchoolLoading(true);
    setSchoolError(null);

    try {
      const qs = new URLSearchParams({ mode: "school", tenantId });
      const res = await fetch(`/api/governance/schemes?${qs.toString()}`, {
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      const json = (await res.json().catch(() => null)) as SchemeCoverageSchoolResponse | null;

      if (!res.ok || !json?.ok) {
        setSchoolDetail(null);
        setSchoolError(json && !json.ok ? json.error : `Failed to load school scheme detail (${res.status})`);
        return;
      }

      setSchoolDetail(json);
      if (json.ok) {
        const preferredTeacher =
          json.teachers.find((teacher) => teacher.needsFollowUp)?.teacherUserId ??
          json.teachers[0]?.teacherUserId ??
          null;

        setSelectedTeacherUserId((current) =>
          current && json.teachers.some((teacher) => teacher.teacherUserId === current)
            ? current
            : preferredTeacher,
        );
      }
    } catch {
      setSchoolDetail(null);
      setSchoolError("Network/server error while loading school scheme detail.");
    } finally {
      setSchoolLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    if (!selectedTenantId) {
      setSchoolDetail(null);
      return;
    }

    void loadSchool(selectedTenantId);
  }, [selectedTenantId]);

  const summary = overview?.ok ? overview.summary : null;
  const schools = overview?.ok ? overview.schools : [];
  const followUpSchools = overview?.ok ? overview.followUpSchools : [];
  const selectedSchoolFromOverview = useMemo(
    () => schools.find((school) => school.tenantId === selectedTenantId) ?? null,
    [schools, selectedTenantId],
  );
  const selectedSchool = schoolDetail?.ok ? schoolDetail.school : selectedSchoolFromOverview;
  const teachers = schoolDetail?.ok ? schoolDetail.teachers : [];
  const schoolOptions = followUpSchools.length ? followUpSchools : schools;
  const selectedTeacher = useMemo(() => {
    if (!teachers.length) return null;

    return (
      teachers.find((teacher) => teacher.teacherUserId === selectedTeacherUserId) ??
      teachers.find((teacher) => teacher.needsFollowUp) ??
      teachers[0]
    );
  }, [teachers, selectedTeacherUserId]);

  return (
    <section className="rounded-[28px] border border-cyan-300/20 bg-cyan-500/10 p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
            Scheme Coverage command signal
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">
            Preparation evidence before teaching
          </h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-cyan-100/80">
            {isDistrictView
              ? "Director view: which schools and teachers still need approved schemes."
              : isCircuitView
                ? "SISSO view: schools and teachers needing scheme follow-up."
                : "Governance view of missing and approved scheme evidence."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadOverview()}
          disabled={overviewLoading}
          className="w-fit rounded-full border border-cyan-300/25 bg-cyan-500/20 px-4 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50"
        >
          {overviewLoading ? "Refreshing..." : "Refresh schemes"}
        </button>
      </div>

      {overviewError ? (
        <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">
          {overviewError}
        </div>
      ) : null}

      {summary ? (
        <>
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/35 p-4 text-sm leading-6 text-cyan-100/90">
            <span className="font-semibold text-white">Quick signal:</span>{" "}
            {summary.schoolsNeedingFollowUp} school(s) need follow-up. {summary.teachersWithApprovedScheme}/{summary.teachers} teacher(s) have approved scheme evidence.
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[0.86fr_1.14fr]">
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <div>
                <p className="text-sm font-bold text-white">Choose school</p>
                <p className="mt-1 text-xs leading-5 text-cyan-100/75">
                  Pick one school. The page hides the rest so the officer focuses on one action.
                </p>
              </div>

              <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                School
              </label>
              <select
                value={selectedTenantId ?? ""}
                onChange={(event) => {
                  setSelectedTenantId(event.target.value || null);
                  setSelectedTeacherUserId(null);
                }}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-cyan-200/50"
              >
                {!schoolOptions.length ? <option value="">No school available</option> : null}
                {schoolOptions.map((school) => (
                  <option key={school.tenantId} value={school.tenantId}>
                    {school.schoolName}
                    {school.needsFollowUp ? " — follow-up" : " — ready"}
                  </option>
                ))}
              </select>

              {selectedSchool || selectedSchoolFromOverview ? (
                <div className="mt-4 rounded-2xl border border-cyan-200/25 bg-cyan-500/15 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cx(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                        sectorBadgeClass(selectedSchool?.schoolSector ?? selectedSchoolFromOverview?.schoolSector),
                      )}
                    >
                      {sectorLabel(selectedSchool?.schoolSector ?? selectedSchoolFromOverview?.schoolSector)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
                      {selectedSchool?.circuitName ?? selectedSchoolFromOverview?.circuitName ?? "No circuit"}
                    </span>
                    <span
                      className={cx(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                        selectedSchool?.needsFollowUp ?? selectedSchoolFromOverview?.needsFollowUp
                          ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
                          : "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
                      )}
                    >
                      {selectedSchool?.needsFollowUp ?? selectedSchoolFromOverview?.needsFollowUp ? "Needs follow-up" : "Ready"}
                    </span>
                  </div>

                  <p className="mt-3 text-base font-bold text-white">
                    {selectedSchoolName(selectedSchool, selectedSchoolFromOverview?.schoolName ?? null)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {selectedSchool?.schoolCode || selectedSchoolFromOverview?.schoolCode || "No school code"} · {selectedSchool?.currentTerm || selectedSchoolFromOverview?.currentTerm || "No term"} · {selectedSchool?.currentAcademicYear || selectedSchoolFromOverview?.currentAcademicYear || "No academic year"}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-cyan-100/90">
                    {selectedSchool?.followUpReason ?? selectedSchoolFromOverview?.followUpReason ?? "No school signal available."}
                  </p>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <MiniStat
                      label="Approved"
                      value={`${selectedSchool?.teachersWithApprovedScheme ?? selectedSchoolFromOverview?.teachersWithApprovedScheme ?? 0}/${selectedSchool?.teachers ?? selectedSchoolFromOverview?.teachers ?? 0}`}
                      tone={
                        (selectedSchool?.teachersWithApprovedScheme ?? selectedSchoolFromOverview?.teachersWithApprovedScheme ?? 0) <
                        (selectedSchool?.teachers ?? selectedSchoolFromOverview?.teachers ?? 0)
                          ? "warning"
                          : "success"
                      }
                    />
                    <MiniStat
                      label="Missing"
                      value={selectedSchool?.teachersMissingAnyScheme ?? selectedSchoolFromOverview?.teachersMissingAnyScheme ?? 0}
                      tone={
                        selectedSchool?.teachersMissingAnyScheme ?? selectedSchoolFromOverview?.teachersMissingAnyScheme
                          ? "warning"
                          : "success"
                      }
                    />
                    <MiniStat
                      label="Schemes"
                      value={selectedSchool?.schemes ?? selectedSchoolFromOverview?.schemes ?? 0}
                      helper={`${selectedSchool?.schemeItems ?? selectedSchoolFromOverview?.schemeItems ?? 0} item(s)`}
                      tone="info"
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                  No school is available in this governance scope.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-white">Choose teacher</p>
                  <p className="mt-1 text-xs leading-5 text-cyan-100/75">
                    Show one teacher at a time. Start with the teacher needing attention.
                  </p>
                </div>

                <span className="w-fit rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white">
                  {schoolLoading ? "Loading..." : `${teachers.length} teacher(s)`}
                </span>
              </div>

              {schoolError ? (
                <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">
                  {schoolError}
                </div>
              ) : null}

              {teachers.length ? (
                <>
                  <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Teacher
                  </label>
                  <select
                    value={selectedTeacher?.teacherUserId ?? ""}
                    onChange={(event) => setSelectedTeacherUserId(event.target.value || null)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-cyan-200/50"
                  >
                    {teachers.map((teacher) => (
                      <option key={`${teacher.tenantId}:${teacher.teacherUserId}`} value={teacher.teacherUserId}>
                        {teacher.teacherName}
                        {teacher.hasApprovedScheme ? " — approved" : teacher.hasAnyScheme ? " — not approved" : " — missing"}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}

              {selectedTeacher ? (() => {
                const teacher = selectedTeacher;
                const counts = statusCountsSafe(teacher.statusCounts);

                return (
                  <article className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cx(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                          teacher.hasApprovedScheme
                            ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                            : teacher.hasAnyScheme
                              ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
                              : "border-red-300/25 bg-red-500/10 text-red-100",
                        )}
                      >
                        {teacher.hasApprovedScheme
                          ? "Approved evidence"
                          : teacher.hasAnyScheme
                            ? "Not approved yet"
                            : "Missing scheme"}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
                        {teacher.assignmentCount} assignment(s)
                      </span>
                    </div>

                    <p className="mt-3 text-base font-bold text-white">{teacher.teacherName}</p>
                    <p className="mt-1 text-sm leading-6 text-cyan-100/90">{teacher.followUpReason}</p>

                    {teacher.assignments.length ? (
                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        Assigned: {teacher.assignments.slice(0, 2).map(assignmentLabel).join("; ")}
                        {teacher.assignments.length > 2 ? "…" : ""}
                      </p>
                    ) : null}

                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <MiniStat
                        label="Schemes"
                        value={teacher.schemeCount}
                        helper={`${teacher.itemCount} item(s)`}
                        tone={teacher.schemeCount ? "info" : "danger"}
                      />
                      <MiniStat label="Draft" value={counts.DRAFT} tone={counts.DRAFT ? "warning" : "default"} />
                      <MiniStat label="Submitted" value={counts.SUBMITTED} tone={counts.SUBMITTED ? "warning" : "success"} />
                      <MiniStat label="Approved" value={counts.APPROVED} tone={counts.APPROVED ? "success" : "warning"} />
                    </div>

                    {teacher.schemes.length ? (
                      <div className="mt-4 space-y-2">
                        {teacher.schemes.slice(0, 3).map((scheme) => (
                          <div key={scheme.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-xs font-bold text-white">{scheme.title || scheme.subject}</p>
                                <p className="mt-1 text-[11px] leading-5 text-slate-400">
                                  {scheme.subject} · {scheme.classroomName || "No class"} · {scheme.term} · {scheme.academicYear} · {scheme.itemCount} item(s)
                                </p>
                              </div>
                              <span
                                className={cx(
                                  "w-fit rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                                  statusBadgeClass(scheme.status),
                                )}
                              >
                                {scheme.status}
                              </span>
                            </div>

                            <p className="mt-2 text-[11px] leading-5 text-slate-400">
                              Submitted: {compactDateTime(scheme.submittedAt)} · Approved: {compactDateTime(scheme.approvedAt)}
                            </p>

                            {scheme.headteacherComment ? (
                              <p className="mt-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] leading-5 text-amber-100">
                                Headteacher comment: {scheme.headteacherComment}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-xs leading-5 text-red-100">
                        No scheme of work evidence found for this teacher in the current filter window.
                      </div>
                    )}

                    {teacher.schemes.length > 3 ? (
                      <p className="mt-2 text-[11px] text-slate-400">
                        Showing first 3 of {teacher.schemes.length} scheme record(s).
                      </p>
                    ) : null}
                  </article>
                );
              })() : schoolLoading ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
                  Loading teacher scheme rows...
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                  Choose a school to see one teacher at a time.
                </div>
              )}
            </div>
          </div>
        </>
      ) : overviewLoading ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
          Loading scheme coverage...
        </div>
      ) : null}
    </section>
  );
}
