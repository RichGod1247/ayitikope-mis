//src/components/governance/GovernanceTeacherAbsenteeismRiskPanel.tsx
"use client";

import { useMemo, useState } from "react";

export type GovernanceAbsenteeTeacher = {
  teacherUserId: string;
  staffId: string | null;
  teacherName: string;
  absentDays: number;
  lastAbsentDate: string | null;
};

export type GovernanceAbsenteeSchool = {
  tenantId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector: string;
  circuitId: string | null;
  circuitName: string;
  absentTeacherCount: number;
  totalAbsentDays: number;
  teachers: GovernanceAbsenteeTeacher[];
};

export type GovernanceAbsenteeCircuit = {
  circuitId: string;
  circuitName: string;
  absentTeacherCount: number;
  totalAbsentDays: number;
  schoolsWithCases: number;
  schools: GovernanceAbsenteeSchool[];
};

export type GovernanceTeacherAbsenteeismOverview = {
  thresholdDays: number;
  periodLabel: string;
  fromDate: string;
  toDate: string;
  fallbackUsed: boolean;
  flaggedTeachers: number;
  schoolsWithCases: number;
  circuitsWithCases: number;
  circuits: GovernanceAbsenteeCircuit[];
};

function ordinal(position: number) {
  const mod100 = position % 100;

  if (mod100 >= 11 && mod100 <= 13) return `${position}th`;

  if (position % 10 === 1) return `${position}st`;
  if (position % 10 === 2) return `${position}nd`;
  if (position % 10 === 3) return `${position}rd`;

  return `${position}th`;
}

function formatDate(value: string | null) {
  if (!value) return "Not available";

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeZone: "Africa/Accra",
  }).format(date);
}

