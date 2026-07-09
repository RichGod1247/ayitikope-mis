//src/app/governance/appraisals/[id]/print/ui.tsx
"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

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
  percentField?: string;
  items: RubricItem[];
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

type ReportSection = RubricSection & {
  totalScore?: number | null;
  denominator?: number | null;
  percentage?: number | null;
  rows?: ScoreRow[];
};

type AppraisalReport = {
  id: string;
  tenantId: string;
  teacherUserId: string;
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

  officialHeader?: {
    directorate?: string | null;
    directorateName?: string | null;
    districtName?: string | null;
    formTitle?: string | null;
    teacherName?: string | null;
    schoolName?: string | null;
    circuitName?: string | null;
    dateObserved?: string | null;
    classTaught?: string | null;
    yearsInService?: number | null;
    yearsInPresentSchool?: number | null;
    subjectBeingObserved?: string | null;
    subStrand?: string | null;
    durationOfLesson?: number | string | null;
    appraiserName?: string | null;
    finalizedByName?: string | null;
  };

  teacher?: { name?: string | null } | null;
  school?: {
    schoolName?: string | null;
    schoolCode?: string | null;
    circuitName?: string | null;
    districtName?: string | null;
  } | null;
  classroom?: { name?: string | null } | null;

  percentages?: {
    preparation?: number | null;
    lessonDelivery?: number | null;
    classroomCulture?: number | null;
    learnerParticipation?: number | null;
    understandingStrategies?: number | null;
    evaluationStrategies?: number | null;
    overall?: number | null;
  };

  sections?: ReportSection[];

  evidence?: {
    schemeOfWork?: {
      id: string;
      title?: string | null;
      subject?: string | null;
      level?: string | null;
      term?: string | null;
      academicYear?: string | null;
      status?: string | null;
      submittedAt?: string | null;
      reviewedAt?: string | null;
      approvedAt?: string | null;
    } | null;
    lessonNote?: {
      id: string;
      lessonTitle?: string | null;
      subject?: string | null;
      level?: string | null;
      term?: string | null;
      academicYear?: string | null;
      weekNumber?: number | null;
      substrand?: string | null;
      status?: string | null;
      approvedAt?: string | null;
      reviewedAt?: string | null;
    } | null;
    lessonDelivery?: {
      id: string;
      subject?: string | null;
      term?: string | null;
      academicYear?: string | null;
      dateTaught?: string | null;
      contentStandardCode?: string | null;
      indicatorCode?: string | null;
      notes?: string | null;
      assessmentItems?: Array<{
        id: string;
        title?: string | null;
        type?: string | null;
        status?: string | null;
        maxScore?: number | null;
        scoresCount?: number | null;
      }>;
    } | null;
    snapshot?: unknown;
  } | null;
};

type ApiResponse =
  | { ok: true; report: AppraisalReport; sections?: RubricSection[] }
  | { ok: false; error: string };

