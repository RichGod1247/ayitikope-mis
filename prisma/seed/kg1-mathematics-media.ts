import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

// Resolve from project root (where you run npx ts-node …)
const MEDIA_JSON_PATH = path.join(
  process.cwd(),
  "prisma",
  "seed",
  "curriculum",
  "kg1-mathematics-media.json"
);

type RawMediaItem = {
  subjectSlug: string;
  phase: string;
  level: string;

  strandCode: string;
  subStrandCode: string;
  contentStandardCode: string;
  indicatorCode: string;

  pageNumberInPdf: number;
  figureLabel?: string | null;

  imagePath: string;
  altText: string;
  detailedDescription: string;
  tags?: string[] | string | null;
};

async function mainReal() {
  console.log(
    `📖 Loading KG1 Mathematics media seed from: ${MEDIA_JSON_PATH}`
  );

  if (!fs.existsSync(MEDIA_JSON_PATH)) {
    console.error("❌ Media JSON file not found.");
    process.exit(1);
  }

  const raw = fs.readFileSync(MEDIA_JSON_PATH, "utf8");
  let items: RawMediaItem[];

  try {
    items = JSON.parse(raw);
  } catch (err) {
    console.error("❌ Failed to parse kg1-mathematics-media.json as JSON:", err);
    process.exit(1);
    return;
  }

  console.log(`   Items in JSON: ${items.length}`);

  for (const item of items) {
    const {
      subjectSlug,
      strandCode,
      subStrandCode,
      contentStandardCode,
      indicatorCode,
    } = item;

    console.log(
      `\n→ Processing indicator ${indicatorCode} (${subjectSlug || "KG1 Mathematics"})`
    );

    // 1. Find the indicator via subject → strand → substrand → content standard → indicator
    const indicator = await prisma.curriculumIndicator.findFirst({
      where: {
        code: indicatorCode,
        contentStandard: {
          code: contentStandardCode,
          subStrand: {
            code: subStrandCode,
            strand: {
              code: strandCode,
              subject: {
                slug: subjectSlug,
              },
            },
          },
        },
      },
    });

    if (!indicator) {
      console.warn(
        `   ⚠️ Could not find indicator ${indicatorCode} (strand=${strandCode}, subStrand=${subStrandCode}, contentStandard=${contentStandardCode}, subjectSlug=${subjectSlug}). Skipping.`
      );
      continue;
    }

    console.log(`   ✅ Found indicator ${indicatorCode} (id=${indicator.id})`);

    // 2. Prepare tags as a single string (or null) to match your existing schema behaviour
    let tags: string | null = null;
    if (Array.isArray(item.tags)) {
      tags = item.tags.join(", ");
    } else if (typeof item.tags === "string") {
      tags = item.tags;
    } else {
      tags = null;
    }

    // 3. Normalise imagePath (remove leading slash if present)
    const imagePathNormalised = item.imagePath.startsWith("/")
      ? item.imagePath.slice(1)
      : item.imagePath;

    // 4. pageNumberInPdf is required by the Prisma schema
    if (
      typeof item.pageNumberInPdf !== "number" ||
      Number.isNaN(item.pageNumberInPdf)
    ) {
      console.error(
        `   ❌ Invalid or missing pageNumberInPdf for indicator ${indicatorCode}. Value: ${item.pageNumberInPdf}`
      );
      continue;
    }

    const data = {
      figureLabel: item.figureLabel ?? null,
      imagePath: imagePathNormalised,
      altText: item.altText,
      detailedDescription: item.detailedDescription,
      tags,
      pageNumberInPdf: item.pageNumberInPdf,
      indicator: {
        connect: {
          id: indicator.id,
        },
      },
    };

    // 5. Check if a CurriculumMedia row already exists for this indicator + imagePath
    //    (this works together with the DB unique constraint on (indicatorId, imagePath))
    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicatorId: indicator.id,
        imagePath: imagePathNormalised,
      },
    });

    if (existing) {
      console.log(
        `   🔁 Existing media found (id=${existing.id}), updating...`
      );
      await prisma.curriculumMedia.update({
        where: {
          id: existing.id,
        },
        data,
      });
      console.log(`   ✅ Updated existing media row.`);
    } else {
      console.log(`   ➕ No existing media found, creating new row...`);
      const created = await prisma.curriculumMedia.create({
        data,
      });
      console.log(
        `   ✅ Created CurriculumMedia with id=${created.id}`
      );
    }
  }

  console.log("\n🎉 Done seeding KG1 Mathematics media.");
}

async function main() {
  try {
    await mainReal();
  } catch (err) {
    console.error("❌ Error in KG1 Mathematics media seed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
