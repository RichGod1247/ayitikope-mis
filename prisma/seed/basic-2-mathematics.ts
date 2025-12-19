// prisma/seed/basic-2-mathematics.ts
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

// =========================
// Types matching your JSON
// =========================

type ExemplarJson = {
  orderIndex?: number;
  description: string;
};

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
    // Media can hang off multiple nodes — delete it first to avoid FK blocks
    await tx.curriculumMedia.deleteMany({
      where: {
        OR: [
          { subjectId },
          {
            contentStandard: {
              subStrand: { strand: { subjectId } },
            },
          },
          {
            indicator: {
              contentStandard: {
                subStrand: { strand: { subjectId } },
              },
            },
          },
          {
            exemplar: {
              indicator: {
                contentStandard: {
                  subStrand: { strand: { subjectId } },
                },
              },
            },
          },
        ],
      },
    });

    await tx.curriculumExemplar.deleteMany({
      where: {
        indicator: {
          contentStandard: {
            subStrand: {
              strand: { subjectId },
            },
          },
        },
      },
    });

    await tx.curriculumIndicator.deleteMany({
      where: {
        contentStandard: {
          subStrand: {
            strand: { subjectId },
          },
        },
      },
    });

    await tx.curriculumContentStandard.deleteMany({
      where: {
        subStrand: {
          strand: { subjectId },
        },
      },
    });

    await tx.curriculumSubStrand.deleteMany({
      where: {
        strand: { subjectId },
      },
    });

    await tx.curriculumStrand.deleteMany({
      where: { subjectId },
    });

    await tx.curriculumSubject.delete({
      where: { id: subjectId },
    });
  });
}

// =========================
// Main
// =========================

async function main() {
  const args = new Set(process.argv.slice(2));
  const CHECK = args.has("--check");
  const RESET = args.has("--reset");

  // ESM-friendly __dirname
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const jsonPath = path.join(__dirname, "curriculum", "basic-2-mathematics.json");
  const raw = await fs.readFile(jsonPath, "utf8");
  const curriculum = JSON.parse(raw) as CurriculumSubjectJson;

  console.log(`📖 Loading Basic 2 Mathematics curriculum from: ${jsonPath}`);
  console.log(`→ Subject: ${curriculum.name} (${curriculum.slug})`);
  console.log(`   Phase/Level: ${curriculum.phase} / ${curriculum.level}`);
  console.log(`   Strands in JSON: ${curriculum.strands.length}`);
  console.log(`   Indicators in JSON: ${countIndicators(curriculum)}`);

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

    const indicatorsInDb = await prisma.curriculumIndicator.count({
      where: {
        contentStandard: {
          subStrand: {
            strand: {
              subjectId: subject.id, // ✅ FIXED
            },
          },
        },
      },
    });

    console.log(`✅ CHECK: curriculumSubject exists: ${subject.name}`);
    console.log(`✅ CHECK: indicators in JSON: ${countIndicators(curriculum)}`);
    console.log(`✅ CHECK: indicators in DB : ${indicatorsInDb}`);
    return;
  }

  // -------------------------
  // Subject (safe: upsert)
  // -------------------------

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

  const createdCounts = {
    strands: 0,
    subStrands: 0,
    contentStandards: 0,
    indicators: 0,
  };

  // -------------------------
  // Strands → SubStrands → ContentStandards → Indicators → Exemplars
  // -------------------------

  for (let strandIndex = 0; strandIndex < (curriculum.strands ?? []).length; strandIndex++) {
    const strandJson = curriculum.strands[strandIndex];

    // Strand
    const existingStrand = await prisma.curriculumStrand.findFirst({
      where: {
        code: strandJson.code,
        subjectId: subject.id, // ✅ FIXED
      },
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
          select: { id: true, code: true },
        })
      : await prisma.curriculumStrand.create({
          data: {
            code: strandJson.code,
            title: strandJson.title,
            description: strandJson.description,
            orderIndex: strandJson.orderIndex ?? strandIndex + 1,
            subject: { connect: { id: subject.id } }, // ✅ FIXED (relation name)
          },
          select: { id: true, code: true },
        });

    if (!existingStrand) createdCounts.strands++;

    // SubStrands
    for (let subIndex = 0; subIndex < (strandJson.subStrands ?? []).length; subIndex++) {
      const subStrandJson = strandJson.subStrands[subIndex];

      const existingSubStrand = await prisma.curriculumSubStrand.findFirst({
        where: {
          code: subStrandJson.code,
          strandId: strand.id,
        },
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
            select: { id: true, code: true },
          })
        : await prisma.curriculumSubStrand.create({
            data: {
              code: subStrandJson.code,
              title: subStrandJson.title,
              description: subStrandJson.description,
              orderIndex: subStrandJson.orderIndex ?? subIndex + 1,
              strand: { connect: { id: strand.id } },
            },
            select: { id: true, code: true },
          });

      if (!existingSubStrand) createdCounts.subStrands++;

      // Content Standards
      for (let csIndex = 0; csIndex < (subStrandJson.contentStandards ?? []).length; csIndex++) {
        const csJson = subStrandJson.contentStandards[csIndex];

        const existingCS = await prisma.curriculumContentStandard.findFirst({
          where: {
            code: csJson.code,
            subStrandId: subStrand.id,
          },
          select: { id: true },
        });

        const contentStandard = existingCS
          ? await prisma.curriculumContentStandard.update({
              where: { id: existingCS.id },
              data: {
                description: csJson.description,
                orderIndex: csJson.orderIndex ?? csIndex + 1,
              },
              select: { id: true, code: true },
            })
          : await prisma.curriculumContentStandard.create({
              data: {
                code: csJson.code,
                description: csJson.description,
                orderIndex: csJson.orderIndex ?? csIndex + 1,
                subStrand: { connect: { id: subStrand.id } },
              },
              select: { id: true, code: true },
            });

        if (!existingCS) createdCounts.contentStandards++;

        // Indicators
        for (let indIndex = 0; indIndex < (csJson.indicators ?? []).length; indIndex++) {
          const indJson = csJson.indicators[indIndex];

          const existingInd = await prisma.curriculumIndicator.findFirst({
            where: {
              code: indJson.code,
              contentStandardId: contentStandard.id,
            },
            select: { id: true },
          });

          if (existingInd) {
            await prisma.curriculumIndicator.update({
              where: { id: existingInd.id },
              data: {
                description: indJson.description,
                orderIndex: indJson.orderIndex ?? indIndex + 1,
                exemplars: {
                  deleteMany: {},
                  create: toExemplarCreates(indJson.exemplars),
                },
              },
            });
          } else {
            await prisma.curriculumIndicator.create({
              data: {
                code: indJson.code,
                description: indJson.description,
                orderIndex: indJson.orderIndex ?? indIndex + 1,
                contentStandard: { connect: { id: contentStandard.id } },
                exemplars: {
                  create: toExemplarCreates(indJson.exemplars),
                },
              },
            });
            createdCounts.indicators++;
          }
        }
      }
    }
  }

  console.log(
    `✅ Seeded/updated Basic 2 Mathematics (subject slug: ${subject.slug}). Created: ` +
      `${createdCounts.strands} strands, ${createdCounts.subStrands} subStrands, ` +
      `${createdCounts.contentStandards} contentStandards, ${createdCounts.indicators} indicators.`
  );
}

main()
  .catch((err) => {
    console.error("❌ Error seeding Basic 2 Mathematics:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
