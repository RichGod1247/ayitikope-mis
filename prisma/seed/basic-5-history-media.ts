// prisma/seed/basic-5-history-media.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SUBJECT_SLUG = "basic-5-history";
const MEDIA_JSON_FILE = "basic-5-history-media.json";

type MediaItem = {
  contentStandardCode: string;
  indicatorCode: string;
  image: string; // maps to CurriculumMedia.imagePath
  pageNumberInPdf?: number;
  figureLabel?: string;
  altText?: string;
  detailedDescription?: string;
  tags?: string | string[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getCurriculumPath(fileName: string) {
  return path.join(__dirname, "curriculum", fileName);
}

function asTagsString(tags?: string | string[]) {
  if (!tags) return null;
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean).join(", ");
  return String(tags).trim() || null;
}

function safeString(s: unknown, fallback: string) {
  const v = typeof s === "string" ? s.trim() : "";
  return v.length ? v : fallback;
}

async function findIndicatorStrict(subjectSlug: string, csCode: string, indCode: string) {
  return prisma.curriculumIndicator.findFirst({
    where: {
      code: indCode,
      contentStandard: {
        code: csCode,
        subStrand: {
          strand: {
            subject: { slug: subjectSlug },
          },
        },
      },
    },
    select: {
      id: true,
      code: true,
      description: true,
      contentStandard: { select: { code: true, description: true } },
    },
  });
}

async function upsertIndicatorMedia(indicatorId: string, imagePath: string, data: any) {
  const existing = await prisma.curriculumMedia.findFirst({
    where: { indicatorId, imagePath },
    select: { id: true },
  });

  if (existing) {
    await prisma.curriculumMedia.update({
      where: { id: existing.id },
      data,
    });
    return "updated";
  }

  await prisma.curriculumMedia.create({
    data,
  });
  return "created";
}

async function main() {
  const checkMode = process.argv.includes("--check");

  const filePath = getCurriculumPath(MEDIA_JSON_FILE);
  console.log(`📦 Loading media JSON from: ${filePath}`);

  const raw = fs.readFileSync(filePath, "utf8");
  const items = JSON.parse(raw) as MediaItem[];

  console.log(`✅ Items in JSON: ${items.length}`);

  console.log(
    checkMode
      ? `🔎 CHECK MODE: verifying indicators exist for ${SUBJECT_SLUG} (no writes)`
      : `🚀 Seeding CurriculumMedia for ${SUBJECT_SLUG}`
  );

  for (const item of items) {
    const csCode = item.contentStandardCode;
    const indCode = item.indicatorCode;
    const imagePath = item.image;

    if (!csCode || !indCode || !imagePath) {
      console.log(`❌ Bad item (missing contentStandardCode/indicatorCode/image):`, item);
      continue;
    }

    const ind = await findIndicatorStrict(SUBJECT_SLUG, csCode, indCode);

    if (!ind) {
      console.log(`❌ Missing Indicator: ${csCode} / ${indCode}`);
      continue;
    }

    console.log(
      `✅ OK: ${csCode} / ${indCode} → indicatorId=${ind.id}, image=${imagePath}`
    );

    if (checkMode) continue;

    // REQUIRED fields (per your schema)
    const pageNumberInPdf = Number.isFinite(Number(item.pageNumberInPdf))
      ? Number(item.pageNumberInPdf)
      : 0;

    // Auto-generate strong defaults so seeding never fails again
    const fallbackAlt = `Illustration for ${ind.code}: ${ind.description}`;
    const altText = safeString(item.altText, fallbackAlt);

    const fallbackDetailed = `This image supports Indicator ${ind.code} (${ind.description}). Content Standard ${ind.contentStandard.code}: ${ind.contentStandard.description}.`;
    const detailedDescription = safeString(item.detailedDescription, fallbackDetailed);

    const data = {
      indicatorId: ind.id,
      pageNumberInPdf,
      figureLabel: item.figureLabel ?? null,
      imagePath,
      altText,
      detailedDescription,
      tags: asTagsString(item.tags),
    };

    const action = await upsertIndicatorMedia(ind.id, imagePath, data);
    console.log(`➕ ${action}: ${csCode} / ${indCode} → ${imagePath}`);
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
