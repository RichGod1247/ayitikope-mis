import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

// Recreate __dirname in ES module context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type MediaSeedItem = {
  subjectSlug?: string;
  phase?: string;          // kept in type so JSON parses, but NOT written to DB
  level?: string;          // same here
  strandCode?: string;
  subStrandCode?: string;
  contentStandardCode?: string;
  indicatorCode?: string;
  imagePath?: string;
  figureLabel?: string;
  altText?: string;
  detailedDescription?: string;
  pageNumberInPdf?: number;
  tags?: string[] | string | null;
};

async function main() {
  const seedPath = path.join(
    __dirname,
    "curriculum",
    "b1-creative-arts-performing-media.json"
  );

  const raw = await readFile(seedPath, "utf8");
  const items: MediaSeedItem[] = JSON.parse(raw);

  console.log(
    `📖 Loading B1 Creative Arts (Performing) media seed from: ${seedPath}`
  );
  console.log(`   Items in JSON: ${items.length}`);

  for (const item of items) {
    const {
      subjectSlug = "basic-1-creative-arts",
      strandCode,
      subStrandCode,
      contentStandardCode,
      indicatorCode,
      imagePath,
      figureLabel = "",
      altText,
      detailedDescription,
      pageNumberInPdf = 0,
      tags,
    } = item;

    if (!indicatorCode || !imagePath) {
      console.warn(
        `   ⚠️ Skipping row because indicatorCode or imagePath is missing (subjectSlug=${subjectSlug}).`
      );
      continue;
    }

    console.log(`\n→ Processing indicator ${indicatorCode} (${subjectSlug})`);

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
        where: { code: indicatorCode },
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

    const tagsString = Array.isArray(tags)
      ? tags.join(", ")
      : tags ?? "";

    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicatorId: indicator.id,
        imagePath,
      },
    });

    const baseData = {
      imagePath,
      figureLabel,
      altText: altText ?? "",
      detailedDescription: detailedDescription ?? "",
      tags: tagsString,
      pageNumberInPdf,
      indicator: {
        connect: { id: indicator.id },
      },
    };

    if (existing) {
      console.log("   🔁 Existing media found, updating row...");
      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data: baseData,
      });
    } else {
      console.log("   ➕ No existing media found, creating new row...");
      await prisma.curriculumMedia.create({
        data: baseData,
      });
    }
  }

  console.log("\n🎉 Done seeding B1 Creative Arts (Performing) media.");
}

async function mainReal() {
  try {
    await main();
  } catch (err) {
    console.error(
      "❌ Error in B1 Creative Arts (Performing) media seed:",
      err
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

mainReal();
