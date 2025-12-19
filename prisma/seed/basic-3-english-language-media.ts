// prisma/seed/basic-3-english-language-media.ts
import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

// ESM-friendly __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Basic3EnglishMediaEntry {
  indicatorCode: string; // e.g. "B3.1.1.1.1"
  slug?: string;
  imageName?: string;
  imageFilename?: string;
  fileName?: string;
  imagePath?: string; // from your JSON
}

// Match the subject slug in your curriculum table
const SUBJECT_SLUG = "basic-3-english-language";

// For Basic 3 we are using PNGs
const IMAGE_EXTENSION = ".png";

// Map strand number → folder name
const STRAND_FOLDER_MAP: Record<string, string> = {
  "1": "strand-1-oral-language",
  "2": "strand-2-reading",
  "4": "strand-4-writing",
  "5": "strand-5-grammar-and-usage",
  "6": "strand-6-extensive-reading",
};

function slugToHuman(s: string): string {
  return s.replace(/-/g, " ");
}

function buildAltText(slug: string, entry: Basic3EnglishMediaEntry): string {
  return `Illustration for ${entry.indicatorCode}: ${slugToHuman(
    slug
  )}, Basic 3 English Language.`;
}

function buildDetailedDescription(
  slug: string,
  entry: Basic3EnglishMediaEntry
): string {
  return `Contextual image for Basic 3 English Language indicator ${
    entry.indicatorCode
  }, depicting: ${slugToHuman(
    slug
  )}. Designed to support critical thinking, communication, and deeper understanding for lower primary learners in Africa’s transformation era.`;
}

async function main() {
  console.log("📦 Seeding Basic 3 English Language media from JSON");

  // 🔍 CRITICAL: show exactly which DB we are writing to
  console.log("DATABASE_URL at runtime:", process.env.DATABASE_URL);

  const jsonPath = path.join(
    __dirname,
    "curriculum",
    "basic-3-english-language-media.json"
  );

  const raw = await fs.readFile(jsonPath, "utf8");
  const entries: Basic3EnglishMediaEntry[] = JSON.parse(raw);

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

    if (processed === 1) {
      console.log("🔎 Example media JSON entry:", entry);
    }

    // 1️⃣ Find the indicator
    const indicator = await prisma.curriculumIndicator.findFirst({
      where: { code: entry.indicatorCode },
    });

    if (!indicator) {
      console.warn(
        `⚠️  Skipping: indicator with code "${entry.indicatorCode}" not found`
      );
      skipped += 1;
      continue;
    }

    // 2️⃣ Resolve baseSlug
    const rawSlug =
      entry.slug ??
      entry.imageName ??
      entry.imageFilename ??
      entry.fileName ??
      entry.imagePath;

    if (!rawSlug) {
      console.warn(
        `⚠️  Skipping ${entry.indicatorCode} – no usable slug/imageName/imageFilename/fileName/imagePath in JSON entry:`,
        entry
      );
      skipped += 1;
      continue;
    }

    const baseSlug = rawSlug.replace(/\.(png|webp|jpe?g)$/i, "");

    // 3️⃣ Strand folder from indicator code
    const parts = entry.indicatorCode.split(".");
    const strandNumber = parts[1]; // e.g. "1" from "B3.1.6.1.2"

    const strandFolder = STRAND_FOLDER_MAP[strandNumber];
    if (!strandFolder) {
      console.warn(
        `⚠️  No strand folder mapping for indicator "${entry.indicatorCode}". Skipping "${baseSlug}".`
      );
      skipped += 1;
      continue;
    }

    // 4️⃣ Build imagePath
    const imagePath = path.posix.join(
      "/curriculum/basic-3/english-language",
      strandFolder,
      `${baseSlug}${IMAGE_EXTENSION}`
    );

    // 5️⃣ Upsert CurriculumMedia
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
          tags: existing.tags ?? "",
        },
      });
      updated += 1;
      console.log(`📝 Updated media: ${indicator.code} (${baseSlug})`);
    } else {
      await prisma.curriculumMedia.create({
        data: {
          subjectId: subject.id,
          indicatorId: indicator.id,
          imagePath,
          tags: "",
          pageNumberInPdf: 0,
          altText: buildAltText(baseSlug, entry),
          detailedDescription: buildDetailedDescription(baseSlug, entry),
        },
      });
      created += 1;
      console.log(`✅ Created media: ${indicator.code} (${baseSlug})`);
    }
  }

  console.log(
    `🎉 Done seeding Basic 3 English Language media. Processed: ${processed}, Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`
  );
}

main()
  .catch((err) => {
    console.error("❌ Error seeding Basic 3 English media");
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
