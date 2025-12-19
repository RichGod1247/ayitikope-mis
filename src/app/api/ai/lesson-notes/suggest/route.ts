// src/app/api/ai/lesson-notes/suggest/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/ai/lesson-notes/suggest
 *
 * Body:
 * {
 *   "tenantId": "cmhhnghn00008vcpgp3fl07fl",
 *   "teacherUserId": "cmhhnguk5000ivcpgmjj3nxn4",
 *   "lessonNoteId": "cmi7wf5eb0001vcdslkttotnz",
 *   "mode": "OBJECTIVES" | "INTRO" | "DEVELOPMENT" | "ASSESSMENT" | "FULL",
 *   "prompt": "optional extra instructions for the AI",
 *   "context": {
 *     "classLevel": "KG1",
 *     "classSize": 35,
 *     "learnerProfile": "Mixed ability, mostly visual and kinesthetic learners"
 *   }
 * }
 *
 * For now this is a STUB “AI Co-Tutor”:
 * - It reads the lesson note from the DB
 * - It returns a smart, human-written suggestion string
 * - Later, we can swap the suggestion engine for a real OpenAI call
 */

type SuggestMode = "OBJECTIVES" | "INTRO" | "DEVELOPMENT" | "ASSESSMENT" | "FULL";

type LessonContext = {
  classLevel?: string;
  classSize?: number;
  learnerProfile?: string;
};

