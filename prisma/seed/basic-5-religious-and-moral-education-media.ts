import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CURRICULUM_DIR = path.join(__dirname, "curriculum");
const FILE_NAME = "basic-5-religious-and-moral-education-media.json";

type MediaSeedItem = {
  subjectSlug: string;
  phase: string;
  level: string;
  strandCode: string;
  subStrandCode: string;
  contentStandardCode: string;
  indicatorCode: string;
  pageNumberInPdf: number;
  figureLabel: string | null;
  imagePath: string;
  altText: string;
  detailedDescription: string;
  tags: string[];
};

async function main() {
  const fullPath = path.join(CURRICULUM_DIR, FILE_NAME);

  console.log("📖 Loading B5 Religious and Moral Education media seed from:", fullPath);

  if (!fs.existsSync(fullPath)) {
    console.error("❌ Media JSON file not found:", fullPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(fullPath, "utf8");
  const items: MediaSeedItem[] = JSON.parse(raw);

  console.log("   Items in JSON:", items.length);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    try {
      console.log(`\n→ Processing indicator ${item.indicatorCode} (${item.subjectSlug})`);

      const subject = await prisma.curriculumSubject.findFirst({
        where: { slug: item.subjectSlug },
        select: { id: true, slug: true },
      });

      if (!subject) {
        console.log("   ⚠️ Skipped: subject not found");
        skipped++;
        continue;
      }

      // Find indicator by code, scoped under the subject
      const indicator = await prisma.curriculumIndicator.findFirst({
        where: {
          code: item.indicatorCode,
          contentStandard: {
            subStrand: {
              strand: {
                subject: { slug: item.subjectSlug },
              },
            },
          },
        },
        select: { id: true, code: true },
      });

      if (!indicator) {
        console.log("   ⚠️ Skipped: indicator not found in DB");
        skipped++;
        continue;
      }

      // Avoid guessing unique constraints: do manual upsert
      const existing = await prisma.curriculumMedia.findFirst({
        where: {
          subjectId: subject.id,
          indicatorId: indicator.id,
        },
        select: { id: true },
      });

      if (!existing) {
        const createdRow = await prisma.curriculumMedia.create({
          data: {
            subject: { connect: { id: subject.id } },
            indicator: { connect: { id: indicator.id } },
            imagePath: item.imagePath,
            altText: item.altText,
            detailedDescription: item.detailedDescription,
            tags: (item.tags ?? []).join(","),
            pageNumberInPdf: item.pageNumberInPdf,
            figureLabel: item.figureLabel,
          },
          select: { id: true },
        });

        console.log(`   ✅ Created (id=${createdRow.id})`);
        created++;
      } else {
        await prisma.curriculumMedia.update({
          where: { id: existing.id },
          data: {
            imagePath: item.imagePath,
            altText: item.altText,
            detailedDescription: item.detailedDescription,
           tags: (item.tags ?? []).join(","),
            pageNumberInPdf: item.pageNumberInPdf,
            figureLabel: item.figureLabel,
          },
        });

        console.log(`   🔁 Updated (id=${existing.id})`);
        updated++;
      }
    } catch (err) {
      console.log("   ❌ Failed:", err);
      failed++;
    }
  }

  console.log("\n🎉 Done seeding B5 Religious and Moral Education media.");
  console.log({ created, updated, skipped, failed });
}

main()
  .catch((e) => {
    console.error("❌ Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
