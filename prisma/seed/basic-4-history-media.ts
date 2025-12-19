// prisma/seed/basic-4-history-media.ts
// Seed CurriculumMedia for Basic 4 History
// @ts-nocheck

import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUBJECT_SLUG = "basic-4-history";
const MEDIA_JSON_FILE = "basic-4-history-media.json";

function argHas(flag: string) {
  return process.argv.slice(2).includes(flag);
}

async function loadItems() {
  const curriculumDir = path.join(__dirname, "curriculum");
  const filePath = path.join(curriculumDir, MEDIA_JSON_FILE);

  console.log(`📦 Loading media JSON from: ${filePath}`);

  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);

  const items = Array.isArray(parsed) ? parsed : parsed?.items ?? [];
  if (!Array.isArray(items)) throw new Error("Media JSON must be an array, or { items: [] }");

  console.log(`✅ Items in JSON: ${items.length}`);
  return items;
}

// Robust indicator lookup (tries subject-scoped relation filter, then falls back to code-only)
async function findIndicatorByCode(indicatorCode: string) {
  // Try relation filter (preferred)
  try {
    const hit = await prisma.curriculumIndicator.findFirst({
      where: {
        code: indicatorCode,
        contentStandard: {
          subStrand: {
            strand: {
              subject: {
                slug: SUBJECT_SLUG,
              },
            },
          },
        },
      },
      select: { id: true },
    });
    if (hit?.id) return hit.id;
  } catch (_) {
    // ignore and fallback
  }

  // Fallback: code-only
  const hit2 = await prisma.curriculumIndicator.findFirst({
    where: { code: indicatorCode },
    select: { id: true },
  });

  return hit2?.id ?? null;
}

function tagsToString(tags: any): string | null {
  if (tags == null) return null;
  if (Array.isArray(tags)) return tags.map(String).join(", ");
  if (typeof tags === "string") return tags;
  return String(tags);
}

async function main() {
  const CHECK_MODE = argHas("--check");
  const items = await loadItems();

  if (CHECK_MODE) {
    console.log(`🔎 CHECK MODE: verifying indicators exist for ${SUBJECT_SLUG} (no writes)`);
  } else {
    console.log(`🚀 Seeding CurriculumMedia for ${SUBJECT_SLUG}`);
  }

  for (const item of items) {
    const csCode = item.contentStandardCode ? String(item.contentStandardCode) : "";
    const indCode = String(item.indicatorCode);

    const indicatorId = await findIndicatorByCode(indCode);

    if (!indicatorId) {
      console.log(`❌ MISSING: ${csCode ? csCode + " / " : ""}${indCode}  (indicator not found)`);
      if (CHECK_MODE) continue;
      throw new Error(`Indicator not found for code: ${indCode} (subject: ${SUBJECT_SLUG})`);
    }

    const imagePath = String(item.imagePath);
    const altText = item.altText != null ? String(item.altText) : null;
    const detailedDescription =
      item.detailedDescription != null ? String(item.detailedDescription) : null;

    const tags = tagsToString(item.tags);
    const pageNumberInPdf =
      item.pageNumberInPdf != null ? Number(item.pageNumberInPdf) : null;

    if (CHECK_MODE) {
      console.log(
        `✅ OK: ${csCode ? csCode + " / " : ""}${indCode} → indicatorId=${indicatorId}, image=${imagePath}`
      );
      continue;
    }

    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicatorId,
        imagePath,
      },
      select: { id: true },
    });

    if (existing?.id) {
      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data: {
          altText,
          detailedDescription,
          tags,
          pageNumberInPdf,
        },
      });
      console.log(
        `♻️ updated: ${csCode ? csCode + " / " : ""}${indCode} → ${imagePath} (tags→string)`
      );
    } else {
      await prisma.curriculumMedia.create({
        data: {
          indicatorId,
          imagePath,
          altText,
          detailedDescription,
          tags,
          pageNumberInPdf,
        },
      });
      console.log(
        `➕ created: ${csCode ? csCode + " / " : ""}${indCode} → ${imagePath} (tags→string)`
      );
    }
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
