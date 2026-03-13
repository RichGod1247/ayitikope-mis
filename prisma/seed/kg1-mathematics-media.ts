// prisma/seed/kg1-mathematics-media.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// prisma/seed -> prisma/.env
dotenv.config({ path: path.join(__dirname, "..", ".env") });

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

type ExistingMediaRow = {
  id: string;
  indicatorId: string;
  imagePath: string;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeTags(tags: string[] | string | undefined): string {
  if (Array.isArray(tags)) {
    return tags
      .map((t) => normalizeText(t))
      .filter(Boolean)
      .join(", ");
  }
  return normalizeText(tags);
}

function normalizeStoragePath(value: unknown): string {
  const raw = String(value ?? "")
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .trim();

  if (!raw) return "";

  // Canonicalize known KG1 Mathematics legacy prefix.
  if (/^curriculum\/kg1\/mathematics\//i.test(raw)) {
    return raw.replace(
      /^curriculum\/kg1\/mathematics\//i,
      "lower-primary/kg1/mathematics/"
    );
  }

  return raw;
}

function makeIndicatorLookupKey(
  item: Pick<
    MediaSeed,
    "subjectSlug" | "strandCode" | "subStrandCode" | "contentStandardCode" | "indicatorCode"
  >
) {
  return [
    normalizeText(item.subjectSlug).toLowerCase(),
    normalizeText(item.strandCode).toLowerCase(),
    normalizeText(item.subStrandCode).toLowerCase(),
    normalizeText(item.contentStandardCode).toLowerCase(),
    normalizeText(item.indicatorCode).toLowerCase(),
  ].join("||");
}

function resolveSeedPath(cliPath?: string) {
  if (cliPath) {
    return path.resolve(process.cwd(), cliPath);
  }

  const candidates = [
    path.join(__dirname, "curriculum", "kg1-mathematics-media.clean.json"),
    path.join(__dirname, "curriculum", "kg1-mathematics-media.json"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(
    [
      "Seed file not found. Checked:",
      ...candidates.map((p) => `- ${p}`),
      "Provide a path explicitly or place the JSON in prisma/seed/curriculum.",
    ].join("\n")
  );
}

async function main() {
  const argv = process.argv.slice(2);

  const positional = argv.filter((x) => !x.startsWith("--"));
  const cliPath = positional[0];

  const DRY_RUN = argv.includes("--dry-run");
  const PRUNE_LEGACY = argv.includes("--prune-legacy");
  const PRUNE_TARGET_INDICATORS = argv.includes("--prune-target-indicators");

  const seedPath = resolveSeedPath(cliPath);

  console.log("📖 Loading KG1 Mathematics media seed from:", seedPath);
  console.log("   Flags:", {
    DRY_RUN,
    PRUNE_LEGACY,
    PRUNE_TARGET_INDICATORS,
  });

  if (!fs.existsSync(seedPath)) {
    throw new Error(`Seed file not found: ${seedPath}`);
  }

  const raw = fs.readFileSync(seedPath, "utf8");
  const items = JSON.parse(raw) as MediaSeed[];

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Seed JSON is empty or invalid.");
  }

  console.log("   Items in JSON:", items.length);

  const subjectSlugs = [...new Set(items.map((x) => normalizeText(x.subjectSlug)).filter(Boolean))];
  if (subjectSlugs.length !== 1) {
    throw new Error(
      `Expected a single subjectSlug in this seed file. Found: ${subjectSlugs.join(", ")}`
    );
  }

  const subjectSlug = subjectSlugs[0]!;
  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true, name: true, slug: true },
  });

  if (!subject) {
    throw new Error(
      `CurriculumSubject not found for slug='${subjectSlug}'. Seed the curriculum tree first.`
    );
  }

  console.log(`   Subject slug: ${subjectSlug}`);
  console.log(`   ✅ Using subject '${subject.name}' (id=${subject.id})`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let deletedLegacy = 0;
  let deletedPruned = 0;

  const indicatorCache = new Map<string, { id: string } | null>();

  const resolvedItems: Array<
    MediaSeed & { indicatorId: string; normalizedImagePath: string }
  > = [];

  for (const item of items) {
    const lookupKey = makeIndicatorLookupKey(item);
    let cached = indicatorCache.get(lookupKey);

    if (cached === undefined) {
      const indicator = await prisma.curriculumIndicator.findFirst({
        where: {
          code: normalizeText(item.indicatorCode),
          contentStandard: {
            code: normalizeText(item.contentStandardCode),
            subStrand: {
              code: normalizeText(item.subStrandCode),
              strand: {
                code: normalizeText(item.strandCode),
                subject: {
                  slug: normalizeText(item.subjectSlug),
                },
              },
            },
          },
        },
        select: { id: true },
      });

      cached = indicator ?? null;
      indicatorCache.set(lookupKey, cached);
    }

    if (!cached) {
      console.warn(
        `   ⚠️ Could not find indicator ${item.indicatorCode} (strand=${item.strandCode}, subStrand=${item.subStrandCode}, contentStandard=${item.contentStandardCode}, subjectSlug=${item.subjectSlug}). Skipping.`
      );
      skipped++;
      continue;
    }

    const normalizedImagePath = normalizeStoragePath(item.imagePath);
    if (!normalizedImagePath) {
      console.warn(`   ⚠️ Empty imagePath for indicator ${item.indicatorCode}. Skipping.`);
      skipped++;
      continue;
    }

    resolvedItems.push({
      ...item,
      indicatorId: cached.id,
      normalizedImagePath,
    });
  }

  console.log("   Resolved items:", resolvedItems.length);

  const indicatorIds = [...new Set(resolvedItems.map((x) => x.indicatorId))];
  if (indicatorIds.length === 0) {
    console.log("   Nothing to seed.");
    console.log({ created, updated, skipped, deletedLegacy, deletedPruned, dryRun: DRY_RUN });
    return;
  }

  const existingRows = await prisma.curriculumMedia.findMany({
    where: {
      indicatorId: { in: indicatorIds },
    },
    select: {
      id: true,
      indicatorId: true,
      imagePath: true,
    },
  });

  const existingByIndicator = new Map<string, ExistingMediaRow[]>();

  for (const row of existingRows) {
    const normalizedIndicatorId = normalizeText(row.indicatorId);
    if (!normalizedIndicatorId) continue;

    const list = existingByIndicator.get(normalizedIndicatorId) ?? [];
    list.push({
      id: row.id,
      indicatorId: normalizedIndicatorId,
      imagePath: normalizeStoragePath(row.imagePath),
    });
    existingByIndicator.set(normalizedIndicatorId, list);
  }

  const desiredPathsByIndicator = new Map<string, Set<string>>();
  for (const item of resolvedItems) {
    const set = desiredPathsByIndicator.get(item.indicatorId) ?? new Set<string>();
    set.add(item.normalizedImagePath);
    desiredPathsByIndicator.set(item.indicatorId, set);
  }

  for (const item of resolvedItems) {
    console.log(`\n→ Processing indicator ${item.indicatorCode} (${item.subjectSlug})`);

    const rows = existingByIndicator.get(item.indicatorId) ?? [];
    const existing = rows.find((r) => r.imagePath === item.normalizedImagePath);

    const tagsString = normalizeTags(item.tags);

    if (existing) {
      console.log(`   🔁 Existing media found (id=${existing.id}), updating...`);

      if (!DRY_RUN) {
        await prisma.curriculumMedia.update({
          where: { id: existing.id },
          data: {
            subjectId: subject.id,
            pageNumberInPdf: Number.isInteger(item.pageNumberInPdf) ? item.pageNumberInPdf : 0,
            figureLabel: normalizeText(item.figureLabel) || null,
            imagePath: item.normalizedImagePath,
            altText: normalizeText(item.altText),
            detailedDescription: normalizeText(item.detailedDescription),
            tags: tagsString,
          },
        });
      }

      console.log("   ✅ Updated existing media row.");
      updated++;
    } else {
      console.log("   ➕ No existing media found, creating new row...");

      if (!DRY_RUN) {
        const createdRow = await prisma.curriculumMedia.create({
  data: {
    subjectId: subject.id,
    indicatorId: item.indicatorId,
    pageNumberInPdf: Number.isInteger(item.pageNumberInPdf) ? item.pageNumberInPdf : 0,
    figureLabel: normalizeText(item.figureLabel) || null,
    imagePath: item.normalizedImagePath,
    altText: normalizeText(item.altText),
    detailedDescription: normalizeText(item.detailedDescription),
    tags: tagsString,
  },
  select: {
    id: true,
    indicatorId: true,
    imagePath: true,
  },
});

        const createdIndicatorId = normalizeText(createdRow.indicatorId);
        if (!createdIndicatorId) {
          throw new Error(`Created media row ${createdRow.id} is missing indicatorId unexpectedly.`);
        }

        const list = existingByIndicator.get(createdIndicatorId) ?? [];
        list.push({
          id: createdRow.id,
          indicatorId: createdIndicatorId,
          imagePath: normalizeStoragePath(createdRow.imagePath),
        });
        existingByIndicator.set(createdIndicatorId, list);
      }

      console.log("   ✅ Created CurriculumMedia row.");
      created++;
    }
  }

  if (PRUNE_LEGACY) {
    console.log("\n🧹 Pruning stale legacy rows for seeded indicators...");

    for (const [indicatorId, desiredSet] of desiredPathsByIndicator.entries()) {
      const rows = existingByIndicator.get(indicatorId) ?? [];
      const hasCanonicalDesired = [...desiredSet].some((p) => !p.startsWith("curriculum/"));

      if (!hasCanonicalDesired) continue;

      const staleLegacyIds = rows
        .filter((row) => {
          if (desiredSet.has(row.imagePath)) return false;
          return row.imagePath.startsWith("curriculum/");
        })
        .map((row) => row.id);

      if (!staleLegacyIds.length) continue;

      console.log(`   🗑️ Legacy stale rows to delete for indicator ${indicatorId}:`, staleLegacyIds.length);

      if (!DRY_RUN) {
        const result = await prisma.curriculumMedia.deleteMany({
          where: { id: { in: staleLegacyIds } },
        });
        deletedLegacy += result.count;
      } else {
        deletedLegacy += staleLegacyIds.length;
      }
    }
  }

  if (PRUNE_TARGET_INDICATORS) {
    console.log("\n🧹 Pruning non-canonical rows for targeted indicators...");

    for (const [indicatorId, desiredSet] of desiredPathsByIndicator.entries()) {
      const rows = existingByIndicator.get(indicatorId) ?? [];
      const pruneIds = rows
        .filter((row) => !desiredSet.has(row.imagePath))
        .map((row) => row.id);

      if (!pruneIds.length) continue;

      console.log(`   🗑️ Non-canonical rows to delete for indicator ${indicatorId}:`, pruneIds.length);

      if (!DRY_RUN) {
        const result = await prisma.curriculumMedia.deleteMany({
          where: { id: { in: pruneIds } },
        });
        deletedPruned += result.count;
      } else {
        deletedPruned += pruneIds.length;
      }
    }
  }

  console.log("\n🎉 Done seeding KG1 Mathematics media.");
  console.log({
    created,
    updated,
    skipped,
    deletedLegacy,
    deletedPruned,
    dryRun: DRY_RUN,
  });
}

main()
  .catch((e) => {
    console.error("❌ Error in KG1 Mathematics media seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });