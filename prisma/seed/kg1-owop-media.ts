// prisma/seed/kg1-owop-media.ts
//
// Seed real CurriculumMedia rows for KG1 Our World and Our People
// using a JSON file of image descriptions.
//
// Run with:
//   npx ts-node prisma/seed/kg1-owop-media.ts

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

type KgMediaSeedItem = {
  phase: string;
  level: string;
  subject: string;
  subjectSlug: string;

  strandCode: string;
  subStrandCode: string;
  contentStandardCode: string;
  indicatorCode: string;

  assetType: "image";

  ageBand: string;

  imagePath: string;

  caption: string;
  altText: string;
  detailedDescription: string;

  sourceDocumentTitle: string;
  sourceDocumentYear: number;
  sourcePage: number; // MUST be integer in JSON
};

async function mainReal() {
  const jsonPath = path.join(
    process.cwd(),
    "prisma",
    "seed",
    "curriculum",
    "kg1-owop-media.json"
  );

  if (!fs.existsSync(jsonPath)) {
    console.error("❌ Seed JSON not found at:", jsonPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, "utf8");
  const items = JSON.parse(raw) as KgMediaSeedItem[];

  console.log(`📖 Loading KG1 OWOP media seed from: ${jsonPath}`);
  console.log(`   Items in JSON: ${items.length}`);

  if (!items.length) {
    console.error("❌ No items in kg1-owop-media.json. Exiting.");
    process.exit(1);
  }

  // 🔎 All items share the same subjectSlug for KG1 OWOP
  const subjectSlug = items[0].subjectSlug;
  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: subjectSlug },
  });

  if (!subject) {
    console.error(
      `❌ CurriculumSubject not found for slug='${subjectSlug}'. ` +
        `Seed the KG1 OWOP curriculum first (kg1-our-world-and-our-people.ts).`
    );
    process.exit(1);
  }

  console.log(
    `   ✅ Using subject '${subject.name}' (id=${subject.id}, slug=${subject.slug})`
  );

  for (const item of items) {
    console.log(
      `\n→ Processing indicator ${item.indicatorCode} (${item.subject})`
    );

    // Sanity check: we need a valid page number or Prisma will explode
    if (
      typeof item.sourcePage !== "number" ||
      !Number.isInteger(item.sourcePage)
    ) {
      console.error(
        `   ❌ Invalid or missing sourcePage for indicator ${item.indicatorCode}. ` +
          `Check kg1-owop-media.json and ensure "sourcePage" is an integer. Skipping.`
      );
      continue;
    }

    // Find the indicator under the correct subject/strand tree
    const indicator = await prisma.curriculumIndicator.findFirst({
      where: {
        code: item.indicatorCode,
        contentStandard: {
          subStrand: {
            strand: {
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
        `   ⚠️ No CurriculumIndicator found for code ${item.indicatorCode} under subject slug ${item.subjectSlug}. Skipping.`
      );
      continue;
    }

    console.log(`   ✅ Found indicator ${indicator.code} (id=${indicator.id})`);

    // Check if there is already a media row for this indicator + image path
    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicatorId: indicator.id,
        imagePath: item.imagePath,
      },
    });

    const figureLabel = item.caption;
    const tags = `${item.phase}, ${item.level}, ${item.subject}, ${item.indicatorCode}`;

    if (existing) {
      console.log(
        `   🔁 Existing media found (id=${existing.id}), updating...`
      );
      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data: {
          subjectId: subject.id, // 🔐 FIX: always bind to KG1 OWOP subject
          pageNumberInPdf: item.sourcePage,
          figureLabel,
          altText: item.altText,
          detailedDescription: item.detailedDescription,
          tags,
        },
      });
      console.log("   ✅ Updated existing media row.");
    } else {
      console.log("   ➕ No existing media found, creating new row...");
      const created = await prisma.curriculumMedia.create({
        data: {
          subjectId: subject.id, // 🔐 FIX: always bind to KG1 OWOP subject
          indicatorId: indicator.id,
          pageNumberInPdf: item.sourcePage,
          figureLabel,
          imagePath: item.imagePath,
          altText: item.altText,
          detailedDescription: item.detailedDescription,
          tags,
        },
      });
      console.log(`   ✅ Created CurriculumMedia with id=${created.id}`);
    }
  }

  console.log("\n🎉 Done seeding KG1 OWOP media.");
}

mainReal()
  .catch((err) => {
    console.error("❌ Error in KG1 OWOP media seed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
