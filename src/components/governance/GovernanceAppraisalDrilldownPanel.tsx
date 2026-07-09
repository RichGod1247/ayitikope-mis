// src/components/governance/GovernanceAppraisalDrilldownPanel.tsx
"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type Tone = "default" | "success" | "warning" | "danger" | "info";

type SectionKey =
  | "PREPARATION"
  | "LESSON_DELIVERY"
  | "CLASSROOM_CULTURE"
  | "LEARNER_PARTICIPATION"
  | "UNDERSTANDING_STRATEGIES"
  | "EVALUATION_STRATEGIES";

type RubricItem = {
  key: string;
  order: number;
  label: string;
};

type RubricSection = {
  key: SectionKey | string;
  title: string;
  order: number;
  maxScore: number;
  percentField: string;
  items: RubricItem[];
};

type AppraisalSummary = {
  finalizedCount: number;
  teachersAppraised: number;
  averageOverall: number | null;
  latestFinalizedAt: string | null;
  sectionAverages?: Record<string, number | null>;
};

type CircuitRow = {
  circuitId: string;
  circuitName: string;
  districtId?: string | null;
  districtName?: string | null;
  schools: number;
  finalizedCount: number;
  teachersAppraised: number;
  averageOverall: number | null;
  latestFinalizedAt?: string | null;
};

type SchoolRow = {
  tenantId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector?: string | null;
  circuitId?: string | null;
  circuitName?: string | null;
  districtId?: string | null;
  districtName?: string | null;
  finalizedCount: number;
  teachersAppraised: number;
  averageOverall: number | null;
  latestFinalizedAt?: string | null;
};

type TeacherRow = {
  tenantId: string;
  teacherUserId: string;
  teacherName: string;
  staffId?: string | null;
  email?: string | null;
  schoolName?: string | null;
  schoolCode?: string | null;
  circuitName?: string | null;
  finalizedCount: number;
  averageOverall: number | null;
  latestFinalizedAt?: string | null;
};

type ReportRow = {
  id: string;
  tenantId: string;
  teacherUserId: string;
  teacherName: string;
  schoolName?: string | null;
  schoolCode?: string | null;
  circuitName?: string | null;
  dateObserved: string | null;
  subject: string | null;
  classTaught: string | null;
  overallPercentage: number | null;
  finalizedAt: string | null;
};

type ScoreRow = {
  id?: string;
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  sectionMaxScore: number;
  itemKey: string;
  itemLabel: string;
  itemOrder: number;
  score: number | null;
  notApplicable: boolean;
};

type EvidenceScheme = {
  id?: string;
  title?: string | null;
  subject?: string | null;
  level?: string | null;
  term?: string | null;
  academicYear?: string | null;
  status?: string | null;
  approvedAt?: string | null;
};

type EvidenceLessonNote = {
  id?: string;
  lessonTitle?: string | null;
  subject?: string | null;
  level?: string | null;
  substrand?: string | null;
  status?: string | null;
  approvedAt?: string | null;
};

type EvidenceLessonDelivery = {
  id?: string;
  subject?: string | null;
  dateTaught?: string | null;
  notes?: string | null;
  assessmentItems?: Array<{
    id?: string;
    title?: string | null;
    type?: string | null;
    status?: string | null;
    maxScore?: number | null;
    scoresCount?: number | null;
  }>;
};

type EvidenceSnapshot = Record<string, unknown> & {
  scheme?: EvidenceScheme | null;
  lessonNote?: EvidenceLessonNote | null;
  lessonDelivery?: EvidenceLessonDelivery | null;
};

