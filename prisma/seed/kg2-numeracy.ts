// prisma/seed/kg2-numeracy.ts
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

function cleanStr(v: unknown): string {
  return String(v ?? "").trim();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validateCurriculum(curriculum: CurriculumSubjectJson) {
  assert(cleanStr(curriculum.phase), "phase is required");
  assert(cleanStr(curriculum.level), "level is required");
  assert(cleanStr(curriculum.subject), "subject is required");
  assert(cleanStr(curriculum.name), "name is required");
  assert(cleanStr(curriculum.slug), "slug is required");
  assert(Array.isArray(curriculum.strands), "strands must be an array");

  const strandCodes = new Set<string>();
  const subCodes = new Set<string>();
  const csCodes = new Set<string>();
  const indCodes = new Set<string>();

  for (const strand of curriculum.strands ?? []) {
    assert(cleanStr(strand.code), "Every strand must have a code");
    assert(!strandCodes.has(strand.code), `Duplicate strand code: ${strand.code}`);
    strandCodes.add(strand.code);

    for (const sub of strand.subStrands ?? []) {
      assert(cleanStr(sub.code), `Sub-strand code missing under ${strand.code}`);
      assert(
        sub.code.startsWith(`${strand.code}.`),
        `Sub-strand code ${sub.code} does not belong under strand ${strand.code}`
      );
      assert(!subCodes.has(sub.code), `Duplicate sub-strand code: ${sub.code}`);
      subCodes.add(sub.code);

      for (const cs of sub.contentStandards ?? []) {
        assert(cleanStr(cs.code), `Content standard code missing under ${sub.code}`);
        assert(
          cs.code.startsWith(`${sub.code}.`),
          `Content standard code ${cs.code} does not belong under sub-strand ${sub.code}`
        );
        assert(!csCodes.has(cs.code), `Duplicate content standard code: ${cs.code}`);
        csCodes.add(cs.code);

        for (const ind of cs.indicators ?? []) {
          assert(cleanStr(ind.code), `Indicator code missing under ${cs.code}`);
          assert(
            ind.code.startsWith(`${cs.code}.`),
            `Indicator code ${ind.code} does not belong under content standard ${cs.code}`
          );
          assert(!indCodes.has(ind.code), `Duplicate indicator code: ${ind.code}`);
          indCodes.add(ind.code);
        }
      }
    }
  }
}

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
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const jsonPath = path.join(__dirname, "curriculum", "kg2-numeracy.json");

  const raw = await fs.readFile(jsonPath, "utf8");
  const curriculum = JSON.parse(raw) as CurriculumSubjectJson;

  validateCurriculum(curriculum);

  console.log(`📖 Loading KG2 Numeracy curriculum from: ${jsonPath}`);
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
        create: (curriculum.strands ?? []).map((strand, strandIndex) => ({
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

  console.log(`✅ Seeded KG2 Mathematics (Numeracy) with id: ${created.id}`);
  console.log(`   Strands created from JSON: ${curriculum.strands.length}`);
}

main()
  .catch((err) => {
    console.error("❌ Error seeding KG2 Mathematics (Numeracy):", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });