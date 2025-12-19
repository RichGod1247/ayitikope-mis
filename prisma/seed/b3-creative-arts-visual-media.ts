import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type MediaSeedItem = {
  phase: string;
  level: string;
  subject: string;
  subjectSlug: string;

  strandCode: string;
  subStrandCode: string;
  contentStandardCode: string;
  indicatorCode: string;

  assetType?: string;
  ageBand?: string;

  imagePath: string;
  caption?: string;
  altText: string;
  detailedDescription?: string;

  sourceDocumentTitle?: string;
  sourceDocumentYear?: number;
  sourcePage?: number;

  pageNumberInPdf?: number;
  figureLabel?: string;
  tags?: string[] | string;
};

async function main() {
  const seedPath = path.join(
    __dirname,
    "curriculum",
    "b3-creative-arts-visual-media.json"
  );

  console.log(
    `📖 Loading B3 Creative Arts (Visual) media seed from: ${seedPath}`
  );

  if (!fs.existsSync(seedPath)) {
    console.error("❌ Seed file not found at path:", seedPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(seedPath, "utf-8");
  const items: MediaSeedItem[] = JSON.parse(raw);

  console.log(`   Items in JSON: ${items.length}`);

  for (const item of items) {
    const label = `${item.indicatorCode} (${item.subjectSlug})`;
    console.log(`\n→ Processing indicator ${label}`);

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
                slug: item.subjectSlug,
              },
            },
          },
        },
      },
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

    let tags = "";
    if (Array.isArray(item.tags)) {
      tags = item.tags.join(", ");
    } else if (typeof item.tags === "string") {
      tags = item.tags;
    }

    const pageNumberInPdf =
      typeof item.pageNumberInPdf === "number"
        ? item.pageNumberInPdf
        : typeof item.sourcePage === "number"
        ? item.sourcePage
        : 0;

    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicatorId: indicator.id,
        imagePath: item.imagePath,
      },
    });

    if (existing) {
      console.log(
        `   🔁 Existing media found (id=${existing.id}), updating...`
      );

      const detailedDescription: string =
        item.detailedDescription ??
        (existing.detailedDescription ?? existing.altText);

      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data: {
          figureLabel:
            item.figureLabel ?? item.caption ?? existing.figureLabel ?? "",
          imagePath: item.imagePath,
          altText: item.altText,
          detailedDescription,
          tags,
          pageNumberInPdf,
        },
      });

      console.log("   ✅ Updated existing media row.");
    } else {
      console.log("   ➕ No existing media found, creating new row...");

      const detailedDescription: string =
        item.detailedDescription ?? item.caption ?? item.altText;

      await prisma.curriculumMedia.create({
        data: {
          figureLabel: item.figureLabel ?? item.caption ?? "",
          imagePath: item.imagePath,
          altText: item.altText,
          detailedDescription,
          tags,
          pageNumberInPdf,
          indicator: {
            connect: { id: indicator.id },
          },
        },
      });

      console.log("   ✅ Created CurriculumMedia row.");
    }
  }

  console.log("\n🎉 Done seeding B3 Creative Arts (Visual) media.");
}

async function mainReal() {
  try {
    await main();
  } catch (err) {
    console.error("❌ Error in B3 Creative Arts (Visual) media seed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

mainReal();
