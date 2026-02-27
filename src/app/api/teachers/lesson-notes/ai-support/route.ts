// src/app/api/teachers/lesson-notes/ai-support/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mode = "FULL" | "QUICK";

type AiLessonFields = {
  lessonTitle?: string;

  // Dedicated fields (print page / UI can render these separately)
  performanceIndicator?: string; // plain sentence, no "Learners can..."
  coreCompetencies?: string; // bullet list string
  keywords?: string; // bullet list string

  // Existing lesson note fields
  objectives?: string; // MUST start with Learning Outcomes only
  teachingLearningResources?: string;
  introduction?: string;
  lessonDevelopment?: string;
  conclusion?: string;
  assessment?: string;
  homework?: string;
  differentiationNotes?: string;
  reflectionNotes?: string;
};

type LessonNoteForCoach = {
  id: string;
  subject: string;
  phase: string | null;
  level: string | null;

  term: string;
  academicYear: string;
  weekNumber: number | null;

  strand: string;
  substrand: string | null;
  contentStandard: string | null;
  indicator: string | null;
  lessonTitle: string | null;

  objectives: string | null;
  priorKnowledge: string | null;
  teachingLearningResources: string | null;
  introduction: string | null;
  lessonDevelopment: string | null;
  conclusion: string | null;
  assessment: string | null;
  homework: string | null;
  differentiationNotes: string | null;
  reflectionNotes: string | null;

  curriculumUnitId: string | null;
  schemeOfWorkItemId: string | null;
};

type Grounding = {
  strandCode?: string | null;
  strandTitle?: string | null;

  subStrandCode?: string | null;
  subStrandTitle?: string | null;

  contentStandardCode?: string | null;
  contentStandardDesc?: string | null;

  indicatorCode?: string | null;
  indicatorDesc?: string | null;

  unitWeekNumber?: number | null;
  unitNotes?: string | null;

  schemeItem?: {
    weekNumber?: number | null;
    dayNumber?: number | null;
    notes?: string | null;
    indicatorId?: string | null;
    indicatorCode?: string | null;
    indicatorDescription?: string | null;
    strandTitle?: string | null;
    subStrandTitle?: string | null;
    contentStandardCode?: string | null;
    contentStandardDescription?: string | null;
  } | null;

  exemplars: Array<{
    title?: string | null;
    description: string;
    assessmentNotes?: string | null;
  }>;
};

