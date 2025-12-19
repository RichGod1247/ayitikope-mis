// prisma/seed/kg1-owop-strand1-substrand1-media.ts

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

type MediaJsonItem = {
  subjectSlug: string;
  phase?: string;
  level?: string;
  strandCode?: string;
  subStrandCode?: string;
  contentStandardCode?: string;
  indicatorCode?: string;
  pageNumberInPdf: number;
  figureLabel?: string;
  nodeType?: string;
  ageBand?: string;
  promptForModel?: string;
  altText: string;
  detailedDescription: string;
  tags?: string[] | string;
  imagePath: string;
};

async function main() {
  console.log("🎨 Seeding KG1 OWOP Strand 1 Sub-strand 1 media…");

  const jsonPath = path.join(
    process.cwd(),
    "prisma",
    "seed",
    "curriculum",
    "kg1-owop-strand1-substrand1-media.json"
  );

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`JSON file not found at: ${jsonPath}`);
  }

  const raw = fs.readFileSync(jsonPath, "utf8");
  const items = JSON.parse(raw) as MediaJsonItem[];

  console.log(`Found ${items.length} media items in JSON.`);

  for (const item of items) {
    const {
      subjectSlug,
      contentStandardCode,
      indicatorCode,
      pageNumberInPdf,
      figureLabel,
      altText,
      detailedDescription,
      imagePath,
      tags,
    } = item;

    console.log(
      `\n➡️  Processing media for indicatorCode=${indicatorCode ?? "NONE"} / contentStandardCode=${contentStandardCode ?? "NONE"}`
    );

    // 1. Find the CurriculumSubject by slug
    const subject = await prisma.curriculumSubject.findUnique({
      where: { slug: subjectSlug },
    });

    if (!subject) {
      console.warn(
        `   ⚠️  Skipping: no CurriculumSubject found with slug=${subjectSlug}`
      );
      continue;
    }

    let contentStandard = null;
    let indicator = null;

    // 2. If we have a contentStandardCode, try to locate it under this subject
    if (contentStandardCode) {
      contentStandard = await prisma.curriculumContentStandard.findFirst({
        where: {
          code: contentStandardCode,
          subStrand: {
            strand: {
              subjectId: subject.id,
            },
          },
        },
      });

      if (!contentStandard) {
        console.warn(
          `   ⚠️  No CurriculumContentStandard found for code=${contentStandardCode} under subject=${subjectSlug}`
        );
      }
    }

    // 3. If we have an indicatorCode, try to locate it under this content standard
    if (indicatorCode && contentStandard) {
      indicator = await prisma.curriculumIndicator.findFirst({
        where: {
          code: indicatorCode,
          contentStandardId: contentStandard.id,
        },
      });

      if (!indicator) {
        console.warn(
          `   ⚠️  No CurriculumIndicator found for code=${indicatorCode} under contentStandard=${contentStandardCode}`
        );
      }
    }

    // 4. Prepare tags as a single string
    let tagsString: string | null = null;
    if (Array.isArray(tags)) {
      tagsString = tags.join(", ");
    } else if (typeof tags === "string") {
      tagsString = tags;
    }

    // 5. Create or update CurriculumMedia
    // We try to use (subjectId, indicatorId, pageNumberInPdf, figureLabel) as a "natural key"
    const subjectId = subject.id;
    const indicatorId = indicator ? indicator.id : null;
    const contentStandardId = contentStandard ? contentStandard.id : null;

    const uniqueKey = `${subjectId}__${indicatorId ?? "NULL"}__${contentStandardId ?? "NULL"}__${pageNumberInPdf}__${figureLabel ?? "NO_LABEL"}`;

    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        subjectId,
        indicatorId: indicatorId ?? undefined,
        contentStandardId: contentStandardId ?? undefined,
        pageNumberInPdf,
        figureLabel: figureLabel ?? undefined,
      },
    });

    if (existing) {
      console.log(
        `   🔁 Existing media found (id=${existing.id}). Updating imagePath/altText/description…`
      );

      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data: {
          imagePath,
          altText,
          detailedDescription,
          tags: tagsString,
        },
      });

      console.log("   ✅ Updated existing CurriculumMedia.");
    } else {
      console.log(
        `   ➕ Creating new CurriculumMedia for subject=${subjectSlug}, indicator=${indicatorCode ?? "NONE"}.`
      );

      await prisma.curriculumMedia.create({
        data: {
          subject: { connect: { id: subjectId } },
          contentStandard: contentStandardId
            ? { connect: { id: contentStandardId } }
            : undefined,
          indicator: indicatorId
            ? { connect: { id: indicatorId } }
            : undefined,
          pageNumberInPdf,
          figureLabel: figureLabel ?? null,
          imagePath,
          altText,
          detailedDescription,
          tags: tagsString,
        },
      });

      console.log("   ✅ Created CurriculumMedia.");
    }
  }

  console.log("\n🎉 Done seeding KG1 OWOP Strand 1 Sub-strand 1 media.");
}

main()
  .catch((e) => {
    console.error("❌ Error while seeding media:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
