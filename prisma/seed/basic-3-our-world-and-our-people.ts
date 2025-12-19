// prisma/seed/basic-3-our-world-and-our-people.ts
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
  exemplars: ExemplarJson[];
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

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const jsonPath = path.join(
    __dirname,
    "curriculum",
    "basic-3-our-world-and-our-people.json"
  );

  const raw = await fs.readFile(jsonPath, "utf8");
  const curriculum = JSON.parse(raw) as CurriculumSubjectJson;

  console.log(
    `📖 Loading Basic 3 Our World and Our People curriculum from: ${jsonPath}`
  );
  console.log(`→ Subject: ${curriculum.name} (${curriculum.slug})`);
  console.log(`   Phase/Level: ${curriculum.phase} / ${curriculum.level}`);
  console.log(`   Strands in JSON: ${curriculum.strands.length}`);

  const existing = await prisma.curriculumSubject.findUnique({
    where: { slug: curriculum.slug },
  });

  if (existing) {
    console.log(
      `⚠️ Found existing curriculumSubject for slug "${curriculum.slug}", deleting...`
    );
    await prisma.curriculumSubject.delete({
      where: { id: existing.id },
    });
    console.log("   Deleted existing curriculumSubject.");
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
            create: strand.subStrands.map((subStrand, subIndex) => ({
              code: subStrand.code,
              title: subStrand.title,
              description: subStrand.description,
              orderIndex: subStrand.orderIndex ?? subIndex + 1,

              contentStandards: {
                create: subStrand.contentStandards.map(
                  (contentStandard, csIndex) => ({
                    code: contentStandard.code,
                    description: contentStandard.description,
                    orderIndex:
                      contentStandard.orderIndex ?? csIndex + 1,

                    indicators: {
                      create: contentStandard.indicators.map(
                        (indicator, indIndex) => ({
                          code: indicator.code,
                          description: indicator.description,
                          orderIndex:
                            indicator.orderIndex ?? indIndex + 1,

                          exemplars: {
                            create: indicator.exemplars.map(
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
    `✅ Seeded Basic 3 Our World and Our People with id: ${created.id}`
  );
  console.log(
    `   Strands created from JSON: ${curriculum.strands.length}`
  );
}

main()
  .catch((err) => {
    console.error("❌ Error seeding Basic 3 Our World and Our People:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
