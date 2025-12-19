// prisma/seed/kg1-creative-arts.ts
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the KG1 Creative Arts curriculum JSON
const CURRICULUM_JSON_PATH = path.join(
  __dirname,
  'curriculum',
  'kg1-creative-arts.json'
);

interface CurriculumIndicatorJson {
  code: string;
  description: string;
  orderIndex: number;
  exemplars?: {
    orderIndex: number;
    description: string;
  }[];
}

interface CurriculumContentStandardJson {
  code: string;
  description: string;
  orderIndex: number;
  indicators: CurriculumIndicatorJson[];
}

interface CurriculumSubStrandJson {
  code: string;
  title: string;
  description: string;
  orderIndex: number;
  contentStandards: CurriculumContentStandardJson[];
}

interface CurriculumStrandJson {
  code: string;
  title: string;
  description: string;
  orderIndex: number;
  subStrands: CurriculumSubStrandJson[];
}

interface CurriculumSubjectJson {
  phase: string;
  level: string;
  subject: string;
  name: string;
  slug: string;
  orderIndex: number;
  description: string;
  strands: CurriculumStrandJson[];
}

async function main() {
  console.log(
    `📖 Loading KG1 Creative Arts curriculum from: ${CURRICULUM_JSON_PATH}`
  );

  const raw = await fs.readFile(CURRICULUM_JSON_PATH, 'utf-8');
  const data: CurriculumSubjectJson = JSON.parse(raw);

  // 1️⃣ Upsert the subject by slug (canonical: "kg1-creative-arts")
  const subject = await prisma.curriculumSubject.upsert({
    where: { slug: data.slug },
    update: {
      name: data.name,
      phase: data.phase,
      level: data.level,
      description: data.description,
      orderIndex: data.orderIndex,
    },
    create: {
      slug: data.slug,
      name: data.name,
      phase: data.phase,
      level: data.level,
      description: data.description,
      orderIndex: data.orderIndex,
    },
  });

  console.log(
    `🎯 Upserted CurriculumSubject: ${subject.slug} (id=${subject.id})`
  );

  // 2️⃣ Upsert strands, sub-strands, content standards, indicators
  for (const strandJson of data.strands) {
    console.log(`\n→ Strand ${strandJson.code} – ${strandJson.title}`);

    // Strand
    let strand = await prisma.curriculumStrand.findFirst({
      where: {
        code: strandJson.code,
        subjectId: subject.id,
      },
    });

    if (strand) {
      strand = await prisma.curriculumStrand.update({
        where: { id: strand.id },
        data: {
          title: strandJson.title,
          description: strandJson.description,
          orderIndex: strandJson.orderIndex,
        },
      });
    } else {
      strand = await prisma.curriculumStrand.create({
        data: {
          code: strandJson.code,
          title: strandJson.title,
          description: strandJson.description,
          orderIndex: strandJson.orderIndex,
          subject: {
            connect: { id: subject.id },
          },
        },
      });
    }

    console.log(`   ✅ Strand upserted (id=${strand.id})`);

    // Sub-strands
    for (const subStrandJson of strandJson.subStrands) {
      console.log(
        `   → SubStrand ${subStrandJson.code} – ${subStrandJson.title}`
      );

      let subStrand = await prisma.curriculumSubStrand.findFirst({
        where: {
          code: subStrandJson.code,
          strandId: strand.id,
        },
      });

      if (subStrand) {
        subStrand = await prisma.curriculumSubStrand.update({
          where: { id: subStrand.id },
          data: {
            title: subStrandJson.title,
            description: subStrandJson.description,
            orderIndex: subStrandJson.orderIndex,
          },
        });
      } else {
        subStrand = await prisma.curriculumSubStrand.create({
          data: {
            code: subStrandJson.code,
            title: subStrandJson.title,
            description: subStrandJson.description,
            orderIndex: subStrandJson.orderIndex,
            strand: {
              connect: { id: strand.id },
            },
          },
        });
      }

      console.log(`      ✅ SubStrand upserted (id=${subStrand.id})`);

      // Content standards
      for (const csJson of subStrandJson.contentStandards) {
        console.log(
          `      → ContentStandard ${csJson.code} – ${csJson.description.slice(
            0,
            40
          )}...`
        );

        let contentStandard =
          await prisma.curriculumContentStandard.findFirst({
            where: {
              code: csJson.code,
              subStrandId: subStrand.id,
            },
          });

        if (contentStandard) {
          contentStandard =
            await prisma.curriculumContentStandard.update({
              where: { id: contentStandard.id },
              data: {
                description: csJson.description,
                orderIndex: csJson.orderIndex,
              },
            });
        } else {
          contentStandard =
            await prisma.curriculumContentStandard.create({
              data: {
                code: csJson.code,
                description: csJson.description,
                orderIndex: csJson.orderIndex,
                subStrand: {
                  connect: { id: subStrand.id },
                },
              },
            });
        }

        console.log(
          `         ✅ ContentStandard upserted (id=${contentStandard.id})`
        );

        // Indicators
        for (const indJson of csJson.indicators) {
          console.log(
            `         → Indicator ${indJson.code} – ${indJson.description.slice(
              0,
              40
            )}...`
          );

          let indicator = await prisma.curriculumIndicator.findFirst({
            where: {
              code: indJson.code,
              contentStandardId: contentStandard.id,
            },
          });

          if (indicator) {
            indicator = await prisma.curriculumIndicator.update({
              where: { id: indicator.id },
              data: {
                description: indJson.description,
                orderIndex: indJson.orderIndex,
              },
            });
          } else {
            indicator = await prisma.curriculumIndicator.create({
              data: {
                code: indJson.code,
                description: indJson.description,
                orderIndex: indJson.orderIndex,
                contentStandard: {
                  connect: { id: contentStandard.id },
                },
              },
            });
          }

          console.log(`            ✅ Indicator upserted (id=${indicator.id})`);

          // (Optional) Exemplars – only if your Prisma model supports them.
          // I’ll leave a placeholder here; uncomment and adjust if you already have a CurriculumExemplar model.
          //
          // if (indJson.exemplars && indJson.exemplars.length > 0) {
          //   for (const ex of indJson.exemplars) {
          //     await prisma.curriculumExemplar.upsert({
          //       where: {
          //         indicatorId_orderIndex: {
          //           indicatorId: indicator.id,
          //           orderIndex: ex.orderIndex,
          //         },
          //       },
          //       update: {
          //         description: ex.description,
          //       },
          //       create: {
          //         indicator: { connect: { id: indicator.id } },
          //         orderIndex: ex.orderIndex,
          //         description: ex.description,
          //       },
          //     });
          //   }
          // }
        }
      }
    }
  }

  console.log('\n🎉 Finished seeding KG1 Creative Arts curriculum.');
}

main()
  .catch((e) => {
    console.error('❌ Error in KG1 Creative Arts curriculum seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
