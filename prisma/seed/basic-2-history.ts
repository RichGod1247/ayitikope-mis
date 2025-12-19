// prisma/seed/basic-2-history.ts
// Seed script for Basic 2 History curriculum

// @ts-nocheck

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUBJECT_FRIENDLY_NAME = 'Basic 2 History';
const SUBJECT_JSON_FILE = 'basic-2-history.json';

// -------- MODEL ALIASES (same pattern as the working History / Creative Arts scripts) --------

const models = {
  phase:
    (prisma as any).curriculumPhase ??
    (prisma as any).phase ??
    null,
  level:
    (prisma as any).curriculumLevel ??
    (prisma as any).level ??
    null,
  subject:
    (prisma as any).curriculumSubject ??
    (prisma as any).subject ??
    null,
  strand:
    (prisma as any).curriculumStrand ??
    (prisma as any).strand ??
    null,
  subStrand:
    (prisma as any).curriculumSubStrand ??
    (prisma as any).subStrand ??
    (prisma as any).curriculumSubstrand ??
    (prisma as any).substrand ??
    null,
  contentStandard:
    (prisma as any).curriculumContentStandard ??
    (prisma as any).contentStandard ??
    (prisma as any).curriculumStandard ??
    (prisma as any).standard ??
    null,
  indicator:
    (prisma as any).curriculumIndicator ??
    (prisma as any).indicator ??
    null,
  exemplar:
    (prisma as any).curriculumExemplar ??
    (prisma as any).exemplar ??
    null,
};

function ensureRequiredModels() {
  const missing: string[] = [];
  if (!models.subject) missing.push('subject');
  if (!models.strand) missing.push('strand');
  if (!models.subStrand) missing.push('subStrand');
  if (!models.contentStandard) missing.push('contentStandard');
  if (!models.indicator) missing.push('indicator');
  if (!models.exemplar) missing.push('exemplar');

  if (missing.length > 0) {
    const available = Object.keys(prisma as any).join(', ');
    throw new Error(
      `Required Prisma models missing: ${missing.join(
        ', ',
      )}. I looked for CurriculumSubject/Subject, CurriculumStrand/Strand, CurriculumSubStrand/SubStrand, CurriculumContentStandard/ContentStandard/Standard, CurriculumIndicator/Indicator, CurriculumExemplar/Exemplar.\n` +
        `Available prisma delegates: ${available}`,
    );
  }
}

// ----------------- Types matching your JSON shape -----------------

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
  indicators: IndicatorJson[];
};

type SubStrandJson = {
  code: string;
  title: string;
  description: string;
  orderIndex: number;
  contentStandards: ContentStandardJson[];
};

type StrandJson = {
  code: string;
  title: string;
  description: string;
  orderIndex: number;
  subStrands: SubStrandJson[];
};

type SubjectJson = {
  phase: string;
  level: string;
  subject: string;
  name: string;
  slug: string;
  orderIndex: number;
  description: string;
  strands: StrandJson[];
};

// ----------------- Helpers -----------------

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function phaseOrderIndex(phase: string): number {
  switch (phase.trim().toLowerCase()) {
    case 'kindergarten':
    case 'kg':
      return 1;
    case 'lower primary':
      return 2;
    case 'upper primary':
      return 3;
    case 'jhs':
    case 'junior high school':
      return 4;
    default:
      return 99;
  }
}

function levelOrderIndex(level: string): number {
  const match = level.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

// ----------------- Load JSON -----------------

async function loadSubject(): Promise<SubjectJson[]> {
  const curriculumDir = path.join(__dirname, 'curriculum');
  const filePath = path.join(curriculumDir, SUBJECT_JSON_FILE);

  console.log(
    `📖 Loading ${SUBJECT_FRIENDLY_NAME} from: ${filePath}`,
  );

  const raw = await fs.readFile(filePath, 'utf8');
  const json = JSON.parse(raw);

  if (Array.isArray(json)) {
    console.log(`✅ Loaded ${json.length} subject(s) for ${SUBJECT_FRIENDLY_NAME}`);
    return json;
  } else {
    console.log(`✅ Loaded 1 subject for ${SUBJECT_FRIENDLY_NAME}`);
    return [json];
  }
}

// ----------------- Upsert-like helpers without composite unique -----------------

async function findOrCreateStrand(subjectId: string, data: StrandJson) {
  const strandModel = models.strand;

  let strand = await strandModel.findFirst({
    where: {
      subjectId,
      code: data.code,
    },
  });

  if (strand) {
    strand = await strandModel.update({
      where: { id: strand.id },
      data: {
        title: data.title,
        description: data.description,
        orderIndex: data.orderIndex ?? 1,
      },
    });
  } else {
    strand = await strandModel.create({
      data: {
        subjectId,
        code: data.code,
        title: data.title,
        description: data.description,
        orderIndex: data.orderIndex ?? 1,
      },
    });
  }

  return strand;
}

async function findOrCreateSubStrand(strandId: string, data: SubStrandJson) {
  const subStrandModel = models.subStrand;

  let subStrand = await subStrandModel.findFirst({
    where: {
      strandId,
      code: data.code,
    },
  });

  if (subStrand) {
    subStrand = await subStrandModel.update({
      where: { id: subStrand.id },
      data: {
        title: data.title,
        description: data.description,
        orderIndex: data.orderIndex ?? 1,
      },
    });
  } else {
    subStrand = await subStrandModel.create({
      data: {
        strandId,
        code: data.code,
        title: data.title,
        description: data.description,
        orderIndex: data.orderIndex ?? 1,
      },
    });
  }

  return subStrand;
}

async function findOrCreateContentStandard(
  subStrandId: string,
  data: ContentStandardJson,
) {
  const contentStandardModel = models.contentStandard;

  let cs = await contentStandardModel.findFirst({
    where: {
      subStrandId,
      code: data.code,
    },
  });

  if (cs) {
    cs = await contentStandardModel.update({
      where: { id: cs.id },
      data: {
        description: data.description,
        orderIndex: data.orderIndex ?? 1,
      },
    });
  } else {
    cs = await contentStandardModel.create({
      data: {
        subStrandId,
        code: data.code,
        description: data.description,
        orderIndex: data.orderIndex ?? 1,
      },
    });
  }

  return cs;
}

async function findOrCreateIndicator(
  contentStandardId: string,
  data: IndicatorJson,
) {
  const indicatorModel = models.indicator;

  let indicator = await indicatorModel.findFirst({
    where: {
      contentStandardId,
      code: data.code,
    },
  });

  if (indicator) {
    indicator = await indicatorModel.update({
      where: { id: indicator.id },
      data: {
        description: data.description,
        orderIndex: data.orderIndex ?? 1,
      },
    });
  } else {
    indicator = await indicatorModel.create({
      data: {
        contentStandardId,
        code: data.code,
        description: data.description,
        orderIndex: data.orderIndex ?? 1,
      },
    });
  }

  return indicator;
}

// ----------------- Upsert subject + tree -----------------

async function upsertSubjectTree(subjectJson: SubjectJson) {
  ensureRequiredModels();

  const phaseModel = models.phase;
  const levelModel = models.level;
  const subjectModel = models.subject;
  const exemplarModel = models.exemplar;

  const phaseSlug = slugify(subjectJson.phase);
  const levelSlug = slugify(subjectJson.level);

  // Optional Phase
  if (phaseModel) {
    await phaseModel.upsert({
      where: { slug: phaseSlug },
      update: {
        name: subjectJson.phase,
        orderIndex: phaseOrderIndex(subjectJson.phase),
      },
      create: {
        name: subjectJson.phase,
        slug: phaseSlug,
        orderIndex: phaseOrderIndex(subjectJson.phase),
      },
    });
  } else {
    console.log('   (ℹ️ No phase model found – skipping phase upsert)');
  }

  // Optional Level
  if (levelModel) {
    const baseLevelData: any = {
      name: subjectJson.level,
      slug: levelSlug,
      orderIndex: levelOrderIndex(subjectJson.level),
    };

    try {
      await levelModel.upsert({
        where: { slug: levelSlug },
        update: baseLevelData,
        create: baseLevelData,
      });
    } catch (e: any) {
      console.warn(
        '   (⚠️ Level upsert failed, but level is optional – continuing):',
        e?.message,
      );
    }
  } else {
    console.log('   (ℹ️ No level model found – skipping level upsert)');
  }

  // SUBJECT – uses slug, phase, level (string fields on CurriculumSubject)
  const subjectWhere = { slug: subjectJson.slug };
  const subjectBaseData: any = {
    name: subjectJson.name,
    slug: subjectJson.slug,
    description: subjectJson.description,
    orderIndex: subjectJson.orderIndex ?? 1,
    phase: subjectJson.phase,
    level: subjectJson.level,
  };

  const subject = await subjectModel.upsert({
    where: subjectWhere,
    update: subjectBaseData,
    create: subjectBaseData,
  });

  console.log(
    `   → Upserting strands for ${subjectJson.name} (${subjectJson.level}, ${subjectJson.phase})…`,
  );

  // STRANDS
  for (const strandJson of subjectJson.strands ?? []) {
    const strand = await findOrCreateStrand(subject.id, strandJson);

    // SUB-STRANDS
    for (const subStrandJson of strandJson.subStrands ?? []) {
      const subStrand = await findOrCreateSubStrand(strand.id, subStrandJson);

      // CONTENT STANDARDS
      for (const csJson of subStrandJson.contentStandards ?? []) {
        const cs = await findOrCreateContentStandard(subStrand.id, csJson);

        // INDICATORS
        for (const indicatorJson of csJson.indicators ?? []) {
          const indicator = await findOrCreateIndicator(cs.id, indicatorJson);

          // EXEMPLARS – clear & recreate so JSON is the single source of truth
          await exemplarModel.deleteMany({
            where: { indicatorId: indicator.id },
          });

          for (const exJson of indicatorJson.exemplars ?? []) {
            await exemplarModel.create({
              data: {
                indicatorId: indicator.id,
                orderIndex: exJson.orderIndex ?? 1,
                description: exJson.description,
              },
            });
          }
        }
      }
    }
  }

  console.log(`   ✅ Finished upserting ${subjectJson.name}`);
}

// ----------------- Main -----------------

async function main() {
  try {
    const subjects = await loadSubject();

    for (const subjectJson of subjects) {
      await upsertSubjectTree(subjectJson);
    }

    console.log(`🎉 Done seeding ${SUBJECT_FRIENDLY_NAME}!`);
  } catch (err) {
    console.error('❌ Error seeding Basic 2 History:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
