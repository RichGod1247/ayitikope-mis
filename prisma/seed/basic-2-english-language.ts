// prisma/seed/basic-2-english-language.ts

import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

// Fix for ESM: define __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// ---------- Types for the JSON structure ----------

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
  description?: string;
  orderIndex?: number;
  contentStandards: ContentStandardJson[];
};

type StrandJson = {
  code: string;
  title: string;
  description?: string;
  orderIndex?: number;
  subStrands: SubStrandJson[];
};

type SubjectJson = {
  phase: string;
  level: string;
  subject: string;
  name: string;
  slug: string;
  orderIndex?: number;
  description?: string;
  strands: StrandJson[];
};

// ---------- Helpers ----------

function safeOrderIndex(v: number | undefined): number {
  return typeof v === 'number' ? v : 0;
}

async function loadJson(): Promise<SubjectJson> {
  const curriculumDir = path.join(__dirname, 'curriculum');
  const filePath = path.join(
    curriculumDir,
    'basic-2-english-language.json',
  );

  console.log('📖 Loading Basic 2 English curriculum from:', filePath);

  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as SubjectJson;

  if (!parsed.slug || !parsed.name || !parsed.subject) {
    throw new Error('Invalid Basic 2 English JSON: missing slug/name/subject');
  }

  return parsed;
}

// Build deterministic IDs so re-running the script does upserts instead of duplicates
function strandId(subjectSlug: string, strandCode: string | undefined) {
  return `${subjectSlug}-strand-${(strandCode ?? '').toLowerCase()}`;
}

function subStrandId(subjectSlug: string, subStrandCode: string | undefined) {
  return `${subjectSlug}-substrand-${(subStrandCode ?? '').toLowerCase()}`;
}

function contentStandardId(subjectSlug: string, csCode: string | undefined) {
  return `${subjectSlug}-cs-${(csCode ?? '').toLowerCase()}`;
}

function indicatorId(subjectSlug: string, indCode: string | undefined) {
  return `${subjectSlug}-ind-${(indCode ?? '').toLowerCase()}`;
}

function exemplarId(
  subjectSlug: string,
  indicatorCode: string | undefined,
  orderIndex: number | undefined,
) {
  return `${subjectSlug}-ex-${(indicatorCode ?? '').toLowerCase()}-${
    orderIndex ?? 0
  }`;
}

// ---------- Main seeding logic ----------

