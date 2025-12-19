// prisma/seed/kg1-owop-strand2-substrand1-media.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

type RawMediaItem = {
  subjectSlug: string;
  phase: string;
  level: string;
  strandCode: string;
  subStrandCode: string;
  contentStandardCode: string;
  indicatorCode: string;
  pageNumberInPdf: number;
  figureLabel: string;
  imagePath: string;
  altText: string;
  detailedDescription: string;
  tags?: string[];
};

async function main() {
  console.log("🎨 Seeding KG1 OWOP Strand 2 Sub-strand 1 media…");

  // 🔑 IMPORTANT: use process.cwd() instead of __dirname
  // so it works even when ts-node runs in ESM mode
  const jsonPath = path.join(
    process.cwd(),
    "prisma",
    "seed",
    "curriculum",
    "kg1-owop-strand2-substrand1-media.json"
  );

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`JSON file not found at: ${jsonPath}`);
  }

  const raw = fs.readFileSync(jsonPath, "utf8");
  const items = JSON.parse(raw) as RawMediaItem[];

  console.log(`Found ${items.length} media items in JSON.`);

  if (items.length === 0) {
    console.log("Nothing to seed. Exiting.");
    return;
  }

  const subjectSlug = items[0].subjectSlug;
  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: subjectSlug },
  });

  if (!subject) {
    throw new Error(
      `CurriculumSubject with slug=${subjectSlug} not found. Seed the subject first.`
    );
  }

  for (const item of items) {
    console.log(
      `\n➡️  Processing media for indicatorCode=${item.indicatorCode} / contentStandardCode=${item.contentStandardCode}`
    );

    // 1️⃣ Find the content standard inside this subject
    const contentStandard = await prisma.curriculumContentStandard.findFirst({
      where: {
        code: item.contentStandardCode,
        subStrand: {
          strand: {
            subjectId: subject.id,
          },
        },
      },
      include: {
        subStrand: true,
      },
    });

    if (!contentStandard) {
      console.warn(
        `   ⚠️  No CurriculumContentStandard found for code=${item.contentStandardCode} under subject=${subjectSlug}. Skipping.`
      );
      continue;
    }

    // 2️⃣ Find the indicator (if present)
    const indicator = await prisma.curriculumIndicator.findFirst({
      where: {
        code: item.indicatorCode,
        contentStandardId: contentStandard.id,
      },
    });

    if (!indicator) {
      console.warn(
        `   ⚠️  No CurriculumIndicator found for code=${item.indicatorCode}. Will attach media only to content standard.`
      );
    }

    // 3️⃣ Create CurriculumMedia entry
    await prisma.curriculumMedia.create({
      data: {
        subjectId: subject.id,
        contentStandardId: contentStandard.id,
        indicatorId: indicator ? indicator.id : null,
        exemplarId: null,
        pageNumberInPdf: item.pageNumberInPdf,
        figureLabel: item.figureLabel,
        imagePath: item.imagePath,
        altText: item.altText,
        detailedDescription: item.detailedDescription,
        tags: item.tags && item.tags.length > 0 ? item.tags.join(",") : null,
      },
    });

    console.log("   ✅ Media row created/seeded.");
  }

  console.log("\n✅ Done seeding KG1 OWOP Strand 2 Sub-strand 1 media.");
}

main()
  .catch((err) => {
    console.error("❌ Error while seeding media:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
