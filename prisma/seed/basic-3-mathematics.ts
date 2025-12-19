// prisma/seed/basic-3-mathematics.ts
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

// =========================
// Types matching your JSON
// =========================

type ExemplarJson = { orderIndex?: number; description: string };

type IndicatorJson = {
  code: string;
  description: string;
  orderIndex?: number;
  exemplars?: ExemplarJson[];
};

type ContentStandardJson = {
  code: string;
  description: string;
  orderIndex?: number;
  indicators: IndicatorJson[];
};

type SubStrandJson = {
  code: string;
  title: string;
  description: string;
  orderIndex?: number;
  contentStandards: ContentStandardJson[];
};

type StrandJson = {
  code: string;
  title: string;
  description: string;
  orderIndex?: number;
  subStrands: SubStrandJson[];
};

type CurriculumSubjectJson = {
  phase: string;
  level: string;
  subject?: string;
  name: string;
  slug: string;
  orderIndex?: number;
  description: string;
  strands: StrandJson[];
};

// =========================
// Helpers
// =========================

function countIndicators(curriculum: CurriculumSubjectJson): number {
  let count = 0;
  for (const strand of curriculum.strands ?? []) {
    for (const subStrand of strand.subStrands ?? []) {
      for (const cs of subStrand.contentStandards ?? []) {
        count += (cs.indicators ?? []).length;
      }
    }
  }
  return count;
}

function countExemplars(curriculum: CurriculumSubjectJson): number {
  let count = 0;
  for (const strand of curriculum.strands ?? []) {
    for (const subStrand of strand.subStrands ?? []) {
      for (const cs of subStrand.contentStandards ?? []) {
        for (const ind of cs.indicators ?? []) {
          count += (ind.exemplars ?? []).length;
        }
      }
    }
  }
  return count;
}

function toExemplarCreates(exemplars: ExemplarJson[] | undefined) {
  return (exemplars ?? []).map((ex, idx) => ({
    description: ex.description,
    orderIndex: ex.orderIndex ?? idx + 1,
  }));
}

/**
 * Hard-delete the entire subject tree safely (even without DB cascade).
 */
async function deleteSubjectTree(subjectId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.curriculumMedia.deleteMany({
      where: {
        OR: [
          { subjectId },
          { contentStandard: { subStrand: { strand: { subjectId } } } },
          { indicator: { contentStandard: { subStrand: { strand: { subjectId } } } } },
          { exemplar: { indicator: { contentStandard: { subStrand: { strand: { subjectId } } } } } },
        ],
      },
    });

    await tx.curriculumExemplar.deleteMany({
      where: { indicator: { contentStandard: { subStrand: { strand: { subjectId } } } } },
    });

    await tx.curriculumIndicator.deleteMany({
      where: { contentStandard: { subStrand: { strand: { subjectId } } } },
    });

    await tx.curriculumContentStandard.deleteMany({
      where: { subStrand: { strand: { subjectId } } },
    });

    await tx.curriculumSubStrand.deleteMany({ where: { strand: { subjectId } } });
    await tx.curriculumStrand.deleteMany({ where: { subjectId } });
    await tx.curriculumSubject.delete({ where: { id: subjectId } });
  });
}

// =========================
// Main
// =========================

