// prisma/seed/basic-1-mathematics.ts
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

const SUBJECT_FRIENDLY_NAME = "Basic 1 Mathematics";
const SUBJECT_JSON_FILE = "basic-1-mathematics.json";

// -------- Types matching JSON --------
type ExemplarJson = { orderIndex: number; description: string; title?: string };
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
  description?: string;
  orderIndex: number;
  contentStandards: ContentStandardJson[];
};
type StrandJson = {
  code: string;
  title: string;
  description?: string;
  orderIndex: number;
  subStrands: SubStrandJson[];
};
type CurriculumSubjectJson = {
  phase?: string;
  level?: string;
  subject: string;
  name: string;
  slug: string;
  orderIndex: number;
  description?: string;
  strands: StrandJson[];
};

// -------- ESM dirname --------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getCurriculumPath(fileName: string) {
  return path.join(__dirname, "curriculum", fileName);
}

/**
 * DEDUPE HELPERS
 * Canonical = earliest created row (createdAt asc).
 * Merge strategy = move children -> delete duplicates.
 */
async function dedupeStrand(subjectId: string, code: string) {
  const rows = await prisma.curriculumStrand.findMany({
    where: { subjectId, code },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length <= 1) return rows[0] ?? null;

  const [keep, ...dups] = rows;

  for (const d of dups) {
    await prisma.curriculumSubStrand.updateMany({
      where: { strandId: d.id },
      data: { strandId: keep.id },
    });
    await prisma.curriculumStrand.delete({ where: { id: d.id } });
  }

  return keep;
}

async function dedupeSubStrand(strandId: string, code: string) {
  const rows = await prisma.curriculumSubStrand.findMany({
    where: { strandId, code },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length <= 1) return rows[0] ?? null;

  const [keep, ...dups] = rows;

  for (const d of dups) {
    await prisma.curriculumContentStandard.updateMany({
      where: { subStrandId: d.id },
      data: { subStrandId: keep.id },
    });
    await prisma.curriculumSubStrand.delete({ where: { id: d.id } });
  }

  return keep;
}

async function dedupeContentStandard(subStrandId: string, code: string) {
  const rows = await prisma.curriculumContentStandard.findMany({
    where: { subStrandId, code },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length <= 1) return rows[0] ?? null;

  const [keep, ...dups] = rows;

  for (const d of dups) {
    await prisma.curriculumIndicator.updateMany({
      where: { contentStandardId: d.id },
      data: { contentStandardId: keep.id },
    });

    // If any ContentStandard-level media exists, move it too
    await prisma.curriculumMedia.updateMany({
      where: { contentStandardId: d.id },
      data: { contentStandardId: keep.id },
    });

    await prisma.curriculumContentStandard.delete({ where: { id: d.id } });
  }

  return keep;
}

async function dedupeIndicator(contentStandardId: string, code: string) {
  const rows = await prisma.curriculumIndicator.findMany({
    where: { contentStandardId, code },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length <= 1) return rows[0] ?? null;

  const [keep, ...dups] = rows;

  for (const d of dups) {
    await prisma.curriculumExemplar.updateMany({
      where: { indicatorId: d.id },
      data: { indicatorId: keep.id },
    });

    await prisma.curriculumMedia.updateMany({
      where: { indicatorId: d.id },
      data: { indicatorId: keep.id },
    });

    // Scheme items that point at this indicator must be moved too
    await prisma.schemeOfWorkItem.updateMany({
      where: { curriculumIndicatorId: d.id },
      data: { curriculumIndicatorId: keep.id },
    });

    await prisma.curriculumIndicator.delete({ where: { id: d.id } });
  }

  return keep;
}

/**
 * EXEMPLARS
 * IMPORTANT: do NOT wipe exemplars (deleting breaks future exemplar-media stability).
 * We upsert by (indicatorId, orderIndex). Optional prune via PRUNE_EXEMPLARS=1.
 */
async function upsertExemplars(indicatorId: string, exemplars: ExemplarJson[]) {
  const existing = await prisma.curriculumExemplar.findMany({
    where: { indicatorId },
    orderBy: { orderIndex: "asc" },
  });

  const existingByOrder = new Map<number, (typeof existing)[number]>();
  for (const e of existing) existingByOrder.set(e.orderIndex, e);

  const keepOrders = new Set<number>();

  for (const ex of exemplars) {
    keepOrders.add(ex.orderIndex);
    const found = existingByOrder.get(ex.orderIndex);

    if (found) {
      await prisma.curriculumExemplar.update({
        where: { id: found.id },
        data: {
          title: ex.title ?? null,
          description: ex.description,
          orderIndex: ex.orderIndex,
        },
      });
    } else {
      await prisma.curriculumExemplar.create({
        data: {
          indicatorId,
          title: ex.title ?? null,
          description: ex.description,
          orderIndex: ex.orderIndex,
        },
      });
    }
  }

  // Optional prune (only if you REALLY want strict syncing)
  if (process.env.PRUNE_EXEMPLARS === "1") {
    const toDelete = existing.filter((e) => !keepOrders.has(e.orderIndex));
    for (const d of toDelete) {
      // If later you attach media to exemplars, pruning can delete referenced nodes.
      await prisma.curriculumExemplar.delete({ where: { id: d.id } });
    }
  }
}

async function upsertSubjectTree(subjectJson: CurriculumSubjectJson) {
  // 1) Subject (no delete!)
  const subject = await prisma.curriculumSubject.upsert({
    where: { slug: subjectJson.slug },
    update: {
      name: subjectJson.name,
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
    `   → Upserting (dedupe-safe) strands for ${subject.name} (${subject.level ?? "no level"}, ${subject.phase ?? "no phase"})…`
  );

  // 2) Strands
  for (const strand of subjectJson.strands ?? []) {
    // Ensure dedupe first (merge if needed)
    let strandRecord = await dedupeStrand(subject.id, strand.code);

    if (!strandRecord) {
      strandRecord = await prisma.curriculumStrand.create({
        data: {
          subjectId: subject.id,
          code: strand.code,
          title: strand.title,
          description: strand.description ?? null,
          orderIndex: strand.orderIndex ?? 0,
        },
      });
    } else {
      strandRecord = await prisma.curriculumStrand.update({
        where: { id: strandRecord.id },
        data: {
          code: strand.code,
          title: strand.title,
          description: strand.description ?? null,
          orderIndex: strand.orderIndex ?? 0,
        },
      });
    }

    // 3) SubStrands
    for (const sub of strand.subStrands ?? []) {
      let subRecord = await dedupeSubStrand(strandRecord.id, sub.code);

      if (!subRecord) {
        subRecord = await prisma.curriculumSubStrand.create({
          data: {
            strandId: strandRecord.id,
            code: sub.code,
            title: sub.title,
            description: sub.description ?? null,
            orderIndex: sub.orderIndex ?? 0,
          },
        });
      } else {
        subRecord = await prisma.curriculumSubStrand.update({
          where: { id: subRecord.id },
          data: {
            code: sub.code,
            title: sub.title,
            description: sub.description ?? null,
            orderIndex: sub.orderIndex ?? 0,
          },
        });
      }

      // 4) ContentStandards
      for (const cs of sub.contentStandards ?? []) {
        let csRecord = await dedupeContentStandard(subRecord.id, cs.code);

        if (!csRecord) {
          csRecord = await prisma.curriculumContentStandard.create({
            data: {
              subStrandId: subRecord.id,
              code: cs.code,
              description: cs.description,
              orderIndex: cs.orderIndex ?? 0,
            },
          });
        } else {
          csRecord = await prisma.curriculumContentStandard.update({
            where: { id: csRecord.id },
            data: {
              code: cs.code,
              description: cs.description,
              orderIndex: cs.orderIndex ?? 0,
            },
          });
        }

        // 5) Indicators
        for (const ind of cs.indicators ?? []) {
          let indRecord = await dedupeIndicator(csRecord.id, ind.code);

          if (!indRecord) {
            indRecord = await prisma.curriculumIndicator.create({
              data: {
                contentStandardId: csRecord.id,
                code: ind.code,
                description: ind.description,
                orderIndex: ind.orderIndex ?? 0,
              },
            });
          } else {
            indRecord = await prisma.curriculumIndicator.update({
              where: { id: indRecord.id },
              data: {
                code: ind.code,
                description: ind.description,
                orderIndex: ind.orderIndex ?? 0,
              },
            });
          }

          // 6) Exemplars (stable upsert, no wipe)
          await upsertExemplars(indRecord.id, ind.exemplars ?? []);
        }
      }
    }
  }
}

async function main() {
  try {
    const filePath = getCurriculumPath(SUBJECT_JSON_FILE);
    console.log(`📖 Loading ${SUBJECT_FRIENDLY_NAME} from: ${filePath}`);

    const raw = await fs.readFile(filePath, "utf8");
    const subjectJson = JSON.parse(raw) as CurriculumSubjectJson;

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
