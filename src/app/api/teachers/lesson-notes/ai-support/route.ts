// src/app/api/teachers/lesson-notes/ai-support/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const lessonNoteId = body?.lessonNoteId as string | undefined;
  const mode = (body?.mode as Mode | undefined) ?? "FULL";

  if (!lessonNoteId) {
    return NextResponse.json(
      { ok: false, error: "Missing lessonNoteId." },
      { status: 400 }
    );
  }

  try {
    const note = await prisma.lessonNote.findUnique({
      where: { id: lessonNoteId },
      include: {
        curriculumUnit: true,
      },
    });

    if (!note) {
      return NextResponse.json(
        { ok: false, error: "Lesson note not found." },
        { status: 404 }
      );
    }

    const { fields, suggestion } = buildRuleBasedCoach(
      note as unknown as LessonNoteForCoach,
      mode
    );

    return NextResponse.json({
      ok: true,
      suggestion,
      fields,
      meta: {
        mode,
        groundedOnLessonNoteId: lessonNoteId,
      },
    });
  } catch (err) {
    console.error("TEACHER_LESSON_NOTE_AI_SUPPORT_ERROR", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "The AI Co-Tutor could not generate support at the moment. Please try again.",
      },
      { status: 500 }
    );
  }
}

/**
 * WORLD-CLASS RULE-BASED CO-TUTOR (NO EXTERNAL API YET)
 *
 * Goals:
 *  - Subject-aware (Maths / Literacy / OWOP / others)
 *  - Content & context-aware (NaCCA slice, term, week, phase, level)
 *  - Human-aware (teacher workload, KG realities)
 *  - Image-aware: gives concrete image ideas for Gemini or any image tool
 *
 *  Shape is still:
 *    { fields, suggestion }
 *
 *  So the frontend does NOT need to change.
 */
