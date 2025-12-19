// src/lib/curriculum/kg.ts

// High-level KG learning areas for timetable, reports, etc.
export const KG_LEARNING_AREAS = [
  "Language and Literacy",
  "Numeracy",
  "Creative Arts",
  "Our World and Our People",
] as const;

export type KgLearningArea = (typeof KG_LEARNING_AREAS)[number];

// Thematic strands for KG1 & KG2 (from NaCCA curriculum)
export const KG_STRANDS = [
  "All About Me",
  "My Family",
  "Values and Beliefs",
  "My Local Community",
  "My Nation Ghana",
  "All Around Us",
  "My Global Community",
] as const;

export type KgStrand = (typeof KG_STRANDS)[number];

// Very lightweight representation of one KG "lesson note" building block.
// We can extend this gradually as we encode more of the curriculum.
export type KgLessonBlock = {
  strand: KgStrand;
  subStrand: string; // e.g. "I am a wonderful and unique creation"
  contentStandardRef: string; // e.g. "K1.1.1.1"
  indicators: string[]; // short indicator texts
  learningAreas: KgLearningArea[]; // integrated areas touched
};

// Example seed entries for KG1 Term 1, Strand 1: All About Me.
// (Texts shortened – you can refine word-for-word against the PDF if you like.)
export const KG1_TERM1_BLOCKS: KgLessonBlock[] = [
  {
    strand: "All About Me",
    subStrand: "I am a wonderful and unique creation",
    contentStandardRef: "K1.1.1.1",
    indicators: [
      "Learners talk about themselves as wonderful and unique.",
      "Learners identify body features that make them different from others.",
    ],
    learningAreas: [
      "Language and Literacy",
      "Our World and Our People",
      "Creative Arts",
    ],
  },
  // Add more blocks gradually (body parts, senses, etc.)
];
