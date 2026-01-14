import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CURRICULUM_DIR = path.join(__dirname, "curriculum");
const FILE_NAME = "basic-6-religious-and-moral-education-media.json";

function normalizeTags(tags: any): string | null {
  if (tags == null) return null;
  if (Array.isArray(tags)) return tags.join(", ");
  if (typeof tags === "string") return tags;
  return String(tags);
}

console.log("📖 Loading B6 RME media seed from:", path.join(CURRICULUM_DIR, FILE_NAME));

async function main() {
  const fullPath = path.join(CURRICULUM_DIR, FILE_NAME);

  if (!fs.existsSync(fullPath)) {
    console.error("❌ Media JSON file not found:", fullPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(fullPath, "utf8");
  const items: any[] = JSON.parse(raw);

  console.log("   Items in JSON:", items.length);

  let upserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    try {
      console.log(`\n→ Processing indicator ${item.indicatorCode} (${item.subjectSlug})`);

      // 1) Find subject (so we seed the correct indicator within the correct subject)
      const subject = await prisma.curriculumSubject.findUnique({
        where: { slug: item.subjectSlug },
        select: { id: true },
      });

      if (!subject) {
        console.log("   ⚠️ Skipped: Subject not found:", item.subjectSlug);
        skipped++;
        continue;
      }

      // 2) Find indicator ID
      const indicator = await prisma.curriculumIndicator.findFirst({
        where: {
          code: item.indicatorCode,
          contentStandard: {
            subStrand: {
              strand: {
                subjectId: subject.id,
              },
            },
          },
        },
        select: { id: true },
      });

      if (!indicator) {
        console.log("   ⚠️ Skipped: Indicator not found in DB:", item.indicatorCode);
        skipped++;
        continue;
      }

      const tags = normalizeTags(item.tags);

      // ✅ IMPORTANT: Your unique key is NOT indicatorId alone.
      // It is this compound unique: CurriculumMedia_indicator_image_unique (indicatorId + imagePath)
      await prisma.curriculumMedia.upsert({
        where: {
          CurriculumMedia_indicator_image_unique: {
            indicatorId: indicator.id,
            imagePath: item.imagePath,
          },
        },
        create: {
          indicatorId: indicator.id,
          imagePath: item.imagePath,
          altText: item.altText ?? item.indicatorDescription ?? null,
          detailedDescription: item.detailedDescription ?? null,
          tags,
          pageNumberInPdf: item.pageNumberInPdf ?? 0,
          figureLabel: item.figureLabel ?? null,
        },
        update: {
          altText: item.altText ?? item.indicatorDescription ?? null,
          detailedDescription: item.detailedDescription ?? null,
          tags,
          pageNumberInPdf: item.pageNumberInPdf ?? 0,
          figureLabel: item.figureLabel ?? null,
        },
      });

      console.log("   ✅ Upserted");
      upserted++;
    } catch (e) {
      console.error("   ❌ Failed:", item?.indicatorCode, e);
      failed++;
    }
  }

  console.log("\n🎉 Done seeding B6 RME media.");
  console.log({ upserted, skipped, failed });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
