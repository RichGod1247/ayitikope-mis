// prisma/seed/basic-5-computing.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SUBJECT_FRIENDLY_NAME = 'Basic 4 English Language (Part 1)';
const SUBJECT_JSON_FILE = 'basic-4-english-language-part1.json';

// ---------- Types matching the JSON shape ----------

interface ExemplarJson {
  orderIndex: number;
  description: string;
}

interface IndicatorJson {
  code: string;
  description: string;
  orderIndex: number;
  exemplars?: ExemplarJson[];
}

interface ContentStandardJson {
  code: string;
  description: string;
  orderIndex: number;
  indicators: IndicatorJson[];
}

interface SubStrandJson {
  code: string;
  title: string;
  description?: string;
  orderIndex: number;
  contentStandards: ContentStandardJson[];
}

interface StrandJson {
  code: string;
  title: string;
  description?: string;
  orderIndex: number;
  subStrands: SubStrandJson[];
}

interface SubjectJson {
  phase?: string;
  level?: string;
  subject: string;
  name: string;
  slug: string;
  orderIndex: number;
  description?: string;
  strands: StrandJson[];
}

// ---------- Helpers ----------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getCurriculumPath(fileName: string) {
  return path.join(__dirname, 'curriculum', fileName);
}

// ---------- Upsert tree ----------

async function upsertSubjectTree(subjectJson: SubjectJson) {
  // 1) Subject
  const subject = await prisma.curriculumSubject.upsert({
    where: { slug: subjectJson.slug },
    update: {
      name: subjectJson.name,
      slug: subjectJson.slug,
      description: subjectJson.description ?? null,
      orderIndex: subjectJson.orderIndex,
      phase: subjectJson.phase ?? null,
      level: subjectJson.level ?? null,
    },
    create: {
      name: subjectJson.name,
      slug: subjectJson.slug,
      description: subjectJson.description ?? null,
      orderIndex: subjectJson.orderIndex,
      phase: subjectJson.phase ?? null,
      level: subjectJson.level ?? null,
    },
  });

  console.log(
    `   → Upserting strands for ${subject.name} (${subject.level ?? 'no level'}, ${
      subject.phase ?? 'no phase'
    })…`
  );

  // 2) Strands
  for (const strand of subjectJson.strands ?? []) {
    const existingStrand = await prisma.curriculumStrand.findFirst({
      where: {
        subjectId: subject.id,
        code: strand.code,
      },
    });

    const strandRecord = existingStrand
      ? await prisma.curriculumStrand.update({
          where: { id: existingStrand.id },
          data: {
            code: strand.code,
            title: strand.title,
            description: strand.description ?? null,
            orderIndex: strand.orderIndex,
          },
        })
      : await prisma.curriculumStrand.create({
          data: {
            subjectId: subject.id,
            code: strand.code,
            title: strand.title,
            description: strand.description ?? null,
            orderIndex: strand.orderIndex,
          },
        });

    // 3) Sub-strands
    for (const sub of strand.subStrands ?? []) {
      const existingSub = await prisma.curriculumSubStrand.findFirst({
        where: {
          strandId: strandRecord.id,
          code: sub.code,
        },
      });

      const subRecord = existingSub
        ? await prisma.curriculumSubStrand.update({
            where: { id: existingSub.id },
            data: {
              code: sub.code,
              title: sub.title,
              description: sub.description ?? null,
              orderIndex: sub.orderIndex,
            },
          })
        : await prisma.curriculumSubStrand.create({
            data: {
              strandId: strandRecord.id,
              code: sub.code,
              title: sub.title,
              description: sub.description ?? null,
              orderIndex: sub.orderIndex,
            },
          });

      // 4) Content standards
      for (const cs of sub.contentStandards ?? []) {
        const existingCS = await prisma.curriculumContentStandard.findFirst({
          where: {
            subStrandId: subRecord.id,
            code: cs.code,
          },
        });

        const csRecord = existingCS
          ? await prisma.curriculumContentStandard.update({
              where: { id: existingCS.id },
              data: {
                code: cs.code,
                description: cs.description ?? null,
                orderIndex: cs.orderIndex,
              },
            })
          : await prisma.curriculumContentStandard.create({
              data: {
                subStrandId: subRecord.id,
                code: cs.code,
                description: cs.description ?? null,
                orderIndex: cs.orderIndex,
              },
            });

        // 5) Indicators
        for (const indicator of cs.indicators ?? []) {
          const existingInd = await prisma.curriculumIndicator.findFirst({
            where: {
              contentStandardId: csRecord.id,
              code: indicator.code,
            },
          });

          const indRecord = existingInd
            ? await prisma.curriculumIndicator.update({
                where: { id: existingInd.id },
                data: {
                  code: indicator.code,
                  description: indicator.description ?? null,
                  orderIndex: indicator.orderIndex,
                },
              })
            : await prisma.curriculumIndicator.create({
                data: {
                  contentStandardId: csRecord.id,
                  code: indicator.code,
                  description: indicator.description ?? null,
                  orderIndex: indicator.orderIndex,
                },
              });

          // 6) Exemplars – wipe & recreate (keeps DB in sync with JSON)
          await prisma.curriculumExemplar.deleteMany({
            where: { indicatorId: indRecord.id },
          });

          for (const ex of indicator.exemplars ?? []) {
            await prisma.curriculumExemplar.create({
              data: {
                indicatorId: indRecord.id,
                description: ex.description,
                orderIndex: ex.orderIndex,
              },
            });
          }
        }
      }
    }
  }
}

// ---------- Main ----------

async function main() {
  try {
    const filePath = getCurriculumPath(SUBJECT_JSON_FILE);
    console.log(`📖 Loading ${SUBJECT_FRIENDLY_NAME} from: ${filePath}`);

    const raw = fs.readFileSync(filePath, 'utf8');
    const subjectJson = JSON.parse(raw) as SubjectJson;

    console.log(`✅ Loaded subject: ${subjectJson.name}`);
    await upsertSubjectTree(subjectJson);

    console.log(`🎉 Done seeding ${SUBJECT_FRIENDLY_NAME}!`);
  } catch (err) {
    console.error(`❌ Error seeding ${SUBJECT_FRIENDLY_NAME}:`, err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
