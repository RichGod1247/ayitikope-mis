// src/app/api/teachers/lesson-notes/ai-support/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mode = "FULL" | "QUICK";

type AiLessonFields = {
  lessonTitle?: string;
  objectives?: string;
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
  subject: string;
  strand: string;
  substrand: string | null;
  contentStandard: string | null;
  indicator: string | null;
  lessonTitle: string | null;
  phase: string | null;
  level: string | null;

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

  academicYear: string;
  term: string;
  weekNumber: number | null;

  curriculumUnit: {
    strandCode: string | null;
    substrandCode: string | null;
    contentStandardCode: string | null;
    indicatorCode: string | null;
    weekNumber: number | null;
  } | null;
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
  // -----------------------------
  // Auth (server identity)
  // -----------------------------
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

  // Content-Type guard
  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "Content-Type must be application/json." }, { status: 415 });
  }

  // -----------------------------
  // Parse body
  // -----------------------------
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
    // -----------------------------
    // Load note (tenant + owner enforced)
    // -----------------------------
    const note = await prisma.lessonNote.findFirst({
      where: {
        id: lessonNoteId,
        tenantId: ctx.tenantId,
        teacherUserId: ctx.userId,
      },
      select: {
        id: true,
        tenantId: true,
        teacherUserId: true,

        subject: true,
        strand: true,
        substrand: true,
        contentStandard: true,
        indicator: true,
        lessonTitle: true,
        phase: true,
        level: true,

        term: true,
        academicYear: true,
        weekNumber: true,

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
      },
    });

    if (!note) {
      // 404 prevents leaking cross-tenant existence
      return jsonNoStore({ ok: false, error: "Lesson note not found." }, { status: 404 });
    }

    // -----------------------------
    // Safely load CurriculumUnit (tenant OR global)
    // Avoid relation-join leakage by scoping explicitly.
    // -----------------------------
    let curriculumUnit: LessonNoteForCoach["curriculumUnit"] = null;

    const unitId = (note as any).curriculumUnitId as string | null;

    if (unitId && isPlausibleId(unitId)) {
      // schema-evolution safe: only run if model exists
      const client = prisma as any;
      if (typeof client?.curriculumUnit?.findFirst === "function") {
        const unit = await client.curriculumUnit.findFirst({
          where: {
            id: unitId,
            OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
          },
          select: {
            strandCode: true,
            substrandCode: true,
            contentStandardCode: true,
            indicatorCode: true,
            weekNumber: true,
          },
        });

        curriculumUnit = unit
          ? {
              strandCode: unit.strandCode ?? null,
              substrandCode: unit.substrandCode ?? null,
              contentStandardCode: unit.contentStandardCode ?? null,
              indicatorCode: unit.indicatorCode ?? null,
              weekNumber: unit.weekNumber ?? null,
            }
          : null;
      }
    }

    const coachInput: LessonNoteForCoach = {
      subject: String(note.subject ?? ""),
      strand: String(note.strand ?? ""),
      substrand: note.substrand ?? null,
      contentStandard: note.contentStandard ?? null,
      indicator: note.indicator ?? null,
      lessonTitle: note.lessonTitle ?? null,
      phase: note.phase ?? null,
      level: note.level ?? null,

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

      academicYear: String(note.academicYear ?? ""),
      term: String(note.term ?? ""),
      weekNumber: note.weekNumber ?? null,

      curriculumUnit,
    };

    let result: { fields: AiLessonFields; suggestion: string };
    try {
      result = buildRuleBasedCoach(coachInput, mode);
    } catch (e) {
      console.error("[AI_SUPPORT_COACH_BUILD_ERROR]", e);
      return jsonNoStore(
        { ok: false, error: "The AI Co-Tutor could not generate support at the moment. Please try again." },
        { status: 500 }
      );
    }

    return jsonNoStore(
      {
        ok: true,
        suggestion: result.suggestion,
        fields: result.fields,
        meta: {
          mode,
          groundedOnLessonNoteId: lessonNoteId,
          curriculumUnitId: unitId ?? null,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[TEACHER_LESSON_NOTE_AI_SUPPORT_ERROR]", err);
    return jsonNoStore(
      { ok: false, error: "The AI Co-Tutor could not generate support at the moment. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * RULE-BASED CO-TUTOR (NO EXTERNAL API YET)
 * Shape remains: { fields, suggestion } so frontend does not change.
 */
function buildRuleBasedCoach(rawNote: LessonNoteForCoach, mode: Mode): { fields: AiLessonFields; suggestion: string } {
  const subject = (rawNote.subject || "").trim();
  const subjectLower = subject.toLowerCase();

  const isMath = subjectLower.includes("math") || subjectLower.includes("numeracy");
  const isLiteracy =
    subjectLower.includes("literacy") || subjectLower.includes("english") || subjectLower.includes("language");
  const isOurWorld =
    subjectLower.includes("our world") || subjectLower.includes("owop") || subjectLower.includes("people") || subjectLower.includes("world");
  const isCreativeArts = subjectLower.includes("creative") || subjectLower.includes("arts") || subjectLower.includes("art");
  const isRme = subjectLower.includes("religious") || subjectLower.includes("moral") || subjectLower.includes("rme");
  const isScience = subjectLower.includes("science");
  const isPe = subjectLower.includes("physical") || subjectLower.includes("education") || subjectLower.includes("p.e");

  const phase = rawNote.phase ?? "KG / Basic";
  const level = rawNote.level ?? "class";

  const levelLower = level.toLowerCase();
  const isKg = levelLower.includes("kg");
  const isJhs = levelLower.includes("jhs") || levelLower.includes("junior");
  const isUpperPrimary =
    levelLower.includes("basic 4") || levelLower.includes("basic 5") || levelLower.includes("basic 6") ||
    levelLower.includes("b4") || levelLower.includes("b5") || levelLower.includes("b6");

  const learnerNoun = isJhs ? "students" : "learners";
  const classNoun = isKg ? "KG" : isJhs ? "JHS" : "basic school";

  const termLabel = rawNote.term || "";
  const weekNumber = rawNote.weekNumber ?? rawNote.curriculumUnit?.weekNumber ?? null;
  const weekLabel = weekNumber != null ? `Week ${weekNumber}` : "this week";

  const curriculum = rawNote.curriculumUnit;
  const strandCode = (curriculum?.strandCode ?? "").trim();
  const substrandCode = (curriculum?.substrandCode ?? "").trim();
  const contentStandardCode = (curriculum?.contentStandardCode ?? "").trim();
  const indicatorCode = (curriculum?.indicatorCode ?? "").trim();

  const topicBase =
    rawNote.lessonTitle || rawNote.substrand || rawNote.indicator || rawNote.strand || rawNote.subject || "this lesson";
  const topic = topicBase.trim();

  const indicatorText = (rawNote.indicator ?? "").trim();
  const contentStandardText = (rawNote.contentStandard ?? "").trim();
  const strandText = rawNote.strand;
  const substrandText = rawNote.substrand ?? "";

  const prior = (rawNote.priorKnowledge ?? "").trim();
  const existingObjectives = (rawNote.objectives ?? "").trim();
  const existingTlm = (rawNote.teachingLearningResources ?? "").trim();
  const existingIntro = (rawNote.introduction ?? "").trim();
  const existingDev = (rawNote.lessonDevelopment ?? "").trim();
  const existingConclusion = (rawNote.conclusion ?? "").trim();
  const existingAssessment = (rawNote.assessment ?? "").trim();
  const existingHomework = (rawNote.homework ?? "").trim();
  const existingDiff = (rawNote.differentiationNotes ?? "").trim();
  const existingReflection = (rawNote.reflectionNotes ?? "").trim();

  const indicatorFirstWord = indicatorText ? indicatorText.split(/\s+/)[0].toLowerCase() : "";
  const recognisedVerbs = [
    "identify","describe","mention","name","count","compare","classify","match","draw","talk","retell","read","write","listen","demonstrate","explain",
  ];
  const indicatorVerb = recognisedVerbs.includes(indicatorFirstWord) ? indicatorFirstWord : "";

  function buildObjectives(): string {
    const lines: string[] = [];
    lines.push(`By the end of the lesson, ${learnerNoun} will be able to:`);

    if (indicatorText) {
      lines.push(
        indicatorCode
          ? `• Demonstrate the skill in indicator ${indicatorCode}: "${indicatorText}".`
          : `• Demonstrate the skill in the indicator: "${indicatorText}".`
      );
    } else {
      lines.push(`• Demonstrate understanding of the key idea in "${topic}".`);
    }

    if (isMath) lines.push("• Use concrete materials to show thinking (counting, grouping, comparing, etc.).");
    else if (isLiteracy) lines.push("• Use spoken language, actions and simple drawings to express ideas and listen to others.");
    else if (isOurWorld) lines.push("• Connect learning to real situations at home, school, market and community.");
    else if (isCreativeArts) lines.push("• Use lines, shapes, colours, movement, music or drama to express the idea creatively.");
    else if (isRme) lines.push("• Show positive values and behaviours related to the theme (respect, kindness, honesty, etc.).");
    else if (isScience) lines.push("• Observe and describe simple patterns or changes in the natural world.");
    else if (isPe) lines.push("• Perform basic body movements safely and confidently during games and activities.");
    else lines.push("• Actively participate in practical activities related to the topic.");

    if (prior) lines.push("• Build on what they already know from home, school or community experiences.");
    lines.push("• Work cooperatively with peers, share materials fairly and take turns during activities.");

    if (existingObjectives) {
      lines.push("");
      lines.push("Teacher’s additional objective(s):");
      lines.push(existingObjectives);
    }

    return lines.join("\n");
  }

  function buildImageIdeas(): string {
    const ideas: string[] = [];
    const shortTopic = topic || "the lesson concept";

    const agePhrase = isKg
      ? "KG learners (ages 4–6)"
      : isJhs
      ? "JHS students (ages 12–15)"
      : isUpperPrimary
      ? "upper primary learners (ages 9–12)"
      : "primary learners (ages 6–9)";

    if (isMath) {
      ideas.push(`A clean classroom scene in Ghana with ${agePhrase} using bottle tops or stones to represent numbers for "${shortTopic}".`);
      ideas.push("A simple number line or place-value chart on a classroom wall (no text labels needed).");
    } else if (isLiteracy) {
      ideas.push(`A Ghanaian classroom reading circle with ${agePhrase}, teacher holding a big picture book related to "${shortTopic}".`);
      ideas.push("A learner pointing to a picture card and speaking while peers listen (no text).");
    } else if (isOurWorld) {
      ideas.push(`A Ghanaian school/community scene with ${agePhrase} exploring "${shortTopic}" (home, family, safety, environment, community life).`);
      ideas.push("A simple poster-style illustration showing local community places and people (no labels).");
    } else if (isCreativeArts) {
      ideas.push(`Learners creating an artwork or short drama about "${shortTopic}" using recycled/local materials.`);
      ideas.push("Finished learner artworks displayed on a classroom wall (no writing).");
    } else if (isRme) {
      ideas.push(`Learners helping each other or sharing in class to show the value behind "${shortTopic}".`);
      ideas.push("Teacher guiding a respectful discussion circle about good behaviour (no text).");
    } else if (isScience) {
      ideas.push(`Learners observing leaves, seeds, water or soil in small groups linked to "${shortTopic}".`);
      ideas.push("Close-up of hands holding simple observation materials (no labels).");
    } else if (isPe) {
      ideas.push("Learners playing a simple running/jumping game in a safe school compound.");
      ideas.push("Teacher demonstrating a warm-up stretch while learners copy safely.");
    } else {
      ideas.push(`A Ghanaian ${classNoun} classroom scene with ${agePhrase} interacting around "${shortTopic}".`);
      ideas.push("A simple visual summary scene of the key idea (no text).");
    }

    return ideas.join("\n- ");
  }

  function buildTlm(): string {
    const base: string[] = [];

    if (isMath) {
      base.push("Bottle tops, stones, sticks, cups, or other counters from the local environment");
      base.push("Number cards or flashcards");
      base.push("Simple charts or drawings of the number concept");
    } else if (isLiteracy) {
      base.push("Word cards, picture cards and simple story books");
      base.push("Objects from the community that match the vocabulary");
      base.push("Songs, rhymes and actions related to the key sounds/words");
    } else if (isOurWorld) {
      base.push("Real objects or pictures related to the environment, family, school and community");
      base.push("Role-play materials (scarves, bags, simple props)");
      base.push("Songs, rhymes and action games linked to the topic");
    } else if (isCreativeArts) {
      base.push("Crayons, paper, old magazines, boxes, bottle tops, leaves");
      base.push("Simple percussion instruments or improvised instruments");
      base.push("Space in class/playground for movement or drama");
    } else if (isRme) {
      base.push("Pictures/symbols that represent the value or story (sharing, helping, honesty, respect)");
      base.push("Simple story book or teacher-made story card");
      base.push("Role play materials for short dramas");
    } else if (isScience) {
      base.push("Real objects from nature (leaves, stones, seeds, water, soil)");
      base.push("Simple charts showing changes or patterns (can be teacher-drawn)");
      base.push("Clear containers for simple observations");
    } else if (isPe) {
      base.push("Safe open space in classroom or outside");
      base.push("Cones or markers (stones, bottles) for games");
      base.push("Whistle or clapping pattern to start/stop");
    } else {
      base.push("Real objects from the classroom, playground and home");
      base.push("Locally available materials (bottles, boxes, leaves, sticks, etc.)");
      base.push("Songs, rhymes and role-play materials");
    }

    if (existingTlm) {
      base.push("");
      base.push("Teacher-specific resources already planned:");
      base.push(existingTlm);
    }

    base.push("");
    base.push("Suggested visuals / image ideas:");
    base.push(buildImageIdeas());

    return "• " + base.join("\n• ");
  }

  function buildIntroduction(): string {
    if (existingIntro) return existingIntro;

    const lines: string[] = [];
    if (isMath) lines.push("Begin with a short counting/clapping song linked to today’s concept (2–3 minutes).");
    else if (isLiteracy) lines.push("Begin with a short song/rhyme/call-and-response using key sounds/words from today.");
    else if (isOurWorld) lines.push("Begin with a short song/game about home, body, family, school or community (as fits the topic).");
    else if (isCreativeArts) lines.push("Begin with a short movement/rhythm/drawing warm-up related to the theme.");
    else if (isRme) lines.push("Begin with a short proverb or simple story that illustrates the value/theme.");
    else if (isScience) lines.push("Begin with a quick observation: show an object and ask learners what they notice.");
    else if (isPe) lines.push("Begin with a simple warm-up routine to prepare safely for movement.");
    else lines.push("Begin with a short song/chant/rhyme that links to the topic (2–3 minutes).");

    if (prior) lines.push(`Ask 2–3 quick questions to surface what learners already know about "${topic}" from home/community.`);
    else lines.push(`Show a real object or picture related to "${topic}" and ask: “What do you see? What is happening?”`);

    lines.push("State the lesson purpose in simple language: “Today we are going to learn about …”");
    return lines.join("\n");
  }

  function buildDevelopment(): string {
    if (existingDev) return existingDev;

    const lines: string[] = [];
    lines.push("I DO (Teacher models):");

    if (indicatorText) {
      if (isMath && indicatorVerb === "count") lines.push(`• Using concrete objects, model counting as described in the indicator: "${indicatorText}".`);
      else if (isLiteracy && (indicatorVerb === "talk" || indicatorVerb === "retell"))
        lines.push(`• Model a short talk/retell aligned to the indicator: "${indicatorText}" using clear speech and actions.`);
      else if (isOurWorld)
        lines.push(`• Use real objects/pictures/role-play to demonstrate the situation in the indicator: "${indicatorText}".`);
      else lines.push(`• Demonstrate step-by-step how to perform the indicator: "${indicatorText}".`);
    } else {
      lines.push(`• Show 2–3 clear examples of the key idea in "${topic}" using objects/pictures.`);
    }

    lines.push("• Think aloud as you demonstrate so learners can follow your reasoning.");
    lines.push("");
    lines.push("WE DO (Guided practice):");
    lines.push("• Learners practise with you in small groups using similar materials.");

    if (isMath) lines.push("• Move between groups and ask learners to show how they counted/grouped/compared.");
    else if (isLiteracy) lines.push("• Pairs practise saying words/sentences while you listen and correct gently.");
    else if (isOurWorld) lines.push("• Groups act out, sort, match or discuss real-life situations related to the topic.");
    else if (isCreativeArts) lines.push("• Groups create simple artworks/movements/songs/dramas reflecting the concept.");
    else if (isRme) lines.push("• Groups discuss/act out short situations that show the value in action.");
    else if (isScience) lines.push("• Learners observe/compare/sort materials as you ask guiding questions.");
    else if (isPe) lines.push("• Guide learners through the movement/game slowly first, then repeat with confidence.");

    lines.push("• Ask guiding questions, correct gently and praise effort. Let learners explain their thinking.");
    lines.push("");
    lines.push("YOU DO (Independent / pair practice):");
    lines.push("• Learners work in pairs/individually to repeat the skill while you observe and support.");
    lines.push("• Note which learners are confident and who needs follow-up support (for differentiation).");

    return lines.join("\n");
  }

  function buildConclusion(): string {
    if (existingConclusion) return existingConclusion;

    const lines: string[] = [];
    lines.push("• Invite 2–3 learners to demonstrate or explain what they learnt.");

    if (isMath) lines.push(`• Ask a quick review task: “Show me with your objects …” linked to "${topic}".`);
    else if (isLiteracy) lines.push(`• Let a few learners say a word/sentence or retell a tiny part linked to "${topic}".`);
    else if (isOurWorld) lines.push(`• Ask how they can use what they learnt about "${topic}" at home, in school or in the community.`);
    else if (isCreativeArts) lines.push(`• Display some work or let a group perform briefly, linked to "${topic}".`);
    else if (isRme) lines.push(`• Ask learners to share one way they will practise the value behind "${topic}" today.`);
    else if (isScience) lines.push(`• Ask learners to share one observation or discovery about "${topic}".`);
    else if (isPe) lines.push("• Let learners show one movement they enjoyed and remind them of safety rules.");
    else lines.push(`• Ask 1–2 key questions that summarise the main idea of "${topic}".`);

    lines.push("• Praise effort and link the learning back to real life.");
    return lines.join("\n");
  }

  function buildAssessment(): string {
    if (existingAssessment) return existingAssessment;

    const stems: string[] = [];
    stems.push("Use oral + practical checks (and short written/drawing where appropriate):");
    stems.push("");
    stems.push("Oral / practical checks:");
    if (isMath) stems.push("• Ask individuals to show counting/grouping/comparing using objects.");
    else if (isLiteracy) stems.push("• Ask individuals to say a word/sentence, answer a simple question, or retell part.");
    else if (isOurWorld) stems.push("• Ask learners to point to/act out/talk about examples from their environment.");
    else if (isCreativeArts) stems.push("• Ask learners to explain or show their artwork/movement/role-play.");
    else if (isRme) stems.push("• Ask what they would do in a simple situation that requires the value taught.");
    else if (isScience) stems.push("• Ask learners to describe or show what they observed.");
    else if (isPe) stems.push("• Observe safe performance of the movement/game with basic control.");
    else stems.push("• Ask learners to show or do the skill with real objects.");

    stems.push("• Ask 3–5 simple questions to check if they can explain in their own words.");
    stems.push("");
    stems.push("Short written / drawing task (if appropriate):");
    if (isMath) stems.push("• Draw/circle groups of objects to match numbers, or trace numbers on slates.");
    else if (isLiteracy) stems.push("• Trace/copy/circle letters or words that match today’s sounds/words.");
    else stems.push("• Draw a simple picture or circle the correct option on a worksheet/slate.");

    return stems.join("\n");
  }

  function buildHomework(): string {
    if (existingHomework) return existingHomework;

    if (isMath) return ["Learners count or group real objects at home (cups, spoons, stones).", "They share one example next lesson."].join("\n");
    if (isLiteracy) return ["Learners find pictures/objects/words at home related to today’s lesson.", "They report one example next lesson."].join("\n");
    if (isOurWorld) return [`Learners identify one real example in their home/community linked to "${topic}".`, "They come ready to talk about it next lesson."].join("\n");
    if (isCreativeArts) return [`Learners identify safe recycled materials at home for a simple artwork linked to "${topic}".`, "They bring one small item (if available) next lesson."].join("\n");
    if (isRme) return ["Learners practise one positive behaviour at home (helping, sharing, greeting respectfully).", "They share one example next lesson."].join("\n");
    if (isScience) return [`Learners find one example in their environment linked to "${topic}".`, "They describe it next lesson."].join("\n");
    if (isPe) return ["Learners practise a simple safe movement at home (stretching, walking, jumping on the spot).", "They show one movement next time."].join("\n");

    return [`Learners identify one example at home/community where "${topic}" is seen or used.`, "They share it next lesson."].join("\n");
  }

  function buildDifferentiation(): string {
    if (existingDiff) return existingDiff;

    return [
      "Support for learners who struggle:",
      "• Seat them nearer to you or beside a supportive peer.",
      "• Use simpler examples and more concrete materials.",
      "• Check on them more frequently and praise small progress.",
      "",
      "Extension for fast learners:",
      "• Give extra challenge tasks related to the same indicator.",
      "• Ask them to explain/demonstrate the skill to a peer or small group.",
    ].join("\n");
  }

  function buildReflection(): string {
    if (existingReflection) return existingReflection;

    return [
      "After the lesson, write 2–4 lines answering:",
      "• What worked well today?",
      "• Which learners struggled and why?",
      "• What will you change next time you teach this indicator?",
    ].join("\n");
  }

  const lessonTitle =
    rawNote.lessonTitle ||
    (indicatorText ? (indicatorCode ? `Indicator ${indicatorCode}: ${indicatorText}` : `${indicatorText}`) : `Lesson on ${topic}`);

  const fields: AiLessonFields = {
    lessonTitle,
    objectives: buildObjectives(),
    teachingLearningResources: buildTlm(),
    introduction: buildIntroduction(),
    lessonDevelopment: buildDevelopment(),
    conclusion: buildConclusion(),
    assessment: buildAssessment(),
    homework: buildHomework(),
    differentiationNotes: buildDifferentiation(),
    reflectionNotes: buildReflection(),
  };

  const suggestionLines: string[] = [];
  const headerContextParts: string[] = [];
  headerContextParts.push(subject || "Subject");
  headerContextParts.push(`${phase} – ${level}`);
  if (termLabel) headerContextParts.push(termLabel);
  headerContextParts.push(weekLabel);
  const headerContext = headerContextParts.join(" • ");

  if (mode === "QUICK") {
    suggestionLines.push(`Quick NaCCA-aligned coaching snapshot for: ${topic} (${headerContext}).`);
    suggestionLines.push("");
    suggestionLines.push("Next action:");
    suggestionLines.push("Apply the suggested fields, then edit the language to match your learners. Save as draft, then submit when ready.");
  } else {
    suggestionLines.push(`Full NaCCA-aligned coaching support for: ${topic} (${headerContext}).`);
    suggestionLines.push("");
    suggestionLines.push("1) Curriculum slice in view");
    suggestionLines.push(`• Strand / Sub-strand: ${strandCode ? `${strandCode} – ` : ""}${strandText} / ${substrandCode ? `${substrandCode} – ` : ""}${substrandText || "—"}`);
    suggestionLines.push(`• Content standard: ${contentStandardCode ? `${contentStandardCode} – ` : ""}${contentStandardText || "Not set yet in the note."}`);
    suggestionLines.push(`• Indicator${indicatorCode ? ` (${indicatorCode})` : ""}: ${indicatorText || "Not set yet in the note."}`);

    suggestionLines.push("");
    suggestionLines.push("2) Objectives draft");
    suggestionLines.push(fields.objectives ?? "");

    suggestionLines.push("");
    suggestionLines.push("3) Lesson flow (I do – We do – You do)");
    suggestionLines.push(fields.lessonDevelopment ?? "");

    suggestionLines.push("");
    suggestionLines.push("4) Assessment ideas");
    suggestionLines.push(fields.assessment ?? "");

    suggestionLines.push("");
    suggestionLines.push("5) Homework idea");
    suggestionLines.push(fields.homework ?? "");

    suggestionLines.push("");
    suggestionLines.push("6) Differentiation & reflection");
    suggestionLines.push(fields.differentiationNotes ?? "");
    suggestionLines.push("");
    suggestionLines.push(fields.reflectionNotes ?? "");

    suggestionLines.push("");
    suggestionLines.push("7) Image ideas (copy into your image generator)");
    suggestionLines.push(buildImageIdeas());

    suggestionLines.push("");
    suggestionLines.push("Use this as a co-teacher: adjust language to your class, then apply to fields and save or submit for review.");
  }

  return { fields, suggestion: suggestionLines.join("\n") };
}
