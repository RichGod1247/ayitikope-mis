import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

/**
 * Always load prisma/.env for seed scripts,
 * so Prisma gets the right DATABASE_URL even when Prisma config skips env loading.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// prisma/seed -> prisma/.env
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Optional: sanity log WITHOUT exposing password
try {
  if (process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL);
    console.log("🔌 DB target:", `${u.hostname}:${u.port}`, "| user:", u.username);
  } else {
    console.log("⚠️ DATABASE_URL is missing. Check prisma/.env");
  }
} catch {
  console.log("⚠️ DATABASE_URL exists but is not a valid URL format. Check prisma/.env");
}

const prisma = new PrismaClient();

type MediaSeedRow = {
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
  tags?: string[];
};

async function mainReal() {
  const seedPath = path.join(
    __dirname,
    "curriculum",
    "basic-1-our-world-and-our-people-media.json"
  );

  console.log("📖 Loading B1 OWOP media seed from:", seedPath);

  const raw = fs.readFileSync(seedPath, "utf8");
  const items: MediaSeedRow[] = JSON.parse(raw);

  console.log("   Items in JSON:", items.length);
  console.log();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of items) {
    console.log(
      `→ Processing indicator ${row.indicatorCode} (${row.subjectSlug})`
    );

    const indicator = await prisma.curriculumIndicator.findFirst({
      where: {
        code: row.indicatorCode,
        contentStandard: {
          code: row.contentStandardCode,
          subStrand: {
            code: row.subStrandCode,
            strand: {
              code: row.strandCode,
              subject: {
                slug: row.subjectSlug,
              },
            },
          },
        },
      },
      include: { media: true },
    });

    if (!indicator) {
      console.log(
        `   ⚠️ Could not find indicator ${row.indicatorCode} (subjectSlug=${row.subjectSlug}). Skipping.\n`
      );
      skipped++;
      continue;
    }

    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicatorId: indicator.id,
        imagePath: row.imagePath,
      },
    });

    if (existing) {
      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data: {
          figureLabel: row.figureLabel,
          imagePath: row.imagePath,
          altText: row.altText,
          detailedDescription: row.detailedDescription,
          tags: row.tags ? row.tags.join(", ") : undefined,
          pageNumberInPdf: row.pageNumberInPdf,
        },
      });
      console.log(`   ✅ Updated (id=${existing.id})\n`);
      updated++;
    } else {
      const newRow = await prisma.curriculumMedia.create({
        data: {
          figureLabel: row.figureLabel,
          imagePath: row.imagePath,
          altText: row.altText,
          detailedDescription: row.detailedDescription,
          tags: row.tags ? row.tags.join(", ") : undefined,
          pageNumberInPdf: row.pageNumberInPdf,
          indicator: { connect: { id: indicator.id } },
        },
      });
      console.log(`   ✅ Created (id=${newRow.id})\n`);
      created++;
    }
  }

  console.log("🎉 Done seeding B1 OWOP media.");
  console.log({ created, updated, skipped });
}

async function main() {
  try {
    await mainReal();
  } catch (err) {
    console.error("❌ Error in B1 OWOP media seed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
