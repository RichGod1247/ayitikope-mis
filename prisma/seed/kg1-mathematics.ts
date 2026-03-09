// prisma/seed/kg1-mathematics.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TREE_MODE = "KG_NUMERACY_PRODUCT_TREE";
/**
 * KG Mathematics/Numeracy is stored as a product-native normalized subject tree.
 * These N-codes are internal EduLife OS curriculum codes, not literal integrated page codes.
 * This seeder is destructive + deterministic:
 * it removes the old tree for this subject slug completely, then recreates it from JSON.
 */

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

type CurriculumJson = {
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

async function main() {
  const filePath = path.join(__dirname, "curriculum", "kg1-mathematics.json");
  console.log(`📖 Loading KG1 Mathematics curriculum from: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Seed file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const data: CurriculumJson = JSON.parse(raw);

  console.log(`→ Subject: ${data.name} (${data.slug})`);
  console.log(`   Phase/Level: ${data.phase} / ${data.level}`);
  console.log(`   Strands in JSON: ${data.strands.length}`);

  const existing = await prisma.curriculumSubject.findUnique({
    where: { slug: data.slug },
    select: { id: true, slug: true },
  });

  if (existing) {
    console.log(
      `⚠️ Found existing curriculumSubject for slug "${data.slug}", deleting tree...`
    );
    await deleteExistingCurriculumTree(existing.id);
    console.log("   ✅ Existing curriculum tree removed.");
  } else {
    console.log(`ℹ️ No existing curriculumSubject to delete for slug: ${data.slug}`);
  }

  const created = await prisma.curriculumSubject.create({
    data: {
      phase: data.phase,
      level: data.level,
      name: data.name,
      slug: data.slug,
      orderIndex: data.orderIndex,
      description: data.description,

      strands: {
        create: data.strands.map((strand, strandIndex) => ({
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
                    orderIndex:
                      contentStandard.orderIndex ?? csIndex + 1,

                    indicators: {
                      create: (contentStandard.indicators ?? []).map(
                        (indicator, indIndex) => ({
                          code: indicator.code,
                          description: indicator.description,
                          orderIndex:
                            indicator.orderIndex ?? indIndex + 1,

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
    `✅ Seeded KG1 Mathematics (Numeracy) with id: ${created.id}`
  );
  console.log(`   Strands created from JSON: ${data.strands.length}`);
}

main()
  .catch((err) => {
    console.error("❌ Error seeding KG1 Mathematics curriculum:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });