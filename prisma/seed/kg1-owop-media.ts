// prisma/seed/kg1-owop-media.ts
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// prisma/seed -> prisma/.env
dotenv.config({ path: path.join(__dirname, "..", ".env") });

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
    "kg1-our-world-and-our-people-media.clean.json"
  );

  console.log("📖 Loading KG1 OWOP media seed from:", seedPath);

  const raw = fs.readFileSync(seedPath, "utf8");
  const items: MediaSeedRow[] = JSON.parse(raw);

  if (!items.length) {
    throw new Error("No rows found in kg1-our-world-and-our-people-media.clean.json");
  }

  const subjectSlug = items[0].subjectSlug;

  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true, name: true, slug: true },
  });

  if (!subject) {
    throw new Error(
      `CurriculumSubject not found for slug='${subjectSlug}'. Seed KG1 curriculum first.`
    );
  }

  console.log(`   ✅ Using subject '${subject.name}' (id=${subject.id})`);
  console.log(`   Items in JSON: ${items.length}`);

  // Deterministic reset of subject media
  const deleted = await prisma.curriculumMedia.deleteMany({
    where: { subjectId: subject.id },
  });

  console.log(`   🗑️ Deleted existing media rows for subject: ${deleted.count}`);
  console.log();

  let created = 0;
  let skipped = 0;

  for (const row of items) {
    console.log(`→ Processing ${row.indicatorCode}`);

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
      select: { id: true, code: true },
    });

    if (!indicator) {
      console.log(
        `   ⚠️ Could not find indicator ${row.indicatorCode} under ${row.subjectSlug}. Skipping.\n`
      );
      skipped++;
      continue;
    }

    const imagePath = row.imagePath.replace(/^\/+/, "");

    const createdRow = await prisma.curriculumMedia.create({
      data: {
        subjectId: subject.id,
        indicatorId: indicator.id,
        figureLabel: row.figureLabel,
        imagePath,
        altText: row.altText,
        detailedDescription: row.detailedDescription,
        tags: row.tags ? row.tags.join(", ") : undefined,
        pageNumberInPdf: row.pageNumberInPdf,
      },
    });

    console.log(`   ✅ Created media row ${createdRow.id}\n`);
    created++;
  }

  console.log("🎉 Done seeding KG1 OWOP media.");
  console.log({ created, skipped });
}

async function main() {
  try {
    await mainReal();
  } catch (err) {
    console.error("❌ Error in KG1 OWOP media seed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();