async function main() {
  console.log('📦 Seeding Basic 2 English Language curriculum');

  const subjectJson = await loadJson();

  // Upsert CurriculumSubject
  const subject = await prisma.curriculumSubject.upsert({
    where: {
      slug: subjectJson.slug,
    },
    update: {
      phase: subjectJson.phase,
      level: subjectJson.level,
      name: subjectJson.name, // e.g. "Basic 2 English Language"
      description: subjectJson.description ?? null,
      orderIndex: safeOrderIndex(subjectJson.orderIndex),
      isActive: true,
    },
    create: {
      slug: subjectJson.slug,
      phase: subjectJson.phase,
      level: subjectJson.level,
      name: subjectJson.name,
      description: subjectJson.description ?? null,
      orderIndex: safeOrderIndex(subjectJson.orderIndex),
      curriculumFramework: 'NaCCA Lower Primary English',
      frameworkVersion: '2019',
      countryCode: 'GH',
      isGlobal: true,
      isActive: true,
    },
  });

  console.log(
    `🎯 Upserting CurriculumSubject: ${subject.slug} (${subject.name})`,
  );

  let strandCount = 0;
  let subStrandCount = 0;
  let csCount = 0;
  let indicatorCount = 0;
  let exemplarCount = 0;

  // Walk Strands → SubStrands → ContentStandards → Indicators → Exemplars
  for (const strandJson of subjectJson.strands) {
    strandCount++;

    const strandCode = strandJson.code ?? `STRAND-${strandCount}`;
    const strandDbId = strandId(subject.slug, strandCode);

    const strand = await prisma.curriculumStrand.upsert({
      where: { id: strandDbId },
      update: {
        subjectId: subject.id,
        code: strandCode,
        title: strandJson.title,
        description: strandJson.description ?? null,
        orderIndex: safeOrderIndex(strandJson.orderIndex),
      },
      create: {
        id: strandDbId,
        subjectId: subject.id,
        code: strandCode,
        title: strandJson.title,
        description: strandJson.description ?? null,
        orderIndex: safeOrderIndex(strandJson.orderIndex),
      },
    });

    console.log(`  ✅ Strand ${strand.code}: ${strand.title}`);

    // Sub-strands
    for (const subStrandJson of strandJson.subStrands ?? []) {
      subStrandCount++;

      const subCode = subStrandJson.code ?? `SUB-${strandCount}-${subStrandCount}`;
      const subDbId = subStrandId(subject.slug, subCode);

      const subStrand = await prisma.curriculumSubStrand.upsert({
        where: { id: subDbId },
        update: {
          strandId: strand.id,
          code: subCode,
          title: subStrandJson.title,
          description: subStrandJson.description ?? null,
          orderIndex: safeOrderIndex(subStrandJson.orderIndex),
        },
        create: {
          id: subDbId,
          strandId: strand.id,
          code: subCode,
          title: subStrandJson.title,
          description: subStrandJson.description ?? null,
          orderIndex: safeOrderIndex(subStrandJson.orderIndex),
        },
      });

      console.log(
        `    🔹 Sub-strand ${subStrand.code}: ${subStrand.title}`,
      );

      // Content standards
      for (const csJson of subStrandJson.contentStandards ?? []) {
        csCount++;

        const csCode = csJson.code ?? `CS-${subStrandCount}-${csCount}`;
        const csDbId = contentStandardId(subject.slug, csCode);

        const contentStandard = await prisma.curriculumContentStandard.upsert(
          {
            where: { id: csDbId },
            update: {
              subStrandId: subStrand.id,
              code: csCode,
              description: csJson.description,
              orderIndex: safeOrderIndex(csJson.orderIndex),
            },
            create: {
              id: csDbId,
              subStrandId: subStrand.id,
              code: csCode,
              description: csJson.description,
              orderIndex: safeOrderIndex(csJson.orderIndex),
            },
          },
        );

        console.log(
          `      📚 Content Standard ${contentStandard.code}: ${contentStandard.description}`,
        );

        // Indicators
        for (const indJson of csJson.indicators ?? []) {
          indicatorCount++;

          const indCode =
            indJson.code ?? `IND-${csCount}-${indicatorCount}`;
          const indDbId = indicatorId(subject.slug, indCode);

          const indicator = await prisma.curriculumIndicator.upsert({
            where: { id: indDbId },
            update: {
              contentStandardId: contentStandard.id,
              code: indCode,
              description: indJson.description,
              orderIndex: safeOrderIndex(indJson.orderIndex),
            },
            create: {
              id: indDbId,
              contentStandardId: contentStandard.id,
              code: indCode,
              description: indJson.description,
              orderIndex: safeOrderIndex(indJson.orderIndex),
            },
          });

          console.log(
            `        🔸 Indicator ${indicator.code}: ${indicator.description}`,
          );

          // Exemplars
          for (const exJson of indJson.exemplars ?? []) {
            exemplarCount++;

            const exDbId = exemplarId(
              subject.slug,
              indCode,
              exJson.orderIndex,
            );

            await prisma.curriculumExemplar.upsert({
              where: { id: exDbId },
              update: {
                indicatorId: indicator.id,
                description: exJson.description,
                orderIndex: safeOrderIndex(exJson.orderIndex),
              },
              create: {
                id: exDbId,
                indicatorId: indicator.id,
                description: exJson.description,
                orderIndex: safeOrderIndex(exJson.orderIndex),
              },
            });
          }
        }
      }
    }
  }

  console.log('🎉 Done seeding Basic 2 English Language curriculum.');
  console.log(
    `   Strands: ${strandCount}, Sub-strands: ${subStrandCount}, Content Standards: ${csCount}, Indicators: ${indicatorCount}, Exemplars: ${exemplarCount}`,
  );
}

// ---------- Run ----------

main()
  .catch((e) => {
    console.error('❌ Error seeding Basic 2 English curriculum', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
