// prisma/seed/kg1-language-and-literacy.ts
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const EXTRACTION_MODE = "KG_LL_EXTRACTED_TREE";
/**
 * KG LL subjects are extracted trees, not literal integrated curriculum mirrors.
 * Keep original curriculum codes and orderIndex values.
 * Missing indicator numbers are allowed when omitted indicators are non-LL.
 * Never renumber to remove gaps.
 * Sub-strand and content-standard titles must still match curriculum wording exactly.
 */
type ExemplarJson = {
  orderIndex: number;
  description: string;
};

type IndicatorJson = {
  code: string;
  description: string;
  orderIndex: number;
  exemplars?: ExemplarJson[];
};

type ContentStandardJson = {
  code: string;
  description: string;
  orderIndex: number;
  indicators?: IndicatorJson[];
};

type SubStrandJson = {
  code: string;
  title: string;
  description: string;
  orderIndex: number;
  contentStandards?: ContentStandardJson[];
};

type StrandJson = {
  code: string;
  title: string;
  description: string;
  orderIndex: number;
  subStrands?: SubStrandJson[];
};

type CurriculumJson = {
  phase: string;
  level: string;
  subject: string;
  name: string;
  slug: string;
  orderIndex: number;
  description: string;
  strands: StrandJson[];
};

// ==============================
// 1. Load JSON from file
// ==============================

function loadCurriculumJson(): CurriculumJson {
  // IMPORTANT: use process.cwd(), NOT __dirname
  const filePath = path.join(
    process.cwd(),
    'prisma',
    'seed',
    'curriculum',
    'kg1-language-and-literacy.json'
  );

  console.log(
    `📖 Loading KG1 Language and Literacy curriculum from: ${filePath}`
  );

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as CurriculumJson;

  return parsed;
}

// ==============================
// 2. Helper: deterministic IDs
// ==============================

function makeId(...parts: string[]): string {
  return parts.join('::');
}

// ==============================
// 3. Seeding logic
// ==============================

async function seedCurriculum(data: CurriculumJson) {
  console.log(`📚 Seeding curriculum for: ${data.name}`);

  const subjectId = makeId(data.phase, data.level, data.slug);

  // ------ Subject ------
  await prisma.curriculumSubject.upsert({
    where: { id: subjectId },
    create: {
      id: subjectId,
      phase: data.phase,
      level: data.level,
      name: data.name,
      slug: data.slug,
      description: data.description,
      orderIndex: data.orderIndex,
    },
    update: {
      phase: data.phase,
      level: data.level,
      name: data.name,
      slug: data.slug,
      description: data.description,
      orderIndex: data.orderIndex,
    },
  });

  // ------ Strands ------
  for (const strand of data.strands ?? []) {
    const strandId = makeId(subjectId, strand.code);

    await prisma.curriculumStrand.upsert({
      where: { id: strandId },
      create: {
        id: strandId,
        subjectId,
        code: strand.code,
        title: strand.title,
        description: strand.description,
        orderIndex: strand.orderIndex,
      },
      update: {
        code: strand.code,
        title: strand.title,
        description: strand.description,
        orderIndex: strand.orderIndex,
      },
    });

    // ------ Sub-strands ------
    for (const sub of strand.subStrands ?? []) {
      const subId = makeId(strandId, sub.code);

      await prisma.curriculumSubStrand.upsert({
        where: { id: subId },
        create: {
          id: subId,
          strandId,
          code: sub.code,
          title: sub.title,
          description: sub.description,
          orderIndex: sub.orderIndex,
        },
        update: {
          code: sub.code,
          title: sub.title,
          description: sub.description,
          orderIndex: sub.orderIndex,
        },
      });

      // ------ Content Standards ------
      for (const cs of sub.contentStandards ?? []) {
        const csId = makeId(subId, cs.code);

        await prisma.curriculumContentStandard.upsert({
          where: { id: csId },
          create: {
            id: csId,
            subStrandId: subId,
            code: cs.code,
            description: cs.description,
            orderIndex: cs.orderIndex,
          },
          update: {
            code: cs.code,
            description: cs.description,
            orderIndex: cs.orderIndex,
          },
        });

        // ------ Indicators ------
        for (const ind of cs.indicators ?? []) {
          const indId = makeId(csId, ind.code);

          await prisma.curriculumIndicator.upsert({
            where: { id: indId },
            create: {
              id: indId,
              contentStandardId: csId,
              code: ind.code,
              description: ind.description,
              orderIndex: ind.orderIndex,
            },
            update: {
              code: ind.code,
              description: ind.description,
              orderIndex: ind.orderIndex,
            },
          });

          // ------ Exemplars ------
          for (const ex of ind.exemplars ?? []) {
            const exId = makeId(indId, String(ex.orderIndex));

            await prisma.curriculumExemplar.upsert({
              where: { id: exId },
              create: {
                id: exId,
                indicatorId: indId,
                title: null,
                description: ex.description,
                assessmentNotes: null,
                orderIndex: ex.orderIndex,
              },
              update: {
                description: ex.description,
                orderIndex: ex.orderIndex,
              },
            });
          }
        }
      }
    }
  }

  console.log(`✅ Done seeding: ${data.name}`);
}

async function main() {
  const curriculumData = loadCurriculumJson();
  await seedCurriculum(curriculumData);
}

main()
  .catch((err) => {
    console.error('❌ Error seeding KG1 Language and Literacy', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
