import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

// HARD RULES (collision-proof):
// - NEVER link by indicatorCode (codes collide across subjects).
// - ALWAYS filter indicators by subject ownership.
// - ALWAYS attach by indicatorId + set subjectId explicitly.
// - Auto-generate JSON snapshot so JSON can never be “truncated by copy/paste”.

const SUBJECT_SLUG = "basic-4-science";
const R2_PREFIX =
  "https://pub-f33886c26f33473d91e2bf1505b9df29.r2.dev/upper-primary/basic-4/basic-4-science/";
const JSON_OUT_PATH = path.join(
  process.cwd(),
  "prisma",
  "seed",
  "curriculum",
  "basic-4-science-media.json"
);

function must(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: SUBJECT_SLUG },
    select: { id: true, slug: true, name: true, level: true, phase: true },
  });

  must(subject, `CurriculumSubject not found for slug: ${SUBJECT_SLUG}`);

  console.log(`📌 Subject: ${subject.name} (${subject.slug}) | ${subject.phase} / ${subject.level}`);

  // Pull indicators ONLY from this subject’s tree (prevents collisions)
  const indicators = await prisma.curriculumIndicator.findMany({
    where: {
      contentStandard: {
        subStrand: {
          strand: {
            subjectId: subject.id,
          },
        },
      },
    },
    select: {
      id: true,
      code: true,
      description: true,
      orderIndex: true,
    },
    orderBy: [{ code: "asc" }],
  });

  must(indicators.length > 0, `No indicators found under subject: ${SUBJECT_SLUG}`);

  // Build deterministic media rows from DB truth + R2 convention
  const rows = indicators.map((i) => {
    const imagePath = `${R2_PREFIX}${i.code}.png`;
    return {
      indicatorId: i.id,
      indicatorCode: i.code,
      indicatorDescription: i.description,
      pageNumberInPdf: 0,
      figureLabel: null,
      imagePath,
      altText: `Basic 4 Science ${i.code}: ${i.description}.`,
      detailedDescription: `Illustration for Basic 4 Science indicator ${i.code} — ${i.description}.`,
      tags: "",
    };
  });

  // Write a clean JSON snapshot (no more copy/paste corruption)
  fs.mkdirSync(path.dirname(JSON_OUT_PATH), { recursive: true });
  fs.writeFileSync(JSON_OUT_PATH, JSON.stringify(rows, null, 2), "utf-8");
  console.log(`🧾 Wrote JSON snapshot: ${JSON_OUT_PATH}`);
  console.log(`→ Rows: ${rows.length}`);

  let createdOrUpdated = 0;
  let attachedToIndicators = 0;
  const failed: { indicatorCode: string; error: string }[] = [];

  for (const row of rows) {
    try {
      must(row.imagePath.startsWith(R2_PREFIX), `Bad R2 prefix for ${row.indicatorCode}: ${row.imagePath}`);
      must(row.imagePath.endsWith(`${row.indicatorCode}.png`), `Bad filename for ${row.indicatorCode}: ${row.imagePath}`);

      // Upsert by imagePath (stable unique key for media)
      const existing = await prisma.curriculumMedia.findFirst({
        where: { imagePath: row.imagePath },
        select: { id: true },
      });

      const data = {
        subjectId: subject.id,
        indicatorId: row.indicatorId,
        imagePath: row.imagePath,
        altText: row.altText,
        detailedDescription: row.detailedDescription,
        tags: row.tags ?? "",
        pageNumberInPdf: row.pageNumberInPdf ?? 0,
        figureLabel: row.figureLabel ?? null,
      };

      if (existing) {
        await prisma.curriculumMedia.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await prisma.curriculumMedia.create({ data });
      }

      createdOrUpdated += 1;
      attachedToIndicators += 1;
      console.log(`✅ ${row.indicatorCode} -> media saved`);
    } catch (e: any) {
      failed.push({
        indicatorCode: row.indicatorCode ?? "(unknown)",
        error: e?.message ?? String(e),
      });
      console.log(`❌ ${row.indicatorCode ?? "(unknown)"} -> failed: ${e?.message ?? e}`);
    }
  }

  console.log("\n📦 Basic 4 Science media seeding complete.");
  console.log({
    totalRows: rows.length,
    createdOrUpdated,
    attachedToIndicators,
    failed: failed.length,
  });

  if (failed.length) {
    console.log("Failed rows:", failed);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
