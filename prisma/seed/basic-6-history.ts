// prisma/seed/basic-6-history.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SUBJECT_FRIENDLY_NAME = "Basic 6 History";
const SUBJECT_JSON_FILE = "basic-6-history.json";

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
  return path.join(__dirname, "curriculum", fileName);
}

function first<T>(arr: T[]) {
  return arr[0];
}

/**
 * ⚠️ IMPORTANT:
 * Because the schema does NOT enforce unique constraints on:
 *  - CurriculumStrand (subjectId, code)
 *  - CurriculumSubStrand (strandId, code)
 *  - CurriculumContentStandard (subStrandId, code)
 *  - CurriculumIndicator (contentStandardId, code)
 *
 * ...we must deduplicate on-the-fly, otherwise reruns can create duplicates.
 */

// ---------- Dedupe + Upsert helpers ----------

async function upsertStrand(subjectId: string, strand: StrandJson) {
  const matches = await prisma.curriculumStrand.findMany({
    where: { subjectId, code: strand.code },
    orderBy: { createdAt: "asc" },
  });

  if (matches.length === 0) {
    return prisma.curriculumStrand.create({
      data: {
        subjectId,
        code: strand.code,
        title: strand.title,
        description: strand.description ?? null,
        orderIndex: strand.orderIndex,
      },
    });
  }

  const canonical = first(matches);

  if (matches.length > 1) {
    const dupIds = matches.slice(1).map((m) => m.id);

    // Move children
    await prisma.curriculumSubStrand.updateMany({
      where: { strandId: { in: dupIds } },
      data: { strandId: canonical.id },
    });

    // Delete duplicates
    await prisma.curriculumStrand.deleteMany({
      where: { id: { in: dupIds } },
    });

    console.log(`🧹 Deduped Strand ${strand.code}: merged ${dupIds.length} duplicate(s).`);
  }

  return prisma.curriculumStrand.update({
    where: { id: canonical.id },
    data: {
      code: strand.code,
      title: strand.title,
      description: strand.description ?? null,
      orderIndex: strand.orderIndex,
    },
  });
}

async function upsertSubStrand(strandId: string, sub: SubStrandJson) {
  const matches = await prisma.curriculumSubStrand.findMany({
    where: { strandId, code: sub.code },
    orderBy: { createdAt: "asc" },
  });

  if (matches.length === 0) {
    return prisma.curriculumSubStrand.create({
      data: {
        strandId,
        code: sub.code,
        title: sub.title,
        description: sub.description ?? null,
        orderIndex: sub.orderIndex,
      },
    });
  }

  const canonical = first(matches);

  if (matches.length > 1) {
    const dupIds = matches.slice(1).map((m) => m.id);

    // Move children
    await prisma.curriculumContentStandard.updateMany({
      where: { subStrandId: { in: dupIds } },
      data: { subStrandId: canonical.id },
    });

    await prisma.curriculumSubStrand.deleteMany({
      where: { id: { in: dupIds } },
    });

    console.log(`🧹 Deduped SubStrand ${sub.code}: merged ${dupIds.length} duplicate(s).`);
  }

  return prisma.curriculumSubStrand.update({
    where: { id: canonical.id },
    data: {
      code: sub.code,
      title: sub.title,
      description: sub.description ?? null,
      orderIndex: sub.orderIndex,
    },
  });
}

async function upsertContentStandard(subStrandId: string, cs: ContentStandardJson) {
  const matches = await prisma.curriculumContentStandard.findMany({
    where: { subStrandId, code: cs.code },
    orderBy: { createdAt: "asc" },
  });

  if (matches.length === 0) {
    return prisma.curriculumContentStandard.create({
      data: {
        subStrandId,
        code: cs.code,
        description: cs.description,
        orderIndex: cs.orderIndex,
      },
    });
  }

  const canonical = first(matches);

  if (matches.length > 1) {
    const dupIds = matches.slice(1).map((m) => m.id);

    // Move children
    await prisma.curriculumIndicator.updateMany({
      where: { contentStandardId: { in: dupIds } },
      data: { contentStandardId: canonical.id },
    });

    await prisma.curriculumMedia.updateMany({
      where: { contentStandardId: { in: dupIds } },
      data: { contentStandardId: canonical.id },
    });

    await prisma.curriculumContentStandard.deleteMany({
      where: { id: { in: dupIds } },
    });

    console.log(`🧹 Deduped ContentStandard ${cs.code}: merged ${dupIds.length} duplicate(s).`);
  }

  return prisma.curriculumContentStandard.update({
    where: { id: canonical.id },
    data: {
      code: cs.code,
      description: cs.description,
      orderIndex: cs.orderIndex,
    },
  });
}

async function upsertIndicator(contentStandardId: string, ind: IndicatorJson) {
  const matches = await prisma.curriculumIndicator.findMany({
    where: { contentStandardId, code: ind.code },
    orderBy: { createdAt: "asc" },
  });

  if (matches.length === 0) {
    return prisma.curriculumIndicator.create({
      data: {
        contentStandardId,
        code: ind.code,
        description: ind.description,
        orderIndex: ind.orderIndex,
      },
    });
  }

  const canonical = first(matches);

  if (matches.length > 1) {
    const dupIds = matches.slice(1).map((m) => m.id);

    // Move children
    await prisma.curriculumExemplar.updateMany({
      where: { indicatorId: { in: dupIds } },
      data: { indicatorId: canonical.id },
    });

    await prisma.curriculumMedia.updateMany({
      where: { indicatorId: { in: dupIds } },
      data: { indicatorId: canonical.id },
    });

    await prisma.schemeOfWorkItem.updateMany({
      where: { curriculumIndicatorId: { in: dupIds } },
      data: { curriculumIndicatorId: canonical.id },
    });

    await prisma.curriculumIndicator.deleteMany({
      where: { id: { in: dupIds } },
    });

    console.log(`🧹 Deduped Indicator ${ind.code}: merged ${dupIds.length} duplicate(s).`);
  }

  return prisma.curriculumIndicator.update({
    where: { id: canonical.id },
    data: {
      code: ind.code,
      description: ind.description,
      orderIndex: ind.orderIndex,
    },
  });
}

// ---------- Upsert tree ----------
async function upsertSubjectTree(subjectJson: SubjectJson) {
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
    `   → Upserting (dedupe-safe) strands for ${subject.name} (${subject.level ?? "no level"}, ${
      subject.phase ?? "no phase"
    })…`
  );

  for (const strand of subjectJson.strands ?? []) {
    const strandRecord = await upsertStrand(subject.id, strand);

    for (const sub of strand.subStrands ?? []) {
      const subRecord = await upsertSubStrand(strandRecord.id, sub);

      for (const cs of sub.contentStandards ?? []) {
        const csRecord = await upsertContentStandard(subRecord.id, cs);

        for (const indicator of cs.indicators ?? []) {
          const indRecord = await upsertIndicator(csRecord.id, indicator);

          // Exemplars: wipe & recreate (same as your Basic 5 pattern)
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

    const raw = fs.readFileSync(filePath, "utf8");
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
