// prisma/seed/basic-3-science-media.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

/**
 * ✅ CHANGE THESE TWO LINES PER SUBJECT
 */
const SUBJECT_SLUG = "basic-3-science";
const JSON_FILE = "basic-3-science-media.json";

/**
 * JSON row shape (we accept both snake_case + camelCase keys)
 */
type MediaSeedRow = {
  indicator_code?: string;
  indicatorCode?: string;

  imagePath: string;
  altText: string;
  detailedDescription: string;

  tags?: string | null;
  pageNumberInPdf?: number;
  figureLabel?: string | null;
};

function getIndicatorCode(row: MediaSeedRow): string {
  const code = row.indicator_code ?? row.indicatorCode;
  if (!code) throw new Error("Missing indicator_code/indicatorCode in JSON row.");
  return code.trim();
}

function mustReadJson(filePath: string): MediaSeedRow[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Seed JSON must be an array. Got: ${typeof parsed}`);
  }
  return parsed as MediaSeedRow[];
}

/**
 * ✅ The key enforcement:
 * Resolve indicator ID by CODE + SUBJECT SLUG constraint (subject chain).
 */
async function resolveIndicatorIdInSubject(code: string): Promise<string | null> {
  const indicator = await prisma.curriculumIndicator.findFirst({
    where: {
      code,
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

  return indicator?.id ?? null;
}

/**
 * Upsert strategy by imagePath (NOT by indicatorId),
 * so we can correct previously-wrong links safely.
 */
async function upsertByImagePath(params: {
  subjectId: string;
  indicatorId: string;
  row: MediaSeedRow;
}) {
  const { subjectId, indicatorId, row } = params;

  const existing = await prisma.curriculumMedia.findMany({
    where: { imagePath: row.imagePath },
    select: { id: true, indicatorId: true, subjectId: true },
  });

  // If there are multiple rows for the same imagePath, that’s ALWAYS a bug in our pipeline.
  // Keep the correct one if it exists; otherwise rewrite the first and delete the rest.
  const alreadyCorrect = existing.find((x) => x.indicatorId === indicatorId);

  const pageNumberInPdf =
    typeof row.pageNumberInPdf === "number" && Number.isFinite(row.pageNumberInPdf)
      ? Math.trunc(row.pageNumberInPdf)
      : 0;

  if (alreadyCorrect) {
    // Update the correct row (force subjectId too), delete any duplicates.
    await prisma.curriculumMedia.update({
      where: { id: alreadyCorrect.id },
      data: {
        subjectId,
        indicatorId,
        pageNumberInPdf,
        figureLabel: row.figureLabel ?? null,
        imagePath: row.imagePath,
        altText: row.altText,
        detailedDescription: row.detailedDescription,
        tags: row.tags ?? null,
      },
    });

    const dupes = existing.filter((x) => x.id !== alreadyCorrect.id);
    if (dupes.length > 0) {
      await prisma.curriculumMedia.deleteMany({
        where: { id: { in: dupes.map((d) => d.id) } },
      });
    }

    return { action: "updated" as const, deduped: existing.length - 1 };
  }

  if (existing.length > 0) {
    // Rewrite the first existing row to be correct; delete the rest.
    const keep = existing[0];

    // Delete any other duplicates first to avoid potential unique conflicts later.
    const rest = existing.slice(1);
    if (rest.length > 0) {
      await prisma.curriculumMedia.deleteMany({
        where: { id: { in: rest.map((d) => d.id) } },
      });
    }

    await prisma.curriculumMedia.update({
      where: { id: keep.id },
      data: {
        subjectId,
        indicatorId,
        pageNumberInPdf,
        figureLabel: row.figureLabel ?? null,
        imagePath: row.imagePath,
        altText: row.altText,
        detailedDescription: row.detailedDescription,
        tags: row.tags ?? null,
      },
    });

    return { action: "fixed" as const, deduped: rest.length };
  }

  // Brand new create
  await prisma.curriculumMedia.create({
    data: {
      subjectId,
      indicatorId,
      contentStandardId: null,
      exemplarId: null,
      pageNumberInPdf,
      figureLabel: row.figureLabel ?? null,
      imagePath: row.imagePath,
      altText: row.altText,
      detailedDescription: row.detailedDescription,
      tags: row.tags ?? null,
    },
  });

  return { action: "created" as const, deduped: 0 };
}

async function main() {
  const jsonPath = path.join(process.cwd(), "prisma", "seed", "curriculum", JSON_FILE);
  console.log(`📖 Loading ${SUBJECT_SLUG} media seed from: ${jsonPath}`);

  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: SUBJECT_SLUG },
    select: { id: true, slug: true, level: true, phase: true },
  });

  if (!subject) {
    throw new Error(`CurriculumSubject not found for slug: ${SUBJECT_SLUG}`);
  }

  const rows = mustReadJson(jsonPath);

  let totalRows = rows.length;
  let createdOrUpdated = 0;
  let attachedToIndicators = 0;
  let missingIndicators = 0;
  let failed = 0;
  let dedupedTotal = 0;

  for (const row of rows) {
    try {
      const code = getIndicatorCode(row);

      const indicatorId = await resolveIndicatorIdInSubject(code);
      if (!indicatorId) {
        missingIndicators++;
        console.log(`⚠️ ${code} -> indicator not found under subject ${SUBJECT_SLUG}`);
        continue;
      }

      // Force-correct linkage (even if previously mislinked)
      const res = await upsertByImagePath({
        subjectId: subject.id,
        indicatorId,
        row,
      });

      createdOrUpdated++;
      attachedToIndicators++;
      dedupedTotal += res.deduped;

      console.log(`✅ ${code} -> media ${res.action}${res.deduped ? ` (deduped ${res.deduped})` : ""}`);
    } catch (err) {
      failed++;
      console.log(`❌ Failed row: ${(err as Error).message}`);
    }
  }

  console.log(`\n📦 ${SUBJECT_SLUG} media seeding complete.`);
  console.log({
    totalRows,
    createdOrUpdated,
    attachedToIndicators,
    missingIndicators,
    failed,
    dedupedTotal,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