async function main() {
  const args = new Set(process.argv.slice(2));
  const CHECK = args.has("--check");
  const RESET = args.has("--reset");

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // ✅ IMPORTANT: This MUST be basic-3-mathematics.json
  const jsonPath = path.join(__dirname, "curriculum", "basic-3-mathematics.json");
  const raw = await fs.readFile(jsonPath, "utf8");
  const curriculum = JSON.parse(raw) as CurriculumSubjectJson;

  console.log(`📖 Loading curriculum from: ${jsonPath}`);
  console.log(`→ Subject: ${curriculum.name} (${curriculum.slug})`);
  console.log(`   Phase/Level: ${curriculum.phase} / ${curriculum.level}`);

  if (CHECK) {
    const subject = await prisma.curriculumSubject.findUnique({
      where: { slug: curriculum.slug },
      select: { id: true, slug: true, name: true },
    });

    if (!subject) {
      throw new Error(
        `No curriculumSubject found in DB for slug "${curriculum.slug}". Run without --check to seed it first.`
      );
    }

    const dbStrands = await prisma.curriculumStrand.count({ where: { subjectId: subject.id } });
    const dbSubStrands = await prisma.curriculumSubStrand.count({
      where: { strand: { subjectId: subject.id } },
    });
    const dbContentStandards = await prisma.curriculumContentStandard.count({
      where: { subStrand: { strand: { subjectId: subject.id } } },
    });
    const dbIndicators = await prisma.curriculumIndicator.count({
      where: { contentStandard: { subStrand: { strand: { subjectId: subject.id } } } },
    });
    const dbExemplars = await prisma.curriculumExemplar.count({
      where: { indicator: { contentStandard: { subStrand: { strand: { subjectId: subject.id } } } } },
    });

    const jsonStrands = curriculum.strands.length;
    const jsonSubStrands = curriculum.strands.reduce((a, s) => a + (s.subStrands?.length ?? 0), 0);
    const jsonContentStandards = curriculum.strands.reduce(
      (a, s) => a + (s.subStrands ?? []).reduce((b, ss) => b + (ss.contentStandards?.length ?? 0), 0),
      0
    );
    const jsonIndicators = countIndicators(curriculum);
    const jsonExemplars = countExemplars(curriculum);

    console.log(`📌 CHECK for: ${curriculum.slug}`);
    console.log(
      `✅ JSON counts: strands=${jsonStrands}, subStrands=${jsonSubStrands}, contentStandards=${jsonContentStandards}, indicators=${jsonIndicators}, exemplars=${jsonExemplars}`
    );
    console.log(
      `✅ DB  counts: strands=${dbStrands}, subStrands=${dbSubStrands}, contentStandards=${dbContentStandards}, indicators=${dbIndicators}, exemplars=${dbExemplars}`
    );

    return;
  }

  if (RESET) {
    const existing = await prisma.curriculumSubject.findUnique({
      where: { slug: curriculum.slug },
      select: { id: true },
    });

    if (existing) {
      console.log(`⚠️ --reset: deleting curriculumSubject "${curriculum.slug}" (safe tree delete).`);
      await deleteSubjectTree(existing.id);
    }
  }

  // ✅ Upsert subject (no more P2002 slug errors)
  const subject = await prisma.curriculumSubject.upsert({
    where: { slug: curriculum.slug },
    create: {
      phase: curriculum.phase,
      level: curriculum.level,
      name: curriculum.name,
      slug: curriculum.slug,
      orderIndex: curriculum.orderIndex ?? 1,
      description: curriculum.description,
    },
    update: {
      phase: curriculum.phase,
      level: curriculum.level,
      name: curriculum.name,
      orderIndex: curriculum.orderIndex ?? 1,
      description: curriculum.description,
    },
    select: { id: true, slug: true },
  });

  console.log(`🎯 Upserting (dedupe-safe) strands for subject: ${subject.slug}`);

  for (let strandIndex = 0; strandIndex < (curriculum.strands ?? []).length; strandIndex++) {
    const strandJson = curriculum.strands[strandIndex];

    const existingStrand = await prisma.curriculumStrand.findFirst({
      where: { code: strandJson.code, subjectId: subject.id },
      select: { id: true },
    });

    const strand = existingStrand
      ? await prisma.curriculumStrand.update({
          where: { id: existingStrand.id },
          data: {
            title: strandJson.title,
            description: strandJson.description,
            orderIndex: strandJson.orderIndex ?? strandIndex + 1,
          },
          select: { id: true },
        })
      : await prisma.curriculumStrand.create({
          data: {
            code: strandJson.code,
            title: strandJson.title,
            description: strandJson.description,
            orderIndex: strandJson.orderIndex ?? strandIndex + 1,
            subject: { connect: { id: subject.id } },
          },
          select: { id: true },
        });

    for (let subIndex = 0; subIndex < (strandJson.subStrands ?? []).length; subIndex++) {
      const subStrandJson = strandJson.subStrands[subIndex];

      const existingSubStrand = await prisma.curriculumSubStrand.findFirst({
        where: { code: subStrandJson.code, strandId: strand.id },
        select: { id: true },
      });

      const subStrand = existingSubStrand
        ? await prisma.curriculumSubStrand.update({
            where: { id: existingSubStrand.id },
            data: {
              title: subStrandJson.title,
              description: subStrandJson.description,
              orderIndex: subStrandJson.orderIndex ?? subIndex + 1,
            },
            select: { id: true },
          })
        : await prisma.curriculumSubStrand.create({
            data: {
              code: subStrandJson.code,
              title: subStrandJson.title,
              description: subStrandJson.description,
              orderIndex: subStrandJson.orderIndex ?? subIndex + 1,
              strand: { connect: { id: strand.id } },
            },
            select: { id: true },
          });

      for (let csIndex = 0; csIndex < (subStrandJson.contentStandards ?? []).length; csIndex++) {
        const csJson = subStrandJson.contentStandards[csIndex];

        const existingCS = await prisma.curriculumContentStandard.findFirst({
          where: { code: csJson.code, subStrandId: subStrand.id },
          select: { id: true },
        });

        const contentStandard = existingCS
          ? await prisma.curriculumContentStandard.update({
              where: { id: existingCS.id },
              data: { description: csJson.description, orderIndex: csJson.orderIndex ?? csIndex + 1 },
              select: { id: true },
            })
          : await prisma.curriculumContentStandard.create({
              data: {
                code: csJson.code,
                description: csJson.description,
                orderIndex: csJson.orderIndex ?? csIndex + 1,
                subStrand: { connect: { id: subStrand.id } },
              },
              select: { id: true },
            });

        for (let indIndex = 0; indIndex < (csJson.indicators ?? []).length; indIndex++) {
          const indJson = csJson.indicators[indIndex];

          const existingInd = await prisma.curriculumIndicator.findFirst({
            where: { code: indJson.code, contentStandardId: contentStandard.id },
            select: { id: true },
          });

          if (existingInd) {
            await prisma.curriculumIndicator.update({
              where: { id: existingInd.id },
              data: {
                description: indJson.description,
                orderIndex: indJson.orderIndex ?? indIndex + 1,
                exemplars: { deleteMany: {}, create: toExemplarCreates(indJson.exemplars) },
              },
            });
          } else {
            await prisma.curriculumIndicator.create({
              data: {
                code: indJson.code,
                description: indJson.description,
                orderIndex: indJson.orderIndex ?? indIndex + 1,
                contentStandard: { connect: { id: contentStandard.id } },
                exemplars: { create: toExemplarCreates(indJson.exemplars) },
              },
            });
          }
        }
      }
    }
  }

  console.log(`🎉 Done seeding: ${subject.slug}`);
}

main()
  .catch((err) => {
    console.error("❌ Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
