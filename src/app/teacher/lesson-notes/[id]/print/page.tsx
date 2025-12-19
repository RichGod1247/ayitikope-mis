// src/app/teacher/lesson-notes/[id]/print/page.tsx
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import HeadteacherReviewPanel from "./HeadteacherReviewPanel";

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function normalizeLabel(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export default async function LessonNotePrintPage({
  params,
}: PageProps) {
  const { id } = await params;

  const note = await prisma.lessonNote.findUnique({
    where: { id },
    include: {
      tenant: true,
      teacher: true,
      classroom: true,
      curriculumUnit: true,
    },
  });

  if (!note) {
    notFound();
  }

  // Curriculum fields – prefer explicit lessonNote fields, fall back to CurriculumUnit
  const subject =
    note.subject ?? note.curriculumUnit?.subject ?? "";
  const strand =
    note.strand ?? note.curriculumUnit?.strand ?? "";
  const substrand =
    note.substrand ?? note.curriculumUnit?.substrand ?? "";
  const contentStandard =
    note.contentStandard ?? note.curriculumUnit?.contentStandard ?? "";
  const indicator =
    note.indicator ?? note.curriculumUnit?.indicator ?? "";

  const strandCode = note.curriculumUnit?.strandCode ?? null;
  const indicatorCode = note.curriculumUnit?.indicatorCode ?? null;
  const contentStandardCode =
    note.curriculumUnit?.contentStandardCode ?? null;

  // LESSON TITLE:
  // 1) Explicit lessonNote.lessonTitle (if teacher/AI set it)
  // 2) Curriculum indicator
  // 3) Curriculum substrand/topic
  // 4) Fallback underline
  let lessonTitle: string;
  if (note.lessonTitle && note.lessonTitle.trim().length > 0) {
    lessonTitle = note.lessonTitle;
  } else if (
    note.curriculumUnit?.indicator &&
    note.curriculumUnit.indicator.trim().length > 0
  ) {
    lessonTitle = note.curriculumUnit.indicator;
  } else if (
    note.curriculumUnit?.substrand &&
    note.curriculumUnit.substrand.trim().length > 0
  ) {
    lessonTitle = note.curriculumUnit.substrand;
  } else if (substrand && substrand.trim().length > 0) {
    lessonTitle = substrand;
  } else {
    lessonTitle =
      "______________________________________________";
  }

  const schoolName =
    note.tenant?.name ?? "__________________________";
  const teacherName =
    note.teacher?.name ?? "__________________________";
  const teacherEmail = note.teacher?.email ?? "";

  // CLASS:
  // 1) Classroom name (if set)
  // 2) Phase – Level (e.g. "KG – KG1")
  // 3) Level
  // 4) Phase
  // 5) Fallback underline
  const classroomName = normalizeLabel(note.classroom?.name);
  const phaseLabel = normalizeLabel(
    note.phase ?? note.curriculumUnit?.phase
  );
  const levelLabel = normalizeLabel(
    note.level ?? note.curriculumUnit?.level
  );

  const classLabel =
    classroomName ??
    (phaseLabel && levelLabel
      ? `${phaseLabel} – ${levelLabel}`
      : null) ??
    levelLabel ??
    phaseLabel ??
    "________________";

  const termLabel = note.term ?? "";
  const academicYearLabel = note.academicYear ?? "";

  const weekNumberLabel =
    typeof note.weekNumber === "number"
      ? note.weekNumber.toString()
      : "____";

  // For now we assume a single 40-minute lesson; this can later be driven from the note data.
  const durationLabel = "40 minutes";

  // WEEK ENDING:
  // Prefer explicit lessonDate; if missing, fall back to createdAt so it's never blank.
  const weekEndingSource = note.lessonDate ?? note.createdAt;
  const weekEndingLabel = formatDate(weekEndingSource);

  // Simple generic core competencies for now (later we can store per-lesson)
  const coreCompetencies =
    "Critical Thinking and Problem Solving; Communication and Collaboration; Creativity and Innovation";

  const teachingResources =
    note.teachingLearningResources ??
    "Concrete materials (counters, bottle tops, sticks), number cards, charts, songs and rhymes.";

  const lessonObjectives =
    note.objectives ??
    "Learners will demonstrate the key skill(s) in the indicator through songs, games and practical activities.";

  const priorKnowledgeText =
    note.priorKnowledge ??
    "Learners can already recognise, say or work with some numbers in their immediate environment.";

  const introductionText =
    note.introduction ??
    "Guide learners to sing a short counting song or chant; connect to real-life counting situations at home, in the market or on the farm.";

  const developmentText =
    note.lessonDevelopment ??
    "Use real objects to model the concept (I do); guide learners to practise together as a class (We do); then let individuals or pairs try independently while you provide support (You do).";

  const conclusionText =
    note.conclusion ??
    "Review the main ideas with learners; invite a few learners to demonstrate or explain in their own words; reinforce the key skill for the day.";

  const assessmentText =
    note.assessment ??
    "Use quick oral questions, practical tasks and short written exercises (where appropriate) to check understanding. Note learners who need more support.";

  const homeworkText =
    note.homework ??
    "Give a simple home task that encourages counting or practice with family members (e.g. count objects at home and report back).";

  const differentiationText =
    note.differentiationNotes ??
    "Pair struggling learners with supportive peers; give extra manipulatives and simpler numbers for slow learners; provide extension tasks and open-ended questions for fast learners.";

  const reflectionText =
    note.reflectionNotes ??
    "After the lesson, reflect on what went well, challenges faced and what you will adjust next time.";

  const createdAtLabel = formatDate(note.createdAt);
  const updatedAtLabel = formatDate(note.updatedAt);

  // NEW: Headteacher review fields
  const headteacherComment = note.headteacherComment ?? "";
  const approvedAtLabel = formatDate(note.approvedAt);
  const isApproved = note.status === "APPROVED";

  return (
    <main className="min-h-screen bg-zinc-200 print:bg-white flex justify-center py-6 px-2">
      <div className="bg-white text-black max-w-5xl w-full mx-auto border border-black p-4 md:p-6 print:shadow-none shadow-sm text-xs md:text-sm">
        {/* Top header */}
        <header className="mb-4 text-center space-y-1">
          <h1 className="text-base md:text-lg font-bold tracking-wide">
            LEARNER PLAN – {subject || "____________________"}
          </h1>
          <p className="font-semibold">
            {schoolName}{" "}
            {classLabel ? (
              <span className="font-normal">
                &nbsp;| Class:{" "}
                <span className="font-semibold">{classLabel}</span>
              </span>
            ) : null}
          </p>
          <p className="text-[11px]">
            Teacher:{" "}
            <span className="font-semibold">{teacherName}</span>{" "}
            {teacherEmail && <span>({teacherEmail})</span>}
          </p>
          {(termLabel || academicYearLabel) && (
            <p className="text-[11px]">
              Term:{" "}
              <span className="font-semibold">
                {termLabel || "________"}
              </span>{" "}
              | Academic Year:{" "}
              <span className="font-semibold">
                {academicYearLabel || "________/________"}
              </span>
            </p>
          )}
          <p className="text-[10px] text-zinc-600">
            EduLife OS – NaCCA-aligned lesson note (print-ready)
          </p>
        </header>

        {/* MAIN INFO TABLE – modelled on your NaCCA template */}
        <table className="w-full border border-black border-collapse text-[11px] mb-4">
          <tbody>
            {/* Row 1: SUBJECT, WEEK, DURATION, CLASS, WEEK ENDING */}
            <tr>
              <td className="border border-black font-semibold px-1 py-1 w-[14%]">
                SUBJECT
              </td>
              <td className="border border-black px-1 py-1 w-[21%]">
                {subject || "____________________"}
              </td>
              <td className="border border-black font-semibold px-1 py-1 w-[10%]">
                WEEK
              </td>
              <td className="border border-black px-1 py-1 w-[8%] text-center">
                {weekNumberLabel}
              </td>
              <td className="border border-black font-semibold px-1 py-1 w-[15%]">
                DURATION
              </td>
              <td className="border border-black px-1 py-1 w-[10%] text-center">
                {durationLabel}
              </td>
              <td className="border border-black font-semibold px-1 py-1 w-[12%]">
                CLASS
              </td>
              <td className="border border-black px-1 py-1 w-[10%] text-center">
                {classLabel}
              </td>
              <td className="border border-black font-semibold px-1 py-1 w-[12%]">
                WEEK ENDING
              </td>
              <td className="border border-black px-1 py-1 w-[12%] text-center">
                {weekEndingLabel || "____________"}
              </td>
            </tr>

            {/* STRAND */}
            <tr>
              <td className="border border-black font-semibold px-1 py-1">
                STRAND
              </td>
              <td
                className="border border-black px-1 py-1"
                colSpan={9}
              >
                {strandCode
                  ? `${strandCode} – ${
                      strand ||
                      "______________________________________________"
                    }`
                  : strand ||
                    "______________________________________________"}
              </td>
            </tr>

            {/* SUB-STRAND */}
            <tr>
              <td className="border border-black font-semibold px-1 py-1">
                SUB-STRAND
              </td>
              <td
                className="border border-black px-1 py-1"
                colSpan={9}
              >
                {substrand ||
                  "______________________________________________"}
              </td>
            </tr>

            {/* CONTENT STANDARD */}
            <tr>
              <td className="border border-black font-semibold px-1 py-1">
                CONTENT
              </td>
              <td
                className="border border-black px-1 py-1"
                colSpan={9}
              >
                {contentStandardCode
                  ? `${contentStandardCode} – ${
                      contentStandard ||
                      "______________________________________________"
                    }`
                  : contentStandard ||
                    "______________________________________________"}
              </td>
            </tr>

            {/* INDICATOR */}
            <tr>
              <td className="border border-black font-semibold px-1 py-1">
                INDICATOR
              </td>
              <td
                className="border border-black px-1 py-1"
                colSpan={9}
              >
                {indicatorCode
                  ? `${indicatorCode} – ${
                      indicator ||
                      "______________________________________________"
                    }`
                  : indicator ||
                    "______________________________________________"}
              </td>
            </tr>

            {/* LESSON TITLE / TOPIC */}
            <tr>
              <td className="border border-black font-semibold px-1 py-1">
                LESSON TITLE
              </td>
              <td
                className="border border-black px-1 py-1"
                colSpan={9}
              >
                {lessonTitle}
              </td>
            </tr>

            {/* PERFORMANCE INDICATOR(S) */}
            <tr>
              <td className="border border-black font-semibold px-1 py-1 align-top">
                PERFORMANCE INDICATOR(S)
              </td>
              <td
                className="border border-black px-1 py-1"
                colSpan={9}
              >
                Learners can{" "}
                {indicator
                  ? indicator.toLowerCase()
                  : "demonstrate the skills described in the indicator for this lesson using songs, games and practical activities."}
              </td>
            </tr>

            {/* CORE COMPETENCIES */}
            <tr>
              <td className="border border-black font-semibold px-1 py-1 align-top">
                CORE COMPETENCIES
              </td>
              <td
                className="border border-black px-1 py-1"
                colSpan={9}
              >
                {coreCompetencies}
              </td>
            </tr>

            {/* TEACHING & LEARNING RESOURCES */}
            <tr>
              <td className="border border-black font-semibold px-1 py-1 align-top">
                TEACHING &amp; LEARNING RESOURCES
              </td>
              <td
                className="border border-black px-1 py-1"
                colSpan={9}
              >
                {teachingResources}
              </td>
            </tr>

            {/* KEYWORDS */}
            <tr>
              <td className="border border-black font-semibold px-1 py-1 align-top">
                KEYWORDS
              </td>
              <td
                className="border border-black px-1 py-1"
                colSpan={9}
              >
                Counting, numeration, numbers, concrete materials, group
                work.
              </td>
            </tr>

            {/* REFERENCES */}
            <tr>
              <td className="border border-black font-semibold px-1 py-1 align-top">
                REFERENCES
              </td>
              <td
                className="border border-black px-1 py-1"
                colSpan={9}
              >
                Official NaCCA Curriculum &amp; Teacher Resource Pack;
                EduLife OS Teacher Lesson Design Studio printout.
              </td>
            </tr>
          </tbody>
        </table>

        {/* LESSON BODY – DAY / PHASES table, following your pattern */}
        <table className="w-full border border-black border-collapse text-[11px] mb-4">
          <thead>
            <tr>
              <th className="border border-black px-1 py-1 w-[10%]">
                DAY
              </th>
              <th className="border border-black px-1 py-1 w-[30%]">
                PHASE 1: STARTER
              </th>
              <th className="border border-black px-1 py-1 w-[35%]">
                PHASE 2: NEW LEARNING &amp; ASSESSMENT
              </th>
              <th className="border border-black px-1 py-1 w-[25%]">
                PHASE 3: PLENARY / REFLECTION
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="align-top">
              <td className="border border-black px-1 py-1 font-semibold">
                {weekNumberLabel ? "Monday" : "Day"}
              </td>
              <td className="border border-black px-1 py-1 whitespace-pre-line">
                <p className="font-semibold underline mb-1">
                  LESSON OBJECTIVES
                </p>
                <p className="mb-2">{lessonObjectives}</p>
                <p className="font-semibold underline mb-1">
                  PRIOR KNOWLEDGE
                </p>
                <p className="mb-2">{priorKnowledgeText}</p>
                <p className="font-semibold underline mb-1">
                  INTRODUCTION (STARTER)
                </p>
                <p>{introductionText}</p>
              </td>
              <td className="border border-black px-1 py-1 whitespace-pre-line">
                <p className="font-semibold underline mb-1">
                  KEY LEARNING POINTS
                </p>
                <p className="mb-2">
                  {contentStandard ||
                    "Highlight the main ideas and skills learners must acquire in this lesson."}
                </p>
                <p className="font-semibold underline mb-1">
                  MAIN TEACHING &amp; LEARNING ACTIVITIES
                </p>
                <p>{developmentText}</p>
              </td>
              <td className="border border-black px-1 py-1 whitespace-pre-line">
                <p className="font-semibold underline mb-1">
                  CONCLUSION
                </p>
                <p className="mb-2">{conclusionText}</p>
                <p className="font-semibold underline mb-1">
                  REFLECTION
                </p>
                <p>{reflectionText}</p>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ASSESSMENT & HOMEWORK BLOCK */}
        <section className="border border-black text-[11px] mb-4">
          <div className="border-b border-black px-2 py-1 font-semibold">
            ASSESSMENT / EVALUATION
          </div>
          <div className="px-2 py-1 whitespace-pre-line">
            {assessmentText}
          </div>
          <div className="border-t border-black px-2 py-1 font-semibold">
            HOMEWORK / ASSIGNMENT
          </div>
          <div className="px-2 py-1 whitespace-pre-line">
            {homeworkText}
          </div>
        </section>

        {/* DIFFERENTIATION & TEACHER'S REMARKS */}
        <section className="border border-black text-[11px] mb-4">
          <div className="border-b border-black px-2 py-1 font-semibold">
            DIFFERENTIATION / SUPPORT FOR LEARNERS
          </div>
          <div className="px-2 py-1 whitespace-pre-line">
            {differentiationText}
          </div>
          <div className="border-t border-black px-2 py-1 font-semibold">
            TEACHER&apos;S REMARKS
          </div>
          <div className="px-2 py-1 text-[10px] text-zinc-700 flex flex-col gap-1">
            <div>
              Date prepared:{" "}
              <span className="font-semibold">
                {createdAtLabel || "____________"}
              </span>
            </div>
            <div>
              Last updated:{" "}
              <span className="font-semibold">
                {updatedAtLabel || "____________"}
              </span>
            </div>
            <div className="mt-2">
              Signature: ____________________________ &nbsp;&nbsp;
              Date: __________________
            </div>
          </div>
        </section>

        {/* NEW: HEADTEACHER REVIEW & SIGNATURE BLOCK */}
        <section className="border border-black text-[11px] mb-4">
          <div className="border-b border-black px-2 py-1 font-semibold">
            HEADTEACHER&apos;S REVIEW / APPROVAL
          </div>
          <div className="px-2 py-1 whitespace-pre-line min-h-[48px]">
            {headteacherComment ||
              "______________________________________________"}
          </div>
          <div className="border-t border-black px-2 py-2 flex flex-row justify-between items-center gap-4">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-[10px] text-zinc-700">
                Headteacher&apos;s Signature:
              </span>
              <div className="h-10 flex items-center">
                {isApproved ? (
                  <img
                    src="/images/headteacher-signature.png"
                    alt="Headteacher Signature"
                    className="h-10 object-contain"
                  />
                ) : (
                  <span>___________________________</span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] text-zinc-700">Date:</span>
              <div>
                {isApproved && approvedAtLabel
                  ? approvedAtLabel
                  : "________________"}
              </div>
            </div>
          </div>
        </section>

        {/* Print hint – users can still use browser print */}
        <p className="text-[10px] text-zinc-500 text-center mt-2 print:hidden">
          Tip: Use your browser&apos;s{" "}
          <span className="font-semibold">Print</span>{" "}
          command (Ctrl+P) to export this official NaCCA-style lesson note
          as PDF for submission.
        </p>

        {/* Headteacher review controls (only visible in headteacher mode, hidden on print) */}
        <HeadteacherReviewPanel
          noteId={note.id}
          tenantId={note.tenantId}
          initialComment={headteacherComment}
          currentStatus={note.status as string}
        />
      </div>
    </main>
  );
}
