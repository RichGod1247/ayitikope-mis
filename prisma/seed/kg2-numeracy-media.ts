// prisma/seed/kg2-numeracy-media.ts
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

type ReuseSourceRef = {
  subjectSlug: string;
  strandCode: string;
  subStrandCode: string;
  contentStandardCode: string;
  indicatorCode: string;
};

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
  imagePath?: string;
  altText?: string;
  detailedDescription?: string;
  tags?: string[] | string;

  reuseSource?: ReuseSourceRef;
}

type ExistingMediaRow = {
  id: string;
  indicatorId: string;
  imagePath: string;
};

type ResolvedPayload = {
  indicatorId: string;
  normalizedImagePath: string;
  figureLabel: string | null;
  altText: string;
  detailedDescription: string;
  tags: string | null;
  pageNumberInPdf: number;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeTags(tags: string[] | string | undefined | null): string | null {
  if (Array.isArray(tags)) {
    const joined = tags
      .map((t) => normalizeText(t))
      .filter(Boolean)
      .join(", ");
    return joined || null;
  }

  const single = normalizeText(tags);
  return single || null;
}

function normalizeStoragePath(value: unknown): string {
  const raw = String(value ?? "")
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .trim();

  if (!raw) return "";

  const canonicalRules: Array<[RegExp, string]> = [
    [/^curriculum\/kg1\/mathematics\//i, "lower-primary/kg1/mathematics/"],
    [/^curriculum\/kg1\/language-and-literacy\//i, "lower-primary/kg1/language-and-literacy/"],
    [/^curriculum\/kg1\/our-world-and-our-people\//i, "lower-primary/kg1/our-world-and-our-people/"],
    [/^curriculum\/kg1\/creative-arts\//i, "lower-primary/kg1/creative-arts/"],
  ];

  for (const [pattern, replacement] of canonicalRules) {
    if (pattern.test(raw)) {
      return raw.replace(pattern, replacement);
    }
  }

  return raw;
}

function makeIndicatorLookupKey(item: {
  subjectSlug: string;
  strandCode: string;
  subStrandCode: string;
  contentStandardCode: string;
  indicatorCode: string;
}) {
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
    path.join(__dirname, "curriculum", "kg2-numeracy-media.clean.json"),
    path.join(__dirname, "curriculum", "kg2-numeracy-media.json"),
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

function validateReuseSource(row: MediaSeed, index: number) {
  const prefix = `Row ${index + 1}`;

  if (!row.reuseSource) return;

  if (!normalizeText(row.reuseSource.subjectSlug)) {
    throw new Error(`${prefix}: reuseSource.subjectSlug is required`);
  }
  if (!normalizeText(row.reuseSource.strandCode)) {
    throw new Error(`${prefix}: reuseSource.strandCode is required`);
  }
  if (!normalizeText(row.reuseSource.subStrandCode)) {
    throw new Error(`${prefix}: reuseSource.subStrandCode is required`);
  }
  if (!normalizeText(row.reuseSource.contentStandardCode)) {
    throw new Error(`${prefix}: reuseSource.contentStandardCode is required`);
  }
  if (!normalizeText(row.reuseSource.indicatorCode)) {
    throw new Error(`${prefix}: reuseSource.indicatorCode is required`);
  }
}

function validateRow(row: MediaSeed, index: number) {
  const prefix = `Row ${index + 1}`;

  if (!normalizeText(row.subjectSlug)) {
    throw new Error(`${prefix}: subjectSlug is required`);
  }
  if (!normalizeText(row.phase)) {
    throw new Error(`${prefix}: phase is required`);
  }
  if (!normalizeText(row.level)) {
    throw new Error(`${prefix}: level is required`);
  }
  if (!normalizeText(row.strandCode)) {
    throw new Error(`${prefix}: strandCode is required`);
  }
  if (!normalizeText(row.subStrandCode)) {
    throw new Error(`${prefix}: subStrandCode is required`);
  }
  if (!normalizeText(row.contentStandardCode)) {
    throw new Error(`${prefix}: contentStandardCode is required`);
  }
  if (!normalizeText(row.indicatorCode)) {
    throw new Error(`${prefix}: indicatorCode is required`);
  }
  if (
    typeof row.pageNumberInPdf !== "number" ||
    !Number.isInteger(row.pageNumberInPdf)
  ) {
    throw new Error(`${prefix}: pageNumberInPdf must be an integer`);
  }

  const hasReuse = !!row.reuseSource;
  const hasDirectPath = !!normalizeText(row.imagePath);

  if (!hasReuse && !hasDirectPath) {
    throw new Error(
      `${prefix}: provide either imagePath for direct media or reuseSource for reusable media`
    );
  }

  if (hasReuse) {
    validateReuseSource(row, index);
  } else {
    if (!normalizeText(row.altText)) {
      throw new Error(`${prefix}: altText is required for direct media rows`);
    }
    if (!normalizeText(row.detailedDescription)) {
      throw new Error(`${prefix}: detailedDescription is required for direct media rows`);
    }
  }

  if (
    row.subjectSlug === "kg2-numeracy" &&
    normalizeText(row.imagePath).match(/(^|\/)kg2\/mathematics\//i)
  ) {
    throw new Error(
      `${prefix}: direct KG2 mathematics image paths are not allowed here. Use reuseSource to point to real KG1 media.`
    );
  }
}

function validateDataset(items: MediaSeed[]) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Seed JSON is empty or invalid.");
  }

  items.forEach((row, index) => validateRow(row, index));

  const subjectSlugs = [...new Set(items.map((x) => normalizeText(x.subjectSlug)).filter(Boolean))];
  if (subjectSlugs.length !== 1) {
    throw new Error(
      `Expected a single subjectSlug in this seed file. Found: ${subjectSlugs.join(", ")}`
    );
  }

  const first = items[0]!;
  const expectedSubjectSlug = normalizeText(first.subjectSlug);
  const expectedPhase = normalizeText(first.phase);
  const expectedLevel = normalizeText(first.level);

  for (let i = 0; i < items.length; i++) {
    const row = items[i]!;
    const prefix = `Row ${i + 1}`;

    if (normalizeText(row.subjectSlug) !== expectedSubjectSlug) {
      throw new Error(`${prefix}: subjectSlug mismatch within dataset`);
    }
    if (normalizeText(row.phase) !== expectedPhase) {
      throw new Error(`${prefix}: phase mismatch within dataset`);
    }
    if (normalizeText(row.level) !== expectedLevel) {
      throw new Error(`${prefix}: level mismatch within dataset`);
    }
  }

  const seenTargetKeys = new Set<string>();
  for (const row of items) {
    const key = makeIndicatorLookupKey(row);
    if (seenTargetKeys.has(key)) {
      throw new Error(`Duplicate target indicator row detected for ${row.indicatorCode}`);
    }
    seenTargetKeys.add(key);
  }
}

async function resolveIndicatorIdByCodes(
  cache: Map<string, { id: string } | null>,
  item: {
    subjectSlug: string;
    strandCode: string;
    subStrandCode: string;
    contentStandardCode: string;
    indicatorCode: string;
  }
) {
  const key = makeIndicatorLookupKey(item);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const found = await prisma.curriculumIndicator.findFirst({
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

  const resolved = found ?? null;
  cache.set(key, resolved);
  return resolved;
}

function pickBestSourceMediaRow(
  rows: Array<{
    id: string;
    imagePath: string;
    figureLabel: string | null;
    altText: string | null;
    detailedDescription: string | null;
    tags: string | null;
    pageNumberInPdf: number;
  }>
) {
  const scored = rows.map((row) => {
    const normalized = normalizeStoragePath(row.imagePath);
    let score = 0;

    if (normalized.startsWith("lower-primary/")) score += 100;
    if (normalized.endsWith(".png")) score += 20;
    if ((row.pageNumberInPdf ?? 0) === 0) score += 5;
    if (normalizeText(row.altText)) score += 3;
    if (normalizeText(row.detailedDescription)) score += 3;

    return {
      row: { ...row, imagePath: normalized },
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
  return scored[0]?.row ?? null;
}

async function resolvePayloadForRow(args: {
  row: MediaSeed;
  targetIndicatorId: string;
  indicatorCache: Map<string, { id: string } | null>;
}): Promise<ResolvedPayload> {
  const { row, targetIndicatorId, indicatorCache } = args;

  if (row.reuseSource) {
    const sourceIndicator = await resolveIndicatorIdByCodes(indicatorCache, row.reuseSource);

    if (!sourceIndicator?.id) {
      throw new Error(
        `Could not resolve reuseSource indicator ${row.reuseSource.indicatorCode} (${row.reuseSource.subjectSlug}) for target ${row.indicatorCode}`
      );
    }

    const sourceRows = await prisma.curriculumMedia.findMany({
      where: { indicatorId: sourceIndicator.id },
      select: {
        id: true,
        imagePath: true,
        figureLabel: true,
        altText: true,
        detailedDescription: true,
        tags: true,
        pageNumberInPdf: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });

    if (!sourceRows.length) {
      throw new Error(
        `Source media row not found for reuseSource indicator ${row.reuseSource.indicatorCode} (${row.reuseSource.subjectSlug})`
      );
    }

    const bestSource = pickBestSourceMediaRow(sourceRows);
    if (!bestSource) {
      throw new Error(
        `Could not choose a valid source media row for reuseSource indicator ${row.reuseSource.indicatorCode} (${row.reuseSource.subjectSlug})`
      );
    }

    const normalizedImagePath = normalizeStoragePath(bestSource.imagePath);
    if (!normalizedImagePath) {
      throw new Error(
        `Resolved empty source imagePath for reuseSource indicator ${row.reuseSource.indicatorCode}`
      );
    }

    return {
      indicatorId: targetIndicatorId,
      normalizedImagePath,
      figureLabel: normalizeText(row.figureLabel) || normalizeText(bestSource.figureLabel) || null,
      altText: normalizeText(row.altText) || normalizeText(bestSource.altText),
      detailedDescription:
        normalizeText(row.detailedDescription) ||
        normalizeText(bestSource.detailedDescription),
      tags: normalizeTags(row.tags) ?? normalizeTags(bestSource.tags),
      pageNumberInPdf:
        Number.isInteger(row.pageNumberInPdf) ? row.pageNumberInPdf : bestSource.pageNumberInPdf ?? 0,
    };
  }

  const normalizedImagePath = normalizeStoragePath(row.imagePath);
  if (!normalizedImagePath) {
    throw new Error(`Empty direct imagePath for target ${row.indicatorCode}`);
  }

  return {
    indicatorId: targetIndicatorId,
    normalizedImagePath,
    figureLabel: normalizeText(row.figureLabel) || null,
    altText: normalizeText(row.altText),
    detailedDescription: normalizeText(row.detailedDescription),
    tags: normalizeTags(row.tags),
    pageNumberInPdf: Number.isInteger(row.pageNumberInPdf) ? row.pageNumberInPdf : 0,
  };
}

async function main() {
  const argv = process.argv.slice(2);

  const positional = argv.filter((x) => !x.startsWith("--"));
  const cliPath = positional[0];

  const DRY_RUN = argv.includes("--dry-run");
  const PRUNE_TARGET_INDICATORS = argv.includes("--prune-target-indicators");

  const seedPath = resolveSeedPath(cliPath);

  console.log("📖 Loading KG2 Numeracy media seed from:", seedPath);
  console.log("   Flags:", {
    DRY_RUN,
    PRUNE_TARGET_INDICATORS,
  });

  if (!fs.existsSync(seedPath)) {
    throw new Error(`Seed file not found: ${seedPath}`);
  }

  const raw = fs.readFileSync(seedPath, "utf8");
  const items = JSON.parse(raw) as MediaSeed[];

  validateDataset(items);

  const subjectSlug = normalizeText(items[0]!.subjectSlug);
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
  console.log(`   Items in JSON: ${items.length}`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let deletedPruned = 0;

  const indicatorCache = new Map<string, { id: string } | null>();

  const resolvedItems: Array<
    MediaSeed & {
      indicatorId: string;
      normalizedImagePath: string;
      figureLabelResolved: string | null;
      altTextResolved: string;
      detailedDescriptionResolved: string;
      tagsResolved: string | null;
    }
  > = [];

  for (const item of items) {
    const targetIndicator = await resolveIndicatorIdByCodes(indicatorCache, item);

    if (!targetIndicator?.id) {
      console.warn(
        `   ⚠️ Could not find target indicator ${item.indicatorCode} (${item.subjectSlug}). Skipping.`
      );
      skipped++;
      continue;
    }

    const payload = await resolvePayloadForRow({
      row: item,
      targetIndicatorId: targetIndicator.id,
      indicatorCache,
    });

    resolvedItems.push({
      ...item,
      indicatorId: payload.indicatorId,
      normalizedImagePath: payload.normalizedImagePath,
      figureLabelResolved: payload.figureLabel,
      altTextResolved: payload.altText,
      detailedDescriptionResolved: payload.detailedDescription,
      tagsResolved: payload.tags,
    });
  }

  console.log("   Resolved items:", resolvedItems.length);

  const indicatorIds = [...new Set(resolvedItems.map((x) => x.indicatorId))];
  if (!indicatorIds.length) {
    console.log("   Nothing to seed.");
    console.log({ created, updated, skipped, deletedPruned, dryRun: DRY_RUN });
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

    if (existing) {
      console.log(`   🔁 Existing media found (id=${existing.id}), updating...`);

      if (!DRY_RUN) {
        await prisma.curriculumMedia.update({
          where: { id: existing.id },
          data: {
            subjectId: subject.id,
            indicatorId: item.indicatorId,
            pageNumberInPdf: item.pageNumberInPdf,
            figureLabel: item.figureLabelResolved,
            imagePath: item.normalizedImagePath,
            altText: item.altTextResolved,
            detailedDescription: item.detailedDescriptionResolved,
            tags: item.tagsResolved,
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
            pageNumberInPdf: item.pageNumberInPdf,
            figureLabel: item.figureLabelResolved,
            imagePath: item.normalizedImagePath,
            altText: item.altTextResolved,
            detailedDescription: item.detailedDescriptionResolved,
            tags: item.tagsResolved,
          },
          select: {
            id: true,
            indicatorId: true,
            imagePath: true,
          },
        });

        const createdIndicatorId = normalizeText(createdRow.indicatorId);
        if (!createdIndicatorId) {
          throw new Error(
            `Created media row ${createdRow.id} is missing indicatorId unexpectedly.`
          );
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

  if (PRUNE_TARGET_INDICATORS) {
    console.log("\n🧹 Pruning non-desired rows for targeted indicators...");

    for (const [indicatorId, desiredSet] of desiredPathsByIndicator.entries()) {
      const rows = existingByIndicator.get(indicatorId) ?? [];
      const pruneIds = rows
        .filter((row) => !desiredSet.has(row.imagePath))
        .map((row) => row.id);

      if (!pruneIds.length) continue;

      console.log(
        `   🗑️ Rows to delete for indicator ${indicatorId}:`,
        pruneIds.length
      );

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

  console.log("\n🎉 Done seeding KG2 Numeracy media.");
  console.log({
    created,
    updated,
    skipped,
    deletedPruned,
    dryRun: DRY_RUN,
  });
}

main()
  .catch((e) => {
    console.error("❌ Error in KG2 Numeracy media seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });