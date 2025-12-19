// src/app/teacher/kg-lesson-note-demo/page.tsx
"use client";

import React, { useMemo, useState } from "react";

/**
 * This page is a thin, working demo of:
 *  - KG curriculum unit list (week/day)
 *  - AI-assisted NaCCA lesson note builder
 *  - Saved "NaCCA-style" note preview for printing
 *
 * In the NEXT step, we will:
 *  - Replace the in-memory demoUnits / demoNotes with real data
 *    from your CurriculumUnit + LessonNote tables.
 *  - Optionally add a "Save to NaCCA note" button that posts to an API.
 */

/* -------------------------
 * Types
 * ------------------------*/

type KgCurriculumUnit = {
  id: string;
  week: number;
  day: number;
  subject: string;
  strand: string;
  subStrand: string;
  topic: string;
  contentStandard: string;
  indicators: string[];
  coreCompetencies: string[];
};

type KgLessonNoteSections = {
  introduction: string;
  development: string;
  assessment: string;
  differentiation: string;
  reflection: string;
};

/* -------------------------
 * Demo data (to be replaced
 * with real DB data later)
 * ------------------------*/

const demoUnits: KgCurriculumUnit[] = [
  {
    id: "kg1-w1-d1-myself",
    week: 1,
    day: 1,
    subject: "KG Integrated – Myself",
    strand: "All About Me",
    subStrand: "Knowing Myself",
    topic: "Parts of the Body",
    contentStandard:
      "KG1.1.1.1: Learners demonstrate knowledge of basic body parts and their functions.",
    indicators: [
      "Learners mention some parts of the body.",
      "Learners point to parts of the body when named.",
      "Learners talk about how to care for the body.",
    ],
    coreCompetencies: [
      "Communication & Collaboration",
      "Personal Development",
      "Critical Thinking and Problem Solving",
    ],
  },
  {
    id: "kg1-w1-d2-home",
    week: 1,
    day: 2,
    subject: "KG Integrated – Home & Family",
    strand: "My Family",
    subStrand: "People in My Home",
    topic: "People who live with me",
    contentStandard:
      "KG1.1.2.1: Learners identify members of their immediate family and talk about what they do at home.",
    indicators: [
      "Learners mention people who live with them.",
      "Learners talk about simple duties at home.",
      "Learners show respect when talking about family.",
    ],
    coreCompetencies: [
      "Cultural Identity & Global Citizenship",
      "Personal Development",
    ],
  },
  {
    id: "kg1-w2-d1-classroom",
    week: 2,
    day: 1,
    subject: "KG Integrated – School",
    strand: "My School",
    subStrand: "My Classroom",
    topic: "Things in the classroom",
    contentStandard:
      "KG1.2.1.1: Learners identify objects in the classroom and explain how to take care of them.",
    indicators: [
      "Learners name common classroom objects.",
      "Learners talk about how to use classroom objects properly.",
      "Learners describe ways of keeping the classroom tidy.",
    ],
    coreCompetencies: [
      "Personal Development",
      "Critical Thinking and Problem Solving",
      "Digital Literacy (foundations)",
    ],
  },
];

