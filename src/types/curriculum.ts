// src/types/curriculum.ts

/**
 * Shared curriculum & scheme-of-work types for EduLife OS.
 *
 * These are used by:
 *  - Curriculum Engine APIs (/api/curriculum, /api/curriculum/hierarchy, /api/curriculum/subjects, /api/curriculum/units)
 *  - Teacher Curriculum Explorer (/teacher/curriculum)
 *  - Scheme of Work builder (to be wired next)
 */

/* ---------------------------------------
 * SUBJECT LIST / SUMMARY
 * -------------------------------------*/

export interface CurriculumSubjectSummary {
  id: string;
  phase: string | null;       // e.g. "KG", "PRIMARY", "JHS"
  level: string | null;       // e.g. "KG1", "B6", "JHS1"
  name: string;               // e.g. "Our World and Our People"
  slug: string | null;        // e.g. "kg1-our-world-and-our-people"
  description?: string | null;
  orderIndex?: number | null;
}

/* ---------------------------------------
 * FULL HIERARCHY (for /api/curriculum)
 * -------------------------------------*/

export interface CurriculumExemplarDto {
  id: string;
  title: string | null;
  description: string | null;
  assessmentNotes: string | null;
  orderIndex: number | null;
}

export interface CurriculumIndicatorDto {
  id: string;
  code: string | null;
  description: string | null;
  orderIndex: number | null;
  media?: unknown;
  exemplars: CurriculumExemplarDto[];
}

export interface CurriculumContentStandardDto {
  id: string;
  code: string | null;
  description: string | null;
  orderIndex: number | null;
  media?: unknown;
  indicators: CurriculumIndicatorDto[];
}

export interface CurriculumSubStrandDto {
  id: string;
  code: string | null;
  title: string | null;
  description: string | null;
  orderIndex: number | null;
  contentStandards: CurriculumContentStandardDto[];
}

export interface CurriculumStrandDto {
  id: string;
  code: string | null;
  title: string | null;
  description: string | null;
  orderIndex: number | null;
  subStrands: CurriculumSubStrandDto[];
}

export interface CurriculumHierarchyDto {
  id: string;
  phase: string | null;
  level: string | null;
  name: string;
  slug: string | null;
  description: string | null;
  orderIndex: number | null;
  media?: unknown;
  strands: CurriculumStrandDto[];
}

/* ---------------------------------------
 * FLATTENED "UNIT"-LIKE SLICE
 * (from /api/curriculum/units)
 * -------------------------------------*/

/**
 * Shape coming back from /api/curriculum/units
 * when we flatten the hierarchical tree into
 * "unit-like" rows (one per indicator).
 */
export interface CurriculumUnitDto {
  id: string;

  // core curriculum positioning
  phase: string;           // e.g. "KG", "PRIMARY", "JHS"
  level: string;           // e.g. "KG1", "B1", "JHS1"
  subject: string;         // e.g. "Mathematics"
  term: string;            // e.g. "1st Term"
  weekNumber: number;      // e.g. 1, 2, 3...

  // From curriculum: Strand / Sub-strand / Content Standard / Indicator
  strandCode: string | null;
  strand: string;

  substrandCode: string | null;
  substrand: string;

  contentStandardCode: string | null;
  contentStandard: string;

  indicatorCode: string | null;
  indicator: string;

  // Optional notes/hints from the curriculum
  notes?: string | null;
}

/**
 * What we actually care about once a teacher has picked
 * a single indicator under a substrand.
 */
export interface SelectedCurriculumSlice {
  curriculumUnitId: string;

  phase: string;
  level: string;
  subject: string;
  term: string;
  weekNumber: number;

  strandCode?: string | null;
  strand: string;

  substrandCode?: string | null;
  substrand: string;

  contentStandardCode?: string | null;
  contentStandard: string;

  indicatorCode?: string | null;
  indicator: string;
}

/* ---------------------------------------
 * SCHEME OF WORK DTOs
 * -------------------------------------*/

/**
 * High-level Scheme of Work representation
 * (one term for one subject & class).
 */
export interface SchemeOfWorkDto {
  id: string;
  tenantId: string;
  teacherUserId: string;
  classroomId: string | null;

  phase: string | null;   // "KG", "PRIMARY", "JHS"
  level: string | null;   // "KG1", "B6", "JHS1"
  subject: string;        // human-readable name
  subjectSlug: string | null;

  term: string;           // e.g. "1st Term"
  academicYear: string;   // e.g. "2025/2026"

  title: string | null;   // e.g. "B6 Maths – 1st Term 2025/2026"

  createdAt: string;      // ISO string from API
  updatedAt: string;      // ISO string from API
}

/**
 * One weekly entry in a Scheme of Work, linked to a
 * specific indicator in the curriculum.
 */
export interface SchemeOfWorkItemDto {
  id: string;
  schemeOfWorkId: string;

  weekNumber: number;
  dayNumber: number | null;

  curriculumIndicatorId: string | null;

  indicatorCode: string | null;
  indicatorDescription: string;
  strandTitle: string;
  subStrandTitle: string;
  contentStandardCode: string | null;
  contentStandardDescription: string | null;

  notes: string | null;

  createdAt: string; // ISO strings from API
  updatedAt: string;
}

/**
 * Payload for "Add to Scheme" from the Curriculum Explorer.
 * (Will be sent to an API endpoint soon.)
 */
export interface AddToSchemePayload {
  schemeOfWorkId: string;
  weekNumber: number;
  // Optional day-level scheduling if we later expose it in the UI
  dayNumber?: number;

  // The curriculum context coming from a selected indicator
  curriculumIndicatorId: string;
  indicatorCode: string | null;
  indicatorDescription: string;
  strandTitle: string;
  subStrandTitle: string;
  contentStandardCode: string | null;
  contentStandardDescription: string | null;

  notes?: string;
}