type AppraisalReport = {
  id: string;
  tenantId: string;
  status?: string;
  teacherUserId: string;
  appraiserUserId?: string | null;
  finalizedByUserId?: string | null;

  teacherNameSnapshot?: string | null;
  schoolNameSnapshot?: string | null;
  circuitSnapshot?: string | null;
  appraiserNameSnapshot?: string | null;

  dateObserved?: string | null;
  classTaught?: string | null;
  term?: string | null;
  academicYear?: string | null;
  subject?: string | null;
  subStrand?: string | null;
  durationMinutes?: number | null;
  yearsInService?: number | null;
  yearsInPresentSchool?: number | null;

  schemeOfWorkId?: string | null;
  lessonNoteId?: string | null;
  lessonDeliveryId?: string | null;

  preparationPercent?: number | null;
  lessonDeliveryPercent?: number | null;
  classroomCulturePercent?: number | null;
  learnerParticipationPercent?: number | null;
  understandingStrategiesPercent?: number | null;
  evaluationStrategiesPercent?: number | null;
  overallPercentage?: number | null;

  generalComment?: string | null;
  finalizedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;

  scores?: ScoreRow[];

  officialHeader?: {
    teacherName?: string | null;
    schoolName?: string | null;
    circuitName?: string | null;
    dateObserved?: string | null;
    classTaught?: string | null;
    yearsInService?: number | null;
    yearsInPresentSchool?: number | null;
    subjectBeingObserved?: string | null;
    subStrand?: string | null;
    durationOfLesson?: number | null;
    appraiserName?: string | null;
    finalizedByName?: string | null;
  } | null;

  percentages?: {
    preparation?: number | null;
    lessonDelivery?: number | null;
    classroomCulture?: number | null;
    learnerParticipation?: number | null;
    understandingStrategies?: number | null;
    evaluationStrategies?: number | null;
    overall?: number | null;
  } | null;

  sections?: Array<RubricSection & {
    totalScore?: number | null;
    denominator?: number | null;
    percentage?: number | null;
    rows?: ScoreRow[];
  }>;

  teacher?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
  school?: {
    tenantId?: string;
    schoolName?: string | null;
    schoolCode?: string | null;
    schoolSector?: string | null;
    circuitId?: string | null;
    circuitName?: string | null;
    districtId?: string | null;
    districtName?: string | null;
  } | null;
  classroom?: {
    id?: string;
    name?: string | null;
    arm?: string | null;
  } | null;

  // Legacy flat evidence fields kept for compatibility with older API shapes.
  schemeOfWork?: EvidenceScheme | null;
  lessonNote?: EvidenceLessonNote | null;
  lessonDelivery?: EvidenceLessonDelivery | null;
  evidenceSnapshotJson?: EvidenceSnapshot | null;

  // Current governance report-detail API shape.
  evidence?: {
    schemeOfWork?: EvidenceScheme | null;
    lessonNote?: EvidenceLessonNote | null;
    lessonDelivery?: EvidenceLessonDelivery | null;
    snapshot?: EvidenceSnapshot | null;
  } | null;
};

type OverviewResponse = {
  ok: true;
  reqId?: string;
  scope?: {
    isSuperAdmin?: boolean;
    assignments?: unknown[];
    zoneCount?: number;
    tenantCount?: number;
  };
  summary: AppraisalSummary;
  circuits?: CircuitRow[];
  schools?: SchoolRow[];
  recent?: ReportRow[];
};

type RubricResponse = {
  ok: true;
  sections: RubricSection[];
  scale: Record<string, string>;
};

type CircuitResponse = {
  ok: true;
  circuit?: CircuitRow | null;
  summary?: AppraisalSummary;
  schools?: SchoolRow[];
  recent?: ReportRow[];
};

type SchoolResponse = {
  ok: true;
  school?: SchoolRow | null;
  summary?: AppraisalSummary;
  teachers?: TeacherRow[];
  reports?: ReportRow[];
};

type TeacherResponse = {
  ok: true;
  teacher?: TeacherRow | null;
  summary?: AppraisalSummary;
  reports?: ReportRow[];
};

type ReportResponse = {
  ok: true;
  report?: AppraisalReport;
  item?: AppraisalReport;
};

type ErrorResponse = {
  ok: false;
  error: string;
};

type ApiResponse =
  | OverviewResponse
  | RubricResponse
  | CircuitResponse
  | SchoolResponse
  | TeacherResponse
  | ReportResponse
  | ErrorResponse;

const SECTION_ORDER: RubricSection[] = [
  {
    key: "PREPARATION",
    title: "Measurement of Preparation of Lesson Plan",
    order: 1,
    maxScore: 35,
    percentField: "preparationPercent",
    items: [],
  },
  {
    key: "LESSON_DELIVERY",
    title: "Measurement of Lesson Delivery/Instruction",
    order: 2,
    maxScore: 25,
    percentField: "lessonDeliveryPercent",
    items: [],
  },
  {
    key: "CLASSROOM_CULTURE",
    title: "Measurement of Classroom Culture",
    order: 3,
    maxScore: 25,
    percentField: "classroomCulturePercent",
    items: [],
  },
  {
    key: "LEARNER_PARTICIPATION",
    title: "Measurement of Learners' Participation During Lesson Delivery",
    order: 4,
    maxScore: 30,
    percentField: "learnerParticipationPercent",
    items: [],
  },
  {
    key: "UNDERSTANDING_STRATEGIES",
    title: "Measurement of Strategies to Improve Pupils' Understanding",
    order: 5,
    maxScore: 30,
    percentField: "understandingStrategiesPercent",
    items: [],
  },
  {
    key: "EVALUATION_STRATEGIES",
    title: "Measurement of Evaluation Strategies",
    order: 6,
    maxScore: 25,
    percentField: "evaluationStrategiesPercent",
    items: [],
  },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
}

