import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MediaSeed {
  subjectSlug: string;
  phase: string;
  level: string;
  strandCode: string;
  subStrandCode: string;
  contentStandardCode: string;
  indicatorCode: string;
  pageNumberInPdf: number;
  figureLabel?: string;
  imagePath: string;
  altText: string;
  detailedDescription: string;
  tags?: string[] | string;
}

async function main() {
  const seedPath = path.join(
    __dirname,
    "curriculum",
    "kg2-owop-media.json"
  );

  console.log("📖 Loading KG2 OWOP media seed from:", seedPath);
  const raw = fs.readFileSync(seedPath, "utf8");
  const items = JSON.parse(raw) as MediaSeed[];

  console.log("   Items in JSON:", items.length);

  for (const item of items) {
    console.log(
      `\n→ Processing indicator ${item.indicatorCode} (${item.subjectSlug})`
    );

    const indicator = await prisma.curriculumIndicator.findFirst({
      where: {
        code: item.indicatorCode,
        contentStandard: {
          code: item.contentStandardCode,
          subStrand: {
            code: item.subStrandCode,
            strand: {
              code: item.strandCode,
              subject: {
                slug: item.subjectSlug
              }
            }
          }
        }
      }
    });

    if (!indicator) {
      console.warn(
        `   ⚠️ Could not find indicator ${item.indicatorCode} (strand=${item.strandCode}, subStrand=${item.subStrandCode}, contentStandard=${item.contentStandardCode}, subjectSlug=${item.subjectSlug}). Skipping.`
      );
      continue;
    }

    console.log(
      `   ✅ Found indicator ${item.indicatorCode} (id=${indicator.id})`
    );

    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicatorId: indicator.id,
        imagePath: item.imagePath
      }
    });

    const tagsString = Array.isArray(item.tags)
      ? item.tags.join(", ")
      : item.tags ?? "";

    if (existing) {
      console.log(
        `   🔁 Existing media found (id=${existing.id}), updating...`
      );
      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data: {
          pageNumberInPdf: item.pageNumberInPdf ?? 0,
          figureLabel: item.figureLabel,
          altText: item.altText,
          detailedDescription: item.detailedDescription,
          tags: tagsString
        }
      });
      console.log("   ✅ Updated existing media row.");
    } else {
      console.log(
        "   ➕ No existing media found, creating new row..."
      );
      await prisma.curriculumMedia.create({
        data: {
          pageNumberInPdf: item.pageNumberInPdf ?? 0,
          figureLabel: item.figureLabel,
          imagePath: item.imagePath,
          altText: item.altText,
          detailedDescription: item.detailedDescription,
          tags: tagsString,
          indicator: {
            connect: { id: indicator.id }
          }
        }
      });
      console.log("   ✅ Created CurriculumMedia row.");
    }
  }

  console.log("\n🎉 Done seeding KG2 OWOP media.");
}

main()
  .catch((e) => {
    console.error("❌ Error in KG2 OWOP media seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
