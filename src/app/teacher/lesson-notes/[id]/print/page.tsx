// src/app/teacher/lesson-notes/[id]/print/page.tsx
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { notFound, redirect } from "next/navigation";
import HeadteacherReviewPanel from "./HeadteacherReviewPanel";

export const dynamic = "force-dynamic";

/** ----------------------- small, safe helpers ----------------------- */

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

function normalizeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function safeLower(v: unknown) {
  return typeof v === "string" ? v.toLowerCase().trim() : "";
}

function titleCase(s: string) {
  const x = clean(s);
  if (!x) return "";
  return x
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/\b(i|ii|iii|iv|v|vi)\b/gi, (m) => m.toUpperCase());
}

function firstMeaningfulLine(text: string) {
  const s = clean(text);
  if (!s) return "";
  const parts = s
    .split(/\n|[.!?]/)
    .map((x) => clean(x))
    .filter(Boolean);
  return parts[0] ?? s;
}

function uniq<T>(arr: T[]) {
  return [...new Set(arr)];
}

function parseListish(input: unknown): string[] {
  const s = clean(input);
  if (!s) return [];
  const normalized = s.replace(/[•·]/g, "\n").replace(/;/g, "\n").replace(/,/g, "\n");
  return uniq(
    normalized
      .split("\n")
      .map((x) => clean(x))
      .filter(Boolean)
      .map((x) => x.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean)
  );
}

function joinForPrint(list: string[], fallback: string) {
  const xs = uniq(list.map((x) => clean(x)).filter(Boolean));
  return xs.length ? xs.join("; ") : fallback;
}

