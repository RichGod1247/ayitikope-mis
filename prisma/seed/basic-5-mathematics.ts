// prisma/seed/basic-5-mathematics.ts
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();

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
  description?: string;
  orderIndex: number;
  contentStandards?: ContentStandardJson[];
};

type StrandJson = {
  code: string;
  title: string;
  description?: string;
  orderIndex: number;
  subStrands?: SubStrandJson[];
};

type SubjectJson = {
  phase: string;
  level: string;
  subject: string;
  name: string;
  slug: string;
  orderIndex: number;
  description?: string;
  strands: StrandJson[];
};

async function upsertSubjectTree(data: SubjectJson) {
  const subject = await prisma.curriculumSubject.upsert({
    where: { slug: data.slug },
    update: {
      name: data.name,
      description: data.description ?? null,
      orderIndex: data.orderIndex,
      phase: data.phase,
      level: data.level,
    },
    create: {
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      orderIndex: data.orderIndex,
      phase: data.phase,
      level: data.level,
    },
  });

  console.log(`→ Subject: ${subject.name} (${subject.slug})`);
  console.log(`   Phase/Level: ${data.phase} / ${data.level}`);
  console.log(`   Strands in JSON: ${data.strands.length}`);

  // STRANDS
  for (const strand of data.strands) {
    let strandRecord = await prisma.curriculumStrand.findFirst({
      where: {
        subjectId: subject.id,
        code: strand.code,
      },
    });

    if (strandRecord) {
      strandRecord = await prisma.curriculumStrand.update({
        where: { id: strandRecord.id },
        data: {
          title: strand.title,
          description: strand.description ?? null,
          orderIndex: strand.orderIndex,
        },
      });
    } else {
      strandRecord = await prisma.curriculumStrand.create({
        data: {
          subjectId: subject.id,
          code: strand.code,
          title: strand.title,
          description: strand.description ?? null,
          orderIndex: strand.orderIndex,
        },
      });
    }

    console.log(`     Strand ${strand.code} - ${strand.title}`);

    if (!strand.subStrands) continue;

    // SUBSTRANDS
    for (const sub of strand.subStrands) {
      let subStrandRecord = await prisma.curriculumSubStrand.findFirst({
        where: {
          strandId: strandRecord.id,
          code: sub.code,
        },
      });

      if (subStrandRecord) {
        subStrandRecord = await prisma.curriculumSubStrand.update({
          where: { id: subStrandRecord.id },
          data: {
            title: sub.title,
            description: sub.description ?? null,
            orderIndex: sub.orderIndex,
          },
        });
      } else {
        subStrandRecord = await prisma.curriculumSubStrand.create({
          data: {
            strandId: strandRecord.id,
            code: sub.code,
            title: sub.title,
            description: sub.description ?? null,
            orderIndex: sub.orderIndex,
          },
        });
      }

      if (!sub.contentStandards) continue;

      // CONTENT STANDARDS
      for (const cs of sub.contentStandards) {
        let csRecord = await prisma.curriculumContentStandard.findFirst({
          where: {
            subStrandId: subStrandRecord.id,
            code: cs.code,
          },
        });

        if (csRecord) {
          csRecord = await prisma.curriculumContentStandard.update({
            where: { id: csRecord.id },
            data: {
              description: cs.description,
              orderIndex: cs.orderIndex,
            },
          });
        } else {
          csRecord = await prisma.curriculumContentStandard.create({
            data: {
              subStrandId: subStrandRecord.id,
              code: cs.code,
              description: cs.description,
              orderIndex: cs.orderIndex,
            },
          });
        }

        if (!cs.indicators) continue;

        // INDICATORS
        for (const ind of cs.indicators) {
          let indicatorRecord = await prisma.curriculumIndicator.findFirst({
            where: {
              contentStandardId: csRecord.id,
              code: ind.code,
            },
          });

          if (indicatorRecord) {
            indicatorRecord = await prisma.curriculumIndicator.update({
              where: { id: indicatorRecord.id },
              data: {
                description: ind.description,
                orderIndex: ind.orderIndex,
              },
            });
          } else {
            indicatorRecord = await prisma.curriculumIndicator.create({
              data: {
                contentStandardId: csRecord.id,
                code: ind.code,
                description: ind.description,
                orderIndex: ind.orderIndex,
              },
            });
          }

          // EXEMPLARS – clear and recreate per indicator
          if (ind.exemplars && ind.exemplars.length > 0) {
            await prisma.curriculumExemplar.deleteMany({
              where: { indicatorId: indicatorRecord.id },
            });

            await prisma.curriculumExemplar.createMany({
              data: ind.exemplars.map((ex) => ({
                indicatorId: indicatorRecord!.id,
                orderIndex: ex.orderIndex,
                description: ex.description,
              })),
              skipDuplicates: true,
            });
          }
        }
      }
    }
  }
}

async function main() {
  const filePath = path.join(
    process.cwd(),
    'prisma',
    'seed',
    'curriculum',
    'basic-5-mathematics.json',
  );

  console.log(`📖 Loading Basic 5 Mathematics from: ${filePath}`);

  const raw = fs.readFileSync(filePath, 'utf8');
  const json = JSON.parse(raw) as SubjectJson;

  if (!json || !json.slug || !Array.isArray(json.strands)) {
    throw new Error('Invalid JSON structure for Basic 5 Mathematics');
  }

  console.log(`✅ Loaded subject: ${json.name}`);

  await upsertSubjectTree(json);

  console.log('✅ Finished seeding Basic 5 Mathematics');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding Basic 5 Mathematics:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
