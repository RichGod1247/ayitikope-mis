// prisma/seed/kg2-numeracy.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

// Polyfill __dirname for ESM / ts-node
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Types matching your normalized JSON ----------

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
  subject: string; // "Numeracy" in your JSON
  name: string;    // "KG2 Numeracy"
  slug: string;    // "kg2-numeracy"
  orderIndex: number;
  description: string;
  strands: StrandJson[];
};

async function main() {
  // Read the normalized KG2 Numeracy JSON file
  const filePath = path.join(__dirname, "curriculum", "kg2-numeracy.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const data: CurriculumJson = JSON.parse(raw);

  console.log("📚 Seeding curriculum for:", data.name);

  // 1. Upsert subject based on slug (slug is unique in your schema)
  const subjectRecord = await prisma.curriculumSubject.upsert({
    where: { slug: data.slug },
    update: {
      phase: data.phase,
      level: data.level,
      name: data.name,
      description: data.description,
      orderIndex: data.orderIndex,
    },
    create: {
      phase: data.phase,
      level: data.level,
      name: data.name,
      slug: data.slug,
      description: data.description,
      orderIndex: data.orderIndex,
    },
  });

  console.log(
    `✅ Subject upserted: ${subjectRecord.name} (${subjectRecord.phase} – ${subjectRecord.level})`,
  );

  // 2. Seed strands → subStrands → contentStandards → indicators → exemplars
  for (const strandJson of data.strands) {
    console.log(`\n➡️  Strand ${strandJson.code}: ${strandJson.title}`);

    // Find strand by (subjectId + code), then update or create by id
    let strand = await prisma.curriculumStrand.findFirst({
      where: {
        subjectId: subjectRecord.id,
        code: strandJson.code,
      },
    });

    if (strand) {
      strand = await prisma.curriculumStrand.update({
        where: { id: strand.id },
        data: {
          title: strandJson.title,
          description: strandJson.description,
          orderIndex: strandJson.orderIndex,
        },
      });
    } else {
      strand = await prisma.curriculumStrand.create({
        data: {
          subjectId: subjectRecord.id,
          code: strandJson.code,
          title: strandJson.title,
          description: strandJson.description,
          orderIndex: strandJson.orderIndex,
        },
      });
    }

    if (!strandJson.subStrands || strandJson.subStrands.length === 0) {
      console.log(`   (no subStrands for ${strandJson.code})`);
      continue;
    }

    for (const subStrandJson of strandJson.subStrands) {
      console.log(
        `   → SubStrand ${subStrandJson.code}: ${subStrandJson.title}`,
      );

      // Find subStrand by (strandId + code), then update or create
      let subStrand = await prisma.curriculumSubStrand.findFirst({
        where: {
          strandId: strand.id,
          code: subStrandJson.code,
        },
      });

      if (subStrand) {
        subStrand = await prisma.curriculumSubStrand.update({
          where: { id: subStrand.id },
          data: {
            title: subStrandJson.title,
            description: subStrandJson.description,
            orderIndex: subStrandJson.orderIndex,
          },
        });
      } else {
        subStrand = await prisma.curriculumSubStrand.create({
          data: {
            strandId: strand.id,
            code: subStrandJson.code,
            title: subStrandJson.title,
            description: subStrandJson.description,
            orderIndex: subStrandJson.orderIndex,
          },
        });
      }

      if (
        !subStrandJson.contentStandards ||
        subStrandJson.contentStandards.length === 0
      ) {
        console.log(`     (no contentStandards for ${subStrandJson.code})`);
        continue;
      }

      for (const csJson of subStrandJson.contentStandards) {
        console.log(
          `     → ContentStandard ${csJson.code} (order ${csJson.orderIndex})`,
        );

        // Find contentStandard by (subStrandId + code), then update/create
        let contentStandard =
          await prisma.curriculumContentStandard.findFirst({
            where: {
              subStrandId: subStrand.id,
              code: csJson.code,
            },
          });

        if (contentStandard) {
          contentStandard = await prisma.curriculumContentStandard.update({
            where: { id: contentStandard.id },
            data: {
              description: csJson.description,
              orderIndex: csJson.orderIndex,
            },
          });
        } else {
          contentStandard = await prisma.curriculumContentStandard.create({
            data: {
              subStrandId: subStrand.id,
              code: csJson.code,
              description: csJson.description,
              orderIndex: csJson.orderIndex,
            },
          });
        }

        if (!csJson.indicators || csJson.indicators.length === 0) {
          console.log(`       (no indicators for ${csJson.code})`);
          continue;
        }

        for (const indJson of csJson.indicators) {
          console.log(
            `       → Indicator ${indJson.code} (order ${indJson.orderIndex})`,
          );

          // Find indicator by (contentStandardId + code), then update/create
          let indicator = await prisma.curriculumIndicator.findFirst({
            where: {
              contentStandardId: contentStandard.id,
              code: indJson.code,
            },
          });

          if (indicator) {
            indicator = await prisma.curriculumIndicator.update({
              where: { id: indicator.id },
              data: {
                description: indJson.description,
                orderIndex: indJson.orderIndex,
              },
            });
          } else {
            indicator = await prisma.curriculumIndicator.create({
              data: {
                contentStandardId: contentStandard.id,
                code: indJson.code,
                description: indJson.description,
                orderIndex: indJson.orderIndex,
              },
            });
          }

          // Exemplars: delete all existing for this indicator and recreate
          await prisma.curriculumExemplar.deleteMany({
            where: { indicatorId: indicator.id },
          });

          if (!indJson.exemplars || indJson.exemplars.length === 0) {
            console.log(`         (no exemplars for ${indJson.code})`);
            continue;
          }

          for (const exJson of indJson.exemplars) {
            console.log(
              `         → Exemplar (indicator ${indJson.code}, order ${exJson.orderIndex})`,
            );

            await prisma.curriculumExemplar.create({
              data: {
                indicatorId: indicator.id,
                orderIndex: exJson.orderIndex,
                description: exJson.description,
              },
            });
          }
        }
      }
    }
  }

  console.log("\n✅ Finished seeding KG2 Numeracy curriculum.");
}

main()
  .catch((err) => {
    console.error("❌ Error seeding KG2 Numeracy curriculum", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