function formatPercent(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1).replace(/\.0$/, "")}%`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeZone: "Africa/Accra",
  }).format(d);
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(d);
}

function toneClass(tone: Tone) {
  if (tone === "success") return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
  if (tone === "warning") return "border-amber-300/20 bg-amber-400/10 text-amber-100";
  if (tone === "danger") return "border-red-300/20 bg-red-500/10 text-red-100";
  if (tone === "info") return "border-sky-300/20 bg-sky-500/10 text-sky-100";
  return "border-white/10 bg-white/[0.04] text-slate-200";
}

function safeArray<T>(value: T[] | undefined) {
  return Array.isArray(value) ? value : [];
}

async function fetchJson(url: string): Promise<ApiResponse> {
  const res = await fetch(url, {
    cache: "no-store",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  const json = (await res.json().catch(() => null)) as ApiResponse | null;

  if (!res.ok || !json?.ok) {
    const message =
      json && !json.ok
        ? json.error
        : `Failed to load appraisal evidence (${res.status})`;
    return { ok: false, error: message };
  }

  return json;
}

function summaryTone(summary?: AppraisalSummary | null): Tone {
  if (!summary?.finalizedCount) return "default";
  if (summary.averageOverall == null) return "info";
  if (summary.averageOverall < 50) return "danger";
  if (summary.averageOverall < 70) return "warning";
  return "success";
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
  tone?: Tone;
}) {
  return (
    <div className={cx("rounded-2xl border p-3", toneClass(tone))}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
      {helper ? <p className="mt-1 text-xs leading-5">{helper}</p> : null}
    </div>
  );
}

function RowButton({
  active,
  eyebrow,
  title,
  meta,
  right,
  onClick,
}: {
  active?: boolean;
  eyebrow?: string;
  title: string;
  meta?: string;
  right?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "w-full rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.06]",
        active
          ? "border-violet-200/50 bg-violet-500/20"
          : "border-white/10 bg-slate-950/45",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200">
              {eyebrow}
            </p>
          ) : null}
          <p className="mt-1 text-sm font-bold text-white">{title}</p>
          {meta ? <p className="mt-1 text-xs leading-5 text-slate-400">{meta}</p> : null}
        </div>
        {right ? (
          <span className="w-fit rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white">
            {right}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function scoreRowsBySection(report: AppraisalReport, section: RubricSection) {
  const directRows = safeArray(report.scores)
    .filter((score) => score.sectionKey === section.key)
    .sort((a, b) => {
      if (a.itemOrder !== b.itemOrder) return a.itemOrder - b.itemOrder;
      return a.itemKey.localeCompare(b.itemKey);
    });

  if (directRows.length) return directRows;

  const nestedSection = safeArray(report.sections).find(
    (item) => String(item.key) === String(section.key),
  );

  return safeArray(nestedSection?.rows)
    .filter((score) => score.sectionKey === section.key)
    .sort((a, b) => {
      if (a.itemOrder !== b.itemOrder) return a.itemOrder - b.itemOrder;
      return a.itemKey.localeCompare(b.itemKey);
    });
}

function sectionPercent(report: AppraisalReport, section: RubricSection) {
  const key = section.percentField as keyof AppraisalReport;
  const direct = report[key];
  if (typeof direct === "number") return direct;

  const nestedSection = safeArray(report.sections).find(
    (item) => String(item.key) === String(section.key),
  );
  if (typeof nestedSection?.percentage === "number") return nestedSection.percentage;

  const pct = report.percentages;
  if (!pct) return null;

  if (section.key === "PREPARATION") return pct.preparation ?? null;
  if (section.key === "LESSON_DELIVERY") return pct.lessonDelivery ?? null;
  if (section.key === "CLASSROOM_CULTURE") return pct.classroomCulture ?? null;
  if (section.key === "LEARNER_PARTICIPATION") return pct.learnerParticipation ?? null;
  if (section.key === "UNDERSTANDING_STRATEGIES") return pct.understandingStrategies ?? null;
  if (section.key === "EVALUATION_STRATEGIES") return pct.evaluationStrategies ?? null;

  return null;
}

function scoredTotal(rows: ScoreRow[]) {
  return rows.reduce((sum, row) => sum + (row.notApplicable ? 0 : numberValue(row.score)), 0);
}

function applicableMax(rows: ScoreRow[]) {
  return rows.filter((row) => !row.notApplicable).length * 5;
}

function scoreMark(row: ScoreRow, value: number | "N/A") {
  if (value === "N/A") return row.notApplicable ? "✓" : "";
  return !row.notApplicable && row.score === value ? "✓" : "";
}

function getReportFromResponse(json: ApiResponse): AppraisalReport | null {
  if (!json.ok) return null;
  if ("report" in json && json.report) return json.report;
  if ("item" in json && json.item) return json.item;
  return null;
}

function evidenceForReport(report: AppraisalReport) {
  const snapshot = report.evidence?.snapshot ?? report.evidenceSnapshotJson ?? null;

  return {
    scheme:
      report.evidence?.schemeOfWork ??
      report.schemeOfWork ??
      snapshot?.scheme ??
      null,
    lessonNote:
      report.evidence?.lessonNote ??
      report.lessonNote ??
      snapshot?.lessonNote ??
      null,
    lessonDelivery:
      report.evidence?.lessonDelivery ??
      report.lessonDelivery ??
      snapshot?.lessonDelivery ??
      null,
  };
}

function compactParts(parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

function OfficialAppraisalForm({
  report,
  rubric,
}: {
  report: AppraisalReport;
  rubric: RubricSection[];
}) {
  const sections = rubric.length ? rubric : SECTION_ORDER;
  const evidence = evidenceForReport(report);

  return (
    <article className="overflow-hidden rounded-[28px] border border-white/10 bg-white text-slate-950 shadow-2xl">
      <div className="border-b border-slate-300 p-4 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.16em]">
          Akatsi South Municipal Education Directorate
        </p>
        <h3 className="mt-1 text-sm font-black uppercase">
          Monitoring and Inspection Sheet (Teachers)
        </h3>
      </div>

      <div className="grid border-b border-slate-300 text-xs md:grid-cols-2">
        {[
          ["Name of Teacher", report.officialHeader?.teacherName || report.teacherNameSnapshot || report.teacher?.name || "—"],
          ["Number of Years in the Service", formatNumber(report.officialHeader?.yearsInService ?? report.yearsInService)],
          ["Name of School", report.officialHeader?.schoolName || report.schoolNameSnapshot || report.school?.schoolName || "—"],
          ["Number of Years in Present School", formatNumber(report.officialHeader?.yearsInPresentSchool ?? report.yearsInPresentSchool)],
          ["Name of Circuit", report.officialHeader?.circuitName || report.circuitSnapshot || report.school?.circuitName || "—"],
          ["Subject Being Observed", report.officialHeader?.subjectBeingObserved || report.subject || "—"],
          ["Date Observed", formatDate(report.officialHeader?.dateObserved ?? report.dateObserved)],
          ["Sub-strand", report.officialHeader?.subStrand || report.subStrand || "—"],
          ["Class Taught", report.officialHeader?.classTaught || report.classTaught || report.classroom?.name || "—"],
          ["Duration of Lesson", (report.officialHeader?.durationOfLesson ?? report.durationMinutes) ? `${report.officialHeader?.durationOfLesson ?? report.durationMinutes} minutes` : "—"],
        ].map(([label, value]) => (
          <div key={label} className="grid grid-cols-[170px_1fr] border-b border-slate-200 last:border-b-0 md:last:border-b">
            <div className="border-r border-slate-200 bg-slate-100 px-3 py-2 font-bold uppercase">
              {label}
            </div>
            <div className="px-3 py-2">{value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-2 py-2">S/N</th>
              <th className="border border-slate-300 px-2 py-2">
                Behavioural competence
                <span className="block text-[11px] font-normal">
                  [1–Very poor] [2–Poor] [3–Acceptable] [4–Good] [5–Very Good]
                </span>
              </th>
              <th className="border border-slate-300 px-2 py-2 text-center">N/A</th>
              {[1, 2, 3, 4, 5].map((n) => (
                <th key={n} className="border border-slate-300 px-2 py-2 text-center">
                  {n}
                </th>
              ))}
              <th className="border border-slate-300 px-2 py-2 text-center">Final score</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              const rows = scoreRowsBySection(report, section);
              const fallbackRows = rows.length
                ? rows
                : section.items.map((item) => ({
                    sectionKey: String(section.key),
                    sectionTitle: section.title,
                    sectionOrder: section.order,
                    sectionMaxScore: section.maxScore,
                    itemKey: item.key,
                    itemLabel: item.label,
                    itemOrder: item.order,
                    score: null,
                    notApplicable: false,
                  }));

              const total = scoredTotal(fallbackRows);
              const max = applicableMax(fallbackRows) || section.maxScore;
              const percent = sectionPercent(report, section);

              return (
                <Fragment key={section.key}>
                  <tr className="bg-slate-700 text-white">
                    <td className="border border-slate-500 px-2 py-2 font-bold">{section.order}.0</td>
                    <td colSpan={8} className="border border-slate-500 px-2 py-2 font-bold uppercase">
                      {section.title}
                    </td>
                  </tr>

                  {fallbackRows.map((row) => (
                    <tr key={`${section.key}-${row.itemKey}`}>
                      <td className="border border-slate-300 px-2 py-2">{row.itemKey}</td>
                      <td className="border border-slate-300 px-2 py-2">{row.itemLabel}</td>
                      <td className="border border-slate-300 px-2 py-2 text-center font-bold">
                        {scoreMark(row, "N/A")}
                      </td>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <td key={n} className="border border-slate-300 px-2 py-2 text-center font-bold">
                          {scoreMark(row, n)}
                        </td>
                      ))}
                      <td className="border border-slate-300 px-2 py-2 text-center">
                        {row.notApplicable ? "N/A" : row.score ?? "—"}
                      </td>
                    </tr>
                  ))}

                  <tr className="bg-slate-50 font-bold">
                    <td className="border border-slate-300 px-2 py-2" />
                    <td className="border border-slate-300 px-2 py-2 text-right">TOTAL SCORE</td>
                    <td colSpan={6} className="border border-slate-300 px-2 py-2 text-right">
                      {total} / {max}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center">
                      {formatPercent(percent)}
                    </td>
                  </tr>

                  <tr className="bg-slate-50 font-bold">
                    <td className="border border-slate-300 px-2 py-2" />
                    <td colSpan={8} className="border border-slate-300 px-2 py-2 text-center">
                      PERCENTAGE SCORE = (TOTAL SCORE/{max}) X 100 = {formatPercent(percent)}
                    </td>
                  </tr>
                </Fragment>
              );
            })}

            <tr className="bg-slate-100 font-black">
              <td className="border border-slate-300 px-2 py-2" />
              <td colSpan={7} className="border border-slate-300 px-2 py-2 text-right">
                OVERALL PERCENTAGE (1.0 + 2.0 + 3.0 + 4.0 + 5.0 + 6.0) ÷ 6
              </td>
              <td className="border border-slate-300 px-2 py-2 text-center">
                {formatPercent(report.overallPercentage ?? report.percentages?.overall ?? null)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid border-t border-slate-300 md:grid-cols-2">
        <div className="border-b border-slate-300 p-4 md:border-b-0 md:border-r">
          <p className="text-xs font-bold uppercase">General Comment(s)</p>
          <p className="mt-2 min-h-20 whitespace-pre-line text-sm">
            {report.generalComment || "—"}
          </p>
        </div>

        <div className="p-4">
          <p className="text-xs font-bold uppercase">Evidence Links</p>
          <dl className="mt-2 space-y-2 text-xs">
            <div>
              <dt className="font-bold">Approved scheme</dt>
              <dd>
                {evidence.scheme
                  ? compactParts([
                      evidence.scheme.title || "Approved scheme",
                      evidence.scheme.subject,
                      evidence.scheme.term,
                      evidence.scheme.academicYear,
                    ])
                  : report.schemeOfWorkId || "No scheme linked"}
              </dd>
            </div>
            <div>
              <dt className="font-bold">Approved lesson note</dt>
              <dd>
                {evidence.lessonNote
                  ? compactParts([
                      evidence.lessonNote.lessonTitle || evidence.lessonNote.substrand || "Approved lesson note",
                      evidence.lessonNote.subject,
                      evidence.lessonNote.approvedAt ? `approved ${formatDate(evidence.lessonNote.approvedAt)}` : null,
                    ])
                  : report.lessonNoteId || "No lesson note linked"}
              </dd>
            </div>
            <div>
              <dt className="font-bold">Lesson delivery</dt>
              <dd>
                {evidence.lessonDelivery
                  ? compactParts([
                      evidence.lessonDelivery.dateTaught ? formatDate(evidence.lessonDelivery.dateTaught) : "Lesson delivered",
                      evidence.lessonDelivery.subject,
                    ])
                  : report.lessonDeliveryId || "No delivery linked"}
              </dd>
            </div>
            <div>
              <dt className="font-bold">Assessment evidence</dt>
              <dd>
                {evidence.lessonDelivery?.assessmentItems?.length
                  ? `${evidence.lessonDelivery.assessmentItems.length} assessment item(s): ${evidence.lessonDelivery.assessmentItems
                      .slice(0, 3)
                      .map((item) => item.title || item.type || "Assessment")
                      .join(", ")}${evidence.lessonDelivery.assessmentItems.length > 3 ? "..." : ""}`
                  : "No assessment evidence linked"}
              </dd>
            </div>
            <div>
              <dt className="font-bold">Finalized</dt>
              <dd>
                {formatDateTime(report.finalizedAt)} by{" "}
                {report.appraiserNameSnapshot || "authorized appraiser"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="border-t border-slate-300 bg-slate-100 p-3 text-[11px] text-slate-700">
        Section totals shown above exclude N/A rows from the denominator. Final overall percentage is the average of valid section percentages.
      </div>
    </article>
  );
}

function ReportsList({
  reports,
  selectedReportId,
  onOpenReport,
}: {
  reports: ReportRow[];
  selectedReportId?: string | null;
  onOpenReport: (reportId: string) => void;
}) {
  return (
    <div className="space-y-2">
      {reports.length ? (
        reports.map((report) => (
          <RowButton
            key={report.id}
            active={selectedReportId === report.id}
            eyebrow={formatDate(report.dateObserved)}
            title={`${report.teacherName} · ${report.subject || "No subject"}`}
            meta={`${report.schoolName || "School"} · ${report.classTaught || "Class not set"} · Finalized ${formatDateTime(report.finalizedAt)}`}
            right={formatPercent(report.overallPercentage)}
            onClick={() => onOpenReport(report.id)}
          />
        ))
      ) : (
        <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm leading-6 text-slate-300">
          No finalized report is available at this level yet.
        </div>
      )}
    </div>
  );
}

export default function GovernanceAppraisalDrilldownPanel({
  isDistrictView,
  isCircuitView,
}: {
  isDistrictView: boolean;
  isCircuitView: boolean;
}) {
  const [rubric, setRubric] = useState<RubricSection[]>([]);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [schoolRows, setSchoolRows] = useState<SchoolRow[]>([]);
  const [teacherRows, setTeacherRows] = useState<TeacherRow[]>([]);
  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const [report, setReport] = useState<AppraisalReport | null>(null);

  const [selectedCircuitId, setSelectedCircuitId] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedTeacherUserId, setSelectedTeacherUserId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOverview() {
    setLoading(true);
    setError(null);

    const [rubricJson, overviewJson] = await Promise.all([
      fetchJson("/api/governance/appraisals?mode=rubric"),
      fetchJson("/api/governance/appraisals?mode=overview"),
    ]);

    if (rubricJson.ok && "sections" in rubricJson) {
      setRubric(safeArray(rubricJson.sections));
    }

    if (!overviewJson.ok) {
      setError(overviewJson.error);
      setOverview(null);
      setSchoolRows([]);
      setLoading(false);
      return;
    }

    const nextOverview = overviewJson as OverviewResponse;
    setOverview(nextOverview);

    const initialSchools = safeArray(nextOverview.schools);
    setSchoolRows(initialSchools);

    setSelectedCircuitId(null);
    setSelectedTenantId(null);
    setSelectedTeacherUserId(null);
    setSelectedReportId(null);
    setTeacherRows([]);
    setReportRows(safeArray(nextOverview.recent));
    setReport(null);
    setLoading(false);
  }

  async function openCircuit(circuitId: string) {
    setSelectedCircuitId(circuitId);
    setSelectedTenantId(null);
    setSelectedTeacherUserId(null);
    setSelectedReportId(null);
    setTeacherRows([]);
    setReportRows([]);
    setReport(null);
    setDetailLoading(true);
    setError(null);

    const json = await fetchJson(
      `/api/governance/appraisals?mode=circuit&circuitId=${encodeURIComponent(circuitId)}`,
    );

    if (!json.ok) {
      setError(json.error);
      setDetailLoading(false);
      return;
    }

    const next = json as CircuitResponse;
    setSchoolRows(safeArray(next.schools));
    setReportRows(safeArray(next.recent));
    setDetailLoading(false);
  }

  async function openSchool(tenantId: string) {
    setSelectedTenantId(tenantId);
    setSelectedTeacherUserId(null);
    setSelectedReportId(null);
    setTeacherRows([]);
    setReportRows([]);
    setReport(null);
    setDetailLoading(true);
    setError(null);

    const json = await fetchJson(
      `/api/governance/appraisals?mode=school&tenantId=${encodeURIComponent(tenantId)}`,
    );

    if (!json.ok) {
      setError(json.error);
      setDetailLoading(false);
      return;
    }

    const next = json as SchoolResponse;
    setTeacherRows(safeArray(next.teachers));
    setReportRows(safeArray(next.reports));
    setDetailLoading(false);
  }

  async function openTeacher(teacherUserId: string) {
    if (!selectedTenantId) return;

    setSelectedTeacherUserId(teacherUserId);
    setSelectedReportId(null);
    setReport(null);
    setDetailLoading(true);
    setError(null);

    const json = await fetchJson(
      `/api/governance/appraisals?mode=teacher&tenantId=${encodeURIComponent(
        selectedTenantId,
      )}&teacherUserId=${encodeURIComponent(teacherUserId)}`,
    );

    if (!json.ok) {
      setError(json.error);
      setDetailLoading(false);
      return;
    }

    const next = json as TeacherResponse;
    setReportRows(safeArray(next.reports));
    setDetailLoading(false);
  }

  async function openReport(reportId: string) {
    setSelectedReportId(reportId);
    setDetailLoading(true);
    setError(null);

    const json = await fetchJson(
      `/api/governance/appraisals?mode=report&id=${encodeURIComponent(reportId)}`,
    );

    if (!json.ok) {
      setError(json.error);
      setReport(null);
      setDetailLoading(false);
      return;
    }

    setReport(getReportFromResponse(json));
    setDetailLoading(false);
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  const circuits = safeArray(overview?.circuits);
  const summary = overview?.summary ?? {
    finalizedCount: 0,
    teachersAppraised: 0,
    averageOverall: null,
    latestFinalizedAt: null,
  };

  const selectedCircuit = useMemo(
    () => circuits.find((row) => row.circuitId === selectedCircuitId) ?? null,
    [circuits, selectedCircuitId],
  );

  const selectedSchool = useMemo(
    () => schoolRows.find((row) => row.tenantId === selectedTenantId) ?? null,
    [schoolRows, selectedTenantId],
  );

  const selectedTeacher = useMemo(
    () => teacherRows.find((row) => row.teacherUserId === selectedTeacherUserId) ?? null,
    [teacherRows, selectedTeacherUserId],
  );

  const headingLabel = isDistrictView
    ? "District appraisal drilldown"
    : isCircuitView
      ? "Circuit appraisal drilldown"
      : "Governance appraisal drilldown";

  return (
    <section className="rounded-[28px] border border-violet-300/20 bg-violet-500/10 p-4 md:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">
            Teacher Appraisal command signal
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">
            {headingLabel}
          </h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-violet-100/80">
            Finalized reports only. Draft appraisals stay hidden from governance.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadOverview()}
          disabled={loading}
          className="w-fit rounded-full border border-violet-300/25 bg-violet-500/20 px-4 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/30 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh appraisal reports"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat
          label="Finalized reports"
          value={summary.finalizedCount}
          helper="Draft appraisals are hidden"
          tone={summary.finalizedCount ? "success" : "default"}
        />
        <MiniStat
          label="Teachers appraised"
          value={summary.teachersAppraised}
          helper="Unique teachers with finalized reports"
          tone={summary.teachersAppraised ? "success" : "default"}
        />
        <MiniStat
          label="Average score"
          value={formatPercent(summary.averageOverall)}
          helper="Average of finalized reports"
          tone={summaryTone(summary)}
        />
        <MiniStat
          label="Latest finalized"
          value={formatDate(summary.latestFinalizedAt)}
          helper="Most recent locked appraisal"
          tone={summary.latestFinalizedAt ? "info" : "default"}
        />
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-300">
          Loading finalized appraisal reports...
        </div>
      ) : null}

      {!loading && !summary.finalizedCount ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm leading-6 text-slate-300">
          No finalized teacher appraisal report is available in this governance
          scope yet. Once a headteacher finalizes an appraisal, it will appear
          here for drilldown.
        </div>
      ) : null}

      {!loading && summary.finalizedCount ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1fr]">
          <div className="space-y-4">
            {isDistrictView ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                <p className="text-sm font-bold text-white">1. Circuits with appraisal reports</p>
                <p className="mt-1 text-xs leading-5 text-violet-100/75">
                  Click a circuit to list only schools with finalized appraisal reports.
                </p>

                <div className="mt-3 space-y-2">
                  {circuits.length ? (
                    circuits.map((circuit) => (
                      <RowButton
                        key={circuit.circuitId}
                        active={selectedCircuitId === circuit.circuitId}
                        eyebrow="Circuit"
                        title={circuit.circuitName}
                        meta={`${circuit.schools} school(s) · ${circuit.teachersAppraised} teacher(s) appraised`}
                        right={formatPercent(circuit.averageOverall)}
                        onClick={() => void openCircuit(circuit.circuitId)}
                      />
                    ))
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
                      No circuit has finalized appraisal reports yet.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <p className="text-sm font-bold text-white">
                {isDistrictView ? "2. Schools with appraisal reports" : "1. Schools with appraisal reports"}
              </p>
              <p className="mt-1 text-xs leading-5 text-violet-100/75">
                {isDistrictView
                  ? selectedCircuit
                    ? `Showing schools under ${selectedCircuit.circuitName}.`
                    : "Select a circuit first, or use the overview list where available."
                  : "Showing schools in the authorized circuit scope."}
              </p>

              <div className="mt-3 space-y-2">
                {schoolRows.length ? (
                  schoolRows.map((school) => (
                    <RowButton
                      key={school.tenantId}
                      active={selectedTenantId === school.tenantId}
                      eyebrow={school.circuitName || "School"}
                      title={school.schoolName}
                      meta={`${school.schoolCode || "No school code"} · ${school.teachersAppraised} teacher(s) appraised`}
                      right={formatPercent(school.averageOverall)}
                      onClick={() => void openSchool(school.tenantId)}
                    />
                  ))
                ) : (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
                    {isDistrictView && !selectedCircuitId
                      ? "Select a circuit to see its schools."
                      : "No school has finalized appraisal reports at this level."}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <p className="text-sm font-bold text-white">
                {isDistrictView ? "3. Teachers with appraisal reports" : "2. Teachers with appraisal reports"}
              </p>
              <p className="mt-1 text-xs leading-5 text-violet-100/75">
                {selectedSchool
                  ? `Showing teachers in ${selectedSchool.schoolName}.`
                  : "Select a school first."}
              </p>

              <div className="mt-3 space-y-2">
                {teacherRows.length ? (
                  teacherRows.map((teacher) => (
                    <RowButton
                      key={teacher.teacherUserId}
                      active={selectedTeacherUserId === teacher.teacherUserId}
                      eyebrow={teacher.staffId ? `Staff ID ${teacher.staffId}` : "Teacher"}
                      title={teacher.teacherName}
                      meta={`${teacher.finalizedCount} finalized report(s)`}
                      right={formatPercent(teacher.averageOverall)}
                      onClick={() => void openTeacher(teacher.teacherUserId)}
                    />
                  ))
                ) : (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
                    {selectedSchool
                      ? "No teacher rows returned for this school yet."
                      : "Select a school to list teachers."}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <p className="text-sm font-bold text-white">
                {isDistrictView ? "4. Appraisal reports" : "3. Appraisal reports"}
              </p>
              <p className="mt-1 text-xs leading-5 text-violet-100/75">
                {selectedTeacher
                  ? `Showing finalized reports for ${selectedTeacher.teacherName}.`
                  : selectedSchool
                    ? "Select a teacher, or open one of the school-level reports below."
                    : "Select a school/teacher to focus the report list."}
              </p>

              {detailLoading ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
                  Loading drilldown evidence...
                </div>
              ) : null}

              <div className="mt-3">
                <ReportsList
                  reports={reportRows}
                  selectedReportId={selectedReportId}
                  onOpenReport={(id) => void openReport(id)}
                />
              </div>
            </div>

            {report ? (
              <OfficialAppraisalForm report={report} rubric={rubric} />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm leading-6 text-slate-300">
                Open a finalized appraisal report to display the Director-style
                form with section scores, total scores, percentages, overall
                percentage, comment, and linked evidence.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
