// prisma/seed/basic-6-history-media.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SUBJECT_SLUG = "basic-6-history";
const MEDIA_JSON_FILE = "basic-6-history-media.json";

type MediaJsonItem = {
  subjectSlug: string;
  contentStandardCode: string;
  indicatorCode: string;

  pageNumberInPdf: number;
  figureLabel?: string | null;

  // allow either key (people sometimes use "image" in older files)
  imagePath?: string;
  image?: string;

  altText: string;
  detailedDescription: string;
  tags?: string | null;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getMediaJsonPath(fileName: string) {
  return path.join(__dirname, "curriculum", fileName);
}

function mustString(v: unknown, field: string) {
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`Missing/invalid required string field: ${field}`);
  }
  return v.trim();
}

function mustInt(v: unknown, field: string) {
  if (typeof v !== "number" || !Number.isInteger(v)) {
    throw new Error(`Missing/invalid required Int field: ${field}`);
  }
  return v;
}

async function findContentStandardId(subjectSlug: string, csCode: string) {
  const cs = await prisma.curriculumContentStandard.findFirst({
    where: {
      code: csCode,
      subStrand: {
        strand: {
          subject: { slug: subjectSlug },
        },
      },
    },
    select: { id: true },
  });

  return cs?.id ?? null;
}

async function findIndicatorId(subjectSlug: string, csCode: string, indicatorCode: string) {
  const csId = await findContentStandardId(subjectSlug, csCode);
  if (!csId) return null;

  const ind = await prisma.curriculumIndicator.findFirst({
    where: {
      code: indicatorCode,
      contentStandardId: csId,
    },
    select: { id: true },
  });

  return ind?.id ?? null;
}

async function upsertMedia(item: MediaJsonItem, checkOnly: boolean) {
  const subjectSlug = mustString(item.subjectSlug, "subjectSlug");
  const csCode = mustString(item.contentStandardCode, "contentStandardCode");
  const indicatorCode = mustString(item.indicatorCode, "indicatorCode");

  const imagePath = mustString(item.imagePath ?? item.image, "imagePath");
  const pageNumberInPdf = mustInt(item.pageNumberInPdf, "pageNumberInPdf");
  const altText = mustString(item.altText, "altText");
  const detailedDescription = mustString(item.detailedDescription, "detailedDescription");

  const indicatorId = await findIndicatorId(subjectSlug, csCode, indicatorCode);

  if (!indicatorId) {
    console.log(`❌ Missing Indicator: ${csCode} / ${indicatorCode}`);
    return { ok: false as const };
  }

  console.log(`✅ OK: ${csCode} / ${indicatorCode} → indicatorId=${indicatorId}, image=${imagePath}`);

  if (checkOnly) return { ok: true as const, skippedWrite: true as const };

  // also store subjectId/contentStandardId for easier querying later
  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true },
  });

  const csId = await findContentStandardId(subjectSlug, csCode);

  const where = {
    CurriculumMedia_indicator_image_unique: {
      indicatorId,
      imagePath,
    },
  };

  const dataCommon = {
    subjectId: subject?.id ?? null,
    contentStandardId: csId ?? null,
    indicatorId,

    pageNumberInPdf,
    figureLabel: item.figureLabel ?? null,
    imagePath,
    altText,
    detailedDescription,
    tags: item.tags ?? null,
  };

  const existing = await prisma.curriculumMedia.findUnique({
    where,
    select: { id: true },
  });

  if (existing) {
    await prisma.curriculumMedia.update({ where, data: dataCommon });
    console.log(`✏️ updated: ${csCode} / ${indicatorCode} → ${imagePath}`);
  } else {
    await prisma.curriculumMedia.create({ data: dataCommon });
    console.log(`➕ created: ${csCode} / ${indicatorCode} → ${imagePath}`);
  }

  return { ok: true as const };
}

async function main() {
  const checkOnly = process.argv.includes("--check");

  const filePath = getMediaJsonPath(MEDIA_JSON_FILE);
  console.log(`📦 Loading media JSON from: ${filePath}`);

  const raw = fs.readFileSync(filePath, "utf8");
  const items = JSON.parse(raw) as MediaJsonItem[];

  console.log(`✅ Items in JSON: ${items.length}`);
  if (checkOnly) console.log(`🔎 CHECK MODE: verifying indicators exist for ${SUBJECT_SLUG} (no writes)`);
  else console.log(`🚀 Seeding CurriculumMedia for ${SUBJECT_SLUG}`);

  for (const item of items) {
    await upsertMedia(item, checkOnly);
  }

  console.log("🎉 Done.");
}

main()
  .catch((e) => {
    console.error("❌ Media seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
