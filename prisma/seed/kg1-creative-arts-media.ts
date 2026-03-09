// prisma/seed/kg1-creative-arts-media.ts
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

function cleanStr(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeImagePath(value: string): string {
  return cleanStr(value).replace(/^\/+/, "");
}

function normalizeTags(tags?: string[]): string | undefined {
  if (!Array.isArray(tags) || tags.length === 0) return undefined;

  const cleaned = tags.map((t) => cleanStr(t)).filter(Boolean);
  return cleaned.length ? cleaned.join(", ") : undefined;
}

function resolveSeedPath(): string {
  const candidates = [
    path.join(__dirname, "curriculum", "kg1-creative-arts-media.clean.json"),
    path.join(__dirname, "curriculum", "kg1-creative-arts-media.json"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    [
      "Seed file not found. Checked:",
      ...candidates.map((p) => `- ${p}`),
      "Rename your file to one of the above or place it in prisma/seed/curriculum.",
    ].join("\n")
  );
}

function validateRow(row: MediaSeedRow, index: number) {
  const prefix = `Row ${index + 1}`;

  if (!cleanStr(row.subjectSlug)) throw new Error(`${prefix}: subjectSlug is required`);
  if (!cleanStr(row.phase)) throw new Error(`${prefix}: phase is required`);
  if (!cleanStr(row.level)) throw new Error(`${prefix}: level is required`);

  if (!cleanStr(row.strandCode)) throw new Error(`${prefix}: strandCode is required`);
  if (!cleanStr(row.subStrandCode)) throw new Error(`${prefix}: subStrandCode is required`);
  if (!cleanStr(row.contentStandardCode)) {
    throw new Error(`${prefix}: contentStandardCode is required`);
  }
  if (!cleanStr(row.indicatorCode)) throw new Error(`${prefix}: indicatorCode is required`);

  if (
    typeof row.pageNumberInPdf !== "number" ||
    !Number.isInteger(row.pageNumberInPdf)
  ) {
    throw new Error(`${prefix}: pageNumberInPdf must be an integer`);
  }

  if (!cleanStr(row.imagePath)) throw new Error(`${prefix}: imagePath is required`);
  if (!cleanStr(row.altText)) throw new Error(`${prefix}: altText is required`);
  if (!cleanStr(row.detailedDescription)) {
    throw new Error(`${prefix}: detailedDescription is required`);
  }
}

async function mainReal() {
  const seedPath = resolveSeedPath();

  console.log("📖 Loading KG1 Creative Arts media seed from:", seedPath);

  const raw = fs.readFileSync(seedPath, "utf8");
  const items = JSON.parse(raw) as MediaSeedRow[];

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("No rows found in KG1 Creative Arts media JSON.");
  }

  items.forEach((row, index) => validateRow(row, index));

  const subjectSlug = cleanStr(items[0].subjectSlug);

  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true, name: true, slug: true },
  });

  if (!subject) {
    throw new Error(
      `CurriculumSubject not found for slug='${subjectSlug}'. Seed KG1 Creative Arts curriculum first.`
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
        code: cleanStr(row.indicatorCode),
        contentStandard: {
          code: cleanStr(row.contentStandardCode),
          subStrand: {
            code: cleanStr(row.subStrandCode),
            strand: {
              code: cleanStr(row.strandCode),
              subject: {
                slug: cleanStr(row.subjectSlug),
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

    const createdRow = await prisma.curriculumMedia.create({
      data: {
        subjectId: subject.id,
        indicatorId: indicator.id,
        figureLabel: cleanStr(row.figureLabel) || undefined,
        imagePath: normalizeImagePath(row.imagePath),
        altText: cleanStr(row.altText),
        detailedDescription: cleanStr(row.detailedDescription),
        tags: normalizeTags(row.tags),
        pageNumberInPdf: row.pageNumberInPdf,
      },
    });

    console.log(`   ✅ Created media row ${createdRow.id}\n`);
    created++;
  }

  console.log("🎉 Done seeding KG1 Creative Arts media.");
  console.log({ created, skipped });
}

async function main() {
  try {
    await mainReal();
  } catch (err) {
    console.error("❌ Error in KG1 Creative Arts media seed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();