const FALLBACK_SECTIONS: RubricSection[] = [
  {
    key: "PREPARATION",
    title: "Measurement of Preparation of Lesson Plan",
    order: 1,
    maxScore: 35,
    items: [
      { key: "1.1", order: 1, label: "Preparation of Scheme of work (vetted and covers the term)" },
      { key: "1.2", order: 2, label: "Preparation of Learner notes (vetted, detailed, appropriate and up-to-date)" },
      { key: "1.3", order: 3, label: "Originality of Learner Notes (No signs of downloaded learner notes)" },
      { key: "1.4", order: 4, label: "Statement of adequate and appropriate core competencies" },
      { key: "1.5", order: 5, label: "Statement of appropriate/relevant TLMs in the lesson plan" },
      { key: "1.6", order: 6, label: "Statement of interactive activities in the lesson plan" },
      { key: "1.7", order: 7, label: "Coherence of stages of learner plan (well-arranged and well-paced)" },
    ],
  },
  {
    key: "LESSON_DELIVERY",
    title: "Measurement of Lesson Delivery/Instruction",
    order: 2,
    maxScore: 25,
    items: [
      { key: "2.1", order: 1, label: "Articulation of the Performance Indicators (PI) at the beginning of the lesson" },
      { key: "2.2", order: 2, label: "Clarity of explanation of content (logically sequenced, use of illustrations, use of examples to aid understanding)" },
      { key: "2.3", order: 3, label: "Linkage of pupils daily life or cultural orientation to the content of the lesson" },
      { key: "2.4", order: 4, label: "Deployment of TLMs during lesson delivery" },
      { key: "2.5", order: 5, label: "Teacher's confidence level during lesson delivery" },
    ],
  },
  {
    key: "CLASSROOM_CULTURE",
    title: "Measurement of Classroom Culture",
    order: 3,
    maxScore: 25,
    items: [
      { key: "3.1", order: 1, label: "The teacher treats all pupils with respect (e.g. teacher does not shout on pupils)" },
      { key: "3.2", order: 2, label: "The teacher uses positive language (e.g. good attempt, well done)" },
      { key: "3.3", order: 3, label: "The teacher rephrases language to promote understanding" },
      { key: "3.4", order: 4, label: "The teacher focuses on expected behaviour and redirects misbehavior" },
      { key: "3.5", order: 5, label: "The teacher recognizes learners with special needs and provides them with relevant support" },
    ],
  },
  {
    key: "LEARNER_PARTICIPATION",
    title: "Measurement of Learners' Participation During Lesson Delivery",
    order: 4,
    maxScore: 30,
    items: [
      { key: "4.1", order: 1, label: "Pupils volunteer to participate in the lesson without the teacher's prompt" },
      { key: "4.2", order: 2, label: "Learners ask questions during lesson" },
      { key: "4.3", order: 3, label: "Learners work collaboratively with each other during lesson" },
      { key: "4.4", order: 4, label: "Learners accept feedback from peers and teachers and work with them" },
      { key: "4.5", order: 5, label: "Learners have adequate learning materials (textbooks, notebooks, exercise books, pens, pencils, etc)" },
      { key: "4.6", order: 6, label: "The teacher provides learners with choices when it comes to activities" },
    ],
  },
  {
    key: "UNDERSTANDING_STRATEGIES",
    title: "Measurement of Strategies to Improve Pupils' Understanding",
    order: 5,
    maxScore: 30,
    items: [
      { key: "5.1", order: 1, label: "The teacher uses questions, prompts or other strategies to determine pupils' level of understanding" },
      { key: "5.2", order: 2, label: "The teacher distributes questions/learning task to all pupils in the class" },
      { key: "5.3", order: 3, label: "The teacher monitors pupil/students during independent/group work" },
      { key: "5.4", order: 4, label: "The teacher provides positive reinforcement (nodding, good, okay but...)" },
      { key: "5.5", order: 5, label: "The teacher links current lessons to previous lessons or knowledge in other subjects" },
      { key: "5.6", order: 6, label: "The teacher provides guidance to pupils before handing exercises/assignments" },
    ],
  },
  {
    key: "EVALUATION_STRATEGIES",
    title: "Measurement of Evaluation Strategies",
    order: 6,
    maxScore: 25,
    items: [
      { key: "6.1", order: 1, label: "Set tasks on relevant performance indicators/core competencies" },
      { key: "6.2", order: 2, label: "Marks learner's work promptly and accurately" },
      { key: "6.3", order: 3, label: "Provides feedback on learners performance (good/poor is not a good feedback)" },
      { key: "6.4", order: 4, label: "Records learner's marks in continuous assessment books/record" },
      { key: "6.5", order: 5, label: "Corrections have been done and marked" },
    ],
  },
];

function compactParts(parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

function formatNumber(value: unknown) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatPercent(value: unknown) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function formatDate(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Accra",
  }).format(d);
}

function formatDateTime(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(d);
}

function normalizeDirectorateName(raw: unknown) {
  const value = String(raw ?? "").trim();
  const base = value || "Education Directorate";

  if (/education\s+directorate/i.test(base)) {
    return base.toUpperCase();
  }

  return `${base} Education Directorate`.toUpperCase();
}

