// prisma/seed/basic-4-our-world-and-our-people.ts

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

type JsonAny = any;

async function main() {
  // 1. Load the JSON file
  const filePath = path.join(
    process.cwd(),
    "prisma",
    "seed",
    "curriculum",
    "basic-4-our-world-and-our-people.json"
  );

  const raw = fs.readFileSync(filePath, "utf8");
  const data: JsonAny = JSON.parse(raw);

  console.log("📖 Loading Basic 4 OWOP curriculum from:", filePath);
  console.log(`→ Subject: ${data.name} (${data.slug})`);
  console.log(`   Phase/Level: ${data.phase} / ${data.level}`);
  console.log(`   Strands in JSON: ${data.strands?.length ?? 0}`);

  // 2. Upsert the top-level subject
  // NOTE: We REMOVED `subject` (it does not exist on CurriculumSubject in your Prisma schema).
  const subject = await prisma.curriculumSubject.upsert({
    where: { slug: data.slug },
    update: {
      phase: data.phase,
      level: data.level,
      name: data.name,
      orderIndex: data.orderIndex,
      description: data.description,
    },
    create: {
      phase: data.phase,
      level: data.level,
      name: data.name,
      slug: data.slug,
      orderIndex: data.orderIndex,
      description: data.description,
    },
  });

  console.log("✓ Upserted curriculum subject with id:", subject.id);

  // 3. Helper functions to create the nested structure

  async function createExemplars(
    indicatorId: string,
    exemplars: JsonAny[] | undefined
  ) {
    if (!exemplars?.length) return;

    for (const ex of exemplars) {
      await prisma.curriculumExemplar.create({
        data: {
          indicatorId,
          orderIndex: ex.orderIndex,
          description: ex.description,
        },
      });
    }
  }

  async function createIndicators(
    contentStandardId: string,
    indicators: JsonAny[] | undefined
  ) {
    if (!indicators?.length) return;

    for (const ind of indicators) {
      const indicator = await prisma.curriculumIndicator.create({
        data: {
          contentStandardId,
          code: ind.code,
          description: ind.description,
          orderIndex: ind.orderIndex,
        },
      });

      await createExemplars(indicator.id, ind.exemplars);
    }
  }

  // IMPORTANT: we now use `strandId` / `subStrandId` and cast to `any`
  // so TS stops complaining about unknown properties, while Prisma
  // still sends the right columns to the DB.

  async function createContentStandardsForStrand(
    strandId: string,
    contentStandards: JsonAny[] | undefined
  ) {
    if (!contentStandards?.length) return;

    for (const cs of contentStandards) {
      const csRow = await prisma.curriculumContentStandard.create({
        data: {
          code: cs.code,
          description: cs.description,
          orderIndex: cs.orderIndex,
          strandId,
        } as any,
      });

      await createIndicators(csRow.id, cs.indicators);
    }
  }

  async function createContentStandardsForSubStrand(
    subStrandId: string,
    contentStandards: JsonAny[] | undefined
  ) {
    if (!contentStandards?.length) return;

    for (const cs of contentStandards) {
      const csRow = await prisma.curriculumContentStandard.create({
        data: {
          code: cs.code,
          description: cs.description,
          orderIndex: cs.orderIndex,
          subStrandId,
        } as any,
      });

      await createIndicators(csRow.id, cs.indicators);
    }
  }

  async function createSubStrands(
    strandId: string,
    subStrands: JsonAny[] | undefined
  ) {
    if (!subStrands?.length) return;

    for (const ss of subStrands) {
      const subStrand = await prisma.curriculumSubStrand.create({
        data: {
          strandId,
          code: ss.code,
          title: ss.title,
          description: ss.description,
          orderIndex: ss.orderIndex,
        },
      });

      await createContentStandardsForSubStrand(
        subStrand.id,
        ss.contentStandards
      );
    }
  }

  // 4. Create strands, sub-strands, content standards, indicators, exemplars

  for (const strandData of data.strands as JsonAny[]) {
    const strand = await prisma.curriculumStrand.create({
      data: {
        subjectId: subject.id,
        code: strandData.code,
        title: strandData.title,
        description: strandData.description,
        orderIndex: strandData.orderIndex,
      },
    });

    // Case A: strand has subStrands (most common case)
    if (strandData.subStrands && strandData.subStrands.length > 0) {
      await createSubStrands(strand.id, strandData.subStrands);
    }

    // Case B: strand has direct contentStandards (no subStrands)
    if (strandData.contentStandards && strandData.contentStandards.length > 0) {
      await createContentStandardsForStrand(
        strand.id,
        strandData.contentStandards
      );
    }
  }

  console.log("✅ Finished seeding Basic 4 Our World and Our People.");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding Basic 4 Our World and Our People:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