const demoNotesByUnitId: Record<string, KgLessonNoteSections> = {
  "kg1-w1-d1-myself": {
    introduction:
      "Teacher welcomes learners with a short song about body parts (e.g. 'Head, shoulders, knees and toes'). Learners touch the parts as they sing. Teacher briefly revises previous knowledge by asking: 'Which part is this?' while pointing to head, arms, legs, etc.",
    development:
      "1) In a circle, teacher displays a simple body outline chart and invites learners to come and point to named parts.\n2) Learners work in pairs with picture cards showing different body parts. They match the picture to where it is found on their body.\n3) Through guided questions, teacher talks about caring for our bodies (bathing, washing hands, brushing teeth). Learners mime each action.\n4) Teacher links to real-life by asking: 'Why must we wash our hands before eating?' and encourages simple answers.",
    assessment:
      "• Observe learners as they touch body parts when named.\n• Ask individual learners to point to two different parts and say their names.\n• Use thumbs up / thumbs down to check understanding of body-care routines (e.g. 'We should brush our teeth once a week' – correct or not?).",
    differentiation:
      "Support: Pair quieter learners with more confident peers during picture-card activity. Use slower pace and more repetition.\nEnrichment: Ask advanced learners to mention one thing they do at home to keep their body clean and healthy.",
    reflection:
      "Most learners could point to major body parts confidently, but a few still confuse left and right. Next lesson, I will include more movement games that emphasize left/right orientation and give extra practice to those learners.",
  },
  "kg1-w1-d2-home": {
    introduction:
      "Teacher starts with a short chat: 'Who did you greet first this morning at home?' Learners share briefly. Teacher shows simple picture cards of a mother, father, sibling, and grandparent and asks learners to name them.",
    development:
      "1) In whole-class discussion, learners talk about people who live with them at home.\n2) Using role-play, teacher invites a few learners to act as 'mother', 'father', 'grandmother', etc. Others guess who they are.\n3) Learners describe one simple duty they perform at home (e.g. sweeping, fetching water, washing plates).\n4) Teacher emphasizes respect, greeting, and helping at home, linking to values of love and responsibility.",
    assessment:
      "• Ask individual learners to name at least three people who live with them.\n• Ask learners to mention one duty they perform at home.\n• Listen for respectful language when they talk about family members.",
    differentiation:
      "Support: Provide sentence starters like 'I live with…' and 'I help by…' for learners who struggle to express themselves.\nEnrichment: Ask confident learners to talk about how they feel when they help at home and why it is important.",
    reflection:
      "Learners enjoyed the role-play and were eager to share. However, some used nicknames instead of family-role words. I will reinforce vocabulary (mother, father, sister, brother, grandmother) using picture cards in the next lesson.",
  },
  "kg1-w2-d1-classroom": {
    introduction:
      "Teacher sings a short tidy-up song while learners pretend to arrange the classroom. After the song, teacher asks: 'What things do you see in our classroom today?'",
    development:
      "1) Learners walk in a guided 'classroom walk', pointing to objects like tables, chairs, chalkboard, books, and charts.\n2) In small groups, learners receive picture cards and name the classroom objects.\n3) Teacher discusses how to use and care for each object (e.g. 'We sit properly on chairs', 'We do not write in library books').\n4) Learners demonstrate simple actions like arranging chairs, stacking books, or wiping the board with a cloth.",
    assessment:
      "• Ask learners to name three classroom objects without looking.\n• Observe how they handle objects during role-play (e.g. carrying chairs safely).\n• Quick oral questions: 'What should we do if we spill water on the floor?'.",
    differentiation:
      "Support: Use real objects and gestures for learners who need more concrete demonstrations.\nEnrichment: Encourage advanced learners to suggest simple classroom rules in their own words (e.g. 'We keep the floor clean').",
    reflection:
      "Learners could name many classroom objects and were enthusiastic about cleaning roles. I need to create a simple visual 'classroom rule' chart to reinforce these behaviours throughout the week.",
  },
};

/* -------------------------
 * Simple "AI" helper – this
 * is just logic + tone for now.
 * Later we can plug an LLM.
 * ------------------------*/

function generateCoachSummary(
  unit: KgCurriculumUnit,
  note: KgLessonNoteSections
) {
  // In future we will swap this stub with a real LLM call.
  return {
    headline: `Helping KG learners thrive in "${unit.topic}"`,
    whyItMatters:
      "This lesson builds strong early foundations by connecting real-life experiences with playful, age-appropriate activities. It supports the NaCCA vision of holistic development in a way parents and community can understand.",
    keyGains: [
      `Language & confidence – children learn and use key words related to "${unit.topic}" in everyday conversation.`,
      "Thinking skills – learners compare, match, and explain ideas instead of only repeating after the teacher.",
      "Values & habits – the note gently reinforces respect, cleanliness, responsibility and care for others.",
    ],
    atHomeIdeas: [
      "Use simple local objects at home (e.g. bucket, cup, chair) to revise vocabulary while playing.",
      "Ask your child to 'teach you' one activity they did in class today – let them demonstrate.",
      "Praise small efforts (like washing hands or greeting elders) and name the value behind it.",
    ],
    teacherReflectionHint:
      "After class, quickly jot one thing that worked well and one thing to adjust. This reflection box can later feed into your end-of-week learner summary and reports for headteacher / parents.",
  };
}

/* -------------------------
 * Components
 * ------------------------*/