function directorateTitleFromReport(report: AppraisalReport) {
  return normalizeDirectorateName(
    report.officialHeader?.directorateName ??
      report.officialHeader?.districtName ??
      report.school?.districtName ??
      null,
  );
}

function rowsForSection(report: AppraisalReport, section: RubricSection): ScoreRow[] {
  const fromSection = report.sections?.find((s) => String(s.key) === String(section.key))?.rows;
  if (Array.isArray(fromSection) && fromSection.length) return fromSection;

  return section.items.map((item) => ({
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
}

function scoredTotal(rows: ScoreRow[]) {
  return rows.reduce((sum, row) => sum + (row.score ?? 0), 0);
}

function applicableMax(rows: ScoreRow[]) {
  return rows.filter((row) => !row.notApplicable).length * 5;
}

function sectionPercent(report: AppraisalReport, section: RubricSection) {
  const found = report.sections?.find((s) => String(s.key) === String(section.key));
  if (found?.percentage != null) return found.percentage;

  switch (section.key) {
    case "PREPARATION":
      return report.percentages?.preparation ?? report.preparationPercent ?? null;
    case "LESSON_DELIVERY":
      return report.percentages?.lessonDelivery ?? report.lessonDeliveryPercent ?? null;
    case "CLASSROOM_CULTURE":
      return report.percentages?.classroomCulture ?? report.classroomCulturePercent ?? null;
    case "LEARNER_PARTICIPATION":
      return report.percentages?.learnerParticipation ?? report.learnerParticipationPercent ?? null;
    case "UNDERSTANDING_STRATEGIES":
      return report.percentages?.understandingStrategies ?? report.understandingStrategiesPercent ?? null;
    case "EVALUATION_STRATEGIES":
      return report.percentages?.evaluationStrategies ?? report.evaluationStrategiesPercent ?? null;
    default:
      return null;
  }
}

function scoreMark(row: ScoreRow, value: number | "N/A") {
  if (value === "N/A") return row.notApplicable ? "✓" : "";
  return !row.notApplicable && row.score === value ? "✓" : "";
}

function evidenceForReport(report: AppraisalReport) {
  return {
    scheme: report.evidence?.schemeOfWork ?? null,
    lessonNote: report.evidence?.lessonNote ?? null,
    lessonDelivery: report.evidence?.lessonDelivery ?? null,
  };
}

function OfficialAppraisalForm({
  report,
  rubric,
}: {
  report: AppraisalReport;
  rubric: RubricSection[];
}) {
  const sections = rubric.length ? rubric : FALLBACK_SECTIONS;
  const directorateTitle = directorateTitleFromReport(report);
  const evidence = evidenceForReport(report);

  return (
    <article className="mx-auto w-full max-w-[1120px] overflow-hidden bg-white text-slate-950 print:max-w-none print:shadow-none">
      <div className="border-b border-slate-300 p-4 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.16em]">
          {directorateTitle}
        </p>
        <h1 className="mt-1 text-sm font-black uppercase">
          {report.officialHeader?.formTitle || "Monitoring and Inspection Sheet (Teachers)"}
        </h1>
      </div>

      <div className="grid border-b border-slate-300 text-xs md:grid-cols-2 print:grid-cols-2">
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
          <div key={label} className="grid grid-cols-[180px_1fr] border-b border-slate-200 last:border-b-0 md:last:border-b print:grid-cols-[170px_1fr]">
            <div className="border-r border-slate-200 bg-slate-100 px-3 py-2 font-bold uppercase">
              {label}
            </div>
            <div className="px-3 py-2">{value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto print:overflow-visible">
        <table className="min-w-[980px] w-full border-collapse text-left text-xs print:min-w-0">
          <thead>
            <tr className="bg-slate-100">
              <th className="w-[44px] border border-slate-300 px-2 py-2">S/N</th>
              <th className="border border-slate-300 px-2 py-2">
                Behavioural competence
                <span className="block text-[11px] font-normal">
                  [1–Very poor] [2–Poor] [3–Acceptable] [4–Good] [5–Very Good]
                </span>
              </th>
              <th className="w-[44px] border border-slate-300 px-2 py-2 text-center">N/A</th>
              {[1, 2, 3, 4, 5].map((n) => (
                <th key={n} className="w-[36px] border border-slate-300 px-2 py-2 text-center">
                  {n}
                </th>
              ))}
              <th className="w-[84px] border border-slate-300 px-2 py-2 text-center">Final score</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              const rows = rowsForSection(report, section);
              const total = scoredTotal(rows);
              const max = applicableMax(rows) || section.maxScore;
              const percent = sectionPercent(report, section);

              return (
                <Fragment key={section.key}>
                  <tr className="bg-slate-700 text-white">
                    <td className="border border-slate-500 px-2 py-2 font-bold">{section.order}.0</td>
                    <td colSpan={8} className="border border-slate-500 px-2 py-2 font-bold uppercase">
                      {section.title}
                    </td>
                  </tr>

                  {rows.map((row) => (
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

      <div className="grid border-t border-slate-300 md:grid-cols-2 print:grid-cols-2">
        <div className="border-b border-slate-300 p-4 md:border-b-0 md:border-r print:border-b-0 print:border-r">
          <p className="text-xs font-bold uppercase">General Comment(s)</p>
          <p className="mt-2 min-h-24 whitespace-pre-line text-sm">
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
                {report.appraiserNameSnapshot || report.officialHeader?.appraiserName || "authorized appraiser"}
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

export default function GovernanceAppraisalPrintClient({ reportId }: { reportId: string }) {
  const [report, setReport] = useState<AppraisalReport | null>(null);
  const [rubric, setRubric] = useState<RubricSection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const printDate = useMemo(() => formatDateTime(new Date().toISOString()), []);

  async function loadReport() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/governance/appraisals?mode=report&id=${encodeURIComponent(reportId)}`,
        {
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
        }
      );

      const json = (await res.json().catch(() => null)) as ApiResponse | null;

      if (!res.ok || !json?.ok) {
        setReport(null);
        setError(
          json && !json.ok
            ? json.error
            : `Failed to load finalized appraisal report (${res.status})`
        );
        return;
      }

      setReport(json.report);
      setRubric(json.sections ?? []);
    } catch {
      setReport(null);
      setError("Network/server error while loading appraisal report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#05070B_0%,#071A3D_55%,#05070B_100%)] px-3 py-5 text-white print:bg-white print:px-0 print:py-0 print:text-black">
      <section className="mx-auto mb-4 flex max-w-[1120px] flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.05] p-4 print:hidden md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8C96A]">
            EduLife OS · Governance
          </p>
          <h1 className="mt-1 text-xl font-bold">Official Appraisal Print View</h1>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            Finalized appraisal reports only. Use your browser print command to save as PDF.
          </p>
          <p className="mt-1 text-xs text-slate-400">Prepared: {printDate}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadReport()}
            disabled={loading}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!report}
            className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37] px-4 py-2 text-sm font-bold text-slate-950 hover:bg-[#E8C96A] disabled:opacity-50"
          >
            Print / Save PDF
          </button>
        </div>
      </section>

      {loading ? (
        <div className="mx-auto max-w-[1120px] rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300 print:hidden">
          Loading finalized appraisal report...
        </div>
      ) : null}

      {error ? (
        <div className="mx-auto max-w-[1120px] rounded-2xl border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100 print:hidden">
          {error}
        </div>
      ) : null}

      {report ? (
        <div className="mx-auto max-w-[1120px] rounded-[28px] border border-white/10 bg-white p-3 shadow-[0_28px_90px_rgba(0,0,0,0.34)] print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <OfficialAppraisalForm report={report} rubric={rubric} />
        </div>
      ) : null}

      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }

        @media print {
          html,
          body {
            background: white !important;
          }

          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </main>
  );
}
