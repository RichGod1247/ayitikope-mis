// prisma/seed/basic-6-science-media.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

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

const SUBJECT_SLUG = "basic-6-science";
const JSON_PATH = path.join(
  process.cwd(),
  "prisma",
  "seed",
  "curriculum",
  "basic-6-science-media.json"
);

async function loadAndNormalizeJson(filePath: string): Promise<MediaRow[]> {
  const raw = await fs.readFile(filePath, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `❌ JSON.parse failed for ${filePath} (often truncation / invalid JSON).`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`❌ Media seed JSON must be an array.`);
  }

  const rows: MediaRow[] = parsed.map((r: any, idx: number) => {
    const row: MediaRow = {
      indicatorId: String(r.indicatorId ?? "").trim(),
      indicatorCode: String(r.indicatorCode ?? "").trim(),
      indicatorDescription: String(r.indicatorDescription ?? "").trim(),
      pageNumberInPdf:
        r.pageNumberInPdf === undefined ? 0 : (r.pageNumberInPdf as number),
      figureLabel: r.figureLabel ?? null,
      imagePath: String(r.imagePath ?? "").trim(),
      altText: String(r.altText ?? "").trim(),
      detailedDescription: String(r.detailedDescription ?? "").trim(),
      tags: String(r.tags ?? ""),
    };

    const missing: string[] = [];
    if (!row.indicatorId) missing.push("indicatorId");
    if (!row.indicatorCode) missing.push("indicatorCode");
    if (!row.indicatorDescription) missing.push("indicatorDescription");
    if (!row.imagePath) missing.push("imagePath");
    if (!row.altText) missing.push("altText");
    if (!row.detailedDescription) missing.push("detailedDescription");

    if (missing.length) {
      throw new Error(
        `❌ Row ${idx} missing required fields: ${missing.join(", ")}`
      );
    }

    row.pageNumberInPdf =
      row.pageNumberInPdf === null || row.pageNumberInPdf === undefined
        ? 0
        : Number(row.pageNumberInPdf);

    return row;
  });

  // Re-write clean JSON snapshot to prevent “Unexpected end of JSON input” repeat
  await fs.writeFile(filePath, JSON.stringify(rows, null, 2), "utf8");
  return rows;
}

async function main() {
  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: SUBJECT_SLUG },
    select: { id: true, name: true, slug: true, phase: true, level: true },
  });

  if (!subject) {
    throw new Error(`❌ CurriculumSubject not found for slug: ${SUBJECT_SLUG}`);
  }

  console.log(
    `📘 Subject: ${subject.name} (${subject.slug}) | ${subject.phase} / ${subject.level}`
  );
  console.log(`📖 Loading media seed JSON from: ${JSON_PATH}`);

  const rows = await loadAndNormalizeJson(JSON_PATH);
  console.log(`🧾 Verified + normalized JSON snapshot: ${JSON_PATH}`);
  console.log(`→ Rows: ${rows.length}\n`);

  // COLLISION GUARD:
  // We do NOT use code to find indicators. We validate ownership by walking:
  // Indicator -> ContentStandard -> SubStrand -> Strand -> subjectId
  const indicatorIds = rows.map((r) => r.indicatorId);

  const indicators = await prisma.curriculumIndicator.findMany({
    where: { id: { in: indicatorIds } },
    select: {
      id: true,
      code: true,
      // derive subjectId via the curriculum chain
      contentStandard: {
        select: {
          subStrand: {
            select: {
              strand: {
                select: {
                  subjectId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const indicatorMap = new Map<
    string,
    { id: string; code: string; subjectId: string | null }
  >();

  for (const i of indicators) {
    const derivedSubjectId =
      i.contentStandard?.subStrand?.strand?.subjectId ?? null;

    indicatorMap.set(i.id, {
      id: i.id,
      code: i.code,
      subjectId: derivedSubjectId,
    });
  }

  let created = 0;
  let updated = 0;
  let deduped = 0; // kept for scoreboard consistency
  let attachedToIndicators = 0;
  let missingIndicators = 0;
  let failed = 0;

  for (const row of rows) {
    const ind = indicatorMap.get(row.indicatorId);

    if (!ind) {
      missingIndicators++;
      failed++;
      console.log(
        `❌ ${row.indicatorCode} -> missing indicatorId ${row.indicatorId}`
      );
      continue;
    }

    // HARD GUARD 1: indicator must belong to THIS subject (prevents cross-subject collisions)
    if (ind.subjectId !== subject.id) {
      failed++;
      console.log(
        `❌ ${row.indicatorCode} -> indicatorId belongs to a different subject (collision guard tripped)`
      );
      continue;
    }

    // HARD GUARD 2: indicator code must match (sanity)
    if (ind.code !== row.indicatorCode) {
      failed++;
      console.log(
        `❌ ${row.indicatorCode} -> indicator.code mismatch for indicatorId ${row.indicatorId} (got ${ind.code})`
      );
      continue;
    }

    try {
      // Upsert key is compound unique: (indicatorId, imagePath)
      const where = {
        CurriculumMedia_indicator_image_unique: {
          indicatorId: row.indicatorId,
          imagePath: row.imagePath,
        },
      } as const;

      const existing = await prisma.curriculumMedia.findUnique({
        where,
        select: { id: true },
      });

      if (existing) {
        await prisma.curriculumMedia.update({
          where,
          data: {
            subjectId: subject.id, // enforce correct subjectId always
            altText: row.altText,
            detailedDescription: row.detailedDescription,
            tags: String(row.tags ?? ""),
            pageNumberInPdf: row.pageNumberInPdf ?? 0,
            figureLabel: row.figureLabel ?? null,
          },
        });
        updated++;
      } else {
        await prisma.curriculumMedia.create({
          data: {
            subjectId: subject.id,
            indicatorId: row.indicatorId,
            imagePath: row.imagePath,
            altText: row.altText,
            detailedDescription: row.detailedDescription,
            tags: String(row.tags ?? ""),
            pageNumberInPdf: row.pageNumberInPdf ?? 0,
            figureLabel: row.figureLabel ?? null,
          },
        });
        created++;
      }

      attachedToIndicators++;
      console.log(`✅ ${row.indicatorCode} -> media saved`);
    } catch (e) {
      failed++;
      console.log(`❌ ${row.indicatorCode} -> failed`);
      console.error(e);
    }
  }

  console.log(`\n📦 Basic 6 Science media seeding complete.`);
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
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
