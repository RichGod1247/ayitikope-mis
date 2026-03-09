// prisma/seed/kg2-owop-media.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MediaSeed {
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
  tags?: string[] | string;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeTags(tags: string[] | string | undefined): string {
  if (Array.isArray(tags)) {
    return tags.map((t) => normalizeText(t)).filter(Boolean).join(", ");
  }
  return normalizeText(tags);
}

async function main() {
  const cliPath = process.argv[2];

  const seedPath = cliPath
    ? path.resolve(process.cwd(), cliPath)
    : path.join(
        __dirname,
        "curriculum",
        "kg2-our-world-and-our-people-media.clean.json"
      );

  console.log("📖 Loading KG2 OWOP media seed from:", seedPath);

  if (!fs.existsSync(seedPath)) {
    throw new Error(`Seed file not found: ${seedPath}`);
  }

  const raw = fs.readFileSync(seedPath, "utf8");
  const items = JSON.parse(raw) as MediaSeed[];

  if (!items.length) {
    throw new Error("Seed file is empty.");
  }

  console.log("   Items in JSON:", items.length);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    console.log(
      `\n→ Processing indicator ${item.indicatorCode} (${item.subjectSlug})`
    );

    const subject = await prisma.curriculumSubject.findUnique({
      where: { slug: item.subjectSlug },
    });

    if (!subject) {
      console.warn(`   ⚠️ Could not find subject ${item.subjectSlug}. Skipping.`);
      skipped++;
      continue;
    }

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
      skipped++;
      continue;
    }

    console.log(`   ✅ Found indicator ${item.indicatorCode} (id=${indicator.id})`);

    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicatorId: indicator.id,
        imagePath: normalizeText(item.imagePath),
      },
    });

    const tagsString = normalizeTags(item.tags);

    if (existing) {
      console.log(`   🔁 Existing media found (id=${existing.id}), updating...`);
      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data: {
          pageNumberInPdf: Number.isInteger(item.pageNumberInPdf)
            ? item.pageNumberInPdf
            : 0,
          figureLabel: normalizeText(item.figureLabel) || null,
          imagePath: normalizeText(item.imagePath),
          altText: normalizeText(item.altText),
          detailedDescription: normalizeText(item.detailedDescription),
          tags: tagsString,
          subject: {
            connect: { id: subject.id },
          },
          indicator: {
            connect: { id: indicator.id },
          },
        },
      });
      console.log("   ✅ Updated existing media row.");
      updated++;
    } else {
      console.log("   ➕ No existing media found, creating new row...");
      await prisma.curriculumMedia.create({
        data: {
          pageNumberInPdf: Number.isInteger(item.pageNumberInPdf)
            ? item.pageNumberInPdf
            : 0,
          figureLabel: normalizeText(item.figureLabel) || null,
          imagePath: normalizeText(item.imagePath),
          altText: normalizeText(item.altText),
          detailedDescription: normalizeText(item.detailedDescription),
          tags: tagsString,
          subject: {
            connect: { id: subject.id },
          },
          indicator: {
            connect: { id: indicator.id },
          },
        },
      });
      console.log("   ✅ Created CurriculumMedia row.");
      created++;
    }
  }

  console.log("\n🎉 Done seeding KG2 OWOP media.");
  console.log({ created, updated, skipped });
}

main()
  .catch((e) => {
    console.error("❌ Error in KG2 OWOP media seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });