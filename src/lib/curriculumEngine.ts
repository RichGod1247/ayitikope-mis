// src/lib/curriculumEngine.ts
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type CurriculumHierarchyRequest = {
  phase?: string;
  level?: string;
  subject?: string; // matches CurriculumSubject.name
  subjectSlug?: string; // matches CurriculumSubject.slug
};

const includeHierarchy = {
  media: { orderBy: [{ pageNumberInPdf: "asc" }, { createdAt: "asc" }] },
  strands: {
    orderBy: [{ orderIndex: "asc" }],
    include: {
      subStrands: {
        orderBy: [{ orderIndex: "asc" }],
        include: {
          contentStandards: {
            orderBy: [{ orderIndex: "asc" }],
            include: {
              media: { orderBy: [{ pageNumberInPdf: "asc" }, { createdAt: "asc" }] },
              indicators: {
                orderBy: [{ orderIndex: "asc" }],
                include: {
                  media: { orderBy: [{ pageNumberInPdf: "asc" }, { createdAt: "asc" }] },
                  exemplars: {
                    orderBy: [{ orderIndex: "asc" }],
                    include: {
                      media: { orderBy: [{ pageNumberInPdf: "asc" }, { createdAt: "asc" }] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CurriculumSubjectInclude;

type SubjectWithHierarchy = Prisma.CurriculumSubjectGetPayload<{
  include: typeof includeHierarchy;
}>;

export async function getCurriculumHierarchyForSubject(params: CurriculumHierarchyRequest) {
  const { phase, level, subject, subjectSlug } = params;

  if (!subject && !subjectSlug) {
    throw new Error("subject or subjectSlug is required");
  }

  const curriculumSubject = (await prisma.curriculumSubject.findFirst({
    where: {
      AND: [
        phase ? { phase } : {},
        level ? { level } : {},
        subject ? { name: subject } : {},
        subjectSlug ? { slug: subjectSlug } : {},
      ],
    },
    include: includeHierarchy,
  })) as SubjectWithHierarchy | null;

  if (!curriculumSubject) return null;

  const verifiedBy =
    curriculumSubject.lastVerifiedByUserId
      ? await prisma.user.findUnique({
          where: { id: curriculumSubject.lastVerifiedByUserId },
          select: { id: true, name: true, email: true },
        })
      : null;

  return {
    id: curriculumSubject.id,
    phase: curriculumSubject.phase,
    level: curriculumSubject.level,
    name: curriculumSubject.name,
    slug: curriculumSubject.slug,
    description: curriculumSubject.description,
    orderIndex: curriculumSubject.orderIndex,

    curriculumFramework: curriculumSubject.curriculumFramework,
    frameworkVersion: curriculumSubject.frameworkVersion,
    countryCode: curriculumSubject.countryCode,
    sourceDocumentTitle: curriculumSubject.sourceDocumentTitle,
    sourceDocumentYear: curriculumSubject.sourceDocumentYear,
    sourceDocumentUrl: curriculumSubject.sourceDocumentUrl,
    lastVerifiedAt: curriculumSubject.lastVerifiedAt,
    lastVerifiedBy: verifiedBy
      ? { id: verifiedBy.id, name: verifiedBy.name, email: verifiedBy.email }
      : null,

    media: curriculumSubject.media,

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
              media: ex.media,
            })),
          })),
        })),
      })),
    })),
  };
}