export default function KgLessonNoteDemoPage() {
  const [selectedUnitId, setSelectedUnitId] = useState<string>(
    demoUnits[0]?.id ?? ""
  );

  const selectedUnit = useMemo(
    () => demoUnits.find((u) => u.id === selectedUnitId) ?? demoUnits[0],
    [selectedUnitId]
  );
  const selectedNote = demoNotesByUnitId[selectedUnit.id];
  const coach = generateCoachSummary(selectedUnit, selectedNote);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8 space-y-5">
        {/* Top header */}
        <header className="space-y-3">
          <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800">
            EduLife OS · Teacher · KG Lesson Note Demo
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1.5">
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900">
                KG NaCCA Lesson Note &amp; AI Coach (Week Sample)
              </h1>
              <p className="text-xs md:text-sm text-slate-600 max-w-2xl">
                This screen shows{" "}
                <span className="font-semibold">
                  one week of KG1 curriculum units
                </span>{" "}
                flowing into an{" "}
                <span className="font-semibold">
                  AI-assisted NaCCA lesson note
                </span>
                . For your 31st demo, you can walk the headteacher from
                curriculum → lesson note → reflection in less than 5 minutes.
              </p>
            </div>
            <div className="text-[11px] md:text-xs text-slate-500 md:text-right space-y-1">
              <p>
                Class: <span className="font-semibold">KG1 – Gold (demo)</span>
              </p>
              <p>
                Focus: <span className="font-semibold">Week 1–2 sample</span>
              </p>
            </div>
          </div>
        </header>

        {/* 3-column layout */}
        <section className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.2fr)_minmax(0,1.3fr)]">
          {/* Column 1: Curriculum units list */}
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 md:p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-semibold text-slate-900">
                  KG1 Curriculum Units (demo week)
                </h2>
                <p className="text-[11px] text-slate-600">
                  Pick a day to see its NaCCA lesson note and AI coach summary.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                {demoUnits.length} units
              </span>
            </div>

            <div className="space-y-1.5 max-h-[320px] overflow-auto pr-1">
              {demoUnits.map((u) => {
                const isSelected = u.id === selectedUnit.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUnitId(u.id)}
                    className={[
                      "w-full rounded-xl border px-3 py-2 text-left text-[11px] transition",
                      isSelected
                        ? "border-emerald-500 bg-emerald-50 shadow-sm"
                        : "border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/60",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900">
                        Week {u.week}, Day {u.day}
                      </div>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-600">
                        {u.topic}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-600">
                      <span className="font-medium">{u.subject}</span>
                      <span className="mx-1 text-slate-400">•</span>
                      <span>{u.strand}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      CS: {u.contentStandard.slice(0, 90)}
                      {u.contentStandard.length > 90 ? "…" : ""}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-600">
              <p>
                In the real system, this list will come from your{" "}
                <span className="font-semibold">CurriculumUnit</span> table
                filtered by class, term and week.
              </p>
            </div>
          </div>

          {/* Column 2: AI-assisted note builder (read-only for now) */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 md:p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-semibold text-emerald-900">
                  AI-assisted NaCCA Lesson Note
                </h2>
                <p className="text-[11px] text-emerald-900/80">
                  Draft generated for:{" "}
                  <span className="font-semibold">{selectedUnit.topic}</span> •
                  KG1, Week {selectedUnit.week}, Day {selectedUnit.day}
                </p>
              </div>
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                Demo draft
              </span>
            </div>

            {/* Indicators & competencies */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900 space-y-1.5">
              <div className="font-semibold">Key indicators</div>
              <ul className="list-disc space-y-0.5 pl-4">
                {selectedUnit.indicators.map((ind) => (
                  <li key={ind}>{ind}</li>
                ))}
              </ul>
              <div className="mt-1 font-semibold">Core competencies</div>
              <div className="flex flex-wrap gap-1">
                {selectedUnit.coreCompetencies.map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-white/80 px-2 py-0.5 text-[10px]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>

            {/* Note sections */}
            <div className="space-y-2 text-[11px] text-emerald-950">
              <NoteBlock title="Introduction" text={selectedNote.introduction} />
              <NoteBlock title="Development / Main Activity" text={selectedNote.development} />
              <NoteBlock title="Assessment" text={selectedNote.assessment} />
              <NoteBlock title="Differentiation" text={selectedNote.differentiation} />
              <NoteBlock title="Teacher Reflection (end of lesson)" text={selectedNote.reflection} />
            </div>

            <div className="flex items-center justify-between gap-2 text-[10px] text-emerald-900/90">
              <p>
                Later, a teacher will be able to{" "}
                <span className="font-semibold">edit this draft</span> and
                click <span className="font-semibold">Save as NaCCA note</span>.
              </p>
              <button
                type="button"
                disabled
                className="rounded-full border border-emerald-300 bg-white/90 px-3 py-1 text-[10px] font-medium text-emerald-800 shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
              >
                Save as NaCCA note (Phase 2)
              </button>
            </div>
          </div>

          {/* Column 3: Coach & print-ready preview */}
          <div className="space-y-3">
            {/* AI coach summary for teacher */}
            <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-3 md:p-4 shadow-sm space-y-2 text-[11px] text-sky-900">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-sky-900">
                  KG Lesson Coach (teacher-focused)
                </h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-sky-700">
                  Slice 1 – alive OS
                </span>
              </div>
              <p className="text-[11px] text-sky-900/90 font-semibold">
                {coach.headline}
              </p>
              <p className="text-[11px] text-sky-900/90">{coach.whyItMatters}</p>
              <div>
                <div className="mt-1 font-semibold">What this lesson grows:</div>
                <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                  {coach.keyGains.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mt-1 font-semibold">
                  Simple ways to extend learning at home:
                </div>
                <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                  {coach.atHomeIdeas.map((idea) => (
                    <li key={idea}>{idea}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-md border border-sky-200 bg-white/80 px-2.5 py-1.5">
                <span className="font-semibold">Reflection hint:</span>{" "}
                <span>{coach.teacherReflectionHint}</span>
              </div>
            </div>

            {/* Print-style NaCCA preview */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3 md:p-4 shadow-sm text-[11px] text-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-900">
                    NaCCA Lesson Note – Print Preview
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {selectedUnit.subject} • Week {selectedUnit.week}, Day{" "}
                    {selectedUnit.day} • Topic:{" "}
                    <span className="font-semibold">
                      {selectedUnit.topic}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="hidden md:inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-[10px] font-medium text-slate-700 shadow-sm hover:bg-slate-100"
                >
                  Print sample
                </button>
              </div>

              <div className="space-y-1">
                <Row label="Strand" value={selectedUnit.strand} />
                <Row label="Sub-strand" value={selectedUnit.subStrand} />
                <Row label="Content standard" value={selectedUnit.contentStandard} />
                <Row
                  label="Indicators"
                  value={selectedUnit.indicators.join(" | ")}
                />
              </div>

              <div className="mt-1 grid gap-1.5 md:grid-cols-2">
                <Row
                  label="Class"
                  value="KG1 – Gold (demo)"
                />
                <Row
                  label="Duration"
                  value="30–35 minutes"
                />
              </div>

              <div className="mt-2 space-y-1.5">
                <Block label="Introduction" text={selectedNote.introduction} />
                <Block label="Development / Main Activity" text={selectedNote.development} />
                <Block label="Assessment" text={selectedNote.assessment} />
                <Block label="Differentiation" text={selectedNote.differentiation} />
                <Block label="Teacher's Reflection" text={selectedNote.reflection} />
              </div>

              <div className="mt-2 grid gap-1.5 md:grid-cols-2">
                <Row label="Teacher" value="(To be auto-filled from login)" />
                <Row label="Date" value="(Auto-filled from timetable)" />
              </div>

              <p className="mt-2 border-t border-dashed border-slate-200 pt-1 text-[10px] text-slate-500">
                In a later phase, this preview will match the official NaCCA
                layout exactly and can be exported as PDF or Word with one
                click.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/* -------------------------
 * Small presentational bits
 * ------------------------*/

function NoteBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
        {title}
      </div>
      <p className="mt-0.5 whitespace-pre-line text-[11px] text-emerald-950">
        {text}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="min-w-[90px] text-[10px] font-semibold text-slate-700">
        {label}:
      </span>
      <span className="flex-1 text-[11px] text-slate-800 whitespace-pre-line">
        {value}
      </span>
    </div>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-slate-700 mb-0.5">
        {label}:
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 whitespace-pre-line text-[11px]">
        {text}
      </div>
    </div>
  );
}
