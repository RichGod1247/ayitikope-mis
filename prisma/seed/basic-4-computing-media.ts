/* prisma/seed/basic-4-computing-media.ts
   Collision-safe media seeding:
   - NEVER attach by indicatorCode (codes collide across subjects).
   - Attach by indicatorId (canonical SQL truth).
   - Set subjectId explicitly from subject slug.
*/

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const SUBJECT_SLUG = "basic-4-computing";
const SUBJECT_NAME = "Basic 4 Computing";
const PHASE_LABEL = "Upper Primary";
const LEVEL_LABEL = "Basic 4";

// JSON must live here (SOP standard)
const JSON_PATH = path.join(
  process.cwd(),
  "prisma",
  "seed",
  "curriculum",
  "basic-4-computing-media.json"
);

type MediaRow = {
  indicatorId: string;
  indicatorCode: string;
  indicatorDescription: string;
  pageNumberInPdf?: number | null;
  figureLabel?: string | null;
  imagePath: string;
  altText: string;
  detailedDescription: string;
  tags?: string | null;
};

function readJsonStrict(filePath: string): MediaRow[] {
  const raw = fs.readFileSync(filePath, "utf8");

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("JSON root must be an array.");
    return parsed as MediaRow[];
  } catch (e: any) {
    throw new Error(
      `Invalid JSON in ${filePath}\n` +
        `Likely causes: file truncated, copy/paste cut off, or trailing characters.\n` +
        `Original error: ${e?.message ?? String(e)}`
    );
  }
}

function normalizeRows(rows: MediaRow[]): MediaRow[] {
  return rows.map((r) => ({
    indicatorId: String(r.indicatorId).trim(),
    indicatorCode: String(r.indicatorCode).trim(),
    indicatorDescription: String(r.indicatorDescription ?? "").trim(),
    pageNumberInPdf:
      r.pageNumberInPdf === undefined ? 0 : (r.pageNumberInPdf ?? 0),
    figureLabel: r.figureLabel ?? null,
    imagePath: String(r.imagePath).trim(),
    altText: String(r.altText).trim(),
    detailedDescription: String(r.detailedDescription).trim(),
    tags: (r.tags ?? "").toString().trim(),
  }));
}

async function main() {
  console.log(
    `📘 Subject: ${SUBJECT_NAME} (${SUBJECT_SLUG}) | ${PHASE_LABEL} / ${LEVEL_LABEL}`
  );
  console.log(`📖 Loading media seed JSON from: ${JSON_PATH}`);

  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: SUBJECT_SLUG },
    select: { id: true, slug: true, name: true, phase: true, level: true },
  });

  if (!subject) {
    throw new Error(
      `Subject not found for slug="${SUBJECT_SLUG}". Run the subject sanity SQL first.`
    );
  }

  const parsed = readJsonStrict(JSON_PATH);
  const rows = normalizeRows(parsed);

  // Rewrite a clean snapshot back to disk (prevents the “Unexpected end of JSON” nonsense later)
  fs.writeFileSync(JSON_PATH, JSON.stringify(rows, null, 2), "utf8");
  console.log(`🧾 Verified + normalized JSON snapshot: ${JSON_PATH}`);
  console.log(`→ Rows: ${rows.length}\n`);

  let created = 0;
  let updated = 0;
  let deduped = 0;
  let attachedToIndicators = 0;
  let missingIndicators = 0;
  let failed = 0;

  for (const r of rows) {
    try {
      // Hard guard: indicatorId must exist; code collisions are irrelevant if IDs are correct.
      const indicator = await prisma.curriculumIndicator.findUnique({
        where: { id: r.indicatorId },
        select: { id: true, code: true },
      });

      if (!indicator) {
        missingIndicators++;
        console.log(`⚠️  ${r.indicatorCode} -> missing indicatorId=${r.indicatorId}`);
        continue;
      }

      // Guard against accidental row mismatch
      if (indicator.code !== r.indicatorCode) {
        throw new Error(
          `Indicator code mismatch for indicatorId=${r.indicatorId}. ` +
            `DB code="${indicator.code}" but JSON code="${r.indicatorCode}".`
        );
      }

      // Upsert using the compound unique constraint (do NOT use imagePath alone).
      // This matches your generated Prisma type:
      // CurriculumMedia_indicator_image_unique(indicatorId, imagePath)
      const existing = await prisma.curriculumMedia.findUnique({
        where: {
          CurriculumMedia_indicator_image_unique: {
            indicatorId: r.indicatorId,
            imagePath: r.imagePath,
          },
        },
        select: { id: true },
      });

      const result = await prisma.curriculumMedia.upsert({
        where: {
          CurriculumMedia_indicator_image_unique: {
            indicatorId: r.indicatorId,
            imagePath: r.imagePath,
          },
        },
        create: {
          indicatorId: r.indicatorId,
          subjectId: subject.id,
          imagePath: r.imagePath,
          altText: r.altText,
          detailedDescription: r.detailedDescription,
          tags: r.tags ?? "",
          pageNumberInPdf: r.pageNumberInPdf ?? 0,
          figureLabel: r.figureLabel ?? null,
        },
        update: {
          subjectId: subject.id,
          altText: r.altText,
          detailedDescription: r.detailedDescription,
          tags: r.tags ?? "",
          pageNumberInPdf: r.pageNumberInPdf ?? 0,
          figureLabel: r.figureLabel ?? null,
        },
        select: { id: true },
      });

      if (!existing) created++;
      else updated++;

      attachedToIndicators++;

      // Keep the same “green” logging you like
      console.log(`✅ ${r.indicatorCode} -> media saved (${result.id})`);
    } catch (err: any) {
      failed++;
      console.log(`❌ ${r.indicatorCode} -> failed: ${err?.message ?? String(err)}`);
    }
  }

  console.log(`\n📦 ${SUBJECT_NAME} media seeding complete.`);
  console.log({
    totalRows: rows.length,
    created,
    updated,
    deduped,
    attachedToIndicators,
    missingIndicators,
    failed,
  });
}

main()
  .catch((e) => {
    console.error("💥 Seeder crashed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