function buildRuleBasedCoach(
  rawNote: LessonNoteForCoach,
  mode: Mode
): { fields: AiLessonFields; suggestion: string } {
  const subject = (rawNote.subject || "").trim();
  const subjectLower = subject.toLowerCase();

  const isMath =
    subjectLower.includes("math") || subjectLower.includes("numeracy");
  const isLiteracy =
    subjectLower.includes("literacy") ||
    subjectLower.includes("english") ||
    subjectLower.includes("language");
  const isOurWorld =
    subjectLower.includes("our world") ||
    subjectLower.includes("owop") ||
    subjectLower.includes("people") ||
    subjectLower.includes("world");
  const isCreativeArts =
    subjectLower.includes("creative") ||
    subjectLower.includes("arts") ||
    subjectLower.includes("art");
  const isRme =
    subjectLower.includes("religious") ||
    subjectLower.includes("moral") ||
    subjectLower.includes("rme");
  const isScience = subjectLower.includes("science");
  const isPe =
    subjectLower.includes("physical") ||
    subjectLower.includes("education") ||
    subjectLower.includes("p.e");

  const phase = rawNote.phase ?? "KG / Basic";
  const level = rawNote.level ?? "class";

  const termLabel = rawNote.term || "";
  const weekNumber =
    rawNote.weekNumber ?? rawNote.curriculumUnit?.weekNumber ?? null;
  const weekLabel = weekNumber != null ? `Week ${weekNumber}` : "this week";

  const curriculum = rawNote.curriculumUnit;
  const strandCode = (curriculum?.strandCode ?? "").trim();
  const substrandCode = (curriculum?.substrandCode ?? "").trim();
  const contentStandardCode = (curriculum?.contentStandardCode ?? "").trim();
  const indicatorCode = (curriculum?.indicatorCode ?? "").trim();

  const topicBase =
    rawNote.lessonTitle ||
    rawNote.substrand ||
    rawNote.indicator ||
    rawNote.strand ||
    rawNote.subject ||
    "this lesson";

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

  // Try to extract a key verb from the indicator: e.g. "identify", "describe", "count"
  const indicatorFirstWord = indicatorText
    ? indicatorText.split(/\s+/)[0].toLowerCase()
    : "";
  const recognisedVerbs = [
    "identify",
    "describe",
    "mention",
    "name",
    "count",
    "compare",
    "classify",
    "match",
    "draw",
    "talk",
    "retell",
    "read",
    "write",
    "listen",
    "demonstrate",
    "explain",
  ];
  const indicatorVerb = recognisedVerbs.includes(indicatorFirstWord)
    ? indicatorFirstWord
    : "";

  /**
   * SUBJECT-AWARE OBJECTIVES
   */
  function buildObjectives(): string {
    const lines: string[] = [];
    lines.push("By the end of the lesson, learners will be able to:");

    if (indicatorText) {
      if (indicatorCode) {
        lines.push(
          `• Demonstrate the skill described in indicator ${indicatorCode}: "${indicatorText}".`
        );
      } else {
        lines.push(
          `• Demonstrate the skill described in the indicator: "${indicatorText}".`
        );
      }
    } else {
      lines.push(
        `• Demonstrate understanding of the key idea in "${topic}".`
      );
    }

    if (isMath) {
      lines.push(
        "• Use concrete materials from their environment to show their thinking (counting, grouping, comparing, etc.)."
      );
    } else if (isLiteracy) {
      lines.push(
        "• Use spoken language, actions and simple drawings to express ideas clearly and listen to others."
      );
    } else if (isOurWorld) {
      lines.push(
        "• Connect what they learn to real situations in their home, school, market and wider community."
      );
    } else if (isCreativeArts) {
      lines.push(
        "• Use lines, shapes, colours, movement, music or drama to express the idea in a creative way."
      );
    } else if (isRme) {
      lines.push(
        "• Show positive values, attitudes and behaviours related to the theme (respect, kindness, honesty, etc.)."
      );
    } else if (isScience) {
      lines.push(
        "• Observe, talk about and describe simple patterns or changes they see in the natural world."
      );
    } else if (isPe) {
      lines.push(
        "• Perform basic body movements safely and confidently during games and physical activities."
      );
    } else {
      lines.push(
        "• Actively participate in songs, games or practical activities related to the topic."
      );
    }

    if (prior) {
      lines.push(
        "• Build on what they already know from home, school or community experiences."
      );
    }

    // Core competencies
    lines.push(
      "• Work cooperatively with peers, share materials fairly and take turns during activities."
    );

    if (existingObjectives) {
      lines.push("");
      lines.push("Teacher’s additional objective(s):");
      lines.push(existingObjectives);
    }

    return lines.join("\n");
  }

  /**
   * IMAGE-AWARE TLM (for real classroom + Gemini images)
   */
  function buildTlm(): string {
    const base: string[] = [];

    if (isMath) {
      base.push(
        "Bottle tops, stones, sticks, cups, or other counters from the local environment"
      );
      base.push("Number cards or flashcards");
      base.push("Simple charts or drawings of the number concept");
    } else if (isLiteracy) {
      base.push("Word cards, picture cards and simple story books");
      base.push("Objects from the community that match the vocabulary");
      base.push("Songs, rhymes and actions related to the key sounds/words");
    } else if (isOurWorld) {
      base.push(
        "Real objects or pictures related to the environment, family, school and community"
      );
      base.push("Role-play materials (scarves, bags, simple props)");
      base.push("Songs, rhymes and action games linked to the topic");
    } else if (isCreativeArts) {
      base.push("Crayons, paper, old magazines, boxes, bottle tops, leaves");
      base.push("Simple percussion instruments or improvised instruments");
      base.push("Space in class/playground for movement or drama");
    } else if (isRme) {
      base.push(
        "Pictures or symbols that represent the value or story (e.g. sharing, helping, worship)"
      );
      base.push("Simple story book or teacher-made story card");
      base.push("Role play materials for short dramas");
    } else if (isScience) {
      base.push("Real objects from nature (leaves, stones, seeds, water, soil)");
      base.push("Simple charts showing changes or patterns");
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

    // Add a short block suggesting AI-generated images
    base.push("");
    base.push("Suggested visuals / images (for teacher drawing or Gemini):");
    base.push(buildImageIdeas());

    return "• " + base.join("\n• ");
  }

  /**
   * IMAGE IDEAS for Gemini or any image generator
   * (Pure text – you will later copy/paste phrases into Gemini)
   */
  function buildImageIdeas(): string {
    const ideas: string[] = [];

    const shortTopic = topic || "the lesson concept";

    if (isMath) {
      ideas.push(
        `A photorealistic image of Ghanaian KG children counting bottle tops on the classroom floor, focusing on ${shortTopic}.`
      );
      ideas.push(
        "A simple colourful number line on a classroom wall with Ghanaian-style uniforms."
      );
    } else if (isLiteracy) {
      ideas.push(
        `KG children sitting in a semi-circle while a teacher reads a big picture book related to "${shortTopic}".`
      );
      ideas.push(
        "Close-up of a child pointing to a letter or sound card with clear facial expression and engagement."
      );
    } else if (isOurWorld) {
      ideas.push(
        `Ghanaian KG children in school uniform exploring their environment related to "${shortTopic}" (e.g. home, family, body parts, safety, community).`
      );
      ideas.push(
        "Simple, bright poster showing children, family, homes and community places in a Ghanaian setting."
      );
    } else if (isCreativeArts) {
      ideas.push(
        `Children creating art or doing a short drama about "${shortTopic}" using recycled materials.`
      );
      ideas.push(
        "Colourful drawings pinned on a classroom wall made by KG learners."
      );
    } else if (isRme) {
      ideas.push(
        `Children helping each other or sharing items in class, showing the value behind "${shortTopic}".`
      );
      ideas.push(
        "A calm, respectful classroom scene where a teacher gently guides a discussion about good behaviour."
      );
    } else if (isScience) {
      ideas.push(
        `Children observing natural objects (leaves, seeds, water) in small groups connected to "${shortTopic}".`
      );
      ideas.push("Close-up of a child's hands holding simple science materials.");
    } else if (isPe) {
      ideas.push(
        "KG children playing a simple running or jumping game in a safe school compound."
      );
      ideas.push("Teacher demonstrating a simple stretch or warm-up exercise.");
    } else {
      ideas.push(
        `A friendly Ghanaian KG classroom scene where children and teacher are interacting around "${shortTopic}".`
      );
      ideas.push("Simple poster or chart summarising the key idea of the lesson.");
    }

    // You’ll later copy 1–2 of these sentences straight into Gemini.
    return ideas.join("\n  - ");
  }

  /**
   * Introduction – short, playful, linked to prior knowledge
   */
  function buildIntroduction(): string {
    if (existingIntro) return existingIntro;

    const lines: string[] = [];

    if (isMath) {
      lines.push(
        "Begin with a short counting or clapping song that uses the numbers or patterns in today’s lesson (2–3 minutes)."
      );
    } else if (isLiteracy) {
      lines.push(
        "Begin with a short song, rhyme or call-and-response that uses key sounds or words from today’s lesson."
      );
    } else if (isOurWorld) {
      lines.push(
        "Begin with a short song or game about home, body, family, school or community (depending on the topic)."
      );
    } else if (isCreativeArts) {
      lines.push(
        "Begin with a short movement, rhythm or drawing warm-up activity related to the theme."
      );
    } else if (isRme) {
      lines.push(
        "Begin with a short song, proverb or simple story that illustrates the value or theme."
      );
    } else if (isScience) {
      lines.push(
        "Begin with a short observation game: show a natural object and ask learners what they see."
      );
    } else if (isPe) {
      lines.push(
        "Begin with a simple stretching or movement routine to warm up the body safely."
      );
    } else {
      lines.push(
        "Begin with a short song, chant or rhyme that links to the topic (2–3 minutes)."
      );
    }

    if (prior) {
      lines.push(
        `Ask 2–3 quick questions that bring out what learners already know about "${topic}" from home, market, church/mosque or playground.`
      );
    } else {
      lines.push(
        `Show a real object or picture related to "${topic}" and ask learners: “What do you see? What is happening?”`
      );
    }

    lines.push(
      'Clearly state the lesson purpose in simple language, e.g. “Today we are going to learn about …”'
    );

    return lines.join("\n");
  }

  /**
   * Lesson development – I do / We do / You do
   */
  function buildDevelopment(): string {
    if (existingDev) return existingDev;

    const lines: string[] = [];

    // I DO
    lines.push("I DO (Teacher models):");
    if (indicatorText) {
      if (isMath && indicatorVerb === "count") {
        lines.push(
          `• Using concrete objects (stones, bottle tops, sticks), model counting as described in the indicator (e.g. "${indicatorText}").`
        );
      } else if (isLiteracy && (indicatorVerb === "talk" || indicatorVerb === "retell")) {
        lines.push(
          `• Model a short talk or retelling related to the indicator (e.g. "${indicatorText}"), using clear, slow speech and actions.`
        );
      } else if (isOurWorld) {
        lines.push(
          `• Using real objects, pictures or a brief role-play, demonstrate the real-life situation described in the indicator: "${indicatorText}".`
        );
      } else {
        lines.push(
          `• Using real objects or pictures, demonstrate step-by-step how to perform the indicator: "${indicatorText}".`
        );
      }
    } else {
      lines.push(
        `• Using real objects or pictures, show 2–3 clear examples of the key idea in "${topic}".`
      );
    }
    lines.push("• Think aloud as you demonstrate so learners can follow your reasoning.");

    // WE DO
    lines.push("");
    lines.push("WE DO (Guided practice):");
    lines.push(
      "• Learners practise with you as a whole class or in small groups using similar materials."
    );

    if (isMath) {
      lines.push(
        "• Move between groups and ask learners to show you how they counted, grouped or compared objects."
      );
    } else if (isLiteracy) {
      lines.push(
        "• Let pairs practise saying words, short sentences or dialogues while you listen and correct gently."
      );
    } else if (isOurWorld) {
      lines.push(
        "• Let groups act out, sort, match or discuss real-life situations from their environment related to the topic."
      );
    } else if (isCreativeArts) {
      lines.push(
        "• Guide groups to create simple artworks, movements, songs or dramas reflecting the concept."
      );
    } else if (isRme) {
      lines.push(
        "• In small groups, let learners act out or discuss short situations that show the value in action."
      );
    } else if (isScience) {
      lines.push(
        "• Guide learners to observe, compare or sort materials while you ask simple guiding questions."
      );
    } else if (isPe) {
      lines.push(
        "• Guide learners through the movement or game slowly first, then repeat with more confidence."
      );
    }

    lines.push(
      "• Ask guiding questions, correct gently and praise good efforts. Let learners explain their thinking."
    );

    // YOU DO
    lines.push("");
    lines.push("YOU DO (Independent / pair practice):");
    lines.push(
      "• Learners work in pairs or individually to repeat the skill while you move around, observe and support."
    );
    lines.push(
      "• Note which learners are confident, and which ones still struggle, for follow-up and differentiation."
    );

    return lines.join("\n");
  }

  /**
   * Conclusion & reflection
   */
  function buildConclusion(): string {
    if (existingConclusion) return existingConclusion;

    const lines: string[] = [];
    lines.push("• Invite 2–3 learners to demonstrate or explain what they learnt.");

    if (isMath) {
      lines.push(
        `• Ask a quick class question that reviews the main maths idea in "${topic}" (e.g. “Show me with your objects …”).`
      );
    } else if (isLiteracy) {
      lines.push(
        `• Ask 2–3 learners to say a word/sentence or retell a tiny part related to "${topic}".`
      );
    } else if (isOurWorld) {
      lines.push(
        `• Ask learners how they can use what they learnt about "${topic}" at home, in school or in the community.`
      );
    } else if (isCreativeArts) {
      lines.push(
        `• Display some of the learners’ work or let them briefly perform a movement/song related to "${topic}".`
      );
    } else if (isRme) {
      lines.push(
        `• Ask learners to share one way they will practise the value behind "${topic}" today.`
      );
    } else if (isScience) {
      lines.push(
        `• Ask learners to share one thing they observed or discovered about "${topic}".`
      );
    } else if (isPe) {
      lines.push(
        "• Let learners show one movement or action they enjoyed and remind them about safety rules."
      );
    } else {
      lines.push(
        `• Ask the whole class one or two key questions that summarise the main idea of "${topic}".`
      );
    }

    lines.push("• Praise effort and remind them where they can see or use this in real life.");

    return lines.join("\n");
  }

  /**
   * Assessment
   */
  function buildAssessment(): string {
    if (existingAssessment) return existingAssessment;

    const stems: string[] = [];

    stems.push("Use a mix of oral, practical and (where appropriate) short written checks:");
    stems.push("");
    stems.push("Oral / practical checks:");

    if (isMath) {
      stems.push(
        "• Ask individual learners to show counting/grouping/comparing using real objects."
      );
    } else if (isLiteracy) {
      stems.push(
        "• Ask individual learners to say a word/sentence, answer a simple question or retell part of a story."
      );
    } else if (isOurWorld) {
      stems.push(
        "• Ask individual learners to point to, act out or talk about examples from their environment."
      );
    } else if (isCreativeArts) {
      stems.push(
        "• Ask learners to briefly explain or show their artwork, movement or role-play."
      );
    } else if (isRme) {
      stems.push(
        "• Ask learners what they would do in a simple situation that requires the value taught."
      );
    } else if (isScience) {
      stems.push(
        "• Ask learners to describe or show something they observed in the activity."
      );
    } else if (isPe) {
      stems.push(
        "• Observe learners performing the movement or game safely and with basic control."
      );
    } else {
      stems.push(
        "• Ask individual learners to show or do the skill using real objects (e.g. act out, sort, classify, etc.)."
      );
    }

    stems.push(
      "• Ask 3–5 simple questions to check if they can explain in their own words."
    );

    stems.push("");
    stems.push("Short written / drawing tasks (if appropriate for the level):");

    if (isMath) {
      stems.push(
        "• Learners draw or circle groups of objects to match numbers, or trace numbers on slates."
      );
    } else if (isLiteracy) {
      stems.push(
        "• Learners trace, copy or circle letters/words that match sounds/words from the lesson."
      );
    } else {
      stems.push(
        "• Learners draw a simple picture or circle a correct option on a worksheet or slate."
      );
    }

    stems.push("");
    stems.push("Simple question stems you can adapt:");
    stems.push("1) Show me with these objects how to do what we learned today.");
    stems.push(
      "2) Which of these pictures/objects/words is correct according to today’s lesson?"
    );
    stems.push("3) Tell a friend in your own words what we did in class today.");

    return stems.join("\n");
  }

  /**
   * Homework
   */
  function buildHomework(): string {
    if (existingHomework) return existingHomework;

    if (isMath) {
      return [
        "Ask learners to count or group real objects at home (e.g. cups, plates, spoons, stones).",
        "They should tell a parent/guardian what they did and be ready to share one example in class.",
      ].join("\n");
    }

    if (isLiteracy) {
      return [
        "Learners identify words, pictures or objects at home related to today’s lesson (e.g. items that start with a particular sound or letter).",
        "They report one example back in class the next day.",
      ].join("\n");
    }

    if (isOurWorld) {
      return [
        `Learners look for one example in their home or community where "${topic}" is seen (e.g. family roles, body parts, safety rules, environment).`,
        "They come ready to talk briefly about it in the next lesson.",
      ].join("\n");
    }

    if (isCreativeArts) {
      return [
        `Learners bring or identify safe recycled materials from home that can be used for a simple artwork linked to "${topic}".`,
        "They bring one small item (if available) for the next lesson.",
      ].join("\n");
    }

    if (isRme) {
      return [
        "Learners practise one positive behaviour at home (e.g. helping, sharing, greeting respectfully).",
        "They share one example with the class in the next lesson.",
      ].join("\n");
    }

    if (isScience) {
      return [
        `Learners look for one example in their environment related to "${topic}" (e.g. a plant, animal, object).`,
        "They describe it briefly in the next lesson.",
      ].join("\n");
    }

    if (isPe) {
      return [
        "Learners practise a simple safe movement at home (e.g. stretching, walking, jumping on the spot).",
        "They show one movement during the next PE-related lesson.",
      ].join("\n");
    }

    return [
      `Learners look for one example in their home or community where "${topic}" is used or seen.`,
      "They come prepared to talk briefly about it in the next lesson.",
    ].join("\n");
  }

  /**
   * Differentiation & teacher reflection
   */
  function buildDifferentiation(): string {
    if (existingDiff) return existingDiff;

    const lines: string[] = [];
    lines.push("Support for learners who struggle:");
    lines.push(
      "• Seat them nearer to you or beside a supportive peer during practice."
    );
    lines.push(
      "• Give them simpler examples and more concrete materials."
    );
    lines.push(
      "• Check on them more frequently and praise small progress."
    );

    lines.push("");
    lines.push("Extension for fast / gifted learners:");
    lines.push(
      "• Give extra challenge questions or open-ended tasks related to the same indicator."
    );
    lines.push(
      "• Ask them to explain or demonstrate the skill to a friend or small group."
    );

    return lines.join("\n");
  }

  function buildReflection(): string {
    if (existingReflection) return existingReflection;

    const lines: string[] = [];
    lines.push("After the lesson, write 2–4 lines answering:");
    lines.push("• What worked very well today?");
    lines.push("• Which learners struggled and why do you think so?");
    lines.push("• What will you change next time you teach this indicator?");
    return lines.join("\n");
  }

  const lessonTitle =
    rawNote.lessonTitle ||
    (indicatorText
      ? indicatorCode
        ? `Exploring indicator ${indicatorCode}: ${indicatorText}`
        : `Exploring: ${indicatorText}`
      : `Lesson on ${topic}`);

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

  // HUMAN-FACING COACH MESSAGE (right panel, now also image-aware)
  const suggestionLines: string[] = [];

  const headerContextParts: string[] = [];
  headerContextParts.push(subject || "Subject");
  headerContextParts.push(`${phase} – ${level}`);
  if (termLabel) headerContextParts.push(termLabel);
  headerContextParts.push(weekLabel);

  const headerContext = headerContextParts.join(" • ");

  if (mode === "QUICK") {
    suggestionLines.push(
      `Quick NaCCA-aligned coaching snapshot for **${topic}** (${headerContext}).`
    );
    suggestionLines.push("");
    suggestionLines.push("1) Objectives (student-centred)");
    suggestionLines.push(fields.objectives ?? "");
    suggestionLines.push("");
    suggestionLines.push("2) Next micro-move:");
    suggestionLines.push(
      "Skim through the suggested objectives and lesson development. Edit any line that does not fit your learners, then click “Apply AI suggestions to fields” and save."
    );
  } else {
    suggestionLines.push(
      `Full NaCCA-aligned coaching support for **${topic}** (${headerContext}).`
    );
    suggestionLines.push("");

    suggestionLines.push("1) Curriculum slice in view");
    suggestionLines.push(
      `• Strand / Sub-strand: ${
        strandCode ? `${strandCode} – ` : ""
      }${strandText} / ${
        substrandCode ? `${substrandCode} – ` : ""
      }${substrandText || "—"}`
    );
    suggestionLines.push(
      `• Content standard: ${
        contentStandardCode ? `${contentStandardCode} – ` : ""
      }${
        contentStandardText || "Not specified yet in the note."
      }`
    );
    suggestionLines.push(
      `• Indicator${
        indicatorCode ? ` (${indicatorCode})` : ""
      }: ${indicatorText || "Not specified yet in the note."}`
    );

    suggestionLines.push("");
    suggestionLines.push("2) Objectives (student-centred draft)");
    suggestionLines.push(fields.objectives ?? "");

    suggestionLines.push("");
    suggestionLines.push("3) Lesson flow suggestion (I do – We do – You do)");
    suggestionLines.push(fields.lessonDevelopment ?? "");

    suggestionLines.push("");
    suggestionLines.push("4) Assessment & homework ideas");
    suggestionLines.push(fields.assessment ?? "");
    suggestionLines.push("");
    suggestionLines.push(fields.homework ?? "");

    suggestionLines.push("");
    suggestionLines.push("5) Differentiation & teacher reflection");
    suggestionLines.push(fields.differentiationNotes ?? "");
    suggestionLines.push("");
    suggestionLines.push(fields.reflectionNotes ?? "");

    suggestionLines.push("");
    suggestionLines.push(
      "6) Image ideas for this lesson (for teacher drawings or Gemini prompts)"
    );
    suggestionLines.push(buildImageIdeas());

    suggestionLines.push("");
    suggestionLines.push(
      "Use this as a co-teacher: adjust language to your class, then apply to the fields and save or submit for the headteacher."
    );
  }

  return {
    fields,
    suggestion: suggestionLines.join("\n"),
  };
}

/**
 * NOTE FOR FUTURE (WHEN YOU SUBSCRIBE TO OPENAI):
 *
 *  - Keep AiLessonFields and the route’s { ok, suggestion, fields, meta } shape.
 *  - Replace buildRuleBasedCoach() with a true LLM call (OpenAI) that:
 *      * Reads this lesson + curriculum slice
 *      * Returns exactly the same fields
 *  - Frontend will not need to change.
 */