// ✅ render stored SVG signature safely as <img src="data:...">
function signatureDataUrlFromSvg(svgRaw: unknown): string | null {
  if (typeof svgRaw !== "string") return null;
  const svg = svgRaw.trim();
  if (!svg) return null;

  const lower = svg.toLowerCase();
  if (!lower.startsWith("<svg")) return null;
  if (
    lower.includes("<script") ||
    lower.includes("javascript:") ||
    lower.includes("onload=") ||
    lower.includes("onerror=")
  )
    return null;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** ----------------------- subject-aware defaults ----------------------- */

function subjectKind(subjectRaw: string) {
  const s = safeLower(subjectRaw);
  if (s.includes("math")) return "MATH" as const;
  if (s.includes("comput") || s.includes("ict")) return "COMPUTING" as const;
  if (s.includes("social")) return "SOCIAL" as const;
  if (s.includes("english")) return "ENGLISH" as const;
  return "GENERAL" as const;
}

function defaultCoreCompetencies(subject: string) {
  const k = subjectKind(subject);
  if (k === "ENGLISH") {
    return [
      "Communication and Collaboration",
      "Creativity and Innovation",
      "Critical Thinking and Problem-Solving",
      "Personal Development and Leadership",
    ];
  }
  if (k === "MATH") {
    return ["Critical Thinking and Problem-Solving", "Creativity and Innovation", "Communication and Collaboration"];
  }
  return ["Critical Thinking and Problem-Solving", "Communication and Collaboration", "Personal Development and Leadership"];
}

function defaultTeachingResources(subject: string) {
  const k = subjectKind(subject);
  if (k === "MATH") {
    return [
      "Chalk/marker + board",
      "Exercise books",
      "Counters (bottle tops/beans)",
      "Number line/strip (paper)",
      "Place-value/base-ten materials (or improvised bundles/strips)",
    ];
  }
  if (k === "COMPUTING") {
    return ["Chalk/marker + board", "Computer/phone (if available)", "Printed screenshots (teacher-made)", "Exercise books"];
  }
  if (k === "SOCIAL") {
    return ["Chalk/marker + board", "Pictures/charts (phone if available)", "Short local examples (home/school/community)", "Exercise books"];
  }
  if (k === "ENGLISH") {
    return ["Chalk/marker + board", "Word/sentence cards (paper)", "Short reading text (teacher-made)", "Exercise books"];
  }
  return ["Chalk/marker + board", "Exercise books", "Locally available safe objects (if needed)"];
}

/** ----------------------- seeded-curriculum keyword extraction ----------------------- */

const STOPWORDS = new Set([
  "the","and","or","of","to","a","an","in","on","for","with","as","at","by","from","into","that","this","these","those",
  "is","are","be","being","been","was","were","will","can","should","may","might","must","do","does","did","done",
  "use","using","show","exhibit","demonstrate","understanding","understand","explain","identify","describe","discuss",
  "learners","students","pupils","teacher","lesson","topic","today","their","they","them","we","our","your"
]);

function extractKeywords(parts: string[], max = 6) {
  const bag: string[] = [];
  for (const p of parts) {
    const t = clean(p).replace(/[“”"’']/g, "").toLowerCase();
    if (!t) continue;
    const words = t.split(/[^a-z0-9-]+/g).filter(Boolean);
    for (const w of words) {
      if (w.length < 4) continue;
      if (STOPWORDS.has(w)) continue;
      bag.push(w);
    }
  }

  const counts = new Map<string, number>();
  for (const w of bag) counts.set(w, (counts.get(w) ?? 0) + 1);

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);

  const out: string[] = [];
  for (const w of sorted) {
    if (out.length >= max) break;
    const pretty = w.includes("-")
      ? w.split("-").map((x) => (x ? x[0]!.toUpperCase() + x.slice(1) : "")).join("-")
      : w[0]!.toUpperCase() + w.slice(1);
    out.push(pretty);
  }
  return out;
}

async function fetchExemplarText(args: { indicatorCode?: string | null; contentStandardCode?: string | null }): Promise<string[]> {
  const indicatorCode = clean(args.indicatorCode);
  const contentStandardCode = clean(args.contentStandardCode);

  const hasIndicatorModel = typeof (prisma as any)?.curriculumIndicator?.findFirst === "function";
  const hasCSModel = typeof (prisma as any)?.curriculumContentStandard?.findFirst === "function";
  if (!hasIndicatorModel || !indicatorCode) return [];

  if (contentStandardCode && hasCSModel) {
    try {
      const cs = await (prisma as any).curriculumContentStandard.findFirst({
        where: { code: contentStandardCode },
        select: { id: true },
      });

      if (cs?.id) {
        const row = await (prisma as any).curriculumIndicator.findFirst({
          where: { code: indicatorCode, contentStandardId: cs.id },
          select: { exemplars: { orderBy: { orderIndex: "asc" }, take: 6, select: { description: true } } },
        });

        const xs = Array.isArray(row?.exemplars) ? row.exemplars : [];
        const out = xs.map((x: any) => clean(x?.description)).filter(Boolean);
        if (out.length) return out;
      }
    } catch {}
  }

  try {
    const row = await (prisma as any).curriculumIndicator.findFirst({
      where: { code: indicatorCode },
      select: { exemplars: { orderBy: { orderIndex: "asc" }, take: 6, select: { description: true } } },
    });

    const xs = Array.isArray(row?.exemplars) ? row.exemplars : [];
    return xs.map((x: any) => clean(x?.description)).filter(Boolean);
  } catch {
    return [];
  }
}

/** ----------------------- page ----------------------- */

type PageProps = { params: Promise<{ id: string }> };

export default async function Page({ params }: PageProps) {
  // ✅ Next 15: params must be awaited
  const { id } = await params;
  const noteId = clean(id);

  const ctx = await requireServerUserContext({
    redirectTo: `/teacher/lesson-notes/${encodeURIComponent(noteId)}/print`,
    requireTenant: true,
  });

  // ✅ ACTIVE membership gate + role awareness
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });
  if (!membership || membership.status !== "ACTIVE") redirect("/app/dashboard");

  const roleName = membership.role?.name ?? "";
  const isReviewer = roleName === "HEADTEACHER" || roleName === "SCHOOL_ADMIN" || roleName === "SUPERADMIN";

  // ✅ Tenant isolation:
  // - Teacher: only own note
  // - Headteacher/Admin: any tenant note (but never “self-review” as teacher)
  const note = await prisma.lessonNote.findFirst({
    where: isReviewer
      ? { id: noteId, tenantId: ctx.tenantId }
      : { id: noteId, tenantId: ctx.tenantId, teacherUserId: ctx.userId },
    include: { tenant: true, teacher: true, classroom: true, curriculumUnit: true },
  });

  if (!note) return notFound();

  // prevent self-review print as headteacher (extra safety)
  if (isReviewer && note.teacherUserId === ctx.userId) return notFound();

  // Curriculum fields – prefer explicit lessonNote fields, fall back to CurriculumUnit
  const subject = note.subject ?? (note.curriculumUnit as any)?.subject ?? "";
  const strand = note.strand ?? (note.curriculumUnit as any)?.strand ?? "";
  const substrand = note.substrand ?? (note.curriculumUnit as any)?.substrand ?? "";
  const contentStandard = note.contentStandard ?? (note.curriculumUnit as any)?.contentStandard ?? "";
  const indicator = note.indicator ?? (note.curriculumUnit as any)?.indicator ?? "";

  const strandCode = (note.curriculumUnit as any)?.strandCode ?? null;
  const indicatorCode = (note.curriculumUnit as any)?.indicatorCode ?? null;
  const contentStandardCode = (note.curriculumUnit as any)?.contentStandardCode ?? null;

  // LESSON TITLE fallback logic
  let lessonTitle: string;
  if (note.lessonTitle && note.lessonTitle.trim().length > 0) lessonTitle = note.lessonTitle;
  else if ((note.curriculumUnit as any)?.indicator?.trim()) lessonTitle = (note.curriculumUnit as any).indicator;
  else if ((note.curriculumUnit as any)?.substrand?.trim()) lessonTitle = (note.curriculumUnit as any).substrand;
  else if (substrand?.trim()) lessonTitle = substrand;
  else lessonTitle = "______________________________________________";

  const topic = titleCase(lessonTitle === "______________________________________________" ? clean(indicator) : lessonTitle) || "Lesson";

  const schoolName = note.tenant?.name ?? "__________________________";
  const teacherName = note.teacher?.name ?? "__________________________";
  const teacherEmail = note.teacher?.email ?? "";

  const classroomName = normalizeLabel(note.classroom?.name);
  const phaseLabel = normalizeLabel(note.phase ?? (note.curriculumUnit as any)?.phase);
  const levelLabel = normalizeLabel(note.level ?? (note.curriculumUnit as any)?.level);

  const classLabel =
    classroomName ??
    (phaseLabel && levelLabel ? `${phaseLabel} – ${levelLabel}` : null) ??
    levelLabel ??
    phaseLabel ??
    "________________";

  const termLabel = note.term ?? "";
  const academicYearLabel = note.academicYear ?? "";

  const weekNumberLabel = typeof note.weekNumber === "number" ? note.weekNumber.toString() : "____";
  const durationLabel = "40 minutes";

  const weekEndingSource = (note as any).lessonDate ?? note.createdAt;
  const weekEndingLabel = formatDate(weekEndingSource);

  const exemplarText: string[] = await fetchExemplarText({ indicatorCode, contentStandardCode });

  const dbPerf =
    normalizeLabel((note as any).performanceIndicator) ?? normalizeLabel((note.curriculumUnit as any)?.performanceIndicator);

  const perfFromIndicator = indicator ? `Learners can ${clean(indicator).toLowerCase()}` : "";
  const perfFromExemplar = exemplarText.length ? `Learners can ${firstMeaningfulLine(exemplarText[0]!).replace(/^[•\-\s]+/g, "")}` : "";

  const performanceIndicatorText = dbPerf ?? (perfFromIndicator || perfFromExemplar || `Learners can explain ${topic} and give relevant examples.`);

  const dbCore =
    normalizeLabel((note as any).coreCompetencies) ?? normalizeLabel((note.curriculumUnit as any)?.coreCompetencies);

  const coreList = dbCore ? parseListish(dbCore) : defaultCoreCompetencies(subject);
  const coreCompetenciesText = joinForPrint(coreList, defaultCoreCompetencies(subject).join("; "));

  const dbKeywords =
    normalizeLabel((note as any).keywords) ?? normalizeLabel((note.curriculumUnit as any)?.keywords);

  const generatedKeywords = extractKeywords(
    [topic, clean(subject), clean(strand), clean(substrand), clean(contentStandard), clean(indicator), ...exemplarText.map((t) => firstMeaningfulLine(t))],
    6
  );

  const keywordsText = dbKeywords ? joinForPrint(parseListish(dbKeywords), generatedKeywords.join(", ")) : generatedKeywords.length ? generatedKeywords.join(", ") : "—";

  const teachingResources = note.teachingLearningResources ?? defaultTeachingResources(subject).join("; ");

  const lessonObjectives =
    note.objectives ??
    (indicator
      ? `Learning Outcomes (By the end of the lesson, learners can):\n• ${clean(indicator)}.`
      : `Learning Outcomes (By the end of the lesson, learners can):\n• Explain ${topic} and give examples.`);

  const priorKnowledgeText = note.priorKnowledge ?? `Learners can share relevant experiences about ${topic}.`;
  const introductionText = note.introduction ?? `Introduce ${topic} with a quick question, short discussion, or local example.`;

  const developmentText =
    note.lessonDevelopment ??
    (() => {
      const k = subjectKind(subject);
      if (k === "SOCIAL") return `Teacher explains ${topic} with 1 clear local example; learners discuss in pairs/groups, identify key ideas, and share short answers. Use a short scenario/role-play if helpful.`;
      if (k === "ENGLISH") return `Use a short text/picture prompt; model the skill once, practise together, then learners work independently while teacher supports.`;
      if (k === "MATH") return `Model one example (I do); practise together (We do); learners solve similar items (You do) while teacher coaches.`;
      if (k === "COMPUTING") return `Demonstrate the steps once; learners practise in pairs, then complete a short task independently while teacher supports.`;
      return `Explain the key idea; demonstrate once; practise together; then learners complete a short task while teacher supports.`;
    })();

  const conclusionText = note.conclusion ?? `Review key points; invite 2 learners to share an example/answer; summarise in one sentence.`;

  const assessmentText = note.assessment ?? `Use short oral questions and a quick exit task aligned to the indicator. Note learners who need support.`;

  const homeworkText = note.homework ?? `Find one example of ${topic} from home/community and write 2–3 lines (or draw) to share next lesson.`;

  const differentiationText =
    note.differentiationNotes ??
    `Support: break tasks into smaller steps; pair struggling learners with supportive peers.\nExtension: ask fast learners to explain “why” and create one new example.`;

  const reflectionText =
    note.reflectionNotes ?? `After the lesson, reflect on what worked, challenges faced, and what to improve next time.`;

  const createdAtLabel = formatDate(note.createdAt);
  const updatedAtLabel = formatDate(note.updatedAt);

  const headteacherComment = (note as any).headteacherComment ?? "";
  const approvedAtLabel = formatDate((note as any).approvedAt);
  const isApproved = (note as any).status === "APPROVED";

  const signatureDataUrl = signatureDataUrlFromSvg((note as any).approvalSignatureSvg);

  const referencesText = `Official NaCCA ${subject || "Curriculum"}; Teacher Resource Pack; EduLife OS Teacher Lesson Design Studio printout.`;

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
                &nbsp;| Class: <span className="font-semibold">{classLabel}</span>
              </span>
            ) : null}
          </p>
          <p className="text-[11px]">
            Teacher: <span className="font-semibold">{teacherName}</span>{" "}
            {teacherEmail && <span>({teacherEmail})</span>}
          </p>
          {(termLabel || academicYearLabel) && (
            <p className="text-[11px]">
              Term: <span className="font-semibold">{termLabel || "________"}</span> | Academic
              Year:{" "}
              <span className="font-semibold">{academicYearLabel || "________/________"}</span>
            </p>
          )}
          <p className="text-[10px] text-zinc-600">
            EduLife OS – NaCCA-aligned lesson note (print-ready)
          </p>
        </header>

        {/* MAIN INFO TABLE */}
        <table className="w-full border border-black border-collapse text-[11px] mb-4">
          <tbody>
            <tr>
              <td className="border border-black font-semibold px-1 py-1 w-[14%]">SUBJECT</td>
              <td className="border border-black px-1 py-1 w-[21%]">
                {subject || "____________________"}
              </td>
              <td className="border border-black font-semibold px-1 py-1 w-[10%]">WEEK</td>
              <td className="border border-black px-1 py-1 w-[8%] text-center">
                {weekNumberLabel}
              </td>
              <td className="border border-black font-semibold px-1 py-1 w-[15%]">DURATION</td>
              <td className="border border-black px-1 py-1 w-[10%] text-center">
                {durationLabel}
              </td>
              <td className="border border-black font-semibold px-1 py-1 w-[12%]">CLASS</td>
              <td className="border border-black px-1 py-1 w-[10%] text-center">
                {classLabel}
              </td>
              <td className="border border-black font-semibold px-1 py-1 w-[12%]">WEEK ENDING</td>
              <td className="border border-black px-1 py-1 w-[12%] text-center">
                {weekEndingLabel || "____________"}
              </td>
            </tr>

            <tr>
              <td className="border border-black font-semibold px-1 py-1">STRAND</td>
              <td className="border border-black px-1 py-1" colSpan={9}>
                {strandCode
                  ? `${strandCode} – ${strand || "______________________________________________"}`
                  : strand || "______________________________________________"}
              </td>
            </tr>

            <tr>
              <td className="border border-black font-semibold px-1 py-1">SUB-STRAND</td>
              <td className="border border-black px-1 py-1" colSpan={9}>
                {substrand || "______________________________________________"}
              </td>
            </tr>

            <tr>
              <td className="border border-black font-semibold px-1 py-1">CONTENT</td>
              <td className="border border-black px-1 py-1" colSpan={9}>
                {contentStandardCode
                  ? `${contentStandardCode} – ${contentStandard || "______________________________________________"}`
                  : contentStandard || "______________________________________________"}
              </td>
            </tr>

            <tr>
              <td className="border border-black font-semibold px-1 py-1">INDICATOR</td>
              <td className="border border-black px-1 py-1" colSpan={9}>
                {indicatorCode
                  ? `${indicatorCode} – ${indicator || "______________________________________________"}`
                  : indicator || "______________________________________________"}
              </td>
            </tr>

            <tr>
              <td className="border border-black font-semibold px-1 py-1">LESSON TITLE</td>
              <td className="border border-black px-1 py-1" colSpan={9}>
                {lessonTitle}
              </td>
            </tr>

            <tr>
              <td className="border border-black font-semibold px-1 py-1 align-top">PERFORMANCE INDICATOR(S)</td>
              <td className="border border-black px-1 py-1" colSpan={9}>
                {performanceIndicatorText}
              </td>
            </tr>

            <tr>
              <td className="border border-black font-semibold px-1 py-1 align-top">CORE COMPETENCIES</td>
              <td className="border border-black px-1 py-1" colSpan={9}>
                {coreCompetenciesText}
              </td>
            </tr>

            <tr>
              <td className="border border-black font-semibold px-1 py-1 align-top">TEACHING &amp; LEARNING RESOURCES</td>
              <td className="border border-black px-1 py-1" colSpan={9}>
                {teachingResources}
              </td>
            </tr>

            <tr>
              <td className="border border-black font-semibold px-1 py-1 align-top">KEYWORDS</td>
              <td className="border border-black px-1 py-1" colSpan={9}>
                {keywordsText}
              </td>
            </tr>

            <tr>
              <td className="border border-black font-semibold px-1 py-1 align-top">REFERENCES</td>
              <td className="border border-black px-1 py-1" colSpan={9}>
                {referencesText}
              </td>
            </tr>
          </tbody>
        </table>

        {/* LESSON BODY */}
        <table className="w-full border border-black border-collapse text-[11px] mb-4">
          <thead>
            <tr>
              <th className="border border-black px-1 py-1 w-[10%]">DAY</th>
              <th className="border border-black px-1 py-1 w-[30%]">PHASE 1: STARTER</th>
              <th className="border border-black px-1 py-1 w-[35%]">PHASE 2: NEW LEARNING &amp; ASSESSMENT</th>
              <th className="border border-black px-1 py-1 w-[25%]">PHASE 3: PLENARY / REFLECTION</th>
            </tr>
          </thead>
          <tbody>
            <tr className="align-top">
              <td className="border border-black px-1 py-1 font-semibold">{weekNumberLabel ? "Monday" : "Day"}</td>
              <td className="border border-black px-1 py-1 whitespace-pre-line">
                <p className="font-semibold underline mb-1">LESSON OBJECTIVES</p>
                <p className="mb-2">{lessonObjectives}</p>
                <p className="font-semibold underline mb-1">PRIOR KNOWLEDGE</p>
                <p className="mb-2">{priorKnowledgeText}</p>
                <p className="font-semibold underline mb-1">INTRODUCTION (STARTER)</p>
                <p>{introductionText}</p>
              </td>
              <td className="border border-black px-1 py-1 whitespace-pre-line">
                <p className="font-semibold underline mb-1">KEY LEARNING POINTS</p>
                <p className="mb-2">{contentStandard || `Highlight the main ideas and skills learners must acquire in ${topic}.`}</p>
                <p className="font-semibold underline mb-1">MAIN TEACHING &amp; LEARNING ACTIVITIES</p>
                <p>{developmentText}</p>
              </td>
              <td className="border border-black px-1 py-1 whitespace-pre-line">
                <p className="font-semibold underline mb-1">CONCLUSION</p>
                <p className="mb-2">{conclusionText}</p>
                <p className="font-semibold underline mb-1">REFLECTION</p>
                <p>{reflectionText}</p>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ASSESSMENT & HOMEWORK */}
        <section className="border border-black text-[11px] mb-4">
          <div className="border-b border-black px-2 py-1 font-semibold">ASSESSMENT / EVALUATION</div>
          <div className="px-2 py-1 whitespace-pre-line">{assessmentText}</div>
          <div className="border-t border-black px-2 py-1 font-semibold">HOMEWORK / ASSIGNMENT</div>
          <div className="px-2 py-1 whitespace-pre-line">{homeworkText}</div>
        </section>

        {/* DIFFERENTIATION */}
        <section className="border border-black text-[11px] mb-4">
          <div className="border-b border-black px-2 py-1 font-semibold">DIFFERENTIATION / SUPPORT FOR LEARNERS</div>
          <div className="px-2 py-1 whitespace-pre-line">{differentiationText}</div>
          <div className="border-t border-black px-2 py-1 font-semibold">TEACHER&apos;S REMARKS</div>
          <div className="px-2 py-1 text-[10px] text-zinc-700 flex flex-col gap-1">
            <div>Date prepared: <span className="font-semibold">{createdAtLabel || "____________"}</span></div>
            <div>Last updated: <span className="font-semibold">{updatedAtLabel || "____________"}</span></div>
            <div className="mt-2">Signature: ____________________________ &nbsp;&nbsp; Date: __________________</div>
          </div>
        </section>

        {/* HEADTEACHER REVIEW */}
        <section className="border border-black text-[11px] mb-4">
          <div className="border-b border-black px-2 py-1 font-semibold">HEADTEACHER&apos;S REVIEW / APPROVAL</div>
          <div className="px-2 py-1 whitespace-pre-line min-h-[48px]">
            {headteacherComment || "______________________________________________"}
          </div>
          <div className="border-t border-black px-2 py-2 flex flex-row justify-between items-center gap-4">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-[10px] text-zinc-700">Headteacher&apos;s Signature:</span>
              <div className="h-10 flex items-center">
                {isApproved ? (
                  signatureDataUrl ? (
                    <img src={signatureDataUrl} alt="Headteacher Signature" className="h-10 object-contain" />
                  ) : (
                    <img src="/images/headteacher-signature.png" alt="Headteacher Signature" className="h-10 object-contain" />
                  )
                ) : (
                  <span>___________________________</span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] text-zinc-700">Date:</span>
              <div>{isApproved && approvedAtLabel ? approvedAtLabel : "________________"}</div>
            </div>
          </div>
        </section>

        <p className="text-[10px] text-zinc-500 text-center mt-2 print:hidden">
          Tip: Use your browser&apos;s <span className="font-semibold">Print</span> command (Ctrl+P) to export as PDF.
        </p>

        <HeadteacherReviewPanel
          noteId={note.id}
          tenantId={note.tenantId}
          initialComment={headteacherComment}
          currentStatus={(note as any).status as string}
        />
      </div>
    </main>
  );
}