export default function GovernanceTeacherAbsenteeismRiskPanel({
  data,
  isDistrictView,
}: {
  data?: GovernanceTeacherAbsenteeismOverview | null;
  isDistrictView: boolean;
}) {
  const [selectedCircuitId, setSelectedCircuitId] = useState<string | null>(
    null,
  );
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);

  const circuits = data?.circuits ?? [];

  const selectedCircuit =
    circuits.find((circuit) => circuit.circuitId === selectedCircuitId) ?? null;

  const circuitSchools = useMemo(() => {
    if (isDistrictView) {
      return selectedCircuit?.schools ?? [];
    }

    return circuits
      .flatMap((circuit) => circuit.schools)
      .sort(
        (a, b) =>
          b.absentTeacherCount - a.absentTeacherCount ||
          b.totalAbsentDays - a.totalAbsentDays ||
          a.schoolName.localeCompare(b.schoolName),
      );
  }, [circuits, isDistrictView, selectedCircuit]);

  const selectedSchool =
    circuitSchools.find((school) => school.tenantId === selectedSchoolId) ??
    null;

  if (!data || data.flaggedTeachers === 0) {
    return (
      <section className="rounded-[28px] border border-emerald-300/20 bg-emerald-400/10 p-4 md:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
          Teacher Absenteeism Risk Board
        </p>

        <h2 className="mt-2 text-lg font-bold text-white">
          No teacher has reached 3 absent days
        </h2>

        <p className="mt-2 text-sm leading-6 text-emerald-100/80">
          Only closed and certified teacher-attendance registers are counted.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-red-300/20 bg-red-500/10 p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
            Teacher Absenteeism Risk Board
          </p>

          <h2 className="mt-1 text-lg font-bold text-white">
            Teachers absent for 3 days or more
          </h2>

          <p className="mt-1 text-sm leading-6 text-red-100/80">
            Based only on closed and certified teacher-attendance registers.
          </p>
        </div>

        <span className="w-fit rounded-full border border-red-300/25 bg-black/20 px-3 py-1 text-xs font-semibold text-red-100">
          {data.periodLabel}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
            Teachers
          </p>
          <p className="mt-1 text-xl font-bold text-white">
            {data.flaggedTeachers}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
            Schools
          </p>
          <p className="mt-1 text-xl font-bold text-white">
            {data.schoolsWithCases}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
            Circuits
          </p>
          <p className="mt-1 text-xl font-bold text-white">
            {data.circuitsWithCases}
          </p>
        </div>
      </div>

      {isDistrictView ? (
        <div className="mt-5">
          <h3 className="text-sm font-bold text-white">
            Circuits ranked by absentee teachers
          </h3>

          <p className="mt-1 text-xs text-red-100/75">
            Tap a circuit to see its schools.
          </p>

          <div className="mt-3 space-y-2">
            {circuits.map((circuit, index) => {
              const active = circuit.circuitId === selectedCircuitId;

              return (
                <button
                  key={circuit.circuitId}
                  type="button"
                  onClick={() => {
                    setSelectedCircuitId(circuit.circuitId);
                    setSelectedSchoolId(null);
                  }}
                  className={`min-h-14 w-full rounded-2xl border p-3 text-left transition ${
                    active
                      ? "border-red-200/50 bg-red-500/20"
                      : "border-white/10 bg-slate-950/50 hover:bg-white/[0.07]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-red-200">
                        {ordinal(index + 1)}
                      </p>
                      <p className="truncate text-sm font-bold text-white">
                        {circuit.circuitName}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-bold text-white">
                        {circuit.absentTeacherCount}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        absentee teacher
                        {circuit.absentTeacherCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {!isDistrictView || selectedCircuit ? (
        <div className="mt-5">
          <h3 className="text-sm font-bold text-white">
            {isDistrictView && selectedCircuit
              ? `Schools in ${selectedCircuit.circuitName}`
              : "Schools ranked by absentee teachers"}
          </h3>

          <p className="mt-1 text-xs text-red-100/75">
            Tap a school to see the teachers.
          </p>

          <div className="mt-3 space-y-2">
            {circuitSchools.map((school, index) => {
              const active = school.tenantId === selectedSchoolId;

              return (
                <button
                  key={school.tenantId}
                  type="button"
                  onClick={() => setSelectedSchoolId(school.tenantId)}
                  className={`min-h-14 w-full rounded-2xl border p-3 text-left transition ${
                    active
                      ? "border-amber-200/50 bg-amber-400/15"
                      : "border-white/10 bg-slate-950/50 hover:bg-white/[0.07]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-amber-200">
                        {ordinal(index + 1)}
                      </p>

                      <p className="truncate text-sm font-bold text-white">
                        {school.schoolName}
                      </p>

                      <p className="mt-1 text-[11px] text-slate-400">
                        {school.schoolCode || "No school code"}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-bold text-white">
                        {school.absentTeacherCount}
                      </p>

                      <p className="text-[10px] text-slate-400">
                        absentee teacher
                        {school.absentTeacherCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {selectedSchool ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <h3 className="text-base font-bold text-white">
            {selectedSchool.schoolName}
          </h3>

          <p className="mt-1 text-xs text-slate-400">
            Teachers ranked by total certified absent days
          </p>

          <div className="mt-3 space-y-2">
            {selectedSchool.teachers.map((teacher, index) => (
              <article
                key={teacher.teacherUserId}
                className="rounded-xl border border-white/10 bg-white/[0.05] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-red-200">
                      {ordinal(index + 1)}
                    </p>

                    <p className="truncate text-sm font-bold text-white">
                      {teacher.teacherName}
                    </p>

                    <p className="mt-1 text-[11px] text-slate-400">
                      {teacher.staffId
                        ? `Staff ID: ${teacher.staffId}`
                        : "No staff ID"}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-bold text-red-100">
                      {teacher.absentDays}
                    </p>

                    <p className="text-[10px] text-slate-400">
                      absent day{teacher.absentDays === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                <p className="mt-2 text-xs text-slate-300">
                  Last absent: {formatDate(teacher.lastAbsentDate)}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}