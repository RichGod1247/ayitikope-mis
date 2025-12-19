// prisma/seed/basic-3-history-media.ts
// Media seeder for Basic 3 History (idempotent + --check mode)
// Uses FULL code chain (subjectSlug + strand + substrand + contentStandard + indicator)
// Handles tags field as String in DB by JSON-stringifying arrays.

// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUBJECT_SLUG = "basic-3-history";
const MEDIA_JSON_FILE = "basic-3-history-media.json";

const CHECK_MODE = process.argv.includes("--check");

const models = {
  indicator:
    (prisma as any).curriculumIndicator ?? (prisma as any).indicator ?? null,
  media: (prisma as any).curriculumMedia ?? (prisma as any).media ?? null,
};

function ensureRequiredModels() {
  const missing: string[] = [];
  if (!models.indicator) missing.push("curriculumIndicator");
  if (!models.media) missing.push("curriculumMedia");
  if (missing.length) {
    const available = Object.keys(prisma as any).join(", ");
    throw new Error(
      `Missing Prisma delegates: ${missing.join(
        ", "
      )}\nAvailable: ${available}`
    );
  }
}

type MediaItem = {
  subjectSlug: string;
  strandCode: string;
  subStrandCode: string;
  contentStandardCode: string;
  indicatorCode: string;
  imagePath: string;
  altText: string;
  detailedDescription?: string | null;
  tags?: string[] | string | null;
  pageNumberInPdf?: number | null;
};

async function loadMedia(): Promise<MediaItem[]> {
  const filePath = path.join(__dirname, "curriculum", MEDIA_JSON_FILE);
  console.log(`📦 Loading media JSON from: ${filePath}`);
  const raw = await fs.readFile(filePath, "utf8");
  const json = JSON.parse(raw);
  if (!Array.isArray(json)) throw new Error("Media JSON must be an array.");
  console.log(`✅ Items in JSON: ${json.length}`);
  return json as MediaItem[];
}

function tagsToString(tags: MediaItem["tags"]): string | null {
  if (tags == null) return null;
  if (typeof tags === "string") return tags;
  if (Array.isArray(tags)) return JSON.stringify(tags);
  return JSON.stringify([String(tags)]);
}

async function findIndicatorId(item: MediaItem): Promise<string | null> {
  // Full-chain query to prevent wrong attachments
  const found = await models.indicator.findFirst({
    where: {
      code: item.indicatorCode,
      contentStandard: {
        code: item.contentStandardCode,
        subStrand: {
          code: item.subStrandCode,
          strand: {
            code: item.strandCode,
            subject: { slug: item.subjectSlug },
          },
        },
      },
    },
    select: { id: true },
  });

  return found?.id ?? null;
}

async function upsertMedia(item: MediaItem, indicatorId: string) {
  const existing = await models.media.findFirst({
    where: { indicatorId, imagePath: item.imagePath },
    select: { id: true },
  });

  const data: any = {
    indicatorId,
    imagePath: item.imagePath,
    altText: item.altText,
    detailedDescription: item.detailedDescription ?? null,
    tags: tagsToString(item.tags), // DB expects String | Null
    pageNumberInPdf: item.pageNumberInPdf ?? null,
  };

  if (existing) {
    await models.media.update({ where: { id: existing.id }, data });
    return "updated";
  }

  await models.media.create({ data });
  return "created";
}

async function main() {
  ensureRequiredModels();

  const items = await loadMedia();

  console.log(
    CHECK_MODE
      ? `🔎 CHECK MODE: verifying indicators exist for ${SUBJECT_SLUG} (no writes)`
      : `🚀 Seeding CurriculumMedia for ${SUBJECT_SLUG}`
  );

  for (const item of items) {
    if (item.subjectSlug !== SUBJECT_SLUG) {
      console.warn(
        `⚠️ Skipping item with subjectSlug=${item.subjectSlug} (expected ${SUBJECT_SLUG})`
      );
      continue;
    }

    const indicatorId = await findIndicatorId(item);
    if (!indicatorId) {
      throw new Error(
        `Indicator not found for:\n` +
          `subject=${item.subjectSlug}\nstrand=${item.strandCode}\nsubStrand=${item.subStrandCode}\ncontentStandard=${item.contentStandardCode}\nindicator=${item.indicatorCode}\n` +
          `Fix codes in basic-3-history.json (especially B3.2.2.1.1) and re-seed.`
      );
    }

    if (CHECK_MODE) {
      console.log(
        `✅ OK: ${item.contentStandardCode} / ${item.indicatorCode} → indicatorId=${indicatorId}, image=${item.imagePath}`
      );
      continue;
    }

    const action = await upsertMedia(item, indicatorId);
    console.log(
      `➕ ${action}: ${item.contentStandardCode} / ${item.indicatorCode} → ${item.imagePath} (tags→string)`
    );
  }

  console.log("🎉 Done.");
}

main()
  .catch((err) => {
    console.error("❌ Media seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
