// src/lib/curriculumEngine.ts
import { prisma } from "@/lib/prisma";

export type CurriculumHierarchyRequest = {
  phase?: string; // e.g. "KG", "PRIMARY", "JHS"
  level?: string; // e.g. "KG1", "B1", "JHS1"
  subject?: string; // e.g. "Our World and Our People"
  subjectSlug?: string; // e.g. "kg1-our-world-and-our-people"
};

export async function getCurriculumHierarchyForSubject(
  params: CurriculumHierarchyRequest
) {
  const { phase, level, subject, subjectSlug } = params;

  // Basic guard: we need at least subject name or slug
  if (!subject && !subjectSlug) {
    throw new Error("subject or subjectSlug is required");
  }

  // 1. Find the CurriculumSubject row with full hierarchy + trust metadata
  const curriculumSubject = await prisma.curriculumSubject.findFirst({
    where: {
      AND: [
        phase ? { phase } : {},
        level ? { level } : {},
        subject ? { name: subject } : {},
        subjectSlug ? { slug: subjectSlug } : {},
      ],
    },
    include: {
      // Hierarchy
      strands: {
        orderBy: { orderIndex: "asc" },
        include: {
          subStrands: {
            orderBy: { orderIndex: "asc" },
            include: {
              contentStandards: {
                orderBy: { orderIndex: "asc" },
                include: {
                  indicators: {
                    orderBy: { orderIndex: "asc" },
                    include: {
                      exemplars: {
                        orderBy: { orderIndex: "asc" },
                      },
                      media: true,
                    },
                  },
                  media: true,
                },
              },
            },
          },
        },
      },
      // Subject-level media (figures that belong to the whole subject)
      media: true,
      // For "verified by" trust info
      lastVerifiedBy: true,
    },
  });

  if (!curriculumSubject) {
    return null;
  }

  // 2. Shape the data a bit for the frontend / AI consumers
  //    (so they don’t need to know Prisma’s internal structure)
  return {
    // Core identity
    id: curriculumSubject.id,
    phase: curriculumSubject.phase,
    level: curriculumSubject.level,
    name: curriculumSubject.name,
    slug: curriculumSubject.slug,
    description: curriculumSubject.description,
    orderIndex: curriculumSubject.orderIndex,

    // Trust & provenance metadata (used in the right-hand "trust" panel)
    curriculumFramework: curriculumSubject.curriculumFramework,
    frameworkVersion: curriculumSubject.frameworkVersion,
    countryCode: curriculumSubject.countryCode,
    sourceDocumentTitle: curriculumSubject.sourceDocumentTitle,
    sourceDocumentYear: curriculumSubject.sourceDocumentYear,
    sourceDocumentUrl: curriculumSubject.sourceDocumentUrl,
    lastVerifiedAt: curriculumSubject.lastVerifiedAt,
    lastVerifiedBy: curriculumSubject.lastVerifiedBy
      ? {
          id: curriculumSubject.lastVerifiedBy.id,
          name: curriculumSubject.lastVerifiedBy.name,
          email: curriculumSubject.lastVerifiedBy.email,
        }
      : null,

    // Subject-level media (figures, diagrams, etc.)
    media: curriculumSubject.media,

    // Hierarchy: strands → sub-strands → content standards → indicators → exemplars
    strands: curriculumSubject.strands.map((strand) => ({
      id: strand.id,
      code: strand.code,
      title: strand.title,
      description: strand.description,
      orderIndex: strand.orderIndex,
      subStrands: strand.subStrands.map((sub) => ({
        id: sub.id,
        code: sub.code,
        title: sub.title,
        description: sub.description,
        orderIndex: sub.orderIndex,
        contentStandards: sub.contentStandards.map((cs) => ({
          id: cs.id,
          code: cs.code,
          description: cs.description,
          orderIndex: cs.orderIndex,
          media: cs.media,
          indicators: cs.indicators.map((ind) => ({
            id: ind.id,
            code: ind.code,
            description: ind.description,
            orderIndex: ind.orderIndex,
            media: ind.media,
            exemplars: ind.exemplars.map((ex) => ({
              id: ex.id,
              title: ex.title,
              description: ex.description,
              assessmentNotes: ex.assessmentNotes,
              orderIndex: ex.orderIndex,
              // exemplar-level media can be wired later if needed
            })),
          })),
        })),
      })),
    })),
  };
}
