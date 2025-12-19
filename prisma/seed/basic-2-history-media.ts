// prisma/seed/basic-2-history-media.ts
// Seeds CurriculumMedia for Basic 2 History indicators (with --check mode)

// @ts-nocheck

import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUBJECT_SLUG = "basic-2-history";
const MEDIA_JSON_FILE = "basic-2-history-media.json";

const args = process.argv.slice(2);
const CHECK_MODE = args.includes("--check");

// ---- Model aliases (keep consistent with your working seeders) ----
const models = {
  media: (prisma as any).curriculumMedia ?? (prisma as any).media ?? null,
  indicator:
    (prisma as any).curriculumIndicator ?? (prisma as any).indicator ?? null,
};

function ensureRequiredModels() {
  const missing: string[] = [];
  if (!models.media) missing.push("curriculumMedia");
  if (!models.indicator) missing.push("curriculumIndicator");

  if (missing.length > 0) {
    const available = Object.keys(prisma as any).join(", ");
    throw new Error(
      `Required Prisma models missing: ${missing.join(
        ", "
      )}\nAvailable prisma delegates: ${available}`
    );
  }
}

type MediaJsonItem = {
  subjectSlug: string;
  contentStandardCode: string; // REQUIRED (B2 has a duplicate indicator code)
  indicatorCode: string;
  imagePath: string;
  altText: string;
  detailedDescription?: string | null;
  tags?: string[] | string | null;
  pageNumberInPdf?: number | null;
};

async function loadMediaJson(): Promise<MediaJsonItem[]> {
  const curriculumDir = path.join(__dirname, "curriculum");
  const filePath = path.join(curriculumDir, MEDIA_JSON_FILE);

  console.log(`📦 Loading media JSON from: ${filePath}`);
  const raw = await fs.readFile(filePath, "utf8");
  const json = JSON.parse(raw);

  if (!Array.isArray(json)) {
    throw new Error(`Media JSON must be an array. Got: ${typeof json}`);
  }
  return json as MediaJsonItem[];
}

function tagsToString(tags: MediaJsonItem["tags"]): string | null {
  if (tags == null) return null;
  if (Array.isArray(tags)) return tags.join(", ");
  if (typeof tags === "string") return tags;
  return String(tags);
}

async function findIndicatorId(item: MediaJsonItem): Promise<string | null> {
  // Disambiguate by subjectSlug + contentStandardCode + indicatorCode
  // Expected relations: Indicator -> ContentStandard -> SubStrand -> Strand -> Subject
  const indicator = await models.indicator.findFirst({
    where: {
      code: item.indicatorCode,
      contentStandard: {
        code: item.contentStandardCode,
        subStrand: {
          strand: {
            subject: {
              slug: item.subjectSlug,
            },
          },
        },
      },
    },
    select: { id: true },
  });

  return indicator?.id ?? null;
}

async function upsertMedia(item: MediaJsonItem, indicatorId: string) {
  const tags = tagsToString(item.tags);

  const existing = await models.media.findFirst({
    where: { indicatorId },
    select: { id: true },
  });

  const data = {
    indicatorId,
    imagePath: item.imagePath,
    altText: item.altText,
    detailedDescription: item.detailedDescription ?? null,
    tags, // IMPORTANT: schema expects String | Null
    pageNumberInPdf: item.pageNumberInPdf ?? null,
  };

  if (existing) {
    await models.media.update({
      where: { id: existing.id },
      data,
    });
    return "updated";
  } else {
    await models.media.create({ data });
    return "created";
  }
}

async function main() {
  ensureRequiredModels();

  const items = await loadMediaJson();
  console.log(`✅ Items in JSON: ${items.length}`);

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

    if (!item.contentStandardCode) {
      throw new Error(
        `Missing contentStandardCode for indicator ${item.indicatorCode}. This is REQUIRED for B2.`
      );
    }

    const indicatorId = await findIndicatorId(item);

    if (!indicatorId) {
      throw new Error(
        `Indicator not found: subject=${item.subjectSlug}, contentStandard=${item.contentStandardCode}, indicator=${item.indicatorCode}\n` +
          `Fix your curriculum seed or correct codes in the media JSON.`
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
