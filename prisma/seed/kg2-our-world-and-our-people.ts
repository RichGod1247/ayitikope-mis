// prisma/seed/kg2-our-world-and-our-people.ts
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
  description: string;
  orderIndex: number;
  contentStandards?: ContentStandardJson[];
};

type StrandJson = {
  code: string;
  title: string;
  description: string;
  orderIndex: number;
  subStrands?: SubStrandJson[];
};

type CurriculumSubjectJson = {
  phase: string;
  level: string;
  subject: string;
  name: string;
  slug: string;
  orderIndex: number;
  description: string;
  strands: StrandJson[];
};

async function deleteExistingCurriculumTree(subjectId: string) {
  console.log("   🔎 Discovering existing curriculum tree...");

  const strands = await prisma.curriculumStrand.findMany({
    where: { subjectId },
    select: { id: true, code: true },
  });
  const strandIds = strands.map((s) => s.id);

  const subStrands =
    strandIds.length > 0
      ? await prisma.curriculumSubStrand.findMany({
          where: { strandId: { in: strandIds } },
          select: { id: true, code: true },
        })
      : [];
  const subStrandIds = subStrands.map((s) => s.id);

  const contentStandards =
    subStrandIds.length > 0
      ? await prisma.curriculumContentStandard.findMany({
          where: { subStrandId: { in: subStrandIds } },
          select: { id: true, code: true },
        })
      : [];
  const contentStandardIds = contentStandards.map((c) => c.id);

  const indicators =
    contentStandardIds.length > 0
      ? await prisma.curriculumIndicator.findMany({
          where: { contentStandardId: { in: contentStandardIds } },
          select: { id: true, code: true },
        })
      : [];
  const indicatorIds = indicators.map((i) => i.id);

  console.log(`   • Strands: ${strandIds.length}`);
  console.log(`   • SubStrands: ${subStrandIds.length}`);
  console.log(`   • ContentStandards: ${contentStandardIds.length}`);
  console.log(`   • Indicators: ${indicatorIds.length}`);

  const deletedSubjectMedia = await prisma.curriculumMedia.deleteMany({
    where: { subjectId },
  });
  console.log(`   🗑️ Deleted subject media: ${deletedSubjectMedia.count}`);

  if (indicatorIds.length > 0) {
    const deletedIndicatorMedia = await prisma.curriculumMedia.deleteMany({
      where: { indicatorId: { in: indicatorIds } },
    });
    console.log(`   🗑️ Deleted indicator media: ${deletedIndicatorMedia.count}`);
  }

  if (indicatorIds.length > 0) {
    const deletedExemplars = await prisma.curriculumExemplar.deleteMany({
      where: { indicatorId: { in: indicatorIds } },
    });
    console.log(`   🗑️ Deleted exemplars: ${deletedExemplars.count}`);
  }

  if (indicatorIds.length > 0) {
    const deletedIndicators = await prisma.curriculumIndicator.deleteMany({
      where: { id: { in: indicatorIds } },
    });
    console.log(`   🗑️ Deleted indicators: ${deletedIndicators.count}`);
  }

  if (contentStandardIds.length > 0) {
    const deletedContentStandards =
      await prisma.curriculumContentStandard.deleteMany({
        where: { id: { in: contentStandardIds } },
      });
    console.log(
      `   🗑️ Deleted content standards: ${deletedContentStandards.count}`
    );
  }

  if (subStrandIds.length > 0) {
    const deletedSubStrands = await prisma.curriculumSubStrand.deleteMany({
      where: { id: { in: subStrandIds } },
    });
    console.log(`   🗑️ Deleted sub-strands: ${deletedSubStrands.count}`);
  }

  if (strandIds.length > 0) {
    const deletedStrands = await prisma.curriculumStrand.deleteMany({
      where: { id: { in: strandIds } },
    });
    console.log(`   🗑️ Deleted strands: ${deletedStrands.count}`);
  }

  await prisma.curriculumSubject.delete({
    where: { id: subjectId },
  });
  console.log("   🗑️ Deleted curriculum subject.");
}