function jsonNoStore(payload: any, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json(payload, {
    status: init?.status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function safeUpper(s: unknown) {
  return typeof s === "string" ? s.toUpperCase() : "";
}

function clampMode(v: unknown): Mode {
  const m = safeUpper(v);
  return m === "QUICK" ? "QUICK" : "FULL";
}

function isPlausibleId(id: string) {
  if (!id) return false;
  if (id.length < 5 || id.length > 128) return false;
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

function clean(s: unknown) {
  return String(s ?? "").trim();
}

function safeLower(s: unknown) {
  return typeof s === "string" ? s.toLowerCase().trim() : "";
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

function bullet(lines: string[]) {
  return lines
    .map((x) => clean(x))
    .filter(Boolean)
    .map((x) => `• ${x}`)
    .join("\n");
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

function trimToMax(s: unknown, maxChars: number) {
  const x = clean(s);
  if (x.length <= maxChars) return x;
  return x.slice(0, maxChars - 1).trimEnd() + "…";
}

/** -------- stable seeded variability (non-repetitive across different notes) -------- */
function hash32(input: string) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function makeRng(seed: number) {
  // xorshift32
  let x = seed || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) / 0xffffffff) || 0.5;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function learnerLabel(level: string | null) {
  const lv = safeLower(level);
  if (lv.includes("jhs")) return { band: "JHS", minutes: 40 };
  if (lv.includes("kg")) return { band: "KG", minutes: 30 };
  if (
    lv.includes("basic 4") ||
    lv.includes("basic 5") ||
    lv.includes("basic 6") ||
    lv.includes("b4") ||
    lv.includes("b5") ||
    lv.includes("b6")
  ) {
    return { band: "Upper Primary", minutes: 35 };
  }
  return { band: "Primary", minutes: 35 };
}

function subjectStyle(subjectRaw: string) {
  const s = safeLower(subjectRaw);

  if (s.includes("math")) {
    return {
      kind: "MATH" as const,
      referencesLabel: "Mathematics Curriculum",
      coreMaterials: [
        "Chalk/marker + board",
        "Exercise books",
        "Counters (bottle tops/beans)",
        "Number line/strip (paper)",
        "Place-value/base-ten materials (or improvised bundles/strips)",
        "GH₵ note cut-outs (optional)",
      ],
      visuals: ["place-value chart", "base-ten blocks sketch", "number line"],
      localContexts: ["market prices (GH₵)", "bus/trotro fares", "measuring cups/spoons", "farm produce counts"],
    };
  }

  if (s.includes("comput") || s.includes("ict")) {
    return {
      kind: "COMPUTING" as const,
      referencesLabel: "Computing Curriculum",
      coreMaterials: ["Chalk/marker + board", "Computer/phone (if available)", "Printed screenshots (teacher-made)", "Exercise books"],
      visuals: ["simple diagram", "menu/screenshot printout", "flowchart on board"],
      localContexts: ["school ICT lab", "phone menu/apps", "mobile network issues", "home device sharing"],
    };
  }

  if (s.includes("social")) {
    return {
      kind: "SOCIAL" as const,
      referencesLabel: "Social Studies Curriculum",
      coreMaterials: ["Chalk/marker + board", "Local map sketch (teacher)", "Pictures/video/charts (phone if available)", "Exercise books"],
      visuals: ["community pictures", "simple chart", "role-play prompt cards"],
      localContexts: ["community landmarks", "market/day-to-day life", "family roles", "district/circuit examples"],
    };
  }

  if (s.includes("english")) {
    return {
      kind: "ENGLISH" as const,
      referencesLabel: "English Language Curriculum",
      coreMaterials: ["Chalk/marker + board", "Word/sentence cards (paper)", "Short reading text (teacher-made)", "Exercise books", "Pictures (book/phone) for prompts"],
      visuals: ["picture prompt", "short passage on board", "word cards"],
      localContexts: ["school announcements", "market conversations", "home routines", "local stories"],
    };
  }

  return {
    kind: "GENERAL" as const,
    referencesLabel: "Curriculum",
    coreMaterials: ["Chalk/marker + board", "Exercise books or slates", "Locally available objects (safe to handle)"],
    visuals: ["simple drawing on board", "real object demo"],
    localContexts: ["home", "market", "school", "community"],
  };
}

/**
 * Fetch curriculum grounding safely.
 * - Prefer SchemeOfWorkItem.indicatorId (strongest link to seeded exemplars)
 * - Else use indicatorCode + contentStandardCode
 * - Else fall back to flattened CurriculumUnit fields
 */
async function fetchGrounding(args: {
  tenantId: string;
  userId: string;
  note: LessonNoteForCoach;
  mode: Mode;
}): Promise<Grounding> {
  const { tenantId, userId, note, mode } = args;

  const maxExemplars = mode === "QUICK" ? 2 : 4;

  const out: Grounding = {
    exemplars: [],
    schemeItem: null,
  };

  // 1) Flattened CurriculumUnit (optional but useful)
  if (note.curriculumUnitId && isPlausibleId(note.curriculumUnitId) && typeof (prisma as any)?.curriculumUnit?.findFirst === "function") {
    const unit = await (prisma as any).curriculumUnit.findFirst({
      where: { id: note.curriculumUnitId, OR: [{ tenantId }, { tenantId: null }] },
      select: {
        strandCode: true,
        strand: true,
        substrandCode: true,
        substrand: true,
        contentStandardCode: true,
        contentStandard: true,
        indicatorCode: true,
        indicator: true,
        weekNumber: true,
        notes: true,
      },
    });

    if (unit) {
      out.strandCode = unit.strandCode ?? null;
      out.strandTitle = unit.strand ?? null;
      out.subStrandCode = unit.substrandCode ?? null;
      out.subStrandTitle = unit.substrand ?? null;
      out.contentStandardCode = unit.contentStandardCode ?? null;
      out.contentStandardDesc = unit.contentStandard ?? null;
      out.indicatorCode = unit.indicatorCode ?? null;
      out.indicatorDesc = unit.indicator ?? null;
      out.unitWeekNumber = unit.weekNumber ?? null;
      out.unitNotes = unit.notes ?? null;
    }
  }

  // 2) SchemeOfWorkItem (stronger "teacher planned" signal + might carry indicatorId)
  if (note.schemeOfWorkItemId && isPlausibleId(note.schemeOfWorkItemId) && typeof (prisma as any)?.schemeOfWorkItem?.findFirst === "function") {
    const sItem = await (prisma as any).schemeOfWorkItem.findFirst({
      where: {
        id: note.schemeOfWorkItemId,
        scheme: { tenantId, teacherUserId: userId },
      },
      select: {
        weekNumber: true,
        dayNumber: true,
        notes: true,
        indicatorId: true,
        indicatorCode: true,
        indicatorDescription: true,
        strandTitle: true,
        subStrandTitle: true,
        contentStandardCode: true,
        contentStandardDescription: true,
      },
    });

    if (sItem) {
      out.schemeItem = {
        weekNumber: sItem.weekNumber ?? null,
        dayNumber: sItem.dayNumber ?? null,
        notes: sItem.notes ?? null,
        indicatorId: sItem.indicatorId ?? null,
        indicatorCode: sItem.indicatorCode ?? null,
        indicatorDescription: sItem.indicatorDescription ?? null,
        strandTitle: sItem.strandTitle ?? null,
        subStrandTitle: sItem.subStrandTitle ?? null,
        contentStandardCode: sItem.contentStandardCode ?? null,
        contentStandardDescription: sItem.contentStandardDescription ?? null,
      };

      // scheme values override weaker unit strings if present
      out.strandTitle = out.strandTitle ?? sItem.strandTitle ?? null;
      out.subStrandTitle = out.subStrandTitle ?? sItem.subStrandTitle ?? null;
      out.contentStandardCode = out.contentStandardCode ?? sItem.contentStandardCode ?? null;
      out.contentStandardDesc = out.contentStandardDesc ?? sItem.contentStandardDescription ?? null;
      out.indicatorCode = out.indicatorCode ?? sItem.indicatorCode ?? null;
      out.indicatorDesc = out.indicatorDesc ?? sItem.indicatorDescription ?? null;
    }
  }

  // 3) Seeded Indicator → Exemplars (best grounding)
  const indicatorId = clean(out.schemeItem?.indicatorId);
  const indicatorCode = clean(out.indicatorCode);

  const hasIndicatorModel = typeof (prisma as any)?.curriculumIndicator?.findFirst === "function";
  const hasContentStandardModel = typeof (prisma as any)?.curriculumContentStandard?.findFirst === "function";

  if (hasIndicatorModel) {
    let indicatorRow: any = null;

    if (indicatorId && isPlausibleId(indicatorId)) {
      indicatorRow = await (prisma as any).curriculumIndicator.findFirst({
        where: { id: indicatorId },
        select: {
          code: true,
          description: true,
          exemplars: {
            orderBy: { orderIndex: "asc" },
            take: maxExemplars,
            select: { title: true, description: true, assessmentNotes: true },
          },
          contentStandard: {
            select: {
              code: true,
              description: true,
              subStrand: {
                select: {
                  code: true,
                  title: true,
                  strand: { select: { code: true, title: true } },
                },
              },
            },
          },
        },
      });
    } else if (indicatorCode) {
      const csCode = clean(out.contentStandardCode);

      if (csCode && hasContentStandardModel) {
        const cs = await (prisma as any).curriculumContentStandard.findFirst({
          where: { code: csCode },
          select: { id: true },
        });

        if (cs?.id) {
          indicatorRow = await (prisma as any).curriculumIndicator.findFirst({
            where: { code: indicatorCode, contentStandardId: cs.id },
            select: {
              code: true,
              description: true,
              exemplars: {
                orderBy: { orderIndex: "asc" },
                take: maxExemplars,
                select: { title: true, description: true, assessmentNotes: true },
              },
              contentStandard: {
                select: {
                  code: true,
                  description: true,
                  subStrand: {
                    select: {
                      code: true,
                      title: true,
                      strand: { select: { code: true, title: true } },
                    },
                  },
                },
              },
            },
          });
        }
      }

      if (!indicatorRow) {
        indicatorRow = await (prisma as any).curriculumIndicator.findFirst({
          where: { code: indicatorCode },
          select: {
            code: true,
            description: true,
            exemplars: {
              orderBy: { orderIndex: "asc" },
              take: maxExemplars,
              select: { title: true, description: true, assessmentNotes: true },
            },
            contentStandard: {
              select: {
                code: true,
                description: true,
                subStrand: {
                  select: {
                    code: true,
                    title: true,
                    strand: { select: { code: true, title: true } },
                  },
                },
              },
            },
          },
        });
      }
    }

    if (indicatorRow) {
      out.indicatorCode = out.indicatorCode ?? indicatorRow.code ?? null;
      out.indicatorDesc = out.indicatorDesc ?? indicatorRow.description ?? null;

      const cs = indicatorRow.contentStandard;
      if (cs) {
        out.contentStandardCode = out.contentStandardCode ?? cs.code ?? null;
        out.contentStandardDesc = out.contentStandardDesc ?? cs.description ?? null;

        const ss = cs.subStrand;
        if (ss) {
          out.subStrandCode = out.subStrandCode ?? ss.code ?? null;
          out.subStrandTitle = out.subStrandTitle ?? ss.title ?? null;

          const st = ss.strand;
          if (st) {
            out.strandCode = out.strandCode ?? st.code ?? null;
            out.strandTitle = out.strandTitle ?? st.title ?? null;
          }
        }
      }

      out.exemplars = Array.isArray(indicatorRow.exemplars)
        ? indicatorRow.exemplars
            .map((x: any) => ({
              title: x.title ?? null,
              description: clean(x.description),
              assessmentNotes: x.assessmentNotes ?? null,
            }))
            .filter((x: any) => !!x.description)
        : [];
    }
  }

  return out;
}

/** ---------- V4 helpers (template-like Ghana lesson-plan output) ---------- */

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

  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);

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

// ✅ Imperative, measurable, NO "Learners can..." in the returned text
function makePerformanceIndicator(args: {
  topic: string;
  indDesc: string;
  exemplars: Grounding["exemplars"];
  rng: () => number;
}) {
  const { topic, indDesc, exemplars, rng } = args;

  const e0 = exemplars[0]?.description ? firstMeaningfulLine(exemplars[0]!.description) : "";
  const e1 = exemplars[1]?.description ? firstMeaningfulLine(exemplars[1]!.description) : "";
  const candidates = [e0, e1, indDesc].map((x) => clean(x)).filter(Boolean);

  const base = candidates[0] || `Explain ${topic} and give examples`;

  const stripped = base
    .replace(/^[•\-\s]+/g, "")
    .replace(/^(By the end of the lesson, )?(learners|students|pupils)\s+(should be able to|can)\s+/i, "")
    .replace(/\b(Exhibit|Demonstrate|Show)\b/i, "Explain and show")
    .replace(/\s+/g, " ")
    .trim();

  const compact = trimToMax(stripped, 110);

  if (!/^(Explain|Identify|Describe|Discuss|Solve|Demonstrate|Compare|Write|Read|Create|Perform|Examine)\b/i.test(compact)) {
    return pick(rng, [
      `Explain ${topic} in your own words and give 2 examples.`,
      `Identify key ideas in ${topic} and apply them to real-life examples.`,
    ]);
  }

  return compact.endsWith(".") ? compact : `${compact}.`;
}

function buildWorldClassCoachV4(note: LessonNoteForCoach, grounding: Grounding, mode: Mode) {
  const seed = hash32(`${note.id}:${note.subject}:${note.term}:${note.academicYear}:${mode}:V4`);
  const rng = makeRng(seed);

  const lvl = learnerLabel(note.level);
  const style = subjectStyle(note.subject);

  const strand = clean(grounding.strandTitle || note.strand);
  const substrand = clean(grounding.subStrandTitle || note.substrand);
  const csDesc = clean(grounding.contentStandardDesc || note.contentStandard);
  const indDesc = clean(grounding.indicatorDesc || note.indicator);

  const topic =
    titleCase(clean(note.lessonTitle)) ||
    titleCase(substrand) ||
    titleCase(indDesc) ||
    titleCase(csDesc) ||
    titleCase(strand) ||
    titleCase(note.subject) ||
    "Lesson";

  const localContext = pick(rng, style.localContexts);
  const duration = lvl.minutes;

  const keywordsArr = extractKeywords(
    [
      topic,
      strand,
      substrand,
      csDesc,
      indDesc,
      ...grounding.exemplars.map((e) => firstMeaningfulLine(e.description)),
    ],
    mode === "QUICK" ? 4 : 6
  );
  const keywords = keywordsArr.length ? bullet(keywordsArr) : "• —";

  const performanceIndicator = makePerformanceIndicator({
    topic,
    indDesc,
    exemplars: grounding.exemplars,
    rng,
  });

  const coreCompetenciesArr = (() => {
    if (style.kind === "ENGLISH") {
      return [
        "Communication and Collaboration",
        "Creativity and Innovation",
        "Critical Thinking and Problem-Solving",
        "Personal Development and Leadership",
      ];
    }
    if (style.kind === "MATH") {
      return [
        "Critical Thinking and Problem-Solving",
        "Creativity and Innovation",
        "Communication and Collaboration",
      ];
    }
    return [
      "Communication and Collaboration",
      "Critical Thinking and Problem-Solving",
      "Personal Development and Leadership",
    ];
  })();
  const coreCompetencies = bullet(coreCompetenciesArr);

  const references = (() => {
    const base = style.referencesLabel;
    const pgHint = pick(rng, ["Pg. ____", "Pg. __", "Pg. ___"]);
    return `${base} ${pgHint}`;
  })();

  // ✅ Objectives MUST be ONLY learning outcomes (no headers, no date/week, no keywords, no competencies)
  const objectives = [
    "Learning Outcomes (By the end of the lesson, learners can):",
    bullet([
      indDesc
        ? `Demonstrate the indicator skill: ${trimToMax(indDesc, 140)}.`
        : `Explain the key idea of the lesson and give relevant examples.`,
      grounding.exemplars[0]?.description
        ? `Complete a guided task similar to the exemplar and explain their answers.`
        : `Use one real-life example from ${localContext} to show understanding.`,
      "Work respectfully in pairs/groups (take turns, listen, share materials).",
      "Answer an exit ticket to show understanding before dismissal.",
    ]),
  ].join("\n");

  const teachingLearningResources = [
    "Teaching & Learning Resources:",
    bullet(style.coreMaterials),
    "",
    "Suggested visuals (image-aware):",
    bullet(
      [
        `If you have EduLife/topic images or textbook pictures, display 1–2 and ask: “What do you notice?”`,
        ...style.visuals.map((v) => `Use a ${v} (or draw a quick version on the board).`),
        style.kind === "SOCIAL" ? "Pictures/video/charts (phone if available) to make examples real." : "",
      ].filter(Boolean)
    ),
    "",
    "Teacher note:",
    pick(rng, [
      "Keep pace tight: model once, then learners do the work. You coach and correct quickly.",
      "If materials are limited, demonstrate once, then rotate groups to share items fairly.",
    ]),
  ].join("\n");

  const priorKnowledgeLine = clean(note.priorKnowledge)
    ? `Prior knowledge (2–3 mins): ${trimToMax(note.priorKnowledge, 180)}`
    : "Prior knowledge (2–3 mins): Quick recap questions from the previous lesson (2–3 short questions).";

  const introduction = [
    `Starter focus: connect the topic to ${localContext}.`,
    pick(rng, [
      `Hook (2 mins): Ask learners to give 2 examples connected to ${topic}.`,
      `Hook (2 mins): Show a picture/quick sketch and ask: “What do you see? What does it mean?”`,
      `Hook (2 mins): Think–Pair–Share: “What do you already know about ${topic}?”`,
    ]),
    priorKnowledgeLine,
    indDesc
      ? `Purpose (30s): “Today we will learn to ${safeLower(indDesc).startsWith("exhibit") ? "show" : "do"} ${trimToMax(indDesc, 100)}.”`
      : `Purpose (30s): “Today we will learn about ${topic}.”`,
  ].join("\n");

  const exemplarSteps = grounding.exemplars.length
    ? grounding.exemplars
        .slice(0, mode === "QUICK" ? 2 : 3)
        .map((e, i) => `Task ${i + 1}: ${trimToMax(firstMeaningfulLine(e.description), 170)}`)
    : [];

  const t1 = Math.max(5, Math.round(duration * 0.2));
  const t2 = Math.max(20, Math.round(duration * 0.65));
  const t3 = Math.max(5, duration - (t1 + t2));

  const phase1 = [
    `PHASE 1: STARTER (${t1} mins)`,
    bullet([
      "Recap quickly using 2–3 questions (no long speeches).",
      "Share the performance indicator so learners know the target.",
      `Connect to real life: one example from ${localContext}.`,
    ]),
  ].join("\n");

  const phase2 = [
    `PHASE 2: NEW LEARNING (${t2} mins)`,
    bullet([
      "Teacher modelling: demonstrate 1 clear example aligned to the indicator.",
      style.kind === "SOCIAL"
        ? "Guide learners to explain the key concept(s) in their own words; then give examples from home/school/community."
        : style.kind === "ENGLISH"
        ? "Use a short text/picture prompt; guide learners through the skill step-by-step, then practice."
        : style.kind === "MATH"
        ? "Model one worked example; then learners solve 2 similar ones in pairs using counters/strips if needed."
        : "Model one example; learners practise in pairs while you coach.",
      ...exemplarSteps,
      "Group/pair work: circulate, correct misconceptions immediately, praise effort.",
      "Mini-check: cold-call 2 learners to explain the ‘why’ in one sentence.",
      "",
      "Assessment (during activity):",
      bullet([
        style.kind === "SOCIAL"
          ? `Write 2 examples that show ${topic}, then explain one in one sentence.`
          : style.kind === "MATH"
          ? "Solve 1 short problem and show steps (or a drawing/model)."
          : style.kind === "ENGLISH"
          ? "Respond to a short prompt using the correct skill (e.g., identify, infer, summarise)."
          : "Complete 1 short task that proves understanding.",
      ]),
    ]),
  ].join("\n");

  const phase3 = [
    `PHASE 3: REFLECTION (${t3} mins)`,
    bullet([
      "Use peer discussion + effective questioning: “What did we learn? What was difficult?”",
      "Take 2 learner answers; correct gently.",
      `Ask: “How will this help you in ${localContext}?”`,
      "Summarise the key idea in one sentence.",
    ]),
  ].join("\n");

  const lessonDevelopment = [
    `TERM: ${clean(note.term) || "—"}   ACADEMIC YEAR: ${clean(note.academicYear) || "—"}`,
    "",
    phase1,
    "",
    phase2,
    "",
    phase3,
  ].join("\n");

  const assessmentItems: string[] = [];
  if (style.kind === "SOCIAL") {
    assessmentItems.push(`1. Explain ${topic} in your own words (1–2 sentences).`);
    assessmentItems.push(`2. Give TWO agencies/agents of socialisation and state one role of each.`);
    assessmentItems.push(`3. Exit ticket: Give 2 correct examples + 1 sentence explanation.`);
  } else if (style.kind === "MATH") {
    assessmentItems.push("1. Solve 1–2 short questions aligned to the indicator (show steps or model).");
    assessmentItems.push("2. Create ONE similar question for your friend and swap to solve.");
    assessmentItems.push("3. Exit ticket: 1 question in 2 minutes.");
  } else if (style.kind === "ENGLISH") {
    assessmentItems.push("1. Do a short response task aligned to the indicator (2–3 minutes).");
    assessmentItems.push("2. Write 4–6 lines using the target skill (teacher checks for accuracy).");
    assessmentItems.push("3. Exit ticket: 1 short prompt/question.");
  } else {
    assessmentItems.push("1. Complete a short task aligned to the indicator/topic.");
    assessmentItems.push("2. Exit ticket: one question to prove understanding.");
  }

  const assessment = [
    "Assessment (Formative):",
    ...assessmentItems.map((x) => `• ${x}`),
    "",
    "Success Criteria:",
    bullet([
      "Learner gives correct examples (not random/rote words).",
      "Learner can explain the answer in simple steps/words.",
      "Learner improves after feedback (can correct a mistake).",
    ]),
  ].join("\n");

  const conclusion = [
    "Conclusion:",
    bullet([
      `Recap: “Today we learned about ${topic}.”`,
      "Let 2 learners share one correct example each; correct gently if needed.",
      `Link to life: where will you notice/use this in ${localContext}?`,
    ]),
  ].join("\n");

  const homework = pick(rng, [
    `Homework: Ask a parent/guardian one question about ${topic}. Bring one sentence answer next lesson.`,
    `Homework: Find one example related to ${topic} from ${localContext}. Write 2–3 lines (or draw) and be ready to share.`,
  ]);

  const differentiationNotes = [
    "Differentiation:",
    "",
    "Support (struggling learners):",
    bullet([
      "Break the task into smaller steps; model again with one simple example.",
      "Work beside them for 2 minutes, then let them try again (don’t do it for them).",
      style.kind === "MATH" ? "Use counters/strips to make the idea concrete before writing." : "Use concrete examples first before abstract explanations.",
    ]),
    "",
    "Extension (fast learners):",
    bullet([
      "Add one “why” question: explain the reason, not just the answer.",
      "Create a new example from daily life and justify it.",
      "Teach a partner using clear steps (teacher supervises).",
    ]),
  ].join("\n");

  const reflectionNotes = [
    "Reflection notes (after class):",
    bullet([
      "What worked best today, and why?",
      "What mistake showed up most? (be specific)",
      "What will I change next time (materials, grouping, pacing, explanation)?",
      "Evidence: which exit ticket answers prove mastery vs partial understanding?",
    ]),
  ].join("\n");

  const suggestion = (() => {
    const indCode = clean(grounding.indicatorCode);
    const csCode = clean(grounding.contentStandardCode);
    const ssCode = clean(grounding.subStrandCode);
    const stCode = clean(grounding.strandCode);

    const anchor = [
      "Curriculum anchor:",
      bullet([
        `Subject: ${clean(note.subject) || "—"}`,
        `Strand: ${stCode ? `${stCode} – ` : ""}${strand || "—"}`,
        `Sub-strand: ${ssCode ? `${ssCode} – ` : ""}${substrand || "—"}`,
        `Content standard: ${csCode ? `${csCode} – ` : ""}${csDesc || "—"}`,
        `Indicator: ${indCode ? `${indCode} – ` : ""}${indDesc || "—"}`,
      ]),
    ].join("\n");

    if (mode === "QUICK") {
      return [
        "Quick support generated in Ghana weekly-lesson-plan style.",
        `Topic: ${topic}`,
        "Use the PHASE structure; adjust examples for your class.",
        "",
        anchor,
      ].join("\n");
    }

    return [
      "Teacher-ready support generated in Ghana weekly-lesson-plan style (PHASE 1/2/3, with performance indicator, keywords, and assessment).",
      "",
      anchor,
      grounding.exemplars.length
        ? `\nExemplar grounding used:\n${bullet(
            grounding.exemplars.map((e) => `${e.title ? `${e.title}: ` : ""}${trimToMax(firstMeaningfulLine(e.description), 160)}`)
          )}`
        : "\nNo exemplars found for this indicator yet — seed exemplars to make outputs even more realistic.",
      "",
      `Reference: ${references}`,
    ].join("\n");
  })();

  const fields: AiLessonFields = {
    lessonTitle: topic,

    performanceIndicator,
    coreCompetencies,
    keywords,

    objectives,
    teachingLearningResources,
    introduction,
    lessonDevelopment,
    conclusion,
    assessment,
    homework,
    differentiationNotes,
    reflectionNotes,
  };

  return { fields, suggestion };
}

export async function GET() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use POST." }, { status: 405, headers: { Allow: "POST" } });
}
export async function PUT() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use POST." }, { status: 405, headers: { Allow: "POST" } });
}
export async function DELETE() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use POST." }, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(req: NextRequest) {
  let ctx: { userId: string; tenantId: string };
  try {
    const c = await requireServerUserContext({
      redirectTo: "/teacher/lesson-notes",
      requireTenant: true,
    });
    ctx = { userId: c.userId, tenantId: c.tenantId };
  } catch {
    return jsonNoStore({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "Content-Type must be application/json." }, { status: 415 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const lessonNoteId = typeof body?.lessonNoteId === "string" ? body.lessonNoteId.trim() : "";
  const mode = clampMode(body?.mode);

  if (!isPlausibleId(lessonNoteId)) {
    return jsonNoStore({ ok: false, error: "Missing or invalid lessonNoteId." }, { status: 400 });
  }

  try {
    const note = await prisma.lessonNote.findFirst({
      where: { id: lessonNoteId, tenantId: ctx.tenantId, teacherUserId: ctx.userId },
      select: {
        id: true,
        subject: true,
        phase: true,
        level: true,
        term: true,
        academicYear: true,
        weekNumber: true,

        strand: true,
        substrand: true,
        contentStandard: true,
        indicator: true,
        lessonTitle: true,

        objectives: true,
        priorKnowledge: true,
        teachingLearningResources: true,
        introduction: true,
        lessonDevelopment: true,
        conclusion: true,
        assessment: true,
        homework: true,
        differentiationNotes: true,
        reflectionNotes: true,

        curriculumUnitId: true,
        schemeOfWorkItemId: true,
      },
    });

    if (!note) {
      return jsonNoStore({ ok: false, error: "Lesson note not found." }, { status: 404 });
    }

    const coachInput: LessonNoteForCoach = {
      id: note.id,
      subject: String(note.subject ?? ""),
      phase: note.phase ?? null,
      level: note.level ?? null,

      term: String(note.term ?? ""),
      academicYear: String(note.academicYear ?? ""),
      weekNumber: typeof note.weekNumber === "number" ? note.weekNumber : null,

      strand: String(note.strand ?? ""),
      substrand: note.substrand ?? null,
      contentStandard: note.contentStandard ?? null,
      indicator: note.indicator ?? null,
      lessonTitle: note.lessonTitle ?? null,

      objectives: note.objectives ?? null,
      priorKnowledge: note.priorKnowledge ?? null,
      teachingLearningResources: note.teachingLearningResources ?? null,
      introduction: note.introduction ?? null,
      lessonDevelopment: note.lessonDevelopment ?? null,
      conclusion: note.conclusion ?? null,
      assessment: note.assessment ?? null,
      homework: note.homework ?? null,
      differentiationNotes: note.differentiationNotes ?? null,
      reflectionNotes: note.reflectionNotes ?? null,

      curriculumUnitId: (note as any).curriculumUnitId ?? null,
      schemeOfWorkItemId: (note as any).schemeOfWorkItemId ?? null,
    };

    const grounding = await fetchGrounding({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      note: coachInput,
      mode,
    });

    const result = buildWorldClassCoachV4(coachInput, grounding, mode);

    return jsonNoStore(
      {
        ok: true,
        suggestion: result.suggestion,
        fields: result.fields,
        meta: {
          mode,
          groundedOnLessonNoteId: lessonNoteId,
          curriculumUnitId: coachInput.curriculumUnitId ?? null,
          schemeOfWorkItemId: coachInput.schemeOfWorkItemId ?? null,
          exemplarCount: grounding.exemplars.length,
          engine: "RULE_BASED_COTUTOR_V4_TEMPLATE_GROUNDED",
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[TEACHER_LESSON_NOTE_AI_SUPPORT_ERROR]", err);
    return jsonNoStore({ ok: false, error: "The AI Co-Tutor could not generate support at the moment. Please try again." }, { status: 500 });
  }
}
