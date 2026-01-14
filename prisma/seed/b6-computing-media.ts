/* prisma/seed/b6-computing-media.ts */
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type IndicatorSqlRow = {
  indicator_id: string;
  indicator_code: string;
  indicator_description: string;
  indicator_order?: number;
};

type CleanMediaRow = {
  // Some files include one or both; we support both safely:
  indicatorId?: string | null;
  indicatorCode?: string | null;

  indicatorDescription?: string | null;

  // Required for media record
  imagePath: string;
  altText?: string | null;
  detailedDescription?: string | null;
  tags?: string | null;

  pageNumberInPdf?: number | null;
  figureLabel?: string | null;
};

function readJson<T>(filePath: string): T {
  // Handles UTF-8 BOM safely
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as T;
}

function mustExist(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
}

function normalizeTags(tags?: string | null) {
  const base = ["curriculum", "upper-primary", "basic-6", "computing"];
  if (!tags || !tags.trim()) return base.join(",");
  // if tags already contains commas, keep but ensure base tokens exist
  const parts = tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  for (const b of base) if (!parts.includes(b)) parts.push(b);
  return parts.join(",");
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const doSeed = args.has("--seed");
  const doDryRun = !doSeed;

  const ROOT = process.cwd();

  const MEDIA_PATH = path.join(
    ROOT,
    "prisma",
    "seed",
    "curriculum",
    "basic-6-computing-media.clean.json"
  );
  const INDICATORS_PATH = path.join(
    ROOT,
    "prisma",
    "seed",
    "curriculum",
    "basic-6-computing-indicators.sql.json"
  );

  mustExist(MEDIA_PATH);
  mustExist(INDICATORS_PATH);

  console.log("📦 Seeding Basic 6 Computing media");
  console.log(`📖 media: ${MEDIA_PATH}`);
  console.log(`📖 indicators: ${INDICATORS_PATH}`);
  console.log(doDryRun ? "🧪 DRY RUN (no writes)" : "✅ SEED MODE (will write)");

  const media = readJson<CleanMediaRow[]>(MEDIA_PATH);
  const indicators = readJson<IndicatorSqlRow[]>(INDICATORS_PATH);

  const byCode = new Map<string, IndicatorSqlRow>();
  for (const r of indicators) byCode.set(r.indicator_code, r);

  let missingIndicatorId = 0;
  let missingIndicatorCode = 0;
  let missingIndicatorLookup = 0;

  // Pre-check
  for (const m of media) {
    const hasId = !!m.indicatorId?.trim();
    const hasCode = !!m.indicatorCode?.trim();

    if (!hasId) missingIndicatorId++;
    if (!hasCode) missingIndicatorCode++;

    if (!hasId && hasCode && !byCode.has(m.indicatorCode!.trim())) {
      missingIndicatorLookup++;
    }
  }

  if (missingIndicatorLookup > 0) {
    console.warn(
      `⚠️ ${missingIndicatorLookup} media rows have indicatorCode not found in indicators SQL JSON. Those rows will FAIL unless fixed.`
    );
  }

  console.log(
    `🔎 Rows: ${media.length} | missing indicatorId: ${missingIndicatorId} | missing indicatorCode: ${missingIndicatorCode}`
  );

  let upserted = 0;

  for (const m of media) {
    const imagePath = (m.imagePath || "").trim();
    if (!imagePath) {
      throw new Error("Found media row with empty imagePath.");
    }

    // Resolve indicatorId
    let indicatorId = (m.indicatorId || "").trim();
    const indicatorCode = (m.indicatorCode || "").trim();

    if (!indicatorId) {
      if (!indicatorCode) {
        throw new Error(
          `Media row missing BOTH indicatorId and indicatorCode for imagePath=${imagePath}`
        );
      }
      const match = byCode.get(indicatorCode);
      if (!match) {
        throw new Error(
          `No indicator match for indicatorCode=${indicatorCode} (imagePath=${imagePath})`
        );
      }
      indicatorId = match.indicator_id;
    }

    const indicatorDescFromSql = indicatorCode
      ? byCode.get(indicatorCode)?.indicator_description ?? null
      : null;

    const altText =
      (m.altText && m.altText.trim()) ||
      (indicatorCode && indicatorDescFromSql
        ? `Basic 6 Computing ${indicatorCode}: ${indicatorDescFromSql}`
        : `Basic 6 Computing media`);

    const detailedDescription =
      (m.detailedDescription && m.detailedDescription.trim()) ||
      (indicatorCode && indicatorDescFromSql
        ? `Illustration for Basic 6 Computing indicator ${indicatorCode} — ${indicatorDescFromSql}.`
        : `Illustration for Basic 6 Computing.`);

    const tags = normalizeTags(m.tags ?? undefined);

    const pageNumberInPdf =
      typeof m.pageNumberInPdf === "number" ? m.pageNumberInPdf : 0;

    const figureLabel = m.figureLabel ?? null;

    if (doDryRun) {
      console.log(
        `🧪 would upsert: ${indicatorCode || "(no code)"} → ${imagePath}`
      );
      continue;
    }

    // IMPORTANT:
    // Your Prisma error shows the unique input is:
    // { id } OR { CurriculumMedia_indicator_image_unique: { ... } }
    // So we upsert using that compound unique.
    await prisma.curriculumMedia.upsert({
      where: {
        CurriculumMedia_indicator_image_unique: {
          indicatorId,
          imagePath,
        },
      },
      update: {
        imagePath,
        altText,
        detailedDescription,
        tags,
        pageNumberInPdf,
        figureLabel,
        indicator: { connect: { id: indicatorId } },
      },
      create: {
        imagePath,
        altText,
        detailedDescription,
        tags,
        pageNumberInPdf,
        figureLabel,
        indicator: { connect: { id: indicatorId } },
      },
    });

    upserted++;
    if (upserted % 25 === 0) console.log(`…upserted ${upserted}/${media.length}`);
  }

  if (doDryRun) {
    console.log("✅ Dry run complete.");
  } else {
    console.log(`✅ Done. Upserted ${upserted}/${media.length} media records.`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
