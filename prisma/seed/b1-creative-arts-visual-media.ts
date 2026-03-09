//prisma/seed/b1-creative-arts-visual-media.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type MediaSeedItem = {
  // metadata from JSON (not sent to Prisma)
  phase?: string;
  level?: string;
  subject?: string;
  subjectSlug?: string;

  strandCode?: string;
  subStrandCode?: string;
  contentStandardCode?: string;
  indicatorCode?: string;

  assetType?: string;
  ageBand?: string;

  imagePath?: string;
  caption?: string;
  altText?: string;
  detailedDescription?: string;

  sourceDocumentTitle?: string;
  sourceDocumentYear?: number;
  sourcePage?: number;

  pageNumberInPdf?: number;
  figureLabel?: string;
  tags?: string[] | string | null;
};

async function main() {
  const seedPath = path.join(
    __dirname,
    "curriculum",
    "b1-creative-arts-visual-media.json"
  );

  console.log(
    `📖 Loading B1 Creative Arts (Visual) media seed from: ${seedPath}`
  );

  if (!fs.existsSync(seedPath)) {
    console.error("❌ Seed file not found at path:", seedPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(seedPath, "utf-8");
  const items: MediaSeedItem[] = JSON.parse(raw);

  console.log(`   Items in JSON: ${items.length}`);

  for (const item of items) {
    const {
      subjectSlug = "basic-1-creative-arts",
      strandCode,
      subStrandCode,
      contentStandardCode,
      indicatorCode,
      imagePath,
      caption,
      altText,
      detailedDescription,
      pageNumberInPdf,
      sourcePage,
      figureLabel,
      tags,
    } = item;

    const label = `${indicatorCode ?? "undefined"} (${subjectSlug})`;
    console.log(`\n→ Processing indicator ${label}`);

    if (!indicatorCode || !imagePath) {
      console.warn(
        `   ⚠️ Skipping row because indicatorCode or imagePath is missing (subjectSlug=${subjectSlug}).`
      );
      continue;
    }

    // 1️⃣ Strict hierarchical match (best case)
    let indicator = await prisma.curriculumIndicator.findFirst({
      where: {
        code: indicatorCode,
        contentStandard: contentStandardCode
          ? {
              code: contentStandardCode,
              subStrand: subStrandCode
                ? {
                    code: subStrandCode,
                    strand: strandCode
                      ? {
                          code: strandCode,
                          subject: {
                            slug: subjectSlug,
                          },
                        }
                      : {
                          subject: {
                            slug: subjectSlug,
                          },
                        },
                  }
                : undefined,
            }
          : undefined,
      },
    });

    // 2️⃣ Fallback: just by indicator code
    if (!indicator) {
      indicator = await prisma.curriculumIndicator.findFirst({
        where: {
          code: indicatorCode,
        },
      });
    }

    // 3️⃣ Last-resort fallback: any indicator under this subject
    if (!indicator) {
      indicator = await prisma.curriculumIndicator.findFirst({
        where: {
          contentStandard: {
            subStrand: {
              strand: {
                subject: {
                  slug: subjectSlug,
                },
              },
            },
          },
        },
      });
    }

    if (!indicator) {
      console.warn(
        `   ⚠️ Still could not find any indicator for indicatorCode=${indicatorCode}, subjectSlug=${subjectSlug}. Skipping.`
      );
      continue;
    }

    console.log(`   ✅ Found indicator ${indicator.code} (id=${indicator.id})`);

    // Normalise tags to a single string
    const tagsString =
      Array.isArray(tags) ? tags.join(", ") : tags ?? "";

    // Decide page number (JSON gives either pageNumberInPdf or sourcePage)
    const resolvedPageNumberInPdf =
      typeof pageNumberInPdf === "number"
        ? pageNumberInPdf
        : typeof sourcePage === "number"
        ? sourcePage
        : 0;

    // Detailed description fallback logic
    const resolvedDetailedDescription: string =
      detailedDescription ?? caption ?? altText ?? "";

    const resolvedAltText: string = altText ?? "";

    const resolvedFigureLabel: string =
      figureLabel ?? caption ?? "";

    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicatorId: indicator.id,
        imagePath,
      },
    });

    const baseData = {
      figureLabel: resolvedFigureLabel,
      imagePath,
      altText: resolvedAltText,
      detailedDescription: resolvedDetailedDescription,
      tags: tagsString,
      pageNumberInPdf: resolvedPageNumberInPdf,
      indicator: {
        connect: { id: indicator.id },
      },
    };

    if (existing) {
      console.log(
        `   🔁 Existing media found (id=${existing.id}), updating...`
      );

      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data: baseData,
      });

      console.log("   ✅ Updated existing media row.");
    } else {
      console.log("   ➕ No existing media found, creating new row...");

      await prisma.curriculumMedia.create({
        data: baseData,
      });

      console.log("   ✅ Created CurriculumMedia row.");
    }
  }

  console.log("\n🎉 Done seeding B1 Creative Arts (Visual) media.");
}

async function mainReal() {
  try {
    await main();
  } catch (err) {
    console.error("❌ Error in B1 Creative Arts (Visual) media seed:", err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

mainReal();
