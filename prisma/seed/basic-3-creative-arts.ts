import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Recreate __filename / __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CURRICULUM_DIR = path.join(__dirname, "curriculum");

const partFiles = fs
  .readdirSync(CURRICULUM_DIR)
  .filter(
    (name) =>
      name.toLowerCase().includes("basic-3-creative-arts-part") &&
      name.toLowerCase().endsWith(".json")
  );

console.log(
  "📦 Seeding Basic 3 Creative Arts from JSON parts in:",
  CURRICULUM_DIR
);
console.log("🔍 Found Basic 3 Creative Arts part files:", partFiles);

async function upsertSubject(subjectJson: any) {
  const {
    phase,
    level,
    subject,
    name,
    slug,
    orderIndex,
    description,
    strands,
  } = subjectJson;

  console.log(`🎯 Upserting CurriculumSubject: ${slug}`);

  // 1) Upsert the subject itself WITHOUT nested writes
  const existing = await prisma.curriculumSubject.findUnique({
    where: { slug },
  });

  let subjectRow;
  if (existing) {
    subjectRow = await prisma.curriculumSubject.update({
      where: { slug },
      data: {
        phase,
        level,
        name: name ?? subject,
        description: description ?? null,
        orderIndex: orderIndex ?? 0,
        curriculumFramework: "NaCCA Lower Primary Curriculum",
        frameworkVersion: "2019",
        countryCode: "GH",
        isGlobal: true,
        isActive: true,
      },
    });
  } else {
    subjectRow = await prisma.curriculumSubject.create({
      data: {
        slug,
        phase,
        level,
        name: name ?? subject,
        description: description ?? null,
        orderIndex: orderIndex ?? 0,
        curriculumFramework: "NaCCA Lower Primary Curriculum",
        frameworkVersion: "2019",
        countryCode: "GH",
        isGlobal: true,
        isActive: true,
      },
    });
  }

  const subjectId = subjectRow.id;

  // 2) Seed strands, subStrands, contentStandards, indicators in a SAFE parent→child order
  if (!Array.isArray(strands)) {
    console.warn(`⚠️ Subject ${slug} has no "strands" array.`);
    return;
  }

  for (const strandJson of strands) {
    const strandCode: string | undefined = strandJson.code;
    if (!strandCode) continue;

    // STRAND
    let strandRow = await prisma.curriculumStrand.findFirst({
      where: { subjectId, code: strandCode },
    });

    if (strandRow) {
      strandRow = await prisma.curriculumStrand.update({
        where: { id: strandRow.id },
        data: {
          title: strandJson.title,
          description: strandJson.description ?? null,
          orderIndex: strandJson.orderIndex ?? 0,
        },
      });
    } else {
      strandRow = await prisma.curriculumStrand.create({
        data: {
          subjectId,
          code: strandCode,
          title: strandJson.title,
          description: strandJson.description ?? null,
          orderIndex: strandJson.orderIndex ?? 0,
        },
      });
    }

    const strandId = strandRow.id;

    // SUB-STRANDS
    const subStrands = strandJson.subStrands ?? [];
    for (const subStrandJson of subStrands) {
      const subCode: string | undefined = subStrandJson.code;
      if (!subCode) continue;

      let subRow = await prisma.curriculumSubStrand.findFirst({
        where: { strandId, code: subCode },
      });

      if (subRow) {
        subRow = await prisma.curriculumSubStrand.update({
          where: { id: subRow.id },
          data: {
            title: subStrandJson.title,
            description: subStrandJson.description ?? null,
            orderIndex: subStrandJson.orderIndex ?? 0,
          },
        });
      } else {
        subRow = await prisma.curriculumSubStrand.create({
          data: {
            strandId,
            code: subCode,
            title: subStrandJson.title,
            description: subStrandJson.description ?? null,
            orderIndex: subStrandJson.orderIndex ?? 0,
          },
        });
      }

      const subStrandId = subRow.id;

      // CONTENT STANDARDS
      const contentStandards = subStrandJson.contentStandards ?? [];
      for (const csJson of contentStandards) {
        const csCode: string | undefined = csJson.code;
        if (!csCode) continue;

        let csRow = await prisma.curriculumContentStandard.findFirst({
          where: { subStrandId, code: csCode },
        });

        if (csRow) {
          csRow = await prisma.curriculumContentStandard.update({
            where: { id: csRow.id },
            data: {
              description: csJson.description,
              orderIndex: csJson.orderIndex ?? 0,
            },
          });
        } else {
          csRow = await prisma.curriculumContentStandard.create({
            data: {
              subStrandId,
              code: csCode,
              description: csJson.description,
              orderIndex: csJson.orderIndex ?? 0,
            },
          });
        }

        const contentStandardId = csRow.id;

        // INDICATORS
        const indicators = csJson.indicators ?? [];
        for (const indJson of indicators) {
          const indCode: string | undefined = indJson.code;
          if (!indCode) continue;

          let indRow = await prisma.curriculumIndicator.findFirst({
            where: { contentStandardId, code: indCode },
          });

          if (indRow) {
            await prisma.curriculumIndicator.update({
              where: { id: indRow.id },
              data: {
                description: indJson.description,
                orderIndex: indJson.orderIndex ?? 0,
              },
            });
          } else {
            await prisma.curriculumIndicator.create({
              data: {
                contentStandardId,
                code: indCode,
                description: indJson.description,
                orderIndex: indJson.orderIndex ?? 0,
              },
            });
          }
        }
      }
    }
  }
}

async function main() {
  if (partFiles.length === 0) {
    console.error("❌ No Basic 3 Creative Arts part JSON files found.");
    process.exit(1);
  }

  let allSubjects: any[] = [];

  for (const partFile of partFiles) {
    const partPath = path.join(CURRICULUM_DIR, partFile);

    if (!fs.existsSync(partPath)) {
      console.log(`ℹ️ Part file not found yet, skipping: ${partFile}`);
      continue;
    }

    console.log(`📖 Loading Basic 3 Creative Arts from: ${partPath}`);
    const raw = fs.readFileSync(partPath, "utf8");
    const json = JSON.parse(raw);

    if (Array.isArray(json.subjects)) {
      allSubjects = allSubjects.concat(json.subjects);
    } else {
      console.warn(`⚠️ No "subjects" array in ${partFile}, skipping.`);
    }
  }

  if (allSubjects.length === 0) {
    console.error(
      "❌ No Basic 3 Creative Arts subject data found in any part files."
    );
    process.exit(1);
  }

  for (const subjectJson of allSubjects) {
    await upsertSubject(subjectJson);
  }

  console.log("✅ Finished seeding Basic 3 Creative Arts curriculum.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