function buildStubSuggestion(opts: {
  mode: SuggestMode;
  subject: string | null;
  strand: string | null;
  substrand: string | null;
  contentStandard: string | null;
  indicator: string | null;
  context?: LessonContext;
}) {
  const { mode, subject, strand, substrand, contentStandard, indicator, context } = opts;

  const level = context?.classLevel || "your class";
  const size = context?.classSize || 30;
  const profile =
    context?.learnerProfile ||
    "mixed-ability learners in a typical Ghanaian basic school classroom";

  const coreLine = [
    subject || "the subject",
    strand ? `under the strand "${strand}"` : null,
    substrand ? `and substrand "${substrand}"` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const csLine = contentStandard
    ? `Content standard: ${contentStandard}`
    : "No explicit content standard provided yet.";
  const indLine = indicator
    ? `Indicator: ${indicator}`
    : "No explicit indicator provided yet.";

  if (mode === "OBJECTIVES") {
    return [
      `Here is a suggested set of learner-friendly objectives for ${level} (${size} learners), focusing on ${coreLine}:`,
      "",
      `1. Learners will be able to explain in their own words what the lesson is about, using simple language and concrete objects.`,
      `2. Learners will be able to demonstrate the key skill(s) described in the indicator during individual and group activities.`,
      `3. Learners will work in pairs or small groups to practice, helping at least one other peer who is struggling.`,
      "",
      csLine,
      indLine,
      "",
      `Tip: Keep objectives short, action-based ("Learners will be able to…") and always check that they are observable and measurable for ${profile}.`,
    ].join("\n");
  }

  if (mode === "INTRO") {
    return [
      `Here is a suggested introduction for ${coreLine} with ${level} (${size} learners):`,
      "",
      `1. **Warm-up (2–3 minutes):** Sing a short song or clap a rhythm linked to the topic. For example, if you are doing counting, clap and let learners count with you as they clap.`,
      `2. **Connect to prior knowledge (3–5 minutes):** Ask simple questions about what they already know. Use real objects around the classroom (stones, bottle tops, sticks, books).`,
      `3. **Real-life hook (2–3 minutes):** Tell a short story from their daily life (market, farm, home, school) that naturally leads into today’s lesson.`,
      "",
      `Keep instructions short, use the local language briefly where needed, and ensure that every child is doing something (showing, pointing, saying) rather than only listening.`,
    ].join("\n");
  }

  if (mode === "DEVELOPMENT") {
    return [
      `Here is a suggested lesson development flow for ${coreLine}:`,
      "",
      `1. **I do (Teacher modelling):** Demonstrate the concept step-by-step using real objects and a clear think-aloud. Show exactly how to perform the skill in the indicator.`,
      `2. **We do (Guided practice):** Involve the whole class. Ask questions, invite learners to come to the front, and correct gently. Use group responses and pair work.`,
      `3. **You do (Independent practice):** Give learners a simple task to do individually or in pairs while you walk around and support slow learners.`,
      "",
      `Make groups small (3–5 learners), mix stronger and weaker learners, and always include at least one activity where learners move, touch, or manipulate objects.`,
    ].join("\n");
  }

  if (mode === "ASSESSMENT") {
    return [
      `Here is a suggested assessment strategy for ${coreLine}:`,
      "",
      `1. **Oral check:** Ask 3–5 short questions randomly to different learners to see if they can explain or show the skill.`,
      `2. **Practical task:** Give each learner or pair a quick activity (e.g. "Show me 12 using bottle tops" or "Circle the correct answer on your card").`,
      `3. **Exit tickets:** Before leaving, each learner must answer one small question or complete a tiny task that proves they understood the key idea.`,
      "",
      `Record 3 groups in your notes: learners who have clearly mastered it, learners who are almost there, and learners who need more support next time.`,
    ].join("\n");
  }

  // FULL: give a concise mini-plan touching all the above
  return [
    `Here is a compact AI-style lesson support summary for ${coreLine} with ${level} (${size} learners, ${profile}):`,
    "",
    `**Objectives:**`,
    `- Learners will demonstrate the key skill(s) described in the indicator through songs, games, and practical activities.`,
    `- Learners will work in pairs or groups to practice and explain their thinking.`,
    "",
    `**Introduction:**`,
    `- Start with a short song or game related to the topic, then connect to learners’ real experiences (home, market, farm, play).`,
    "",
    `**Development (I do – We do – You do):**`,
    `- Model the concept with real objects; guide the class through examples; then let individuals/pairs try while you support.`,
    "",
    `**Assessment:**`,
    `- Use quick oral checks, practical tasks, and simple exit tickets to see who has mastered the concept and who needs more help.`,
    "",
    csLine,
    indLine,
    "",
    `You can copy and adapt any part of this into your official NaCCA lesson note fields in EduLife OS.`,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | {
          tenantId?: string;
          teacherUserId?: string;
          lessonNoteId?: string;
          mode?: SuggestMode;
          prompt?: string;
          context?: LessonContext;
        }
      | null;

    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const { tenantId, teacherUserId, lessonNoteId, mode, context } = body;

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required." },
        { status: 400 }
      );
    }
    if (!teacherUserId) {
      return NextResponse.json(
        { ok: false, error: "teacherUserId is required." },
        { status: 400 }
      );
    }
    if (!lessonNoteId) {
      return NextResponse.json(
        { ok: false, error: "lessonNoteId is required." },
        { status: 400 }
      );
    }
    if (!mode) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'mode is required. Use one of: "OBJECTIVES", "INTRO", "DEVELOPMENT", "ASSESSMENT", "FULL".',
        },
        { status: 400 }
      );
    }

    // Load the lesson note to ground the suggestion
    const note = await prisma.lessonNote.findUnique({
      where: { id: lessonNoteId },
      select: {
        id: true,
        tenantId: true,
        teacherUserId: true,
        subject: true,
        strand: true,
        substrand: true,
        contentStandard: true,
        indicator: true,
      },
    });

    if (!note) {
      return NextResponse.json(
        {
          ok: false,
          error: "Lesson note not found.",
        },
        { status: 404 }
      );
    }

    if (note.tenantId !== tenantId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Lesson note does not belong to this tenant.",
        },
        { status: 403 }
      );
    }

    // In future we can enforce that only the owner or headteacher can ask for suggestions
    // if (note.teacherUserId !== teacherUserId) { ... }

    const suggestion = buildStubSuggestion({
      mode,
      subject: note.subject,
      strand: note.strand,
      substrand: note.substrand,
      contentStandard: note.contentStandard,
      indicator: note.indicator,
      context,
    });

    return NextResponse.json(
      {
        ok: true,
        suggestion,
        meta: {
          mode,
          groundedOnLessonNoteId: note.id,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[AI_LESSON_NOTES_SUGGEST_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to generate AI-style suggestions for this lesson. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
