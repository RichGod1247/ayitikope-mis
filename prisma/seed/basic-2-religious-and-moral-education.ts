import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to curriculum JSON
const CURRICULUM_DIR = path.join(__dirname, "curriculum");
const FILE_NAME = "basic-2-religious-and-moral-education.json";

console.log("📦 Seeding Basic 2 Religious and Moral Education from JSON in:", CURRICULUM_DIR);

type JsonExemplar = { orderIndex: number; description: string };
type JsonIndicator = { code: string; description: string; orderIndex: number; exemplars?: JsonExemplar[] };
type JsonContentStandard = { code: string; description: string; orderIndex: number; indicators?: JsonIndicator[] };
type JsonSubStrand = {
  code: string;
  title: string;
  description?: string;
  orderIndex: number;
  contentStandards?: JsonContentStandard[];
};
type JsonStrand = {
  code: string;
  title: string;
  description?: string;
  orderIndex: number;
  subStrands?: JsonSubStrand[];
};
type JsonSubject = {
  phase: string;
  level: string;
  subject?: string;
  name: string;
  slug: string;
  orderIndex?: number;
  description?: string;
  strands?: JsonStrand[];
};

async function main() {
  const fullPath = path.join(CURRICULUM_DIR, FILE_NAME);

  if (!fs.existsSync(fullPath)) {
    console.error("❌ Basic 2 R.M.E JSON file not found:", fullPath);
    process.exit(1);
  }

  console.log("📖 Loading Basic 2 R.M.E from:", fullPath);

  const raw = fs.readFileSync(fullPath, "utf8");
  const json: JsonSubject = JSON.parse(raw);

  if (!json?.slug || !json?.name || !json?.phase || !json?.level) {
    console.error("❌ Invalid JSON root. Expecting { slug, name, phase, level, ... }");
    process.exit(1);
  }

  const strands = json.strands ?? [];

  const counters = {
    subjectCreated: 0,
    subjectUpdated: 0,
    strandsCreated: 0,
    strandsUpdated: 0,
    subStrandsCreated: 0,
    subStrandsUpdated: 0,
    contentStandardsCreated: 0,
    contentStandardsUpdated: 0,
    indicatorsCreated: 0,
    indicatorsUpdated: 0,
    exemplarsCreated: 0,
    exemplarsUpdated: 0,
  };

  // 1) Upsert subject
  const existingSubject = await prisma.curriculumSubject.findUnique({
    where: { slug: json.slug },
    select: { id: true },
  });

  const subject = existingSubject
    ? await prisma.curriculumSubject.update({
        where: { slug: json.slug },
        data: {
          name: json.name,
          phase: json.phase,
          level: json.level,
          description: json.description ?? null,
          orderIndex: json.orderIndex ?? 1,
        },
      })
    : await prisma.curriculumSubject.create({
        data: {
          slug: json.slug,
          name: json.name,
          phase: json.phase,
          level: json.level,
          description: json.description ?? null,
          orderIndex: json.orderIndex ?? 1,
        },
      });

  if (existingSubject) counters.subjectUpdated += 1;
  else counters.subjectCreated += 1;

  console.log(`→ Subject: ${subject.name} (${subject.slug}) [${existingSubject ? "update" : "create"}]`);

  // Helpers: findFirst by code + parentId, then create/update
  async function upsertStrand(strand: JsonStrand) {
    const found = await prisma.curriculumStrand.findFirst({
      where: { code: strand.code, subjectId: subject.id },
      select: { id: true },
    });

    if (found) {
      counters.strandsUpdated += 1;
      return prisma.curriculumStrand.update({
        where: { id: found.id },
        data: {
          title: strand.title,
          description: strand.description ?? null,
          orderIndex: strand.orderIndex,
        },
      });
    } else {
      counters.strandsCreated += 1;
      return prisma.curriculumStrand.create({
        data: {
          subjectId: subject.id,
          code: strand.code,
          title: strand.title,
          description: strand.description ?? null,
          orderIndex: strand.orderIndex,
        },
      });
    }
  }

  async function upsertSubStrand(subStrand: JsonSubStrand, strandId: string) {
    const found = await prisma.curriculumSubStrand.findFirst({
      where: { code: subStrand.code, strandId },
      select: { id: true },
    });

    if (found) {
      counters.subStrandsUpdated += 1;
      return prisma.curriculumSubStrand.update({
        where: { id: found.id },
        data: {
          title: subStrand.title,
          description: subStrand.description ?? null,
          orderIndex: subStrand.orderIndex,
        },
      });
    } else {
      counters.subStrandsCreated += 1;
      return prisma.curriculumSubStrand.create({
        data: {
          strandId,
          code: subStrand.code,
          title: subStrand.title,
          description: subStrand.description ?? null,
          orderIndex: subStrand.orderIndex,
        },
      });
    }
  }

  async function upsertContentStandard(cs: JsonContentStandard, subStrandId: string) {
    const found = await prisma.curriculumContentStandard.findFirst({
      where: { code: cs.code, subStrandId },
      select: { id: true },
    });

    if (found) {
      counters.contentStandardsUpdated += 1;
      return prisma.curriculumContentStandard.update({
        where: { id: found.id },
        data: {
          description: cs.description,
          orderIndex: cs.orderIndex,
        },
      });
    } else {
      counters.contentStandardsCreated += 1;
      return prisma.curriculumContentStandard.create({
        data: {
          subStrandId,
          code: cs.code,
          description: cs.description,
          orderIndex: cs.orderIndex,
        },
      });
    }
  }

  async function upsertIndicator(ind: JsonIndicator, contentStandardId: string) {
    const found = await prisma.curriculumIndicator.findFirst({
      where: { code: ind.code, contentStandardId },
      select: { id: true },
    });

    if (found) {
      counters.indicatorsUpdated += 1;
      return prisma.curriculumIndicator.update({
        where: { id: found.id },
        data: {
          description: ind.description,
          orderIndex: ind.orderIndex,
        },
      });
    } else {
      counters.indicatorsCreated += 1;
      return prisma.curriculumIndicator.create({
        data: {
          contentStandardId,
          code: ind.code,
          description: ind.description,
          orderIndex: ind.orderIndex,
        },
      });
    }
  }

  async function upsertExemplar(ex: JsonExemplar, indicatorId: string) {
    // Exemplars usually have no "code", so use (indicatorId + orderIndex) as identity.
    const found = await prisma.curriculumExemplar.findFirst({
      where: { indicatorId, orderIndex: ex.orderIndex },
      select: { id: true },
    });

    if (found) {
      counters.exemplarsUpdated += 1;
      return prisma.curriculumExemplar.update({
        where: { id: found.id },
        data: { description: ex.description },
      });
    } else {
      counters.exemplarsCreated += 1;
      return prisma.curriculumExemplar.create({
        data: {
          indicatorId,
          orderIndex: ex.orderIndex,
          description: ex.description,
        },
      });
    }
  }

  // 2) Walk the tree
  for (const strandJson of strands) {
    const strand = await upsertStrand(strandJson);

    for (const subStrandJson of strandJson.subStrands ?? []) {
      const subStrand = await upsertSubStrand(subStrandJson, strand.id);

      for (const csJson of subStrandJson.contentStandards ?? []) {
        const cs = await upsertContentStandard(csJson, subStrand.id);

        for (const indJson of csJson.indicators ?? []) {
          const indicator = await upsertIndicator(indJson, cs.id);

          for (const exJson of indJson.exemplars ?? []) {
            await upsertExemplar(exJson, indicator.id);
          }
        }
      }
    }
  }

  console.log("🎉 Done seeding Basic 2 R.M.E curriculum.");
  console.log({
    subjectCreated: counters.subjectCreated,
    subjectUpdated: counters.subjectUpdated,
    strands: counters.strandsCreated + counters.strandsUpdated,
    subStrands: counters.subStrandsCreated + counters.subStrandsUpdated,
    contentStandards: counters.contentStandardsCreated + counters.contentStandardsUpdated,
    indicators: counters.indicatorsCreated + counters.indicatorsUpdated,
    exemplars: counters.exemplarsCreated + counters.exemplarsUpdated,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