function validateCurriculum(data: CurriculumSubjectJson) {
  if (!data.phase?.trim()) throw new Error("phase is required");
  if (!data.level?.trim()) throw new Error("level is required");
  if (!data.subject?.trim()) throw new Error("subject is required");
  if (!data.name?.trim()) throw new Error("name is required");
  if (!data.slug?.trim()) throw new Error("slug is required");
  if (!Array.isArray(data.strands) || data.strands.length === 0) {
    throw new Error("strands must be a non-empty array");
  }

  for (const strand of data.strands) {
    if (!strand.code?.trim()) throw new Error("strand.code is required");
    if (!strand.title?.trim()) {
      throw new Error(`strand.title is required for ${strand.code}`);
    }
    if (!Array.isArray(strand.subStrands)) {
      throw new Error(`strand.subStrands must be an array for ${strand.code}`);
    }

    for (const sub of strand.subStrands) {
      if (!sub.code?.trim()) throw new Error("subStrand.code is required");
      if (!sub.title?.trim()) {
        throw new Error(`subStrand.title is required for ${sub.code}`);
      }
      if (!Array.isArray(sub.contentStandards)) {
        throw new Error(`contentStandards must be an array for ${sub.code}`);
      }

      for (const cs of sub.contentStandards) {
        if (!cs.code?.trim()) throw new Error("contentStandard.code is required");
        if (!Array.isArray(cs.indicators)) {
          throw new Error(`indicators must be an array for ${cs.code}`);
        }

        for (const ind of cs.indicators) {
          if (!ind.code?.trim()) throw new Error("indicator.code is required");
          if (!ind.description?.trim()) {
            throw new Error(`indicator.description is required for ${ind.code}`);
          }
        }
      }
    }
  }
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const candidatePaths = [
    path.join(
      __dirname,
      "curriculum",
      "kg2-our-world-and-our-people.clean.json"
    ),
    path.join(
      __dirname,
      "curriculum",
      "kg2-our-world-and-our-people.json"
    ),
  ];

  const jsonPath = candidatePaths.find((p) => {
    try {
      return require("fs").existsSync(p);
    } catch {
      return false;
    }
  });

  if (!jsonPath) {
    throw new Error(
      `Seed file not found. Checked:\n- ${candidatePaths.join("\n- ")}`
    );
  }

  const raw = await fs.readFile(jsonPath, "utf8");
  const curriculum = JSON.parse(raw) as CurriculumSubjectJson;

  validateCurriculum(curriculum);

  console.log(
    `📖 Loading KG2 Our World and Our People curriculum from: ${jsonPath}`
  );
  console.log(`→ Subject: ${curriculum.name} (${curriculum.slug})`);
  console.log(`   Phase/Level: ${curriculum.phase} / ${curriculum.level}`);
  console.log(`   Strands in JSON: ${curriculum.strands.length}`);

  const existing = await prisma.curriculumSubject.findUnique({
    where: { slug: curriculum.slug },
    select: { id: true, slug: true },
  });

  if (existing) {
    console.log(
      `⚠️ Found existing curriculumSubject for slug "${curriculum.slug}", deleting tree...`
    );
    await deleteExistingCurriculumTree(existing.id);
    console.log("   ✅ Existing curriculum tree removed.");
  } else {
    console.log(
      `ℹ️ No existing curriculumSubject to delete for slug: ${curriculum.slug}`
    );
  }

  const created = await prisma.curriculumSubject.create({
    data: {
      phase: curriculum.phase,
      level: curriculum.level,
      name: curriculum.name,
      slug: curriculum.slug,
      orderIndex: curriculum.orderIndex,
      description: curriculum.description,

      strands: {
        create: curriculum.strands.map((strand, strandIndex) => ({
          code: strand.code,
          title: strand.title,
          description: strand.description,
          orderIndex: strand.orderIndex ?? strandIndex + 1,

          subStrands: {
            create: (strand.subStrands ?? []).map((subStrand, subIndex) => ({
              code: subStrand.code,
              title: subStrand.title,
              description: subStrand.description,
              orderIndex: subStrand.orderIndex ?? subIndex + 1,

              contentStandards: {
                create: (subStrand.contentStandards ?? []).map(
                  (contentStandard, csIndex) => ({
                    code: contentStandard.code,
                    description: contentStandard.description,
                    orderIndex: contentStandard.orderIndex ?? csIndex + 1,

                    indicators: {
                      create: (contentStandard.indicators ?? []).map(
                        (indicator, indIndex) => ({
                          code: indicator.code,
                          description: indicator.description,
                          orderIndex: indicator.orderIndex ?? indIndex + 1,

                          exemplars: {
                            create: (indicator.exemplars ?? []).map(
                              (exemplar, exIndex) => ({
                                description: exemplar.description,
                                orderIndex:
                                  exemplar.orderIndex ?? exIndex + 1,
                              })
                            ),
                          },
                        })
                      ),
                    },
                  })
                ),
              },
            })),
          },
        })),
      },
    },
  });

  console.log(
    `✅ Seeded KG2 Our World and Our People with id: ${created.id}`
  );
  console.log(`   Strands created from JSON: ${curriculum.strands.length}`);
}

main()
  .catch((err) => {
    console.error("❌ Error seeding KG2 Our World and Our People:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });