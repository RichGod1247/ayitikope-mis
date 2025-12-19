// prisma/seed/basic-2-english-language-media.ts
import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

// ESM-friendly __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Basic2EnglishMediaEntry {
  indicatorCode: string;
  slug: string;
}

const SUBJECT_SLUG = "basic-2-english-language";

// Adjust this to match how you're saving the files under /public
// If you save PNGs instead, change this to ".png"
const IMAGE_EXTENSION = ".webp";

const STRAND_FOLDER_MAP: Record<string, string> = {
  "1": "strand-1-oral-language",
  "2": "strand-2-reading",
  "4": "strand-4-writing",
  "5": "strand-5-grammar-usage",
  "6": "strand-6-extensive-reading",
};

function slugToHuman(slug: string): string {
  return slug.replace(/-/g, " ");
}

function buildAltText(entry: Basic2EnglishMediaEntry): string {
  return `Illustration for ${entry.indicatorCode}: ${slugToHuman(
    entry.slug
  )}, Basic 2 English Language.`;
}

function buildDetailedDescription(entry: Basic2EnglishMediaEntry): string {
  return `Contextual image for Basic 2 English Language indicator ${entry.indicatorCode}, depicting: ${slugToHuman(
    entry.slug
  )}. Designed to support critical thinking, communication, and deeper understanding for lower primary learners.`;
}

async function main() {
  console.log("📦 Seeding Basic 2 English Language media from JSON");

  const jsonPath = path.join(
    __dirname,
    "curriculum",
    "basic-2-english-language-media.json"
  );

  const raw = await fs.readFile(jsonPath, "utf8");
  const entries: Basic2EnglishMediaEntry[] = JSON.parse(raw);

  console.log(`🔍 Found ${entries.length} media entries in JSON`);

  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: SUBJECT_SLUG },
  });

  if (!subject) {
    throw new Error(
      `CurriculumSubject with slug "${SUBJECT_SLUG}" not found. Seed curriculum before media.`
    );
  }

  let processed = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const entry of entries) {
    processed += 1;

    // Use findFirst since 'code' is not unique in your schema
    const indicator = await prisma.curriculumIndicator.findFirst({
      where: { code: entry.indicatorCode },
    });

    if (!indicator) {
      console.warn(
        `⚠️  Skipping entry: indicator with code "${entry.indicatorCode}" not found for slug "${entry.slug}"`
      );
      skipped += 1;
      continue;
    }

    const parts = entry.indicatorCode.split(".");
    // e.g. "B2.1.6.1.2" -> parts[1] === "1"
    const strandNumber = parts[1];

    const strandFolder = STRAND_FOLDER_MAP[strandNumber];
    if (!strandFolder) {
      console.warn(
        `⚠️  No strand folder mapping for indicator "${entry.indicatorCode}". Skipping "${entry.slug}".`
      );
      skipped += 1;
      continue;
    }

    const imagePath = path.posix.join(
      "/curriculum/basic-2/english-language",
      strandFolder,
      `${entry.slug}${IMAGE_EXTENSION}`
    );

    // No composite unique in schema, so we manually find and branch
    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicatorId: indicator.id,
        imagePath,
      },
    });

    if (existing) {
      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data: {
          imagePath,
          // keep existing tags, ensure it's at least an empty string
          tags: existing.tags ?? "",
          // we *do not* overwrite altText / detailedDescription here
        },
      });
      updated += 1;
      console.log(`📝 Updated media: ${indicator.code} (${entry.slug})`);
    } else {
      await prisma.curriculumMedia.create({
        data: {
          subjectId: subject.id,
          indicatorId: indicator.id,
          imagePath,
          tags: "",
          // required fields in your schema
          pageNumberInPdf: 0,
          altText: buildAltText(entry),
          detailedDescription: buildDetailedDescription(entry),
        },
      });
      created += 1;
      console.log(`✅ Created media: ${indicator.code} (${entry.slug})`);
    }
  }

  console.log(
    `🎉 Done seeding Basic 2 English Language media. Processed: ${processed}, Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`
  );
}

main()
  .catch((err) => {
    console.error("❌ Error seeding Basic 2 English media");
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
