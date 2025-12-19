import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

/**
 * JSON shapes based on kg2-our-world-and-our-people.json
 */

interface JsonExemplar {
  orderIndex?: number;
  description?: string;
}

interface JsonIndicator {
  code: string;
  orderIndex?: number;
  description?: string;
  exemplars?: JsonExemplar[];
}

interface JsonContentStandard {
  code: string;
  orderIndex?: number;
  description?: string;
  indicators?: JsonIndicator[];
}

interface JsonSubStrand {
  code: string;
  title?: string;
  orderIndex?: number;
  description?: string;
  contentStandards?: JsonContentStandard[];
}

interface JsonStrand {
  code: string;
  title?: string;
  orderIndex?: number;
  description?: string;
  subStrands?: JsonSubStrand[];
}

interface JsonSubject {
  phase: string;
  level: string;
  subject: string;
  name: string;
  slug: string;
  orderIndex: number;
  description?: string;
  strands?: JsonStrand[];
}

// Helper: always return a non-empty string for required description fields
function safeDesc(value: string | undefined, fallback: string): string {
  if (value && value.trim().length > 0) return value;
  return fallback;
}

async function main() {
  // Use process.cwd() instead of __dirname (works nicely with ts-node / ESM)
  const filePath = path.join(
    process.cwd(),
    'prisma',
    'seed',
    'curriculum',
    'kg2-our-world-and-our-people.json'
  );

  console.log('📖 Loading KG2 OWOP curriculum from:', filePath);

  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw) as JsonSubject;

  console.log('→ Subject:', data.name, `(${data.slug})`);
  console.log('   Phase/Level:', data.phase, '/', data.level);
  console.log('   Strands in JSON:', data.strands?.length ?? 0);

  // 1️⃣ Upsert the subject by slug (NO delete, to avoid FK issues and P2002)
  const subject = await prisma.curriculumSubject.upsert({
    where: { slug: data.slug },
    update: {
      phase: data.phase,
      level: data.level,
      name: data.name,
      orderIndex: data.orderIndex,
      description: data.description ?? null,
    },
    create: {
      phase: data.phase,
      level: data.level,
      name: data.name,
      slug: data.slug,
      orderIndex: data.orderIndex,
      description: data.description ?? null,
    },
  });

  console.log(
    `🎯 Upserted CurriculumSubject for KG2 OWOP (id=${subject.id}, slug=${subject.slug})`
  );

  // Counters for a quick summary
  let createdStrands = 0;
  let updatedStrands = 0;
  let createdSubStrands = 0;
  let updatedSubStrands = 0;
  let createdContentStandards = 0;
  let updatedContentStandards = 0;
  let createdIndicators = 0;
  let updatedIndicators = 0;
  let replacedExemplarSets = 0;

  // 2️⃣ Walk the JSON tree and sync strands → subStrands → contentStandards → indicators → exemplars
  for (const strand of data.strands ?? []) {
    // 2a. Strand: find by code + subject
    const existingStrand = await prisma.curriculumStrand.findFirst({
      where: {
        code: strand.code,
        subjectId: subject.id,
      },
    });

    let strandRecord;

    if (existingStrand) {
      strandRecord = await prisma.curriculumStrand.update({
        where: { id: existingStrand.id },
        data: {
          title: strand.title ?? strand.code,
          orderIndex: strand.orderIndex ?? existingStrand.orderIndex ?? 0,
          description: strand.description ?? existingStrand.description ?? null,
          subject: { connect: { id: subject.id } },
        },
      });
      updatedStrands++;
    } else {
      strandRecord = await prisma.curriculumStrand.create({
        data: {
          code: strand.code,
          title: strand.title ?? strand.code,
          orderIndex: strand.orderIndex ?? 0,
          description: strand.description ?? null,
          subject: { connect: { id: subject.id } },
        },
      });
      createdStrands++;
    }

    // 2b. SubStrands under this strand
    for (const sub of strand.subStrands ?? []) {
      const existingSub = await prisma.curriculumSubStrand.findFirst({
        where: {
          code: sub.code,
          strandId: strandRecord.id,
        },
      });

      let subRecord;

      if (existingSub) {
        subRecord = await prisma.curriculumSubStrand.update({
          where: { id: existingSub.id },
          data: {
            title: sub.title ?? sub.code,
            orderIndex: sub.orderIndex ?? existingSub.orderIndex ?? 0,
            description: sub.description ?? existingSub.description ?? null,
            strand: { connect: { id: strandRecord.id } },
          },
        });
        updatedSubStrands++;
      } else {
        subRecord = await prisma.curriculumSubStrand.create({
          data: {
            code: sub.code,
            title: sub.title ?? sub.code,
            orderIndex: sub.orderIndex ?? 0,
            description: sub.description ?? null,
            strand: { connect: { id: strandRecord.id } },
          },
        });
        createdSubStrands++;
      }

      // 2c. Content Standards under this subStrand
      for (const cs of sub.contentStandards ?? []) {
        const existingCs = await prisma.curriculumContentStandard.findFirst({
          where: {
            code: cs.code,
            subStrandId: subRecord.id,
          },
        });

        let csRecord;

        if (existingCs) {
          csRecord = await prisma.curriculumContentStandard.update({
            where: { id: existingCs.id },
            data: {
              description: safeDesc(
                cs.description,
                `Content standard ${cs.code}`
              ),
              orderIndex: cs.orderIndex ?? existingCs.orderIndex ?? 0,
              subStrand: { connect: { id: subRecord.id } },
            },
          });
          updatedContentStandards++;
        } else {
          csRecord = await prisma.curriculumContentStandard.create({
            data: {
              code: cs.code,
              description: safeDesc(
                cs.description,
                `Content standard ${cs.code}`
              ),
              orderIndex: cs.orderIndex ?? 0,
              subStrand: { connect: { id: subRecord.id } },
            },
          });
          createdContentStandards++;
        }

        // 2d. Indicators under this content standard
        for (const ind of cs.indicators ?? []) {
          const existingInd = await prisma.curriculumIndicator.findFirst({
            where: {
              code: ind.code,
              contentStandardId: csRecord.id,
            },
          });

          let indRecord;

          if (existingInd) {
            indRecord = await prisma.curriculumIndicator.update({
              where: { id: existingInd.id },
              data: {
                description: safeDesc(
                  ind.description,
                  `Indicator ${ind.code}`
                ),
                orderIndex: ind.orderIndex ?? existingInd.orderIndex ?? 0,
                contentStandard: { connect: { id: csRecord.id } },
              },
            });
            updatedIndicators++;
          } else {
            indRecord = await prisma.curriculumIndicator.create({
              data: {
                code: ind.code,
                description: safeDesc(
                  ind.description,
                  `Indicator ${ind.code}`
                ),
                orderIndex: ind.orderIndex ?? 0,
                contentStandard: { connect: { id: csRecord.id } },
              },
            });
            createdIndicators++;
          }

          // 2e. Exemplars: destructive sync per indicator
          //     (clear existing for this indicator, then recreate from JSON)
          await prisma.curriculumExemplar.deleteMany({
            where: { indicatorId: indRecord.id },
          });

          const exData = (ind.exemplars ?? []).map((ex, exIdx) => ({
            indicatorId: indRecord.id,
            orderIndex: ex.orderIndex ?? exIdx + 1,
            description: ex.description ?? '',
          }));

          if (exData.length > 0) {
            await prisma.curriculumExemplar.createMany({
              data: exData,
            });
          }

          replacedExemplarSets++;
        }
      }
    }
  }

  console.log('✅ Finished syncing KG2 Our World and Our People');
  console.log('   Strands:       created =', createdStrands, ', updated =', updatedStrands);
  console.log(
    '   SubStrands:    created =',
    createdSubStrands,
    ', updated =',
    updatedSubStrands
  );
  console.log(
    '   Standards:     created =',
    createdContentStandards,
    ', updated =',
    updatedContentStandards
  );
  console.log(
    '   Indicators:    created =',
    createdIndicators,
    ', updated =',
    updatedIndicators
  );
  console.log('   Exemplar sets replaced for indicators =', replacedExemplarSets);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding KG2 Our World and Our People:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
