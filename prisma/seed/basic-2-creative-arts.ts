import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

// ✅ Use a local PrismaClient instance instead of importing from src/lib/prisma
const prisma = new PrismaClient();

// ✅ Recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔁 Auto-discover all Basic 2 Creative Arts part JSON files
const CURRICULUM_DIR = path.join(__dirname, "curriculum");

const partFiles = fs
  .readdirSync(CURRICULUM_DIR)
  .filter(
    (name) =>
      name.toLowerCase().includes("basic-2-creative-arts-part") &&
      name.toLowerCase().endsWith(".json")
  );

console.log(
  "📦 Seeding Basic 2 Creative Arts from JSON parts in:",
  CURRICULUM_DIR
);
console.log("🔍 Found Basic 2 Creative Arts part files:", partFiles);

async function main() {
  if (partFiles.length === 0) {
    console.error("❌ No Basic 2 Creative Arts part JSON files found.");
    process.exit(1);
  }

  let allSubjects: any[] = [];

  for (const partFile of partFiles) {
    const partPath = path.join(CURRICULUM_DIR, partFile);

    if (!fs.existsSync(partPath)) {
      console.log(`ℹ️ Part file not found yet, skipping: ${partFile}`);
      continue;
    }

    console.log(`📖 Loading Basic 2 Creative Arts from: ${partPath}`);
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
      "❌ No Basic 2 Creative Arts subject data found in any part files."
    );
    process.exit(1);
  }

  // ✅ Now actually seed into Prisma
  for (const subjectData of allSubjects) {
    if (!subjectData.slug) {
      console.warn("⚠️ Skipping subject without slug:", subjectData);
      continue;
    }

    console.log(`\n🎯 Seeding subject: ${subjectData.slug}`);

    // 1. Subject
    let subject = await prisma.curriculumSubject.findFirst({
      where: { slug: subjectData.slug },
    });

    if (!subject) {
      subject = await prisma.curriculumSubject.create({
        data: {
          phase: subjectData.phase,
          level: subjectData.level,
          name: subjectData.name,
          slug: subjectData.slug,
          description: subjectData.description ?? "",
          orderIndex: subjectData.orderIndex ?? 0,
        },
      });
      console.log(`   ➕ Created CurriculumSubject (${subject.slug})`);
    } else {
      subject = await prisma.curriculumSubject.update({
        where: { id: subject.id },
        data: {
          phase: subjectData.phase,
          level: subjectData.level,
          name: subjectData.name,
          description: subjectData.description ?? "",
          orderIndex: subjectData.orderIndex ?? 0,
        },
      });
      console.log(`   🔁 Updated CurriculumSubject (${subject.slug})`);
    }

    // 2. Strands
    for (const strandData of subjectData.strands ?? []) {
      if (!strandData.code) continue;

      let strand = await prisma.curriculumStrand.findFirst({
        where: {
          code: strandData.code,
          subjectId: subject.id,
        },
      });

      if (!strand) {
        strand = await prisma.curriculumStrand.create({
          data: {
            code: strandData.code,
            title: strandData.title,
            description: strandData.description ?? "",
            orderIndex: strandData.orderIndex ?? 0,
            subject: { connect: { id: subject.id } },
          },
        });
        console.log(`   ➕ Created Strand ${strand.code}`);
      } else {
        strand = await prisma.curriculumStrand.update({
          where: { id: strand.id },
          data: {
            title: strandData.title,
            description: strandData.description ?? "",
            orderIndex: strandData.orderIndex ?? 0,
          },
        });
        console.log(`   🔁 Updated Strand ${strand.code}`);
      }

      // 3. Sub-strands
      for (const subStrandData of strandData.subStrands ?? []) {
        if (!subStrandData.code) continue;

        let subStrand = await prisma.curriculumSubStrand.findFirst({
          where: {
            code: subStrandData.code,
            strandId: strand.id,
          },
        });

        if (!subStrand) {
          subStrand = await prisma.curriculumSubStrand.create({
            data: {
              code: subStrandData.code,
              title: subStrandData.title,
              description: subStrandData.description ?? "",
              orderIndex: subStrandData.orderIndex ?? 0,
              strand: { connect: { id: strand.id } },
            },
          });
          console.log(`      ➕ Created SubStrand ${subStrand.code}`);
        } else {
          subStrand = await prisma.curriculumSubStrand.update({
            where: { id: subStrand.id },
            data: {
              title: subStrandData.title,
              description: subStrandData.description ?? "",
              orderIndex: subStrandData.orderIndex ?? 0,
            },
          });
          console.log(`      🔁 Updated SubStrand ${subStrand.code}`);
        }

        // 4. Content Standards
        for (const csData of subStrandData.contentStandards ?? []) {
          if (!csData.code) continue;

          let contentStandard =
            await prisma.curriculumContentStandard.findFirst({
              where: {
                code: csData.code,
                subStrandId: subStrand.id,
              },
            });

          if (!contentStandard) {
            contentStandard =
              await prisma.curriculumContentStandard.create({
                data: {
                  code: csData.code,
                  description: csData.description ?? "",
                  orderIndex: csData.orderIndex ?? 0,
                  subStrand: { connect: { id: subStrand.id } },
                },
              });
            console.log(`         ➕ Created ContentStandard ${csData.code}`);
          } else {
            contentStandard =
              await prisma.curriculumContentStandard.update({
                where: { id: contentStandard.id },
                data: {
                  description: csData.description ?? "",
                  orderIndex: csData.orderIndex ?? 0,
                },
              });
            console.log(`         🔁 Updated ContentStandard ${csData.code}`);
          }

          // 5. Indicators (we only need these for media linking)
          for (const indData of csData.indicators ?? []) {
            if (!indData.code) continue;

            let indicator = await prisma.curriculumIndicator.findFirst({
              where: {
                code: indData.code,
                contentStandardId: contentStandard.id,
              },
            });

            if (!indicator) {
              indicator = await prisma.curriculumIndicator.create({
                data: {
                  code: indData.code,
                  description: indData.description ?? "",
                  orderIndex: indData.orderIndex ?? 0,
                  contentStandard: { connect: { id: contentStandard.id } },
                },
              });
              console.log(`            ➕ Created Indicator ${indData.code}`);
            } else {
              indicator = await prisma.curriculumIndicator.update({
                where: { id: indicator.id },
                data: {
                  description: indData.description ?? "",
                  orderIndex: indData.orderIndex ?? 0,
                },
              });
              console.log(`            🔁 Updated Indicator ${indData.code}`);
            }

            // (Optional) Exemplars – not strictly required for media
            // If you want them later, we can extend here.
          }
        }
      }
    }
  }

  console.log("\n✅ Finished seeding Basic 2 Creative Arts curriculum.");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding Basic 2 Creative Arts:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
